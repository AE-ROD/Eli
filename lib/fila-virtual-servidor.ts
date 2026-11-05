import { after } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { estadoDeAtencion } from "@/lib/abierto-ahora"
import { enviarAvisoFilaVirtual } from "@/lib/email"
import {
  MOTIVO_FILA_VACIADA,
  MOTIVO_SALIO_DE_LA_FILA,
  ORIGEN_FILA,
  TOPE_DE_FILA_MAXIMO,
  leTocaElAviso,
  minutosEstimados,
  minutosPorPersona,
  nombreParaPantalla,
  primerNombre,
} from "@/lib/fila-virtual"
import { horarioSemanalDeAtencion } from "@/lib/horario-de-atencion"
import { whereDeAtenciones, type Actor } from "@/lib/permisos"
import { registrarError } from "@/lib/registro-de-errores"
import { generarToken, hashDeToken } from "@/lib/tokens"
import { fechaYMinutosEn, zonaDelNegocio } from "@/lib/zona-horaria"

/**
 * (servidor) La fila virtual (#85): anotarse, mirar el turno, salir, la
 * pantalla del local y el aviso "ya casi es tu turno". Las reglas puras están
 * en `lib/fila-virtual.ts`.
 *
 * Quien se anota es una atención (`Visit`) "en-espera" con `origen` "fila":
 * el Tablero la atiende como a cualquiera que llega sin reserva. La fila de
 * un día son las atenciones de origen fila con `filaFecha` de ese día (en la
 * zona del negocio); la posición de alguien, cuántas de esas siguen en espera
 * con un número menor que el suyo.
 *
 * Aislamiento: lo público entra por el slug y el token, y toda consulta lleva
 * el `businessId` del negocio de ese slug; un token de otro negocio no se
 * encuentra (404). La pantalla del local usa el negocio de la sesión.
 */

const EN_ESPERA = "en-espera"
const EN_ATENCION = "en-atencion"

/** Cuántas veces se reintenta tomar un número cuando dos personas se anotan a la vez. */
const INTENTOS_DE_NUMERAR = 3

/** El token del celular: 32 bytes en base64url (`generarToken`). Lo demás no se busca en la base. */
const FORMA_DEL_TOKEN = /^[A-Za-z0-9_-]{43}$/

/** El hash que se busca en la base, o `null` si el texto no tiene la forma de un token. Nunca lanza. */
export function hashDelTokenDeFila(token: unknown): string | null {
  return typeof token === "string" && FORMA_DEL_TOKEN.test(token) ? hashDeToken(token) : null
}

/** El día de hoy del negocio, "AAAA-MM-DD" en su zona. */
function hoyEn(zona: string | null | undefined, ahora: Date): string {
  return fechaYMinutosEn(ahora, zonaDelNegocio(zona)).fecha
}

/** Las de la fila de un día de un negocio, en el estado que se pida. */
function deLaFila(businessId: string, filaFecha: string, status: string | { in: string[] }): Prisma.VisitWhereInput {
  return { businessId, origen: ORIGEN_FILA, filaFecha, status }
}

/**
 * Lo que el negocio necesita para la fila pública, con su horario de
 * atención (las franjas activas, generales y de miembros:
 * `horarioSemanalDeAtencion` decide cuál manda cada día). `null` si el slug
 * no existe.
 */
export async function negocioDeLaFila(slug: string) {
  const negocio = await prisma.business.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, timezone: true, filaVirtualActiva: true, filaVirtualTope: true },
  })
  if (!negocio) return null
  const workSchedules = await prisma.workSchedule.findMany({
    where: { businessId: negocio.id, active: true },
    select: { dayOfWeek: true, memberId: true, startTime: true, endTime: true },
    take: 500,
  })
  return { ...negocio, workSchedules }
}

type NegocioDeLaFila = NonNullable<Awaited<ReturnType<typeof negocioDeLaFila>>>

/**
 * Si el local está abierto en este instante, según su horario de atención
 * (el mismo que la página pública: `horarioSemanalDeAtencion`) y en su zona.
 * Sin horario cargado, cerrado: no se puede saber cuándo atiende.
 */
export function estaAbiertoAhora(negocio: Pick<NegocioDeLaFila, "timezone" | "workSchedules">, ahora: Date): boolean {
  const estado = estadoDeAtencion(horarioSemanalDeAtencion(negocio.workSchedules), ahora, zonaDelNegocio(negocio.timezone))
  return estado?.abierto === true
}

