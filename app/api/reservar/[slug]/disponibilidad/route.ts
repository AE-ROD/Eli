import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { candidatosDeLaReserva, horasLibresDelDia, horasPosiblesEnElNegocio } from "@/lib/agenda-publica"
import { horasConRebaja, leerHoraValle } from "@/lib/hora-valle"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import {
  MENSAJE_FECHA_MUY_LEJANA,
  MENSAJE_FECHA_PASADA,
  MENSAJE_URGENCIA_SIN_HORAS,
  MENSAJE_URGENCIA_SOLO_HOY,
  duracionDeLaReserva,
  esHoyEn,
  esReservaDeUrgencia,
  fechaNoReservable,
  mensajeProfesionalNoDisponible,
  mensajeServicioNoEncontrado,
} from "@/lib/reserva-publica"
import { esRubroDental } from "@/lib/rubros"
import {
  MENSAJE_SEDE_NO_VALIDA,
  leerSedeDelPedido,
  leerSedesDeLaReserva,
  resolverSedeDeLaReserva,
} from "@/lib/sede-de-la-reserva"
import { leerServiciosDeLaReserva, resumenDeLaReserva } from "@/lib/servicios-de-la-reserva"
import { servicioIdsSchema } from "@/lib/validaciones"
import { esFechaCalendario, zonaDelNegocio } from "@/lib/zona-horaria"

const FALTA_LA_FECHA = "Falta la fecha (AAAA-MM-DD)"
const FALTA_EL_SERVICIO = "Falta el servicio (servicioId)"

/**
 * Lo que llega por la URL, validado antes de tocar la base. `esFechaCalendario` exige un
 * día que exista, de 1900 a 9998, con formato AAAA-MM-DD: con `fecha=xyz` (o `2026-02-30`),
 * `new Date` daba una fecha inválida, el día de la semana salía `NaN` y la
 * consulta del horario terminaba en un 500. `servicioId` es un id (`cuid()`
 * en el esquema, de 25 caracteres): el tope corta un texto arbitrario antes de
 * mandarlo a la base.
 *
 * Varios servicios (#89a): `servicioIds=a,b,c` (hasta 4, sin repetir, en el
 * orden en que se hacen). `servicioId` suelto sigue valiendo: es uno solo.
 *
 * Clínica dental: `primeraVez=1` suma 15 minutos (`duracionDeLaReserva`); en
 * otro rubro se ignora. `0`, o sin él, no suma nada.
 *
 * Sedes (plan Independiente): `sedeId` es la sede que eligió quien reserva; no
 * pasa por este esquema sino por `resolverSedeDeLaReserva`, que la revalida
 * contra las sedes activas del negocio del `slug`. Con dos o más sedes activas
 * es obligatoria: sin ella, o con una que no es una sede activa de este
 * negocio, 400. Sin sedes se ignora, y con una sola se usa esa.
 */
