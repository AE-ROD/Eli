import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { ResultadoDeEnvio } from "@/lib/email"
import { fechaYMinutosEn, rangoDelDiaEn, zonaDelNegocio } from "@/lib/zona-horaria"
import { registrarError } from "@/lib/registro-de-errores"

/**
 * (servidor) Todo mensaje a un cliente pasa por `enviarAClientes`: la lista de
 * espera, "te toca", la reseña y el "Escribirle" manual a un cliente que se va.
 * Un solo camino, con registro, candado y contador en `EnvioAClientes`. El día
 * que llegue WhatsApp se agrega `canal: "whatsapp"` y nada más cambia.
 *
 * El candado es el único `(businessId, tipo, referencia)`, igual que en los
 * correos de prueba (`lib/enviar-correo-de-prueba.ts`):
 *
 * 1. Se inserta la fila ANTES de enviar. Si ya existía (P2002), otro proceso
 *    lo mandó o lo está mandando: no se repite.
 * 2. Se envía. Fallo es: que lance, que Resend responda `{ error }`, o el
 *    `null` de cuando no hay `RESEND_API_KEY`.
 * 3. Si falló, se borra la fila: la próxima corrida lo reintenta.
 *
 * Antes del candado, en este orden: el cupo de la corrida, que el cliente y la
 * inscripción sean del negocio, el consentimiento (promocionales) y el tope
 * diario por negocio (promocionales por correo), que se cuenta en la misma
 * transacción que inserta la fila, bajo un candado del negocio. Nada de esto
 * lanza, y a los logs no va ningún dato personal.
 */

// ─── Topes (decisión b del dueño) ────────────────────────────────────────────

/** Correos promocionales por negocio y día (en su zona). */
export const TOPE_PROMOCIONALES_POR_NEGOCIO_Y_DIA = 50

/**
 * Envíos por corrida del cron, sumando todos los negocios y trabajos. El plan
 * gratuito de Resend comparte ~100 por día con recordatorios y correos de
 * prueba: revisar al confirmar el plan.
 */
export const TOPE_ENVIOS_POR_CORRIDA = 100

/** Lista de espera: a cuántos inscritos se avisa por cada hora que se libera. */
export const AVISOS_POR_EVENTO_LISTA_DE_ESPERA = 10

/** Lista de espera: cuántos avisos recibe, como máximo, una inscripción. */
export const AVISOS_POR_INSCRIPCION = 3

/** Reseña: como máximo una vez cada tantos días por cliente. */
export const DIAS_ENTRE_RESENAS = 90

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Los valores que aceptan los CHECKs de `envios_a_clientes`. */
export const TIPOS_DE_ENVIO = ["lista-de-espera", "te-toca", "resena", "contacto-manual"] as const
export const CANALES_DE_ENVIO = ["correo", "whatsapp", "manual"] as const
export const CATEGORIAS_DE_ENVIO = ["servicio", "promocional"] as const

export type TipoDeEnvio = (typeof TIPOS_DE_ENVIO)[number]
export type CanalDeEnvio = (typeof CANALES_DE_ENVIO)[number]
export type CategoriaDeEnvio = (typeof CATEGORIAS_DE_ENVIO)[number]

/**
 * La categoría sale del tipo, no la elige quien llama: así nadie manda un
 * promocional como si fuera de servicio y se salta el consentimiento. La
 * lista de espera es servicio (lo pidió la persona); el resto, promocional.
 */
export const CATEGORIA_DEL_TIPO: Record<TipoDeEnvio, CategoriaDeEnvio> = {
  "lista-de-espera": "servicio",
  "te-toca": "promocional",
  resena: "promocional",
  "contacto-manual": "promocional",
}

/** Cuántos envíos le quedan a una corrida del cron. Se comparte entre trabajos. */
export interface CupoDeCorrida {
  restantes: number
}

/** Lo que recibe cada trabajo del cron (`lib/mensajes-a-clientes.ts`). */
export interface ContextoDeCorrida {
  ahora: Date
  /** `Date.now()` límite: pasado esto, el trabajo corta y dice `incompleto`. */
  hasta: number
  cupo: CupoDeCorrida
}

/** Lo que devuelve cada trabajo del cron. */
export interface ResumenDeTrabajo {
  revisados: number
  enviados: number
  fallidos: number
  /** Cliente o inscripción de otro negocio (defensa en profundidad) u otros descartes. */
  omitidas: number
  incompleto: boolean
}

export const resumenVacio = (): ResumenDeTrabajo => ({ revisados: 0, enviados: 0, fallidos: 0, omitidas: 0, incompleto: false })

