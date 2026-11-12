import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { categoriaDeServicio } from "@/lib/campos-del-panel"
import { CuerpoDemasiadoGrande, leerJsonConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { registrarError } from "@/lib/registro-de-errores"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import {
  MAX_SERVICIOS_POR_LOTE,
  MAX_SERVICIOS_POR_NEGOCIO,
  MOTIVO_REPETIDO_EN_EL_LOTE,
  MOTIVO_YA_EXISTE,
  TopeDeServicios,
  mensajeDeTopeDeServicios,
  repetidosDe,
  servicioParaCargarSchema,
  type ServicioParaCargar,
} from "@/lib/servicios-en-lote"
import { vocabularioDe } from "@/lib/vocabulario"
import { TOPE_DEL_CUERPO_EN_LOTE, autorizarEscrituraMasiva } from "../_escritura-masiva"

/**
 * Cargar varios servicios de una vez. La pantalla ya leyó y revisó la lista
 * (`lib/servicios-en-lote.ts`); acá se vuelve a validar cada servicio, porque
 * lo que revisó el navegador no se da por bueno.
 *
 * Un servicio que no pasa las reglas, o que repite uno del negocio o uno
 * anterior del mismo pedido (sin mayúsculas, tildes ni espacios de más), no
 * se crea: va en `omitidos` con su motivo y su posición en la lista enviada
 * (`fila`, desde 1). Los demás se crean todos en una sola transacción, o
 * ninguno. Si con ellos el negocio pasaría de `MAX_SERVICIOS_POR_NEGOCIO`, no
 * se crea nada y responde 409.
 *
 * Nunca marca urgencias (`esUrgencia` no viaja): en una clínica dental la
 * bandera se pone después, servicio por servicio, con `PUT /servicios/[id]`.
 */

const cargaSchema = z.object({
  servicios: z
    .array(z.unknown(), { required_error: "Faltan los servicios", invalid_type_error: "Los servicios tienen que ser una lista" })
    .min(1, "Agrega al menos un servicio")
    .max(MAX_SERVICIOS_POR_LOTE, `Una carga puede tener hasta ${MAX_SERVICIOS_POR_LOTE} servicios. Divídela en partes.`),
})

interface Omitido {
  fila: number
  name: string
  motivo: string
}

/** El primer problema de un servicio, con el mismo criterio que `respuestaDeDatosInvalidos`: nunca un texto en inglés. */
function motivoDe(error: z.ZodError): string {
  const [primero] = error.issues
  if (!primero) return "Datos inválidos"
  const porDefecto = z.defaultErrorMap(primero, { defaultError: "", data: undefined }).message
  return primero.message && primero.message !== porDefecto ? primero.message : "Datos inválidos"
}

/** El nombre con que se informa un servicio omitido, aunque no sea válido: texto corto o vacío. */
function nombreParaInformar(servicio: unknown): string {
  const nombre = typeof servicio === "object" && servicio !== null ? (servicio as { name?: unknown }).name : undefined
  return typeof nombre === "string" ? nombre.trim().slice(0, 100) : ""
}

export async function POST(request: NextRequest) {
  const puerta = await autorizarEscrituraMasiva()
  if ("respuesta" in puerta) return puerta.respuesta
  const { actor } = puerta

  try {
    const { servicios } = cargaSchema.parse(await leerJsonConTope(request, TOPE_DEL_CUERPO_EN_LOTE))

    const omitidos: Omitido[] = []
    const validos: { fila: number; servicio: ServicioParaCargar }[] = []
    servicios.forEach((enviado, indice) => {
      const fila = indice + 1
      const revisado = servicioParaCargarSchema.safeParse(enviado)
      if (revisado.success) validos.push({ fila, servicio: revisado.data })
      else omitidos.push({ fila, name: nombreParaInformar(enviado), motivo: motivoDe(revisado.error) })
    })

    // Una transacción con un candado por negocio: dos cargas (o un servicio suelto) a la vez
    // leerían los mismos nombres y pasarían los dos; con el candado, la segunda espera y ve
    // lo que la primera guardó.
    const creados = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`servicios:${actor.businessId}`}))`

      const existentes = await tx.service.findMany({ where: { businessId: actor.businessId }, select: { name: true } })
      const veredictos = repetidosDe(
        validos.map(({ servicio }) => servicio.name),
        existentes.map(({ name }) => name)
      )

      const aCrear: ServicioParaCargar[] = []
      validos.forEach(({ fila, servicio }, orden) => {
        const veredicto = veredictos[orden]
        if (veredicto === null) aCrear.push(servicio)
        else omitidos.push({ fila, name: servicio.name, motivo: veredicto === "existente" ? MOTIVO_YA_EXISTE : MOTIVO_REPETIDO_EN_EL_LOTE })
      })

      if (aCrear.length === 0) return 0
      if (existentes.length + aCrear.length > MAX_SERVICIOS_POR_NEGOCIO) {
        throw new TopeDeServicios(existentes.length, aCrear.length)
      }

      // Un solo INSERT. Se arma campo por campo: lo que no es de `ServicioParaCargar` no pasa.
      await tx.service.createMany({
        data: aCrear.map(({ name, duration, price, category, description }) => ({
          businessId: actor.businessId,
          name,
          duration,
          price,
          category,
          description,
        })),
      })
      return aCrear.length
    })

    omitidos.sort((a, b) => a.fila - b.fila)
    return NextResponse.json({ creados, omitidos })
  } catch (error) {
    if (error instanceof CuerpoDemasiadoGrande) return respuestaDeCuerpoDemasiadoGrande()
    if (error instanceof z.ZodError) return respuestaDeDatosInvalidos(error)
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "El pedido no es un JSON válido" }, { status: 400 })
    }
    if (error instanceof TopeDeServicios) {
      return NextResponse.json(
        { error: mensajeDeTopeDeServicios(error.existentes, error.nuevos, vocabularioDe(actor.rubro).palabras.servicio) },
        { status: 409 }
      )
    }
    registrarError("cargando servicios en lote", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

const cambioSchema = z
  .object({
    ids: z
      .array(z.string().min(1).max(64), { required_error: "Faltan los servicios a cambiar", invalid_type_error: "Los servicios a cambiar tienen que ser una lista" })
      .min(1, "Elige al menos un servicio")
      .max(200, "Se pueden cambiar hasta 200 servicios a la vez"),
    // Vacío o null es "sin categoría".
    category: categoriaDeServicio().nullable().optional(),
    active: z.boolean({ invalid_type_error: "Activo tiene que ser sí o no" }).optional(),
  })
  .refine((cambio) => cambio.category !== undefined || cambio.active !== undefined, {
    message: "Indica qué cambiar: la categoría o si están activos",
  })

/**
 * Cambiar la categoría y/o el estado (activo o no) de varios servicios a la
 * vez. Sólo toca los del negocio de la sesión: un id de otro negocio o que no
 * existe no falla ni se cuenta, simplemente no es de este negocio.
 */
export async function PATCH(request: NextRequest) {
  const puerta = await autorizarEscrituraMasiva()
  if ("respuesta" in puerta) return puerta.respuesta
  const { actor } = puerta

  try {
    const { ids, category, active } = cambioSchema.parse(await leerJsonConTope(request))

    const { count } = await prisma.service.updateMany({
      where: { businessId: actor.businessId, id: { in: [...new Set(ids)] } },
      data: {
        ...(category !== undefined ? { category } : {}),
        ...(active !== undefined ? { active } : {}),
      },
    })

    return NextResponse.json({ actualizados: count })
  } catch (error) {
    if (error instanceof CuerpoDemasiadoGrande) return respuestaDeCuerpoDemasiadoGrande()
    if (error instanceof z.ZodError) return respuestaDeDatosInvalidos(error)
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "El pedido no es un JSON válido" }, { status: 400 })
    }
    registrarError("cambiando servicios en lote", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
