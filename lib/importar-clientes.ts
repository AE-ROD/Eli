import { z } from "zod"
import { emailOVacio, nombre, notas, telefonoChileno } from "./campos-del-panel"
import { normalizarNombre } from "./reserva-publica"
import { aE164Chile } from "./telefono"

/**
 * Importar clientes desde un CSV (pensado para el export de AgendaPro, pero
 * sirve cualquiera). Sólo reglas, sin base: el navegador las usa para la
 * vista previa y para sugerir qué columna es cada dato; el servidor, para
 * validar cada fila y descartar duplicados antes de escribir.
 */

/** 2 MB: unos 20.000 clientes con nombre, teléfono y correo. */
export const TAMAÑO_MAXIMO_EN_BYTES = 2 * 1024 * 1024

/** Filas de datos (sin la cabecera) que se aceptan en una importación. */
export const FILAS_MAXIMAS = 5000

/** Columnas que se aceptan: más que esto no es una lista de clientes. */
export const COLUMNAS_MAXIMAS = 200

export const CAMPOS_DE_IMPORTACION = [
  { id: "nombre", etiqueta: "Nombre", obligatorio: true },
  { id: "apellido", etiqueta: "Apellido", obligatorio: false },
  { id: "telefono", etiqueta: "Teléfono", obligatorio: false },
  { id: "email", etiqueta: "Correo", obligatorio: false },
  { id: "notas", etiqueta: "Notas", obligatorio: false },
  { id: "whatsapp", etiqueta: "Acepta WhatsApp", obligatorio: false },
] as const

export type CampoDeImportacion = (typeof CAMPOS_DE_IMPORTACION)[number]["id"]

/** Qué columna (su índice, desde 0) es cada dato. Un dato sin columna no se importa. */
export type Mapeo = { nombre: number } & Partial<Record<Exclude<CampoDeImportacion, "nombre">, number>>

const columna = () => z.number().int().min(0).max(COLUMNAS_MAXIMAS - 1)

export const mapeoSchema = z.object({
  nombre: columna(),
  apellido: columna().optional(),
  telefono: columna().optional(),
  email: columna().optional(),
  notas: columna().optional(),
  whatsapp: columna().optional(),
})

/**
 * Cómo suele llamarse cada columna, ya normalizado (`normalizarCabecera`). El
 * orden importa: si hay "Celular" y "Teléfono", se sugiere el celular, que es
 * el que recibe WhatsApp.
 */
const CABECERAS_CONOCIDAS: Record<CampoDeImportacion, readonly string[]> = {
  nombre: ["nombre", "nombres", "nombre completo", "nombre cliente", "nombre del cliente", "cliente", "primer nombre", "name", "first name"],
  apellido: ["apellido", "apellidos", "apellido paterno", "last name", "surname"],
  telefono: ["celular", "telefono celular", "telefono movil", "movil", "telefono", "fono", "numero de telefono", "whatsapp", "phone", "mobile"],
  email: ["email", "correo", "correo electronico", "e mail", "mail"],
  notas: ["notas", "nota", "observaciones", "observacion", "comentarios", "comentario", "notes"],
  whatsapp: [
    "acepta whatsapp",
    "acepta mensajes por whatsapp",
    "acepta recibir mensajes por whatsapp",
    "consentimiento whatsapp",
    "autoriza whatsapp",
    "whatsapp autorizado",
  ],
}

/** "Teléfono ", "TELEFONO" y "teléfono" son la misma cabecera; "E-mail" es "e mail". */
export function normalizarCabecera(cabecera: string): string {
  return normalizarNombre(cabecera.replace(/[^\p{L}\p{N}]+/gu, " "))
}

/**
 * Qué columna parece ser cada dato, por el nombre de su cabecera. Una columna
 * se sugiere para un solo dato. Si no hay ninguna que parezca el nombre, no
 * hay sugerencia (`null`): quien importa lo elige.
 */
export function sugerirMapeo(cabeceras: readonly string[]): Mapeo | null {
  const normalizadas = cabeceras.map(normalizarCabecera)
  const usadas = new Set<number>()
  const sugerido: Partial<Record<CampoDeImportacion, number>> = {}

  for (const { id } of CAMPOS_DE_IMPORTACION) {
    for (const conocida of CABECERAS_CONOCIDAS[id]) {
      const indice = normalizadas.findIndex((cabecera, i) => cabecera === conocida && !usadas.has(i))
      if (indice !== -1) {
        sugerido[id] = indice
        usadas.add(indice)
        break
      }
    }
  }

  return sugerido.nombre === undefined ? null : (sugerido as Mapeo)
}

/** Lo que cuenta como "sí" en la columna de consentimiento de WhatsApp. */
const SI = new Set(["si", "s", "yes", "y", "true", "verdadero", "1", "x", "acepta"])