const parametrosSchema = z.object({
  fecha: z
    .string({ required_error: FALTA_LA_FECHA, invalid_type_error: FALTA_LA_FECHA })
    // La regla de fecha aceptable es una sola (`esFechaCalendario`): con
    // `.date()` pasaban años como 0050 o 9999 que el cálculo del día no
    // acepta, y terminaban en un 500.
    .refine(esFechaCalendario, "La fecha no es válida: tiene que ser un día real, con el formato AAAA-MM-DD"),
  servicioId: z
    .string({ invalid_type_error: FALTA_EL_SERVICIO })
    .min(1, FALTA_EL_SERVICIO)
    .max(64, "El servicio (servicioId) no es válido")
    .optional(),
  servicioIds: z
    .string({ invalid_type_error: FALTA_EL_SERVICIO })
    .max(400, "Los servicios (servicioIds) no son válidos")
    .transform((lista) => lista.split(","))
    .pipe(servicioIdsSchema)
    .optional(),
  // Opcional: sin él (o vacío) es "cualquiera disponible".
  profesionalId: z
    .string({ invalid_type_error: "El profesional no es válido" })
    .max(64, "El profesional no es válido")
    .optional(),
  primeraVez: z
    .enum(["0", "1"], { errorMap: () => ({ message: "La primera vez (primeraVez) tiene que ser 0 o 1" }) })
    .transform((valor) => valor === "1")
    .optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  // Público y sin sesión, fuera del límite del panel (`proxy.ts`): el tope es
  // éste, por IP. No es el de `reserva` porque cada día que se mira en el
  // calendario es una consulta (`lecturaPublica` en `lib/rate-limit.ts`).
  const { permitido } = await verificarLimite("lecturaPublica", obtenerIp(request))
  if (!permitido) {
    return NextResponse.json({ error: "Demasiadas solicitudes, intenta más tarde" }, { status: 429 })
  }

  const { slug } = await params
  const { searchParams } = new URL(request.url)
  const parametros = parametrosSchema.safeParse({
    fecha: searchParams.get("fecha") ?? undefined,
    servicioId: searchParams.get("servicioId") ?? undefined,
    servicioIds: searchParams.get("servicioIds") ?? undefined,
    profesionalId: searchParams.get("profesionalId") ?? undefined,
    primeraVez: searchParams.get("primeraVez") ?? undefined,
  })
  if (!parametros.success) {
    return NextResponse.json({ error: parametros.error.issues[0].message }, { status: 400 })
  }
  const { fecha, servicioId } = parametros.data
  const servicioIds = parametros.data.servicioIds ?? (servicioId ? [servicioId] : null)
  if (!servicioIds || (parametros.data.servicioIds && servicioId)) {
    return NextResponse.json({ error: FALTA_EL_SERVICIO }, { status: 400 })
  }
  const profesionalId = parametros.data.profesionalId || null

  const negocio = await prisma.business.findUnique({
    where: { slug },
    select: { id: true, timezone: true, type: true },
  })
  if (!negocio) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 })

  // La sede, revalidada contra las sedes activas de ESTE negocio: el id del
  // navegador no se usa tal cual. Con varias sedes, el horario que se mira es el
  // de la elegida; si no, el vigente de siempre.
  const eleccionDeSede = resolverSedeDeLaReserva(
    await leerSedesDeLaReserva(prisma, negocio.id),
    leerSedeDelPedido(searchParams.get("sedeId"))
  )
  if (eleccionDeSede.tipo === "no-valida") return NextResponse.json({ error: MENSAJE_SEDE_NO_VALIDA }, { status: 400 })
  const sedeId = eleccionDeSede.sedeDelHorario

  // Todos del negocio y activos, o el mismo 404 sin decir cuál falló.
  const servicios = await leerServiciosDeLaReserva(prisma, negocio.id, servicioIds)
  if (!servicios) return NextResponse.json({ error: mensajeServicioNoEncontrado(negocio.type) }, { status: 404 })
  // Clínica dental: la primera vez suma 15 minutos, con la misma cuenta que
  // `confirmar` (`duracionDeLaReserva`). En otro rubro, la suma de siempre.
  const clinicaDental = esRubroDental(negocio.type)
  const duracion = duracionDeLaReserva(resumenDeLaReserva(servicios).duracion, {
    clinicaDental,
    primeraVez: parametros.data.primeraVez === true,
  })
  const urgencia = esReservaDeUrgencia(clinicaDental, servicios)

  // El día, las horas y "hoy" son los del negocio (`Business.timezone`), no
  // los del servidor: `new Date("AAAA-MM-DD").getDay()` daba el día anterior
  // al oeste de UTC, y en Vercel (UTC) las horas quedaban corridas.
  const zona = zonaDelNegocio(negocio.timezone)
  const ahora = new Date()

  // Ni días pasados ni a más de `DIAS_MAXIMOS_DE_ANTICIPACION` de hoy en el
  // reloj del negocio (`lib/reserva-publica.ts`, la misma regla que
  // `confirmar`). La fecha es válida, sólo que no se reserva: sin horas y con
  // el motivo, como un día sin atención.
  const noReservable = fechaNoReservable(fecha, ahora, zona)
  if (noReservable) {
    return NextResponse.json({
      slots: [],
      mensaje: noReservable === "pasada" ? MENSAJE_FECHA_PASADA : MENSAJE_FECHA_MUY_LEJANA,
      sinListaDeEspera: true,
    })
  }

  // Urgencia dental: sólo horas de hoy, en el reloj de la clínica. Otro día
  // responde sin horas y con el motivo; `confirmar` lo rechaza igual.
  if (urgencia && !esHoyEn(fecha, ahora, zona)) {
    return NextResponse.json({ slots: [], mensaje: MENSAJE_URGENCIA_SOLO_HOY, sinListaDeEspera: true })
  }

  // Quién puede atender y en qué franjas (`lib/agenda-publica.ts`): la misma
  // regla con la que `confirmar` acepta y asigna.
  const reserva = await candidatosDeLaReserva(prisma, {
    businessId: negocio.id,
    serviceIds: servicios.map((servicio) => servicio.id),
    profesionalId,
    fecha,
    sedeId,
  })
  if (reserva.tipo === "profesional-no-disponible") {
    return NextResponse.json({ error: mensajeProfesionalNoDisponible(negocio.type) }, { status: 404 })
  }

  const candidatos = reserva.candidatos.filter((candidato) => candidato.franjas.length > 0)
  const consultaDelDia = { businessId: negocio.id, zona, fecha, duracion, candidatos, ahora }
  const slots = candidatos.length > 0 ? await horasLibresDelDia(prisma, consultaDelDia) : []

  // `sinListaDeEspera`: el día no tiene ninguna hora que se pueda liberar
  // (cerrado, bloqueado entero o ya pasado), así que la página no ofrece
  // "Avísame si se libera una hora" (QA#26). La inscripción lo vuelve a
  // comprobar (`inscribirEnListaDeEspera`). Se mira a nivel del negocio y no
  // del profesional elegido: si no, un día bloqueado sólo para esa persona
  // se distinguía de uno lleno (`horasPosiblesEnElNegocio`). Así, con
  // profesional, un día sin horas suyas responde igual sea cual sea el motivo.
  if (slots.length === 0) {
    const delNegocio = await horasPosiblesEnElNegocio(prisma, {
      businessId: negocio.id,
      serviceIds: servicios.map((servicio) => servicio.id),
      fecha,
      zona,
      duracion,
      ahora,
      sedeId,
    })
    // Una urgencia sin horas hoy lo dice claro, con o sin lista de espera.
    const sinHorasDeUrgencia = urgencia ? { mensaje: MENSAJE_URGENCIA_SIN_HORAS } : {}
    if (delNegocio === "con-horas-posibles") return NextResponse.json({ slots, ...sinHorasDeUrgencia })
    return NextResponse.json(
      delNegocio === "sin-atencion"
        ? { slots, mensaje: "No hay atención ese día", sinListaDeEspera: true, ...sinHorasDeUrgencia }
        : { slots, sinListaDeEspera: true, ...sinHorasDeUrgencia }
    )
  }

  // Hora valle (#89c): `slots` sigue siendo la lista de horas, como siempre
  // (la página de antes sólo lee eso). Sólo si el negocio la encendió y
  // alguna hora cuesta menos, va además `valle`: esas horas con su precio
  // total rebajado y el normal. El precio lo vuelve a calcular `confirmar`.
  const valle = horasConRebaja(servicios, fecha, slots, zona, await leerHoraValle(prisma, negocio.id))
  return NextResponse.json(valle.length > 0 ? { slots, valle } : { slots })
}
