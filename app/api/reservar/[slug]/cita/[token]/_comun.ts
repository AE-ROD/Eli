import { nombreCompletoDeCliente } from "@/lib/nombre-de-cliente"
import { NextResponse, type NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { horaDeLaBase } from "@/lib/bloqueos-de-dinero"
import { claveDeLimite, leerCitaDelEnlace, mensajeEnlaceInvalido, type CitaDelEnlace } from "@/lib/gestion-de-cita"
import { obtenerIp, verificarLimite, type TipoLimite } from "@/lib/rate-limit"
import { fechaYMinutosEn, zonaDelNegocio } from "@/lib/zona-horaria"
import { minutosAHora } from "@/lib/horario-dia"

/**
 * Lo que comparten los endpoints del enlace de gestión: los dos límites (por
 * IP y por token) y leer la cita. Todo lo que no encuentra una cita
 * gestionable responde el mismo 404 (`mensajeEnlaceInvalido`).
 */

export type Params = { params: Promise<{ slug: string; token: string }> }

export interface EnlaceAbierto {
  cita: CitaDelEnlace
  zona: string
  ahora: Date
  token: string
  slug: string
}

/**
 * El 404 del enlace. `rubro` (`Business.type`, de la base) pone la palabra de la
 * reserva; sin él, la de siempre ("cita").
 */
export const noEncontrada = (rubro?: string | null) =>
  NextResponse.json({ error: mensajeEnlaceInvalido(rubro) }, { status: 404 })

const demasiadas = () => NextResponse.json({ error: "Demasiadas solicitudes, intenta más tarde" }, { status: 429 })

/**
 * Los límites y la cita. `limiteDeIp` es el de lectura pública para mirar y
 * el de la reserva para cambiar. El límite por token va siempre: un enlace
 * filtrado no se puede usar en bucle aunque se roten IPs.
 */
export async function abrirEnlace(
  request: NextRequest,
  { params }: Params,
  limiteDeIp: TipoLimite
): Promise<EnlaceAbierto | NextResponse> {
  const { slug, token } = await params
  const [porIp, porToken] = await Promise.all([
    verificarLimite(limiteDeIp, obtenerIp(request)),
    verificarLimite("gestionDeCita", claveDeLimite(token)),
  ])
  if (!porIp.permitido || !porToken.permitido) return demasiadas()

  // La hora de la base, no la de esta instancia (#152, #154): con ella se
  // decide si la cita sigue gestionable y, en cada endpoint, el plazo y lo
  // que se guarda (`canceladaEn`). Una sola lectura por pedido.
  const ahora = await horaDeLaBase(prisma)
  const cita = await leerCitaDelEnlace(prisma, slug, token, ahora)
  if (!cita) {
    // El mismo 404 para todo lo que no sirve, con la palabra del rubro del
    // negocio del slug (público: es el de su página). Un slug que no existe
    // lo dice con las palabras de siempre.
    const negocio = await prisma.business.findUnique({ where: { slug }, select: { type: true } })
    return noEncontrada(negocio?.type)
  }
  return { cita, zona: zonaDelNegocio(cita.business.timezone), ahora, token, slug }
}

/** Fecha `AAAA-MM-DD` y hora `HH:MM` de un instante, en el reloj del negocio. */
export function fechaYHora(instante: Date, zona: string): { fecha: string; hora: string } {
  const { fecha, minutos } = fechaYMinutosEn(instante, zona)
  return { fecha, hora: minutosAHora(minutos) }
}

/** El nombre del cliente para el aviso al negocio. */
export function nombreDelCliente(cita: CitaDelEnlace): string {
  return (cita.customer && nombreCompletoDeCliente(cita.customer)) || "El cliente"
}

const INTENTOS_ANTE_CONFLICTO = 3

/**
 * Si Postgres no pudo ordenar la transacción con otra concurrente y hay que
 * reintentarla. Prisma lo dice como P2034, salvo cuando falla una consulta
 * cruda (el `UPDATE` del candado del sillón, `tomarCandadoDelSillon`): ahí es
 * P2010 con el código de Postgres, 40001.
 */
export function esConflictoDeSerializacion(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (error.code === "P2034") return true
  return error.code === "P2010" && (error.meta as { code?: unknown } | undefined)?.code === "40001"
}

/**
 * Una transacción `Serializable` con los reintentos de `confirmar` ante un
 * conflicto de serialización (`esConflictoDeSerializacion`). Si sigue
 * chocando, `alRendirse`.
 */
export async function enTransaccionSerializable<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  alRendirse: () => T
): Promise<T> {
  for (let intento = 1; ; intento++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    } catch (error) {
      const conflicto = esConflictoDeSerializacion(error)
      if (!conflicto) throw error
      if (intento >= INTENTOS_ANTE_CONFLICTO) return alRendirse()
    }
  }
}
