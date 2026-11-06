/**
 * Pasa a `+56` los teléfonos de clientes guardados antes de la etapa 1 (#92),
 * con la misma regla que el panel (`aE164Chile`, lib/telefono.ts). Lo corre el
 * dueño, a mano (README.md, "Teléfonos antiguos a +56"):
 *
 *     node scripts/normalizar-telefonos.ts [--simular | --aplicar] [--negocio <businessId>]
 *
 * Por defecto simula: sólo cuenta cuántos cambiaría y cuántos no se pueden
 * leer. Nunca imprime teléfonos ni nombres, sólo conteos: la salida puede
 * quedar en la terminal o en un log. Con `--aplicar` escribe, de a lotes, y
 * sólo si el teléfono sigue igual que cuando lo leyó: si alguien lo editó
 * mientras tanto, lo deja. Los que no se pueden leer como chilenos no se
 * tocan: se corrigen a mano desde la ficha.
 *
 * Recorre todos los negocios salvo que se pase `--negocio`: es una tarea de
 * mantenimiento de la base, no un endpoint con sesión.
 *
 * Corre con el type stripping de Node, como `prisma/seed.ts`. Por eso
 * `lib/telefono.ts` se importa con su extensión y en tiempo de ejecución
 * (TypeScript no acepta un import con extensión .ts sin cambiar el tsconfig),
 * y la lógica que se puede probar sin base vive en funciones exportadas.
 */
import { pathToFileURL } from "node:url"

type Normalizar = (texto: string | null | undefined) => string | null

/** Cuántos clientes se leen y se escriben por vuelta. */
export const TAMANO_DE_LOTE = 500

export interface Opciones {
  aplicar: boolean
  negocio: string | null
}

const USO = "Uso: node scripts/normalizar-telefonos.ts [--simular | --aplicar] [--negocio <businessId>]"

/** Los argumentos de la línea de comandos, o un error que dice qué está mal. */
export function leerOpciones(argumentos: string[]): Opciones | { error: string } {
  let simular = false
  let aplicar = false
  let negocio: string | null = null

  for (let i = 0; i < argumentos.length; i++) {
    const argumento = argumentos[i]
    if (argumento === "--simular") simular = true
    else if (argumento === "--aplicar") aplicar = true
    else if (argumento === "--negocio" || argumento.startsWith("--negocio=")) {
      const valor = argumento === "--negocio" ? argumentos[++i] : argumento.slice("--negocio=".length)
      if (!valor || valor.startsWith("--")) return { error: `Falta el id del negocio después de --negocio. ${USO}` }
      negocio = valor
    } else return { error: `No entiendo "${argumento}". ${USO}` }
  }

  if (simular && aplicar) return { error: `--simular y --aplicar no van juntos. ${USO}` }
  return { aplicar, negocio }
}

export interface Cambio {
  id: string
  /** Lo guardado, tal cual: la escritura sólo pasa si sigue igual. */
  anterior: string
  nuevo: string
}

export interface Clasificacion {
  cambios: Cambio[]
  /** Ya en `+56XXXXXXXXX`: no se tocan. */
  yaNormalizados: number
  /** No se pueden leer como chilenos (8 dígitos de antes de 2016, extranjeros, texto). */
  ilegibles: number
  /** Texto vacío o sólo espacios: no hay número que normalizar. */
  vacios: number
}

/** Qué pasa con cada teléfono de un lote. Sin base: se prueba sola. */
export function clasificar(clientes: { id: string; phone: string | null }[], normalizar: Normalizar): Clasificacion {
  const resultado: Clasificacion = { cambios: [], yaNormalizados: 0, ilegibles: 0, vacios: 0 }
  for (const { id, phone } of clientes) {
    if (phone === null || phone.trim() === "") {
      resultado.vacios++
      continue
    }
    const nuevo = normalizar(phone)
    if (nuevo === null) resultado.ilegibles++
    else if (nuevo === phone) resultado.yaNormalizados++
    else resultado.cambios.push({ id, anterior: phone, nuevo })
  }
  return resultado
}