export function aceptaWhatsapp(valor: string): boolean {
  return SI.has(normalizarNombre(valor))
}

/**
 * La celda, sin los espacios de las puntas y sin la comilla que una
 * exportación (la nuestra, `celdaSegura`) antepone a lo que parece una
 * fórmula: así un teléfono exportado como `'+56912345678` se vuelve a leer.
 */
function limpiarCelda(valor: string | undefined): string {
  const limpio = (valor ?? "").trim()
  return /^'[=+\-@]/.test(limpio) ? limpio.slice(1) : limpio
}

/** Un cliente listo para crear, con la fila del archivo de donde salió. */
export interface ClienteAImportar {
  fila: number
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  aceptaWhatsapp: boolean
}

/** Una fila que no se importa, y por qué. `fila` es la de la planilla: la cabecera es la 1. */
export interface FilaOmitida {
  fila: number
  motivo: string
}

export interface FilasPreparadas {
  candidatos: ClienteAImportar[]
  duplicados: FilaOmitida[]
  errores: FilaOmitida[]
}

const filaSchema = z.object({
  name: nombre(),
  email: emailOVacio(),
  phone: telefonoChileno(),
  notes: notas(),
})

/** El correo para comparar: en minúsculas. Vacío, `null`. */
const claveDeEmail = (email: string | null | undefined) => email?.trim().toLowerCase() || null

/**
 * Valida cada fila de datos (la primera es la cabecera y no se importa) y
 * descarta las que repiten, dentro del mismo archivo, el teléfono o el correo
 * de una anterior. Las filas vacías se saltan sin contarlas.
 *
 * Nombre y apellido se juntan en el nombre, como lo escribe el panel. Sin
 * columna de consentimiento, nadie queda con consentimiento de WhatsApp.
 */
export function prepararFilas(filas: readonly (readonly string[])[], mapeo: Mapeo): FilasPreparadas {
  const resultado: FilasPreparadas = { candidatos: [], duplicados: [], errores: [] }
  const filaDelTelefono = new Map<string, number>()
  const filaDelEmail = new Map<string, number>()

  filas.slice(1).forEach((celdas, i) => {
    const fila = i + 2
    if (celdas.every((celda) => celda.trim() === "")) return

    const leer = (campo: CampoDeImportacion) => {
      const indice = mapeo[campo]
      return indice === undefined ? "" : limpiarCelda(celdas[indice])
    }

    const validado = filaSchema.safeParse({
      name: [leer("nombre"), leer("apellido")].filter(Boolean).join(" "),
      email: leer("email"),
      phone: leer("telefono"),
      notes: leer("notas"),
    })
    if (!validado.success) {
      resultado.errores.push({ fila, motivo: validado.error.issues[0]?.message ?? "Datos inválidos" })
      return
    }

    const { name, email, phone, notes } = validado.data
    const emailComparable = claveDeEmail(email)
    const repetida = (phone && filaDelTelefono.get(phone)) || (emailComparable && filaDelEmail.get(emailComparable))
    if (repetida) {
      resultado.duplicados.push({ fila, motivo: `Repite el teléfono o el correo de la fila ${repetida}` })
      return
    }
    if (phone) filaDelTelefono.set(phone, fila)
    if (emailComparable) filaDelEmail.set(emailComparable, fila)

    resultado.candidatos.push({
      fila,
      name,
      phone,
      email: email || null,
      notes: notes || null,
      aceptaWhatsapp: mapeo.whatsapp !== undefined && aceptaWhatsapp(leer("whatsapp")),
    })
  })

  return resultado
}

/**
 * Separa los candidatos que ya están en el negocio: mismo teléfono (los
 * guardados antes de normalizar también se leen en E.164) o mismo correo, sin
 * distinguir mayúsculas.
 */
export function descartarExistentes(
  candidatos: readonly ClienteAImportar[],
  existentes: readonly { phone: string | null; email: string | null }[]
): { nuevos: ClienteAImportar[]; duplicados: FilaOmitida[] } {
  const telefonos = new Set(existentes.map((cliente) => aE164Chile(cliente.phone)).filter(Boolean))
  const emails = new Set(existentes.map((cliente) => claveDeEmail(cliente.email)).filter(Boolean))

  const nuevos: ClienteAImportar[] = []
  const duplicados: FilaOmitida[] = []
  for (const candidato of candidatos) {
    if (candidato.phone && telefonos.has(candidato.phone)) {
      duplicados.push({ fila: candidato.fila, motivo: "Ya existe un cliente con ese teléfono" })
    } else if (candidato.email && emails.has(claveDeEmail(candidato.email))) {
      duplicados.push({ fila: candidato.fila, motivo: "Ya existe un cliente con ese correo" })
    } else {
      nuevos.push(candidato)
    }
  }
  return { nuevos, duplicados }
}
