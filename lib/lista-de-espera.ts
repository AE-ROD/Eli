import { createHmac, hkdfSync, randomUUID } from "node:crypto"
import { after } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { candidatosDeLaReserva, horasLibresDelDia } from "@/lib/agenda-publica"
import { enviarAvisoListaDeEspera } from "@/lib/email"
import {
  AVISOS_POR_EVENTO_LISTA_DE_ESPERA,
  AVISOS_POR_INSCRIPCION,
  enviarAClientes,
  resumenVacio,
  type ContextoDeCorrida,
  type ResumenDeTrabajo,
} from "@/lib/envios-a-clientes"
import { registrarError } from "@/lib/registro-de-errores"
import { MENSAJE_FECHA_MUY_LEJANA, MENSAJE_FECHA_PASADA, fechaNoReservable, normalizarEmail } from "@/lib/reserva-publica"
import { hashDeToken } from "@/lib/tokens"
import { fechaYMinutosEn, zonaDelNegocio } from "@/lib/zona-horaria"

/**
 * (servidor) La lista de espera (#74): "Avísame si se libera una hora".
 *
 * - **Inscribirse** (`inscribirEnListaDeEspera`): desde la reserva pública,
 *   para un día que no tiene horas libres de ese servicio (y profesional, si
 *   eligió). Sólo el día, sin franja (decisión f del dueño).
 * - **Avisar** (`avisarHoraLiberada`): cuando una hora futura se libera
 *   (cancelar o reagendar desde el enlace del cliente, cancelar, mover o
 *   borrar desde el panel), se recalculan las horas libres de cada
 *   inscripción activa de ese negocio y ese día con `horasLibresDelDia`, y a
 *   las que tienen alguna se les manda el correo. A todas las que calzan, con
 *   tope por evento; la hora es de quien confirme primero, y la transacción
 *   `Serializable` de `confirmar` ya resuelve la carrera.
 * - **Reservó** (`marcarReservo`): al confirmar una reserva con el mismo email
 *   y para el mismo día, sus inscripciones activas pasan a "reservo".
 * - **Salir** (`salirDeLaLista`): por el token del correo (página o POST de un
 *   clic, RFC 8058). Borra los datos personales.
 * - **Expirar** (`expirarListaDeEspera`, cron diario): las de días pasados en
 *   la zona del negocio pasan a "expirada" y se les borran los datos.
 *
 * El token: la base guarda sólo su sha256 (`tokenHash`), como el enlace de
 * gestión de una cita. Para poder ponerlo en cada aviso sin guardarlo en
 * claro, es un HMAC del id de la inscripción con una clave derivada de
 * `NEXTAUTH_SECRET` (contexto propio, como `lib/baja-de-clientes.ts`): el id
 * lo genera este módulo antes de crear la fila.
 */

/**
 * Inscripciones activas de un mismo email en un negocio. La siguiente no se
 * crea, pero el endpoint responde lo mismo que a un alta (no revela si ese
 * email ya espera en el negocio).
 */
export const INSCRIPCIONES_ACTIVAS_POR_EMAIL = 3

/**
 * Una inscripción avisada no se vuelve a avisar antes de esto: dos horas que
 * se liberan seguidas (dos cancelaciones) no le mandan dos correos.
 */
export const MINUTOS_ENTRE_AVISOS = 60

/** Cuántas inscripciones de un día se revisan por evento. */
const TOPE_DE_INSCRIPCIONES_POR_DIA = 200

/** Cuántos negocios revisa por corrida el cron que expira. */
const TOPE_DE_NEGOCIOS_POR_CORRIDA = 1000

export const ESTADOS_DE_INSCRIPCION = ["activa", "reservo", "expirada", "salio"] as const
export type EstadoDeInscripcion = (typeof ESTADOS_DE_INSCRIPCION)[number]