export interface Totales {
  revisados: number
  cambios: number
  escritos: number
  yaNormalizados: number
  ilegibles: number
  vacios: number
}

/** El resumen para la terminal: sólo conteos, nunca un teléfono ni un nombre. */
export function resumen(totales: Totales, opciones: Opciones): string {
  const alcance = opciones.negocio ? `el negocio ${opciones.negocio}` : "todos los negocios"
  const lineas = [
    opciones.aplicar ? `Normalización de teléfonos en ${alcance}:` : `Simulación (no se escribió nada) en ${alcance}:`,
    `  clientes con teléfono revisados: ${totales.revisados}`,
    `  ya estaban en +56: ${totales.yaNormalizados}`,
    opciones.aplicar
      ? `  normalizados: ${totales.escritos} de ${totales.cambios} (los demás cambiaron mientras tanto y se dejaron)`
      : `  se normalizarían: ${totales.cambios}`,
    `  no se pueden leer como chilenos (se dejan como están): ${totales.ilegibles}`,
    `  vacíos: ${totales.vacios}`,
  ]
  if (!opciones.aplicar && totales.cambios > 0) lineas.push("Para escribirlos, correr de nuevo con --aplicar.")
  return lineas.join("\n")
}

async function main() {
  const opciones = leerOpciones(process.argv.slice(2))
  if ("error" in opciones) {
    console.error(opciones.error)
    process.exitCode = 1
    return
  }

  // Recién acá: al importarlo desde un test no debe leer el .env ni abrir nada.
  await import("dotenv/config")
  const { PrismaClient } = await import("@prisma/client")
  const rutaDeTelefono = new URL("../lib/telefono.ts", import.meta.url).href
  const { aE164Chile } = (await import(rutaDeTelefono)) as typeof import("../lib/telefono")

  const prisma = new PrismaClient()
  const totales: Totales = { revisados: 0, cambios: 0, escritos: 0, yaNormalizados: 0, ilegibles: 0, vacios: 0 }
  try {
    let desde: string | null = null
    for (;;) {
      const lote: { id: string; phone: string | null }[] = await prisma.customer.findMany({
        where: {
          phone: { not: null },
          ...(opciones.negocio && { businessId: opciones.negocio }),
          ...(desde !== null && { id: { gt: desde } }),
        },
        select: { id: true, phone: true },
        orderBy: { id: "asc" },
        take: TAMANO_DE_LOTE,
      })
      if (lote.length === 0) break
      desde = lote[lote.length - 1].id

      const { cambios, yaNormalizados, ilegibles, vacios } = clasificar(lote, aE164Chile)
      totales.revisados += lote.length
      totales.cambios += cambios.length
      totales.yaNormalizados += yaNormalizados
      totales.ilegibles += ilegibles
      totales.vacios += vacios

      if (opciones.aplicar && cambios.length > 0) {
        // `updateMany` con el teléfono leído en el where: si alguien lo
        // cambió desde el panel mientras tanto, no se pisa (cuenta 0).
        const escritos = await prisma.$transaction(
          cambios.map(({ id, anterior, nuevo }) =>
            prisma.customer.updateMany({ where: { id, phone: anterior }, data: { phone: nuevo } })
          )
        )
        totales.escritos += escritos.reduce((suma, { count }) => suma + count, 0)
      }
    }
  } finally {
    await prisma.$disconnect()
  }

  console.log(resumen(totales, opciones))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    // Sólo el tipo y el código: el mensaje de un error de Prisma en una
    // consulta puede traer los valores de la fila (un teléfono). El de no
    // poder conectarse sí se muestra: dice el host, no la contraseña.
    const nombre = error instanceof Error ? error.name : "error desconocido"
    const detalle =
      nombre === "PrismaClientInitializationError" && error instanceof Error
        ? error.message
        : String((error as { code?: unknown } | null)?.code ?? "")
    console.error("Falló la normalización:", nombre, detalle)
    process.exitCode = 1
  })
}
