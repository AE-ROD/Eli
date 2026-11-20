import type Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { formatearMonto } from "@/lib/dinero"
import { clienteNoEliminado } from "@/lib/clientes-eliminados"
import { formasDelTelefono, ORIGEN_WHATSAPP, tienenElMismoTelefono } from "@/lib/reserva-publica"
import {
  SELECCION_DEL_NEGOCIO_QUE_RESERVA,
  confirmarReserva,
  horasLibres,
  type DatosDeReserva,
} from "@/lib/reserva-del-negocio"
import { esFechaCalendario, esHoraDelDia } from "@/lib/zona-horaria"
import { MAX_HORARIOS_OFRECIDOS } from "@/lib/secretaria/config"

/**
 * Las herramientas de la Secretaria. Todas corren con el negocio y el número
 * de la conversación (`ContextoDeHerramientas`), que salen del canal de
 * WhatsApp o de la sesión del panel, nunca del modelo: lo que el modelo puede
 * elegir es el servicio, el día, la hora y el profesional, y todo eso se
 * revalida contra la base de ESE negocio.
 *
 * A propósito ninguna recibe el teléfono ni el id de la clienta: se usa el
 * número que escribe. Así un mensaje que le pide al modelo "busca el número
 * +569..." o "reserva a nombre de otra" no tiene por dónde hacerlo.
 */

export interface ContextoDeHerramientas {
  negocioId: string
  conversacionId: string
  /** El número que escribe, en E.164. */
  telefono: string
  /** La clienta de la conversación, si ya se identificó o registró. */
  customerId: string | null
  ahora: Date
}

export interface PedidoDeDerivacion {
  motivo: string
  /** Un profesional del negocio ya verificado, o null = la dueña. */
  memberId: string | null
}

export interface ResultadoDeHerramienta {
  contenido: Record<string, unknown>
  esError?: boolean
  derivar?: PedidoDeDerivacion
}

const id = z.string().min(1).max(64)
const textoCorto = z.string().trim().min(1).max(500)

const entradas = {
  buscar_cliente: z.object({}).strict(),
  registrar_cliente: z.object({ nombre: z.string().trim().min(2).max(120) }).strict(),
  listar_servicios: z.object({}).strict(),
  ver_disponibilidad: z
    .object({
      servicio_id: id,
      fecha: z.string().refine(esFechaCalendario),
      profesional_id: id.nullable(),
    })
    .strict(),
  crear_reserva: z
    .object({
      servicio_id: id,
      fecha: z.string().refine(esFechaCalendario),
      hora: z.string().refine(esHoraDelDia),
      profesional_id: id.nullable(),
    })
    .strict(),
  derivar_a_profesional: z.object({ motivo: textoCorto, profesional_id: id.nullable() }).strict(),
} as const

export type NombreDeHerramienta = keyof typeof entradas

const sinParametros = { type: "object" as const, properties: {}, required: [], additionalProperties: false }
const idONulo = { type: ["string", "null"] }