/** Lo que se escribe para borrar los datos personales de una inscripción que ya no está activa. */
export const SIN_DATOS_PERSONALES = {
  nombre: "",
  apellido: "",
  email: "",
  telefono: null,
  whatsappConsentAt: null,
} satisfies Prisma.InscripcionEnEsperaUpdateManyMutationInput

// ─── Token ───────────────────────────────────────────────────────────────────

const CONTEXTO_DEL_TOKEN = "eli:lista-de-espera:v1"
/** Un HMAC-SHA256 en base64url sin relleno. */
const FORMA_DEL_TOKEN = /^[A-Za-z0-9_-]{43}$/

function clave(): Buffer {
  const secreto = process.env.NEXTAUTH_SECRET
  if (!secreto) throw new Error("NEXTAUTH_SECRET no configurado: no se puede firmar el enlace de la lista de espera")
  return Buffer.from(hkdfSync("sha256", secreto, Buffer.alloc(0), CONTEXTO_DEL_TOKEN, 32))
}

/** El token del enlace "Salir de la lista" de una inscripción. Lanza sin `NEXTAUTH_SECRET`. */
export function tokenDeInscripcion(esperaId: string): string {
  return createHmac("sha256", clave()).update(esperaId, "utf8").digest("base64url")
}

/** El hash que se busca en la base, o `null` si el texto no tiene la forma de un token. Nunca lanza. */
export function hashDelTokenDeEspera(token: unknown): string | null {
  return typeof token === "string" && FORMA_DEL_TOKEN.test(token) ? hashDeToken(token) : null
}

function urlBase(): string {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000"
}

/** Los enlaces de un aviso: reservar con todo elegido, y salir de la lista (página y un clic). */
export function enlacesDelAviso(datos: {
  slug: string
  esperaId: string
  serviceId: string
  memberId: string | null
  fecha: string
}) {
  const base = urlBase()
  const slug = encodeURIComponent(datos.slug)
  const consulta = new URLSearchParams({ servicio: datos.serviceId, fecha: datos.fecha })
  if (datos.memberId) consulta.set("profesional", datos.memberId)
  const token = tokenDeInscripcion(datos.esperaId)
  return {
    enlaceReservar: `${base}/reservar/${slug}?${consulta}#reservar`,
    enlaceSalir: `${base}/reservar/${slug}/espera/${token}`,
    enlaceSalirEnUnClic: `${base}/api/reservar/${slug}/lista-de-espera/${token}`,
  }
}

// ─── Inscribirse ─────────────────────────────────────────────────────────────

export const MENSAJE_SIN_ATENCION = "Ese día no hay atención para este servicio. Elige otro día."
export const MENSAJE_HAY_HORAS = "Ese día todavía hay horas libres: elige una y reserva."

export interface DatosDeInscripcion {
  servicioId: string
  profesionalId?: string | null
  fecha: string
  nombre: string
  apellido: string
  email: string
  /** Ya en E.164, o null. */
  telefono: string | null
  whatsappConsentimiento?: boolean
}

export type ResultadoDeInscripcion =
  | { tipo: "inscrita" }
  /** Servicio o profesional que no son del negocio, no están activos o no hacen el servicio: 404 genérico. */
  | { tipo: "no-encontrada" }
  | { tipo: "tope" }
  | { tipo: "rechazada"; error: string }

/**
 * Anota a alguien en la lista de espera de un día. `negocio` es el del slug
 * (ya con la lista activa comprobada por quien llama). Todo lo demás se
 * verifica acá contra ese negocio: el servicio, el profesional y que ese día
 * de verdad no tenga horas. Inscribirse dos veces a lo mismo no crea otra fila.
 */
