import { prisma } from "@/lib/prisma"
import { enviarTeToca } from "@/lib/email"
import { enlacesDeBajaDeCliente } from "@/lib/baja-de-clientes"
import { clienteNoEliminado } from "@/lib/clientes-eliminados"
import {
  conConsentimientoPromocional,
  enviarAClientes,
  resumenVacio,
  type ContextoDeCorrida,
  type ResumenDeTrabajo,
} from "@/lib/envios-a-clientes"
import { DIAS_DE_HISTORIAL, estaVencido, fechaDeVisita, frecuenciasPorCliente } from "@/lib/frecuencia-de-visitas"
import { registrarError } from "@/lib/registro-de-errores"
import { rangoDelDiaEn, sumarDias, zonaDelNegocio } from "@/lib/zona-horaria"

/**
 * (servidor) "Te toca" (#75): el correo al cliente al que ya le toca volver.
 * Lo llama una vez al día el cron (`lib/mensajes-a-clientes.ts`); la firma de
 * `ejecutarTeToca` no se cambia sin cambiarla allá.
 *
 * Sale a un cliente sólo si se cumple todo:
 * - su negocio lo encendió (`avisoDeVueltaActivo`, apagado por defecto);
 * - tiene consentimiento promocional vigente y email, y no se eliminó;
 * - tiene ciclo (`lib/frecuencia-de-visitas.ts`) y hoy, en la zona del
 *   negocio, ya es su última visita más el ciclo;
 * - no tiene una cita futura en pie (pendiente o confirmada);
 * - no se le mandó ya por esta misma última visita: la referencia del candado
 *   es `${customerId}:${fechaUltimaVisita}`, así que vuelve a tocarle sólo
 *   después de una visita nueva.
 *
 * Cada envío pasa por `enviarAClientes`, que vuelve a mirar el consentimiento
 * y que el cliente sea del negocio, y aplica el candado, el cupo de la
 * corrida y el tope diario de promocionales. Nunca lanza por un cliente: un
 * fallo de envío se cuenta y la próxima corrida lo reintenta.
 *
 * Defensa en profundidad, como en el cron de recordatorios: una atención
 * guarda el cliente con una FK simple, la base no garantiza que sea del mismo
 * negocio. Una atención con un cliente de otro negocio no se usa: se cuenta en
 * `omitidas` y se registra sólo el id de la atención.
 */

/** Cuántas atenciones se leen por negocio y corrida, como mucho. */
const TOPE_DE_ATENCIONES_POR_NEGOCIO = 20_000

function urlBase(): string {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000"
}

/** Por qué se cortó el negocio: ya no queda cupo ni tiempo, o llegó a su tope del día. */
type Corte = "corrida" | "negocio" | null

export async function ejecutarTeToca(contexto: ContextoDeCorrida): Promise<ResumenDeTrabajo> {
  const resumen = resumenVacio()

  const negocios = await prisma.business.findMany({
    where: { avisoDeVueltaActivo: true },
    select: { id: true, name: true, slug: true, timezone: true },
    orderBy: { id: "asc" },
  })

  for (const negocio of negocios) {
    if (Date.now() > contexto.hasta || contexto.cupo.restantes <= 0) {
      resumen.incompleto = true
      break
    }
    let corte: Corte = null
    try {
      corte = await teTocaEnElNegocio(negocio, contexto, resumen)
    } catch (error) {
      // Un negocio que falla no corta a los demás.
      registrarError("en el cron de te toca", error)
      resumen.fallidos++
    }
    if (corte === "corrida") {
      resumen.incompleto = true
      break
    }
  }
  return resumen
}

interface Negocio {
  id: string
  name: string
  slug: string
  timezone: string | null
}