/** Las definiciones para la API. El orden es fijo: cambiarlo invalida el caché. */
export const HERRAMIENTAS: Anthropic.Tool[] = [
  {
    name: "buscar_cliente",
    description: "Busca si el número que escribe ya está registrado como clienta del negocio. Devuelve su nombre si existe.",
    input_schema: sinParametros,
    strict: true,
  },
  {
    name: "registrar_cliente",
    description: "Registra como clienta nueva a quien escribe, con su nombre y apellido. El teléfono es el del WhatsApp.",
    input_schema: {
      type: "object",
      properties: { nombre: { type: "string", description: "Nombre y apellido" } },
      required: ["nombre"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "listar_servicios",
    description: "Lista los servicios que se pueden reservar, con id, duración y precio.",
    input_schema: sinParametros,
    strict: true,
  },
  {
    name: "ver_disponibilidad",
    description: `Horarios libres para un servicio en un día (AAAA-MM-DD). Devuelve hasta ${MAX_HORARIOS_OFRECIDOS}. profesional_id null = cualquiera.`,
    input_schema: {
      type: "object",
      properties: {
        servicio_id: { type: "string" },
        fecha: { type: "string", description: "AAAA-MM-DD" },
        profesional_id: idONulo,
      },
      required: ["servicio_id", "fecha", "profesional_id"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "crear_reserva",
    description:
      "Crea la reserva de la clienta que escribe, después de que confirmó. Requiere que esté identificada o registrada.",
    input_schema: {
      type: "object",
      properties: {
        servicio_id: { type: "string" },
        fecha: { type: "string", description: "AAAA-MM-DD" },
        hora: { type: "string", description: "HH:MM, uno de los horarios ofrecidos" },
        profesional_id: idONulo,
      },
      required: ["servicio_id", "fecha", "hora", "profesional_id"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "derivar_a_profesional",
    description:
      "Pasa la conversación a una persona del negocio. profesional_id: con quién estaba conversando la reserva, o null.",
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string", description: "Resumen breve de qué necesita la clienta" },
        profesional_id: idONulo,
      },
      required: ["motivo", "profesional_id"],
      additionalProperties: false,
    },
    strict: true,
  },
]

function error(mensaje: string): ResultadoDeHerramienta {
  return { contenido: { error: mensaje }, esError: true }
}

/** Las clientas del negocio con este número, de la más antigua a la más nueva. */
async function clientesDelNumero(negocioId: string, telefono: string) {
  const formas = formasDelTelefono(telefono)
  const candidatas = formas.length
    ? await prisma.customer.findMany({
        where: { AND: [{ businessId: negocioId, phone: { in: formas } }, clienteNoEliminado] },
        select: { id: true, name: true, lastName: true, phone: true, email: true },
        orderBy: { createdAt: "asc" },
        take: 10,
      })
    : await prisma.customer.findMany({
        where: { AND: [{ businessId: negocioId, phone: telefono }, clienteNoEliminado] },
        select: { id: true, name: true, lastName: true, phone: true, email: true },
        orderBy: { createdAt: "asc" },
        take: 10,
      })
  return formas.length ? candidatas.filter((cliente) => tienenElMismoTelefono(cliente.phone, telefono)) : candidatas
}

const nombreCompleto = (cliente: { name: string; lastName: string | null }) =>
  [cliente.name, cliente.lastName].filter(Boolean).join(" ").trim()

/** Reparte los horarios a lo largo del día: el primero, uno del medio y el último. */
export function horariosRepartidos(horas: string[], cuantos = MAX_HORARIOS_OFRECIDOS): string[] {
  if (horas.length <= cuantos) return horas
  const elegidos = new Set<number>()
  for (let i = 0; i < cuantos; i++) elegidos.add(Math.round((i * (horas.length - 1)) / (cuantos - 1)))
  return [...elegidos].sort((a, b) => a - b).map((indice) => horas[indice])
}

/** Verifica que el profesional sea de este negocio. Null si no se pidió o no es de acá. */
async function profesionalDelNegocio(negocioId: string, memberId: string | null): Promise<string | null> {
  if (!memberId) return null
  const miembro = await prisma.businessMember.findFirst({ where: { id: memberId, businessId: negocioId }, select: { id: true } })
  return miembro?.id ?? null
}

type Ejecutores = {
  [N in NombreDeHerramienta]: (
    entrada: z.infer<(typeof entradas)[N]>,
    contexto: ContextoDeHerramientas
  ) => Promise<ResultadoDeHerramienta>
}

const ejecutores: Ejecutores = {
  async buscar_cliente(_entrada, contexto) {
    const [clienta] = await clientesDelNumero(contexto.negocioId, contexto.telefono)
    if (!clienta) return { contenido: { registrada: false } }
    await vincularClienta(contexto, clienta.id)
    return { contenido: { registrada: true, nombre: nombreCompleto(clienta) } }
  },

  async registrar_cliente({ nombre }, contexto) {
    // Si ya hay una con este número, es ella: no se abre una ficha duplicada.
    const [existente] = await clientesDelNumero(contexto.negocioId, contexto.telefono)
    if (existente) {
      await vincularClienta(contexto, existente.id)
      return { contenido: { registrada: true, nombre: nombreCompleto(existente), yaExistia: true } }
    }
    const clienta = await prisma.customer.create({
      data: {
        name: nombre.replace(/\s+/g, " "),
        lastName: null,
        phone: contexto.telefono,
        tags: [],
        notes: "Registrada por la Secretaria Eli (WhatsApp).",
        businessId: contexto.negocioId,
      },
      select: { id: true, name: true },
    })
    await vincularClienta(contexto, clienta.id)
    return { contenido: { registrada: true, nombre: clienta.name } }
  },

  async listar_servicios(_entrada, contexto) {
    const servicios = await prisma.service.findMany({
      where: { businessId: contexto.negocioId, active: true },
      select: { id: true, name: true, duration: true, price: true },
      orderBy: { name: "asc" },
      take: 100,
    })
    return {
      contenido: {
        servicios: servicios.map((servicio) => ({
          id: servicio.id,
          nombre: servicio.name,
          duracionMinutos: servicio.duration,
          precio: servicio.price === null ? "a consultar" : formatearMonto(servicio.price),
        })),
      },
    }
  },

  async ver_disponibilidad({ servicio_id, fecha, profesional_id }, contexto) {
    const negocio = await prisma.business.findUnique({
      where: { id: contexto.negocioId },
      select: { id: true, timezone: true, type: true },
    })
    if (!negocio) return error("Negocio no encontrado")
    const horas = await horasLibres(
      negocio,
      { fecha, servicioIds: [servicio_id], profesionalId: profesional_id, primeraVez: false, sedePedida: null },
      contexto.ahora
    )
    if (horas.tipo === "rechazada") return error(horas.error)
    const ofrecidos = horariosRepartidos(horas.slots)
    return {
      contenido: {
        fecha,
        horarios: ofrecidos,
        ...(ofrecidos.length === 0 && { motivo: horas.mensaje ?? "No quedan horarios libres ese día" }),
      },
    }
  },

  async crear_reserva({ servicio_id, fecha, hora, profesional_id }, contexto) {
    if (!contexto.customerId) return error("Primero identifica o registra a la clienta (buscar_cliente o registrar_cliente)")
    const [negocio, clienta] = await Promise.all([
      prisma.business.findUnique({ where: { id: contexto.negocioId }, select: SELECCION_DEL_NEGOCIO_QUE_RESERVA }),
      prisma.customer.findFirst({
        where: { AND: [{ id: contexto.customerId, businessId: contexto.negocioId }, clienteNoEliminado] },
        select: { id: true, name: true, lastName: true, email: true },
      }),
    ])
    if (!negocio) return error("Negocio no encontrado")
    if (!clienta) return error("Clienta no encontrada")

    const [nombre, ...resto] = nombreCompleto(clienta).split(" ")
    const datos: DatosDeReserva = {
      servicioIds: [servicio_id],
      fecha,
      hora,
      nombre: nombre ?? "",
      apellido: resto.join(" "),
      email: clienta.email ?? undefined,
      telefono: contexto.telefono,
      profesionalId: profesional_id,
    }
    const resultado = await confirmarReserva(negocio, datos, {
      origen: ORIGEN_WHATSAPP,
      sedePedida: null,
      clienteId: clienta.id,
    })
    if (resultado.tipo === "rechazada") return error(resultado.error)
    return {
      contenido: {
        reservada: true,
        servicio: resultado.servicio,
        fecha,
        hora,
        precio: resultado.precio === null ? "a consultar" : formatearMonto(resultado.precio),
        profesional: resultado.profesional?.nombre ?? null,
        ...(resultado.sede && { lugar: resultado.sede }),
      },
    }
  },

  async derivar_a_profesional({ motivo, profesional_id }, contexto) {
    const memberId = await profesionalDelNegocio(contexto.negocioId, profesional_id)
    return { contenido: { derivada: true }, derivar: { motivo, memberId } }
  },
}

/** Deja a la clienta vinculada a la conversación (sólo dentro del negocio). */
async function vincularClienta(contexto: ContextoDeHerramientas, customerId: string): Promise<void> {
  contexto.customerId = customerId
  await prisma.conversacionDeSecretaria.updateMany({
    where: { id: contexto.conversacionId, businessId: contexto.negocioId },
    data: { customerId },
  })
}

/** Corre una herramienta pedida por el modelo. Una entrada inválida o una herramienta desconocida vuelven como error. */
export async function ejecutarHerramienta(
  nombre: string,
  entrada: unknown,
  contexto: ContextoDeHerramientas
): Promise<ResultadoDeHerramienta> {
  if (!(nombre in entradas)) return error(`Herramienta desconocida: ${nombre}`)
  const herramienta = nombre as NombreDeHerramienta
  const leida = entradas[herramienta].safeParse(entrada)
  if (!leida.success) return error("Parámetros inválidos")
  const ejecutor = ejecutores[herramienta] as (
    entrada: unknown,
    contexto: ContextoDeHerramientas
  ) => Promise<ResultadoDeHerramienta>
  return ejecutor(leida.data, contexto)
}