export async function inscribirEnListaDeEspera(
  negocio: { id: string; timezone: string | null },
  datos: DatosDeInscripcion,
  ahora = new Date()
): Promise<ResultadoDeInscripcion> {
  const email = normalizarEmail(datos.email)
  if (!email) return { tipo: "rechazada", error: "Falta el email" }

  const servicio = await prisma.service.findFirst({
    where: { id: datos.servicioId, businessId: negocio.id, active: true },
    select: { id: true, duration: true },
  })
  if (!servicio) return { tipo: "no-encontrada" }

  const zona = zonaDelNegocio(negocio.timezone)
  const noReservable = fechaNoReservable(datos.fecha, ahora, zona)
  if (noReservable) {
    return { tipo: "rechazada", error: noReservable === "pasada" ? MENSAJE_FECHA_PASADA : MENSAJE_FECHA_MUY_LEJANA }
  }

  const memberId = datos.profesionalId || null
  const reserva = await candidatosDeLaReserva(prisma, {
    businessId: negocio.id,
    serviceIds: [servicio.id],
    profesionalId: memberId,
    fecha: datos.fecha,
  })
  if (reserva.tipo === "profesional-no-disponible") return { tipo: "no-encontrada" }

  // Un día sin atención nunca va a liberar una hora; uno con horas libres no
  // necesita lista. Es la misma cuenta que hace `disponibilidad`.
  const candidatos = reserva.candidatos.filter((candidato) => candidato.franjas.length > 0)
  if (candidatos.length === 0) return { tipo: "rechazada", error: MENSAJE_SIN_ATENCION }
  const libres = await horasLibresDelDia(prisma, {
    businessId: negocio.id,
    zona,
    fecha: datos.fecha,
    duracion: servicio.duration,
    candidatos,
    ahora,
  })
  if (libres.length > 0) return { tipo: "rechazada", error: MENSAJE_HAY_HORAS }

  const esperaId = randomUUID()
  const tokenHash = hashDeToken(tokenDeInscripcion(esperaId))
  const conWhatsapp = datos.whatsappConsentimiento === true && Boolean(datos.telefono)

  return prisma.$transaction(async (tx) => {
    // El tope por email se cuenta y se escribe bajo un candado de ese negocio
    // y ese email: dos inscripciones a la vez no pasan las dos con 2 activas.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lista-de-espera:${negocio.id}:${email}`}))`

    const activas = await tx.inscripcionEnEspera.findMany({
      where: { businessId: negocio.id, email, estado: "activa" },
      select: { serviceId: true, memberId: true, fecha: true },
    })
    const repetida = activas.some(
      (fila) => fila.serviceId === servicio.id && fila.memberId === memberId && fila.fecha === datos.fecha
    )
    if (repetida) return { tipo: "inscrita" } as const
    if (activas.length >= INSCRIPCIONES_ACTIVAS_POR_EMAIL) return { tipo: "tope" } as const

    await tx.inscripcionEnEspera.create({
      data: {
        id: esperaId,
        businessId: negocio.id,
        serviceId: servicio.id,
        memberId,
        fecha: datos.fecha,
        nombre: datos.nombre,
        apellido: datos.apellido,
        email,
        telefono: datos.telefono,
        whatsappConsentAt: conWhatsapp ? ahora : null,
        tokenHash,
        createdAt: ahora,
      },
      select: { id: true },
    })
    return { tipo: "inscrita" } as const
  })
}

// ─── Reservó ─────────────────────────────────────────────────────────────────

/**
 * Al confirmar una reserva: las inscripciones activas de ese email para ese
 * día en el negocio pasan a "reservo" y no se les avisa más. Va con el `tx`
 * de `confirmar`, así que queda junto con la cita o no queda.
 */
export async function marcarReservo(
  db: Pick<Prisma.TransactionClient, "inscripcionEnEspera">,
  datos: { businessId: string; email: string | null | undefined; fecha: string; ahora: Date }
): Promise<number> {
  const email = normalizarEmail(datos.email)
  if (!email) return 0
  const { count } = await db.inscripcionEnEspera.updateMany({
    where: { businessId: datos.businessId, email, fecha: datos.fecha, estado: "activa" },
    data: { estado: "reservo", resueltaAt: datos.ahora },
  })
  return count
}