async function teTocaEnElNegocio(negocio: Negocio, contexto: ContextoDeCorrida, resumen: ResumenDeTrabajo): Promise<Corte> {
  const zona = zonaDelNegocio(negocio.timezone)
  const hoy = fechaDeVisita(contexto.ahora, zona)
  const desde = rangoDelDiaEn(sumarDias(hoy, -DIAS_DE_HISTORIAL), zona).desde

  const atenciones = await prisma.visit.findMany({
    where: {
      businessId: negocio.id,
      status: "finalizada",
      arrivedAt: { gte: desde },
      customer: { is: { AND: [conConsentimientoPromocional, clienteNoEliminado, { email: { not: null } }] } },
    },
    select: {
      id: true,
      arrivedAt: true,
      customer: { select: { id: true, businessId: true, name: true, email: true } },
      services: { where: { tipo: "servicio" }, select: { serviceId: true, serviceName: true } },
    },
    // Las más nuevas primero: si se llega al tope, lo que queda afuera es lo viejo.
    orderBy: { arrivedAt: "desc" },
    take: TOPE_DE_ATENCIONES_POR_NEGOCIO,
  })

  const clientes = new Map<string, { name: string; email: string }>()
  const visitas = []
  for (const atencion of atenciones) {
    const cliente = atencion.customer
    if (!cliente?.email) continue
    if (cliente.businessId !== negocio.id) {
      resumen.omitidas++
      console.error("Te toca omitido: la atención y su cliente son de negocios distintos", { visitId: atencion.id })
      continue
    }
    clientes.set(cliente.id, { name: cliente.name, email: cliente.email })
    visitas.push({
      customerId: cliente.id,
      arrivedAt: atencion.arrivedAt,
      servicios: atencion.services.map((s) => ({ serviceId: s.serviceId, nombre: s.serviceName })),
    })
  }
  if (clientes.size === 0) return null

  const idsDeServicios = [...new Set(visitas.flatMap((v) => v.servicios.map((s) => s.serviceId)).filter((id): id is string => !!id))]
  const servicios = idsDeServicios.length
    ? await prisma.service.findMany({ where: { businessId: negocio.id, id: { in: idsDeServicios } }, select: { id: true, frecuenciaDias: true } })
    : []
  const frecuencias = frecuenciasPorCliente(visitas, zona, new Map(servicios.map((s) => [s.id, s.frecuenciaDias])))

  const vencidos = [...frecuencias.values()].filter((f) => f.ciclo && estaVencido(f.ultimaVisita, f.ciclo.dias, hoy))
  if (vencidos.length === 0) return null
  const ids = vencidos.map((f) => f.customerId)

  const [conCita, yaAvisados] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        businessId: negocio.id,
        customerId: { in: ids },
        startTime: { gt: contexto.ahora },
        status: { in: ["pendiente", "confirmada"] },
      },
      select: { customerId: true },
    }),
    prisma.envioAClientes.findMany({
      where: { businessId: negocio.id, tipo: "te-toca", referencia: { in: vencidos.map((f) => `${f.customerId}:${f.ultimaVisita}`) } },
      select: { referencia: true },
    }),
  ])
  const tienenCita = new Set(conCita.map((c) => c.customerId))
  const avisados = new Set(yaAvisados.map((e) => e.referencia))

  for (const frecuencia of vencidos) {
    const referencia = `${frecuencia.customerId}:${frecuencia.ultimaVisita}`
    if (tienenCita.has(frecuencia.customerId) || avisados.has(referencia)) continue
    if (Date.now() > contexto.hasta) return "corrida"

    const cliente = clientes.get(frecuencia.customerId)!
    resumen.revisados++
    const resultado = await enviarAClientes({
      businessId: negocio.id,
      zona: negocio.timezone,
      tipo: "te-toca",
      canal: "correo",
      referencia,
      customerId: frecuencia.customerId,
      cupo: contexto.cupo,
      ahora: contexto.ahora,
      enviar: () =>
        enviarTeToca({
          emailCliente: cliente.email,
          nombreCliente: cliente.name,
          nombreNegocio: negocio.name,
          servicio: frecuencia.ultimoServicio,
          enlaceReservar: `${urlBase()}/reservar/${negocio.slug}`,
          ...enlacesDeBajaDeCliente(frecuencia.customerId),
        }),
    })

    if (resultado === "enviado") resumen.enviados++
    else if (resultado === "fallido") resumen.fallidos++
    else if (resultado === "omitido") resumen.omitidas++
    else if (resultado === "tope") return contexto.cupo.restantes <= 0 ? "corrida" : "negocio"
  }
  return null
}