interface PedidoBase {
  /** Siempre el negocio de quien manda (sesión o fila leída), nunca uno que llegue de afuera. */
  businessId: string
  /** `Business.timezone`: el "día" del tope diario es el del negocio. */
  zona: string | null | undefined
  tipo: TipoDeEnvio
  /**
   * Qué se avisó, para no repetirlo. Convención por tipo:
   * - "lista-de-espera": `${esperaId}:${numeroDeAviso}` (1..AVISOS_POR_INSCRIPCION).
   * - "te-toca": `${customerId}:${fechaDeLaUltimaVisita}` (una vez por ciclo).
   * - "resena": `${customerId}:${fechaDeLaVisita}` (el tope de 90 días lo mira el trabajo).
   * - "contacto-manual": `${customerId}:${fechaDeHoy}`.
   */
  referencia: string
  customerId?: string | null
  esperaId?: string | null
  /** El cupo de la corrida, si lo manda el cron. */
  cupo?: CupoDeCorrida
  /** Para los tests; por defecto, ahora. */
  ahora?: Date
}

/** Correo (o WhatsApp, el día que exista): `enviar` lo manda de verdad. */
interface PedidoConEnvio extends PedidoBase {
  canal: "correo" | "whatsapp"
  enviar: () => Promise<ResultadoDeEnvio>
}

/** "Escribirle" desde el panel (wa.me o mailto): lo manda la persona, acá sólo se registra. */
interface PedidoManual extends PedidoBase {
  canal: "manual"
}

export type PedidoDeEnvio = PedidoConEnvio | PedidoManual

export type ResultadoDeEnvioAClientes =
  | "enviado"
  /** Otro proceso ya lo mandó o lo está mandando (el candado). */
  | "ya-enviado"
  /** Sin cupo en la corrida, o el negocio llegó al tope diario de promocionales. */
  | "tope"
  /** Promocional a un cliente sin consentimiento vigente (o sin cliente). */
  | "sin-consentimiento"
  /** Cliente o inscripción que no son del negocio, o un pedido mal armado. */
  | "omitido"
  | "fallido"

const LARGO_MAXIMO_DE_REFERENCIA = 200

// ─── Consentimiento promocional ──────────────────────────────────────────────

/** Para el `where` de clientes: los que tienen consentimiento promocional vigente. */
export const conConsentimientoPromocional: Prisma.CustomerWhereInput = { correoPromoConsentAt: { not: null } }

export type OrigenDeConsentimiento = "reserva-publica" | "panel"

/** Lo que se escribe al marcar la casilla (en la reserva pública o en la ficha). */
export function datosDeConsentimientoPromocional(origen: OrigenDeConsentimiento, ahora = new Date()) {
  return { correoPromoConsentAt: ahora, correoPromoConsentSource: origen } satisfies Prisma.CustomerUpdateInput
}

/** Lo que se escribe en la baja (en un clic o pedida en el local): sin consentimiento, con fecha de baja. */
export function datosDeBajaPromocional(ahora = new Date()) {
  return {
    correoPromoConsentAt: null,
    correoPromoConsentSource: null,
    correoPromoBajaAt: ahora,
  } satisfies Prisma.CustomerUpdateInput
}

// ─── Enviar ──────────────────────────────────────────────────────────────────

function esPedidoValido(pedido: PedidoDeEnvio): boolean {
  if (!pedido.businessId || !TIPOS_DE_ENVIO.includes(pedido.tipo) || !CANALES_DE_ENVIO.includes(pedido.canal)) return false
  if (!pedido.referencia || pedido.referencia.length > LARGO_MAXIMO_DE_REFERENCIA) return false
  if (pedido.canal !== "manual" && typeof pedido.enviar !== "function") return false
  return true
}

/** Promocionales por correo del negocio en su día de hoy. */
async function promocionalesDeHoy(
  db: Pick<Prisma.TransactionClient, "envioAClientes">,
  businessId: string,
  zona: string,
  ahora: Date
): Promise<number> {
  const { desde, hasta } = rangoDelDiaEn(fechaYMinutosEn(ahora, zona).fecha, zona)
  return db.envioAClientes.count({
    where: { businessId, categoria: "promocional", canal: "correo", enviadoAt: { gte: desde, lt: hasta } },
  })
}

/**
 * El candado del tope diario de un negocio. Contar y escribir la fila del
 * envío van bajo él, en la misma transacción: dos envíos a la vez con 49
 * contados no pasan los dos el tope de 50. La llave es
 * `hashtext('envios:' || businessId)`, como el de la caja (`lib/bloqueos-de-dinero.ts`).
 */