// ─── Salir ───────────────────────────────────────────────────────────────────

/**
 * "Salir de la lista" por el token del correo. Devuelve si sacó a alguien,
 * pero el endpoint responde igual en los dos casos. Sólo una inscripción
 * activa del negocio de ese slug; sus datos personales se borran.
 */
export async function salirDeLaLista(slug: string, token: unknown, ahora = new Date()): Promise<boolean> {
  const tokenHash = hashDelTokenDeEspera(token)
  if (!tokenHash) return false
  const { count } = await prisma.inscripcionEnEspera.updateMany({
    where: { tokenHash, estado: "activa", business: { slug } },
    data: { estado: "salio", resueltaAt: ahora, ...SIN_DATOS_PERSONALES },
  })
  return count > 0
}

// ─── Avisar ──────────────────────────────────────────────────────────────────

export interface HoraLiberada {
  /** El negocio de la cita que se canceló, movió o borró (leída con su filtro de permisos o su token). */
  businessId: string
  /** El inicio que tenía la cita: el horario que quedó libre. */
  inicio: Date
}

/**
 * Programa el aviso para después de responder (`after` de Next): quien
 * cancela no espera los correos, y si el aviso falla la cancelación ya está
 * hecha. Una hora que ya pasó no avisa.
 */
export function programarAvisoDeHoraLiberada(liberada: HoraLiberada): void {
  // Nunca lanza: la cancelación o el cambio ya se hicieron y tienen que responder.
  if (!(liberada.inicio instanceof Date) || !(liberada.inicio.getTime() > Date.now())) return
  try {
    after(() => avisarHoraLiberada(liberada))
  } catch (error) {
    // Sólo fuera de un pedido de Next (scripts, tests).
    registrarError("programando el aviso de la lista de espera", error)
  }
}

/**
 * Avisa a las inscripciones activas del día que se liberó y que ahora tienen
 * alguna hora libre. Nunca lanza.
 *
 * - No avisa por una hora pasada, ni si el negocio apagó la lista.
 * - Cada inscripción recibe a lo sumo `AVISOS_POR_INSCRIPCION` avisos, uno
 *   cada `MINUTOS_ENTRE_AVISOS` como máximo; cada evento avisa a lo sumo a
 *   `AVISOS_POR_EVENTO_LISTA_DE_ESPERA`, por orden de inscripción.
 * - El aviso n de una inscripción tiene la referencia `${esperaId}:${n}`: si
 *   dos eventos corren a la vez, el candado de `enviarAClientes` deja pasar uno.
 *   `n` sale de los envíos ya registrados de la inscripción (el mayor más uno),
 *   no sólo del contador `avisos`: si un correo salió pero falló la escritura
 *   del contador, el siguiente evento no choca para siempre con el mismo `n`.
 *   El contador y `ultimoAvisoAt` quedan como filtro rápido y para el panel.
 */
