import { NextResponse, type NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { claveDeLimite, leerCitaDelEnlace, MENSAJE_ENLACE_INVALIDO, type CitaDelEnlace } from "@/lib/gestion-de-cita"
import { obtenerIp, verificarLimite, type TipoLimite } from "@/lib/rate-limit"
import { fechaYMinutosEn, zonaDelNegocio } from "@/lib/zona-horaria"
import { minutosAHora } from "@/lib/horario-dia"

/**
 * Lo que comparten los endpoints del enlace de gestión: los dos límites (por
 * IP y por token) y leer la cita. Todo lo que no encuentra una cita
 * gestionable responde el mismo 404 (`MENSAJE_ENLACE_INVALIDO`).
 */

export type Params = { params: Promise<{ slug: string; token: string }> }

export interface EnlaceAbierto {
  cita: CitaDelEnlace
  zona: string
  ahora: Date
  token: string
  slug: string
}

export const noEncontrada = () => NextResponse.json({ error: MENSAJE_ENLACE_INVALIDO }, { status: 404 })

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

  const ahora = new Date()
  const cita = await leerCitaDelEnlace(prisma, slug, token, ahora)
  if (!cita) return noEncontrada()
  return { cita, zona: zonaDelNegocio(cita.business.timezone), ahora, token, slug }
}

/** Fecha `AAAA-MM-DD` y hora `HH:MM` de un instante, en el reloj del negocio. */
export function fechaYHora(instante: Date, zona: string): { fecha: string; hora: string } {
  const { fecha, minutos } = fechaYMinutosEn(instante, zona)
  return { fecha, hora: minutosAHora(minutos) }
}

/** El nombre del cliente para el aviso al negocio. */
export function nombreDelCliente(cita: CitaDelEnlace): string {
  return [cita.customer?.name, cita.customer?.lastName].filter(Boolean).join(" ").trim() || "El cliente"
}

const INTENTOS_ANTE_CONFLICTO = 3

/**
 * Una transacción `Serializable` con los reintentos de `confirmar` ante un
 * conflicto de serialización (P2034). Si sigue chocando, `alRendirse`.
 */
export async function enTransaccionSerializable<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  alRendirse: () => T
): Promise<T> {
  for (let intento = 1; ; intento++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    } catch (error) {
      const conflicto = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"
      if (!conflicto) throw error
      if (intento >= INTENTOS_ANTE_CONFLICTO) return alRendirse()
    }
  }
}
