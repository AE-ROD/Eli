import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { verificarLimite } from "@/lib/rate-limit"
import { cuerpoConTope } from "@/lib/cuerpo-del-pedido"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { registrarError } from "@/lib/registro-de-errores"
import { clienteNoEliminado } from "@/lib/clientes-eliminados"
import { leerCsv } from "@/lib/csv"
import {
  COLUMNAS_MAXIMAS,
  FILAS_MAXIMAS,
  TAMAÑO_MAXIMO_EN_BYTES,
  descartarExistentes,
  mapeoSchema,
  prepararFilas,
  type ClienteAImportar,
  type FilaOmitida,
} from "@/lib/importar-clientes"
import { actorDeSesion, puedeImportarExportarClientes, whereDeClientes, type Actor } from "@/lib/permisos"

/**
 * Importar clientes desde un CSV. La pantalla ya leyó el archivo (y lo pasó a
 * texto) para la vista previa; acá se vuelve a leer y se valida todo: lo que
 * diga el navegador no se da por bueno.
 *
 * Responde el resumen: cuántos se crearon, y qué filas se omitieron por
 * duplicadas o por un error, con su número de fila y el motivo.
 */

/** Cuántos clientes se escriben por lote: cada lote es un solo `createMany`, todo o nada. */
const CLIENTES_POR_LOTE = 500

/**
 * El tope del cuerpo: el CSV va como texto dentro de un JSON, y al escaparlo
 * (comillas, saltos de línea) puede crecer. El doble del archivo alcanza; el
 * tamaño del CSV en sí se mide después.
 */
const TOPE_DEL_CUERPO = 2 * TAMAÑO_MAXIMO_EN_BYTES + 64 * 1024

const MENSAJE_DE_TAMAÑO = "El archivo pesa más de 2 MB. Divídelo en partes e impórtalas por separado."

const cuerpoSchema = z.object({
  csv: z.string({ required_error: "Falta el archivo" }),
  mapeo: mapeoSchema,
})

const porFila = (a: FilaOmitida, b: FilaOmitida) => a.fila - b.fila

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor || !puedeImportarExportarClientes(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  // Por negocio y antes de leer el cuerpo: el dueño y el encargado comparten
  // el cupo, y un pedido sobre el tope no llega a ocupar memoria.
  const { permitido } = await verificarLimite("importacionDeClientes", `negocio:${actor.businessId}`)
  if (!permitido) {
    return NextResponse.json(
      { error: "Ya se hicieron varias importaciones en la última hora. Intenta de nuevo más tarde." },
      { status: 429 }
    )
  }

  const leido = await cuerpoConTope(request, TOPE_DEL_CUERPO)
  if (leido.excedido) return NextResponse.json({ error: MENSAJE_DE_TAMAÑO }, { status: 413 })

  const validado = cuerpoSchema.safeParse(leido.cuerpo)
  if (!validado.success) return respuestaDeDatosInvalidos(validado.error)
  const { csv, mapeo } = validado.data

  if (new TextEncoder().encode(csv).byteLength > TAMAÑO_MAXIMO_EN_BYTES) {
    return NextResponse.json({ error: MENSAJE_DE_TAMAÑO }, { status: 413 })
  }

  const filas = leerCsv(csv)
  const cabecera = filas[0] ?? []
  if (filas.length < 2) {
    return NextResponse.json({ error: "El archivo no tiene clientes: le falta la cabecera o las filas." }, { status: 400 })
  }
  if (filas.length - 1 > FILAS_MAXIMAS) {
    return NextResponse.json(
      { error: `El archivo tiene más de ${FILAS_MAXIMAS.toLocaleString("es-CL")} filas. Divídelo en partes.` },
      { status: 400 }
    )
  }
  if (cabecera.length > COLUMNAS_MAXIMAS) {
    return NextResponse.json({ error: `El archivo tiene más de ${COLUMNAS_MAXIMAS} columnas.` }, { status: 400 })
  }
  if (Object.values(mapeo).some((indice) => indice !== undefined && indice >= cabecera.length)) {
    return NextResponse.json({ error: "Una de las columnas elegidas no está en el archivo." }, { status: 400 })
  }

  const { candidatos, duplicados, errores } = prepararFilas(filas, mapeo)

  try {
    const ahora = new Date()
    let creados = 0
    const yaEstaban: FilaOmitida[] = []
    const noGuardados: FilaOmitida[] = []
    for (let desde = 0; desde < candidatos.length; desde += CLIENTES_POR_LOTE) {
      const lote = candidatos.slice(desde, desde + CLIENTES_POR_LOTE)
      try {
        const resultado = await guardarLote(actor, lote, ahora)
        creados += resultado.creados
        yaEstaban.push(...resultado.duplicados)
      } catch (error) {
        // El lote no se escribió (es una transacción): sus filas se informan
        // y los lotes que siguen se intentan igual. Volver a importar el
        // mismo archivo no duplica lo que sí se guardó.
        registrarError("importando un lote de clientes", error)
        noGuardados.push(...lote.map(({ fila }) => ({ fila, motivo: "No se pudo guardar. Vuelve a importar el archivo." })))
      }
    }

    return NextResponse.json({
      creados,
      duplicados: [...duplicados, ...yaEstaban].sort(porFila),
      errores: [...errores, ...noGuardados].sort(porFila),
    })
  } catch (error) {
    registrarError("importando clientes", error)
    return NextResponse.json({ error: "No se pudo importar el archivo" }, { status: 500 })
  }
}

/**
 * Un lote, en una transacción serializada por negocio (#94): no hay una
 * restricción única de teléfono ni de correo en la base, así que dos
 * importaciones simultáneas del mismo negocio leían los mismos existentes y
 * creaban los dos el mismo cliente. Con el candado (`hashtext('importar:' ||
 * businessId)`, como el de la caja en `lib/bloqueos-de-dinero.ts`), la otra
 * espera, y al entrar lee lo que la primera ya guardó. Los existentes se leen
 * dentro, después de tomarlo. Los clientes eliminados no se comparan: ya no
 * tienen teléfono ni correo.
 */
async function guardarLote(
  actor: Actor,
  lote: ClienteAImportar[],
  ahora: Date
): Promise<{ creados: number; duplicados: FilaOmitida[] }> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`importar:${actor.businessId}`}))`
      const existentes = await tx.customer.findMany({
        where: whereDeClientes(actor, clienteNoEliminado),
        select: { phone: true, email: true },
      })
      const { nuevos, duplicados } = descartarExistentes(lote, existentes)
      if (nuevos.length === 0) return { creados: 0, duplicados }
      const { count } = await tx.customer.createMany({
        data: nuevos.map((cliente) => datosDelCliente(cliente, actor.businessId, ahora)),
      })
      return { creados: count, duplicados }
    },
    // Puede esperar a que termine el lote de otra importación del negocio.
    { timeout: 20_000 }
  )
}

/**
 * La fila de la base. El negocio sale de la sesión. El consentimiento de
 * WhatsApp sólo si el archivo trae la columna y dice que sí; si no, queda en
 * null, como cualquier cliente que no lo dio.
 */
function datosDelCliente(cliente: ClienteAImportar, businessId: string, ahora: Date) {
  return {
    businessId,
    name: cliente.name,
    phone: cliente.phone,
    email: cliente.email,
    notes: cliente.notes,
    tags: [],
    whatsappConsentAt: cliente.aceptaWhatsapp ? ahora : null,
    whatsappConsentSource: cliente.aceptaWhatsapp ? "importacion" : null,
  }
}