export async function avisarHoraLiberada(liberada: HoraLiberada, ahora = new Date()): Promise<ResumenDeTrabajo> {
  const resumen = resumenVacio()
  try {
    if (liberada.inicio.getTime() <= ahora.getTime()) return resumen

    const negocio = await prisma.business.findUnique({
      where: { id: liberada.businessId },
      select: { id: true, name: true, slug: true, timezone: true, listaDeEsperaActiva: true },
    })
    if (!negocio?.listaDeEsperaActiva) return resumen

    const zona = zonaDelNegocio(negocio.timezone)
    const fecha = fechaYMinutosEn(liberada.inicio, zona).fecha
    const ventana = new Date(ahora.getTime() - MINUTOS_ENTRE_AVISOS * 60_000)

    const inscripciones = await prisma.inscripcionEnEspera.findMany({
      where: {
        businessId: negocio.id,
        fecha,
        estado: "activa",
        avisos: { lt: AVISOS_POR_INSCRIPCION },
        OR: [{ ultimoAvisoAt: null }, { ultimoAvisoAt: { lt: ventana } }],
      },
      select: {
        id: true,
        serviceId: true,
        memberId: true,
        nombre: true,
        apellido: true,
        email: true,
        avisos: true,
        service: { select: { name: true, duration: true, active: true } },
      },
      orderBy: { createdAt: "asc" },
      take: TOPE_DE_INSCRIPCIONES_POR_DIA,
    })
    if (inscripciones.length === 0) return resumen

    // El nombre del profesional, sólo de miembros de este negocio: aunque se
    // colara una fila con un `memberId` ajeno, su nombre no sale en el correo.
    const idsDeProfesionales = [...new Set(inscripciones.flatMap((fila) => (fila.memberId ? [fila.memberId] : [])))]
    const profesionales = idsDeProfesionales.length
      ? await prisma.businessMember.findMany({
          where: { id: { in: idsDeProfesionales }, businessId: negocio.id },
          select: { id: true, user: { select: { name: true } } },
        })
      : []
    const nombreDelProfesional = new Map(profesionales.map((miembro) => [miembro.id, miembro.user?.name ?? null]))

    // Los avisos ya registrados de cada inscripción: de acá salen el número
    // del próximo y cuándo fue el último, aunque el contador se haya quedado atrás.
    const previos = await prisma.envioAClientes.findMany({
      where: { businessId: negocio.id, tipo: "lista-de-espera", esperaId: { in: inscripciones.map((fila) => fila.id) } },
      select: { esperaId: true, referencia: true, enviadoAt: true },
    })
    const historial = new Map<string, { mayor: number; ultimo: Date | null }>()
    for (const envio of previos) {
      if (!envio.esperaId) continue
      const actual = historial.get(envio.esperaId) ?? { mayor: 0, ultimo: null }
      const numero = Number(envio.referencia.slice(envio.esperaId.length + 1))
      if (envio.referencia.startsWith(`${envio.esperaId}:`) && Number.isInteger(numero) && numero > actual.mayor) {
        actual.mayor = numero
      }
      if (!actual.ultimo || envio.enviadoAt > actual.ultimo) actual.ultimo = envio.enviadoAt
      historial.set(envio.esperaId, actual)
    }

    // Si hay hora libre se calcula una vez por servicio y profesional.
    const hayHora = new Map<string, boolean>()
    const tieneHoraLibre = async (fila: (typeof inscripciones)[number]): Promise<boolean> => {
      const llave = `${fila.serviceId}|${fila.memberId ?? ""}`
      const guardada = hayHora.get(llave)
      if (guardada !== undefined) return guardada
      let libre = false
      if (fila.service?.active) {
        const reserva = await candidatosDeLaReserva(prisma, {
          businessId: negocio.id,
          serviceIds: [fila.serviceId],
          profesionalId: fila.memberId,
          fecha,
        })
        if (reserva.tipo === "ok") {
          const candidatos = reserva.candidatos.filter((candidato) => candidato.franjas.length > 0)
          const horas = candidatos.length
            ? await horasLibresDelDia(prisma, {
                businessId: negocio.id,
                zona,
                fecha,
                duracion: fila.service.duration,
                candidatos,
                ahora,
              })
            : []
          libre = horas.length > 0
        }
      }
      hayHora.set(llave, libre)
      return libre
    }

    for (const fila of inscripciones) {
      if (resumen.enviados >= AVISOS_POR_EVENTO_LISTA_DE_ESPERA) break
      resumen.revisados++
      const yaAvisado = historial.get(fila.id)
      const numero = Math.max(fila.avisos, yaAvisado?.mayor ?? 0) + 1
      const muyPronto = yaAvisado?.ultimo != null && yaAvisado.ultimo >= ventana
      if (numero > AVISOS_POR_INSCRIPCION || muyPronto || !fila.email || !(await tieneHoraLibre(fila))) {
        resumen.omitidas++
        continue
      }

      const enlaces = enlacesDelAviso({
        slug: negocio.slug,
        esperaId: fila.id,
        serviceId: fila.serviceId,
        memberId: fila.memberId,
        fecha,
      })
      const resultado = await enviarAClientes({
        businessId: negocio.id,
        zona,
        tipo: "lista-de-espera",
        canal: "correo",
        referencia: `${fila.id}:${numero}`,
        esperaId: fila.id,
        ahora,
        enviar: () =>
          enviarAvisoListaDeEspera({
            emailCliente: fila.email,
            nombreCliente: `${fila.nombre} ${fila.apellido}`.trim(),
            nombreNegocio: negocio.name,
            servicio: fila.service?.name ?? "",
            profesional: fila.memberId ? (nombreDelProfesional.get(fila.memberId) ?? null) : null,
            fecha,
            ...enlaces,
          }),
      })

      if (resultado === "enviado") {
        resumen.enviados++
        // Sólo hacia arriba: si otro evento ya contó uno mayor, no se pisa. Si
        // esta escritura falla, el próximo evento igual calcula bien el número
        // con los envíos registrados.
        await prisma.inscripcionEnEspera.updateMany({
          where: { id: fila.id, businessId: negocio.id, avisos: { lt: numero } },
          data: { avisos: numero, ultimoAvisoAt: ahora },
        })
      } else if (resultado === "fallido") {
        resumen.fallidos++
      } else {
        resumen.omitidas++
      }
    }
  } catch (error) {
    registrarError("avisando a la lista de espera", error)
    resumen.fallidos++
  }
  return resumen
}