/** Cuántas personas esperan hoy en la fila del negocio. */
export function personasEsperando(businessId: string, zona: string | null | undefined, ahora: Date): Promise<number> {
  return prisma.visit.count({ where: deLaFila(businessId, hoyEn(zona, ahora), EN_ESPERA) })
}

// ─── Anotarse ────────────────────────────────────────────────────────────────

export type ResultadoDeAnotarse =
  | { tipo: "anotada"; token: string; numero: number }
  /** El local no está abierto en este momento. */
  | { tipo: "cerrada" }
  /** Ya hay tantas personas esperando como el tope del negocio. */
  | { tipo: "llena" }

/**
 * Anota a alguien en la fila de hoy. Quien llama ya comprobó que el negocio
 * existe y tiene la fila encendida.
 *
 * El tope y el número se deciden bajo un candado del negocio, en la misma
 * transacción que crea la atención: dos personas que se anotan a la vez no
 * pasan las dos el tope ni toman el mismo número. El único
 * (negocio, día, número) es la segunda barrera: si igual choca, se reintenta.
 */
export async function anotarseEnLaFila(
  negocio: NegocioDeLaFila,
  datos: { nombre: string; email?: string },
  ahora = new Date()
): Promise<ResultadoDeAnotarse> {
  if (!estaAbiertoAhora(negocio, ahora)) return { tipo: "cerrada" }
  const filaFecha = hoyEn(negocio.timezone, ahora)

  for (let intento = 1; ; intento++) {
    try {
      const resultado = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fila:${negocio.id}`}))`

        const esperando = await tx.visit.count({ where: deLaFila(negocio.id, filaFecha, EN_ESPERA) })
        if (esperando >= negocio.filaVirtualTope) return { tipo: "llena" as const }

        const ultimo = await tx.visit.findFirst({
          where: { businessId: negocio.id, origen: ORIGEN_FILA, filaFecha },
          orderBy: { filaNumero: "desc" },
          select: { filaNumero: true },
        })
        const numero = (ultimo?.filaNumero ?? 0) + 1

        const { token, tokenHash } = generarToken()
        await tx.visit.create({
          data: {
            businessId: negocio.id,
            customerName: datos.nombre,
            status: EN_ESPERA,
            arrivedAt: ahora,
            origen: ORIGEN_FILA,
            filaTokenHash: tokenHash,
            filaEmail: datos.email ?? null,
            filaFecha,
            filaNumero: numero,
          },
          select: { id: true },
        })
        return { tipo: "anotada" as const, token, numero }
      })
      // Quien queda con 0 o 1 personas adelante ya está para el aviso "ya
      // casi es tu turno": si no, recién le llegaría cuando la fila se mueva.
      if (resultado.tipo === "anotada") programarAvisoDeFila(negocio.id)
      return resultado
    } catch (error) {
      const choco = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
      if (!choco || intento >= INTENTOS_DE_NUMERAR) throw error
    }
  }
}

// ─── Mi turno ────────────────────────────────────────────────────────────────

/**
 * En qué está el turno, como lo lee el celular:
 * - "esperando": en la fila, con su posición.
 * - "atendiendo": ya pasó a atención.
 * - "terminado": atendido (por cobrar o cobrado).
 * - "fuera": salió de la fila o el local lo anuló.
 * - "vencido": quedó en espera de un día que ya pasó.
 */
export type EstadoDelTurno = "esperando" | "atendiendo" | "terminado" | "fuera" | "vencido"

export interface MiTurno {
  negocio: string
  numero: number
  /** El nombre con que se anotó: sólo el propio, nunca el de otras personas. */
  nombre: string
  estado: EstadoDelTurno
  /** Cuántas personas de la fila van antes. 0 fuera de "esperando". */
  adelante: number
  /** El tiempo estimado (`minutosEstimados`). 0 fuera de "esperando". */
  minutos: number
}

function estadoDelTurno(status: string, filaFecha: string | null, hoy: string): EstadoDelTurno {
  if (status === EN_ESPERA) return filaFecha === hoy ? "esperando" : "vencido"
  if (status === EN_ATENCION) return "atendiendo"
  if (status === "anulada") return "fuera"
  return "terminado"
}