async function tomarCandadoDelTopeDiario(tx: Prisma.TransactionClient, businessId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`envios:${businessId}`}))`
}

export async function enviarAClientes(pedido: PedidoDeEnvio): Promise<ResultadoDeEnvioAClientes> {
  const { businessId, tipo, canal, referencia, cupo } = pedido
  const categoria = CATEGORIA_DEL_TIPO[tipo]
  const ahora = pedido.ahora ?? new Date()
  const customerId = pedido.customerId ?? null
  const esperaId = pedido.esperaId ?? null

  if (!esPedidoValido(pedido)) {
    console.error("Envío a clientes omitido: pedido mal armado", { tipo, canal })
    return "omitido"
  }
  if (cupo && canal !== "manual" && cupo.restantes <= 0) return "tope"

  let candado: string
  try {
    // Defensa en profundidad: las FK de `envios_a_clientes` son simples, la
    // base no garantiza que el cliente o la inscripción sean del negocio.
    const cliente = customerId
      ? await prisma.customer.findFirst({
          where: { id: customerId, businessId },
          select: { id: true, correoPromoConsentAt: true },
        })
      : null
    if (customerId && !cliente) {
      console.error("Envío a clientes omitido: el cliente es de otro negocio o no existe", { tipo })
      return "omitido"
    }
    if (esperaId) {
      const inscripcion = await prisma.inscripcionEnEspera.findFirst({ where: { id: esperaId, businessId }, select: { id: true } })
      if (!inscripcion) {
        console.error("Envío a clientes omitido: la inscripción es de otro negocio o no existe", { tipo })
        return "omitido"
      }
    }

    // El consentimiento lo exige todo promocional que sale solo; el manual lo
    // escribe la persona del negocio, que responde por él.
    if (categoria === "promocional" && canal !== "manual" && !cliente?.correoPromoConsentAt) return "sin-consentimiento"

    const datos = { businessId, customerId, esperaId, tipo, canal, categoria, referencia, enviadoAt: ahora }
    if (categoria === "promocional" && canal === "correo") {
      const zona = zonaDelNegocio(pedido.zona)
      const fila = await prisma.$transaction(async (tx) => {
        await tomarCandadoDelTopeDiario(tx, businessId)
        const enviadosHoy = await promocionalesDeHoy(tx, businessId, zona, ahora)
        if (enviadosHoy >= TOPE_PROMOCIONALES_POR_NEGOCIO_Y_DIA) return null
        return tx.envioAClientes.create({ data: datos, select: { id: true } })
      })
      if (!fila) return "tope"
      candado = fila.id
    } else {
      const fila = await prisma.envioAClientes.create({ data: datos, select: { id: true } })
      candado = fila.id
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "ya-enviado"
    registrarError(`registrando un envío a clientes "${tipo}"`, error)
    return "fallido"
  }

  if (pedido.canal === "manual") return "enviado"

  if (cupo) cupo.restantes--
  let enviado = false
  try {
    const resultado = await pedido.enviar()
    if (resultado?.error) {
      // Sólo el código de Resend: su mensaje puede repetir el destinatario.
      console.error(`Error enviando un mensaje a clientes "${tipo}":`, { name: resultado.error.name })
    }
    enviado = resultado !== null && !resultado.error
  } catch (error) {
    registrarError(`enviando un mensaje a clientes "${tipo}"`, error)
  }
  if (enviado) return "enviado"

  try {
    await prisma.envioAClientes.deleteMany({ where: { id: candado, businessId } })
  } catch (error) {
    registrarError(`liberando un envío a clientes "${tipo}"`, error)
  }
  return "fallido"
}

// ─── Contar ──────────────────────────────────────────────────────────────────

export interface EnviosDelMes {
  /** "AAAA-MM" en la zona del negocio. */
  mes: string
  total: number
  porCategoria: Record<CategoriaDeEnvio, number>
  porTipo: Record<TipoDeEnvio, number>
  porCanal: Record<CanalDeEnvio, number>
}

/** El primer día del mes siguiente a "AAAA-MM". */
function mesSiguiente(mes: string): string {
  const [año, numero] = mes.split("-").map(Number)
  return numero === 12 ? `${año + 1}-01-01` : `${año}-${String(numero + 1).padStart(2, "0")}-01`
}

/**
 * Lo enviado en el mes calendario de `ahora`, en la zona del negocio, por
 * categoría, tipo y canal: la tarjeta "Mensajes de este mes". `businessId`
 * tiene que salir de la sesión; quién la ve lo decide
 * `puedeVerMensajesAClientes`.
 */
export async function contarEnviosDelMes(
  businessId: string,
  zona: string | null | undefined,
  ahora = new Date()
): Promise<EnviosDelMes> {
  const z = zonaDelNegocio(zona)
  const mes = fechaYMinutosEn(ahora, z).fecha.slice(0, 7)
  const desde = rangoDelDiaEn(`${mes}-01`, z).desde
  const hasta = rangoDelDiaEn(mesSiguiente(mes), z).desde

  const filas = await prisma.envioAClientes.findMany({
    where: { businessId, enviadoAt: { gte: desde, lt: hasta } },
    select: { tipo: true, canal: true, categoria: true },
  })

  const cuenta = <T extends string>(valores: readonly T[]) => Object.fromEntries(valores.map((v) => [v, 0])) as Record<T, number>
  const resultado: EnviosDelMes = {
    mes,
    total: 0,
    porCategoria: cuenta(CATEGORIAS_DE_ENVIO),
    porTipo: cuenta(TIPOS_DE_ENVIO),
    porCanal: cuenta(CANALES_DE_ENVIO),
  }
  for (const fila of filas) {
    resultado.total++
    // Un valor fuera de la lista no debería existir (CHECK); si aparece, sólo suma al total.
    if (fila.categoria in resultado.porCategoria) resultado.porCategoria[fila.categoria as CategoriaDeEnvio]++
    if (fila.tipo in resultado.porTipo) resultado.porTipo[fila.tipo as TipoDeEnvio]++
    if (fila.canal in resultado.porCanal) resultado.porCanal[fila.canal as CanalDeEnvio]++
  }
  return resultado
}