// ─── Expirar (cron diario) ───────────────────────────────────────────────────

/** El día UTC siguiente a `ahora`: ninguna zona está más adelante que eso. */
function mañanaEnUtc(ahora: Date): string {
  return new Date(ahora.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * Cron diario: pasa a "expirada" las inscripciones activas de días ya
 * pasados (en la zona de cada negocio) y borra sus datos personales, y
 * también los de las que ya reservaron o salieron. No manda nada. Corta al
 * llegar a `contexto.hasta` y lo dice en `incompleto`.
 */
export async function expirarListaDeEspera(contexto: ContextoDeCorrida): Promise<ResumenDeTrabajo> {
  const resumen = resumenVacio()
  const pendientes: Prisma.InscripcionEnEsperaWhereInput = {
    OR: [{ estado: "activa" }, { email: { not: "" } }],
  }

  const filas = await prisma.inscripcionEnEspera.findMany({
    where: { AND: [{ fecha: { lt: mañanaEnUtc(contexto.ahora) } }, pendientes] },
    select: { businessId: true, business: { select: { timezone: true } } },
    distinct: ["businessId"],
    take: TOPE_DE_NEGOCIOS_POR_CORRIDA,
  })
  const negocios = new Map<string, string | null>()
  for (const fila of filas) negocios.set(fila.businessId, fila.business?.timezone ?? null)

  for (const [businessId, timezone] of negocios) {
    if (Date.now() >= contexto.hasta) {
      resumen.incompleto = true
      break
    }
    const hoy = fechaYMinutosEn(contexto.ahora, zonaDelNegocio(timezone)).fecha
    try {
      const expiradas = await prisma.inscripcionEnEspera.updateMany({
        where: { businessId, fecha: { lt: hoy }, estado: "activa" },
        data: { estado: "expirada", resueltaAt: contexto.ahora, ...SIN_DATOS_PERSONALES },
      })
      const resueltas = await prisma.inscripcionEnEspera.updateMany({
        where: { businessId, fecha: { lt: hoy }, estado: { not: "activa" }, email: { not: "" } },
        data: SIN_DATOS_PERSONALES,
      })
      resumen.revisados += expiradas.count + resueltas.count
    } catch (error) {
      registrarError("expirando la lista de espera", error)
      resumen.fallidos++
    }
  }
  return resumen
}