/** El turno de ese token en ese negocio, o `null` si no existe o es de otro negocio. */
async function turnoDelToken(slug: string, token: string) {
  const hash = hashDelTokenDeFila(token)
  if (!hash) return null
  const negocio = await prisma.business.findUnique({ where: { slug }, select: { id: true, name: true, timezone: true } })
  if (!negocio) return null
  const turno = await prisma.visit.findFirst({
    where: { filaTokenHash: hash, businessId: negocio.id, origen: ORIGEN_FILA },
    select: { id: true, status: true, customerName: true, filaFecha: true, filaNumero: true },
  })
  return turno ? { negocio, turno } : null
}

/** Lo que ve el celular. `null` (404) si el token no es de un turno de ese negocio. */
export async function leerMiTurno(slug: string, token: string, ahora = new Date()): Promise<MiTurno | null> {
  const encontrado = await turnoDelToken(slug, token)
  if (!encontrado) return null
  const { negocio, turno } = encontrado

  const estado = estadoDelTurno(turno.status, turno.filaFecha, hoyEn(negocio.timezone, ahora))
  let adelante = 0
  let minutos = 0
  if (estado === "esperando" && turno.filaFecha && turno.filaNumero !== null) {
    const [antes, servicios] = await Promise.all([
      prisma.visit.count({
        where: { ...deLaFila(negocio.id, turno.filaFecha, EN_ESPERA), filaNumero: { lt: turno.filaNumero } },
      }),
      prisma.service.findMany({ where: { businessId: negocio.id, active: true }, select: { duration: true }, take: 200 }),
    ])
    adelante = antes
    minutos = minutosEstimados(antes, minutosPorPersona(servicios.map((servicio) => servicio.duration)))
  }

  return { negocio: negocio.name, numero: turno.filaNumero ?? 0, nombre: turno.customerName, estado, adelante, minutos }
}

export type ResultadoDeSalir = "fuera" | "no-encontrado" | "ya-no-espera"

/**
 * "Salir de la fila": la atención queda anulada, como cualquier otra que no
 * se atendió. Sólo desde "en espera": a quien ya están atendiendo no se lo
 * saca desde el celular.
 */
export async function salirDeLaFila(slug: string, token: string, ahora = new Date()): Promise<ResultadoDeSalir> {
  const encontrado = await turnoDelToken(slug, token)
  if (!encontrado) return "no-encontrado"
  const { negocio, turno } = encontrado

  const { count } = await prisma.visit.updateMany({
    where: { id: turno.id, businessId: negocio.id, origen: ORIGEN_FILA, status: EN_ESPERA },
    data: { status: "anulada", voidedAt: ahora, voidReason: MOTIVO_SALIO_DE_LA_FILA },
  })
  if (count === 0) return turno.status === "anulada" ? "fuera" : "ya-no-espera"
  programarAvisoDeFila(negocio.id)
  return "fuera"
}

// ─── Pantalla del local ──────────────────────────────────────────────────────

export interface TurnoEnPantalla {
  numero: number
  /** Nombre e inicial del apellido (`nombreParaPantalla`): nunca correo ni teléfono. */
  nombre: string
}

export interface PantallaDeLaFila {
  negocio: { nombre: string; slug: string }
  activa: boolean
  tope: number
  enEspera: TurnoEnPantalla[]
  enAtencion: TurnoEnPantalla[]
}

/**
 * La fila de hoy del negocio de la sesión, para la pantalla del local.
 * Quien llama ya preguntó `puedeVerPantallaDeFila`.
 */
export async function leerPantallaDeLaFila(actor: Actor, ahora = new Date()): Promise<PantallaDeLaFila | null> {
  const negocio = await prisma.business.findUnique({
    where: { id: actor.businessId },
    select: { name: true, slug: true, timezone: true, filaVirtualActiva: true, filaVirtualTope: true },
  })
  if (!negocio) return null

  const turnos = await prisma.visit.findMany({
    where: whereDeAtenciones(actor, deLaFila(actor.businessId, hoyEn(negocio.timezone, ahora), { in: [EN_ESPERA, EN_ATENCION] })),
    orderBy: { filaNumero: "asc" },
    select: { status: true, customerName: true, filaNumero: true },
    take: TOPE_DE_FILA_MAXIMO * 2,
  })
  const enPantalla = (status: string) =>
    turnos
      .filter((turno) => turno.status === status && turno.filaNumero !== null)
      .map((turno) => ({ numero: turno.filaNumero ?? 0, nombre: nombreParaPantalla(turno.customerName) }))

  return {
    negocio: { nombre: negocio.name, slug: negocio.slug },
    activa: negocio.filaVirtualActiva,
    tope: negocio.filaVirtualTope,
    enEspera: enPantalla(EN_ESPERA),
    enAtencion: enPantalla(EN_ATENCION),
  }
}

