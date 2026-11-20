import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import { leerSedeDelPedido } from "@/lib/sede-de-la-reserva"
import { horasLibres } from "@/lib/reserva-del-negocio"
import { servicioIdsSchema } from "@/lib/validaciones"
import { esFechaCalendario } from "@/lib/zona-horaria"

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

  // Las reglas (sedes, rubro, urgencias, hora valle) están en
  // `lib/reserva-del-negocio.ts`, las mismas con que `confirmar` acepta.
  const horas = await horasLibres(
    negocio,
    {
      fecha,
      servicioIds,
      profesionalId,
      primeraVez: parametros.data.primeraVez === true,
      sedePedida: leerSedeDelPedido(searchParams.get("sedeId")),
    },
    new Date()
  )
  if (horas.tipo === "rechazada") return NextResponse.json({ error: horas.error }, { status: horas.status })
  const { tipo: _tipo, ...respuesta } = horas
  return NextResponse.json(respuesta)
}
