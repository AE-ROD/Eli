import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { candidatosDeLaReserva, horasLibresDelDia } from "@/lib/agenda-publica"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import { MENSAJE_FECHA_MUY_LEJANA, MENSAJE_FECHA_PASADA, fechaNoReservable } from "@/lib/reserva-publica"
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
 */
const parametrosSchema = z.object({
  fecha: z
    .string({ required_error: FALTA_LA_FECHA, invalid_type_error: FALTA_LA_FECHA })
    // La regla de fecha aceptable es una sola (`esFechaCalendario`): con
    // `.date()` pasaban años como 0050 o 9999 que el cálculo del día no
    // acepta, y terminaban en un 500.
    .refine(esFechaCalendario, "La fecha no es válida: tiene que ser un día real, con el formato AAAA-MM-DD"),
  servicioId: z
    .string({ required_error: FALTA_EL_SERVICIO, invalid_type_error: FALTA_EL_SERVICIO })
    .min(1, FALTA_EL_SERVICIO)
    .max(64, "El servicio (servicioId) no es válido"),
  // Opcional: sin él (o vacío) es "cualquiera disponible".
  profesionalId: z
    .string({ invalid_type_error: "El profesional no es válido" })
    .max(64, "El profesional no es válido")
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
    profesionalId: searchParams.get("profesionalId") ?? undefined,
  })
  if (!parametros.success) {
    return NextResponse.json({ error: parametros.error.issues[0].message }, { status: 400 })
  }
  const { fecha, servicioId } = parametros.data
  const profesionalId = parametros.data.profesionalId || null

  const negocio = await prisma.business.findUnique({
    where: { slug },
    select: { id: true, timezone: true },
  })
  if (!negocio) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 })

  const servicio = await prisma.service.findFirst({
    where: { id: servicioId, businessId: negocio.id, active: true },
    select: { id: true, duration: true },
  })
  if (!servicio) return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 })

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
    })
  }

  // Quién puede atender y en qué franjas (`lib/agenda-publica.ts`): la misma
  // regla con la que `confirmar` acepta y asigna.
  const reserva = await candidatosDeLaReserva(prisma, {
    businessId: negocio.id,
    serviceId: servicio.id,
    profesionalId,
    fecha,
  })
  if (reserva.tipo === "profesional-no-disponible") {
    return NextResponse.json({ error: "Ese profesional no está disponible para este servicio" }, { status: 404 })
  }

  const candidatos = reserva.candidatos.filter((candidato) => candidato.franjas.length > 0)
  if (candidatos.length === 0) {
    return NextResponse.json({ slots: [], mensaje: "No hay atención ese día" })
  }

  const slots = await horasLibresDelDia(prisma, {
    businessId: negocio.id,
    zona,
    fecha,
    duracion: servicio.duration,
    candidatos,
    ahora,
  })

  return NextResponse.json({ slots })
}