/**
 * "Vaciar la fila de hoy": anula todas las atenciones en espera de origen
 * fila del día, en el negocio de la sesión. Las que ya se atienden o
 * terminaron, las de otros días y las llegadas por el Tablero no se tocan.
 * Quien llama ya preguntó `puedeVaciarFilaVirtual`. Devuelve cuántas anuló.
 * No hay a quién avisar: ya no queda nadie esperando.
 */
export async function vaciarLaFilaDeHoy(
  actor: Actor,
  quien: { id: string | null; nombre: string | null },
  ahora = new Date()
): Promise<number | null> {
  const negocio = await prisma.business.findUnique({ where: { id: actor.businessId }, select: { timezone: true } })
  if (!negocio) return null
  const { count } = await prisma.visit.updateMany({
    where: whereDeAtenciones(actor, deLaFila(actor.businessId, hoyEn(negocio.timezone, ahora), EN_ESPERA)),
    data: {
      status: "anulada",
      voidedAt: ahora,
      voidedById: quien.id,
      voidedByName: quien.nombre,
      voidReason: MOTIVO_FILA_VACIADA,
    },
  })
  return count
}

// ─── Aviso "ya casi es tu turno" ─────────────────────────────────────────────

/**
 * Avisa por correo a quien quedó con 1 persona adelante (o ninguna) en la
 * fila de hoy, una sola vez por turno. Nunca lanza.
 *
 * El candado es `filaAvisadaAt`: se marca ANTES de enviar con un
 * `updateMany` que sólo matchea si seguía en null, así dos avisos a la vez no
 * mandan dos correos. Si el envío falla (o no hay `RESEND_API_KEY`), la marca
 * se borra y el próximo cambio de la fila lo reintenta.
 *
 * Es un correo de servicio: lo pidió la persona al dejar su correo. No pide
 * consentimiento promocional.
 */
export async function avisarFilaVirtual(businessId: string, ahora = new Date()): Promise<number> {
  let enviados = 0
  try {
    const negocio = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true, timezone: true } })
    if (!negocio) return 0

    // Los dos primeros de la fila: sólo a ellos les puede tocar.
    const primeros = await prisma.visit.findMany({
      where: deLaFila(businessId, hoyEn(negocio.timezone, ahora), EN_ESPERA),
      orderBy: { filaNumero: "asc" },
      select: { id: true, customerName: true, filaEmail: true, filaNumero: true, filaAvisadaAt: true },
      take: 2,
    })

    for (const [adelante, turno] of primeros.entries()) {
      if (!leTocaElAviso(adelante, turno.filaEmail, turno.filaAvisadaAt) || !turno.filaEmail) continue

      const marca = await prisma.visit.updateMany({
        where: { id: turno.id, businessId, status: EN_ESPERA, filaAvisadaAt: null },
        data: { filaAvisadaAt: ahora },
      })
      if (marca.count !== 1) continue

      let enviado = false
      try {
        const resultado = await enviarAvisoFilaVirtual({
          emailCliente: turno.filaEmail,
          // Sólo el primer nombre: lo escribió un anónimo y va en un correo.
          nombreCliente: primerNombre(turno.customerName),
          nombreNegocio: negocio.name,
          numero: turno.filaNumero ?? 0,
        })
        if (resultado?.error) console.error("Error enviando el aviso de la fila virtual:", { name: resultado.error.name })
        enviado = resultado !== null && !resultado.error
      } catch (error) {
        registrarError("enviando el aviso de la fila virtual", error)
      }

      if (enviado) {
        enviados++
      } else {
        await prisma.visit.updateMany({
          where: { id: turno.id, businessId, filaAvisadaAt: ahora },
          data: { filaAvisadaAt: null },
        })
      }
    }
  } catch (error) {
    registrarError("avisando a la fila virtual", error)
  }
  return enviados
}

/**
 * Programa el aviso para después de responder (`after` de Next): quien mueve
 * la fila no espera el correo. Se llama cuando alguien de la fila deja de
 * esperar (pasa a atención, sale o se anula) y cuando alguien se anota (por
 * si quedó con 0 o 1 adelante). Nunca lanza.
 */
export function programarAvisoDeFila(businessId: string): void {
  try {
    after(() => avisarFilaVirtual(businessId))
  } catch (error) {
    // Sólo fuera de un pedido de Next (scripts, tests).
    registrarError("programando el aviso de la fila virtual", error)
  }
}
