/**
 * Lo que la página de la Secretaria lee de la base al entrar. Es de servidor:
 * lo importa sólo `page.tsx`. Toda consulta filtra por el negocio del actor
 * (CLAUDE.md, regla 1). Las credenciales de WhatsApp no se leen nunca.
 */

import { prisma } from "@/lib/prisma"
import type { Actor } from "@/lib/permisos"
import { periodoDe, porcentajeGastado } from "@/lib/secretaria/costo"
import { presupuestoDelNegocio } from "@/lib/secretaria/config"
import { zonaDelNegocio } from "@/lib/zona-horaria"
import { estadoDelWhatsapp, type EstadoDelWhatsapp } from "./_datos"

/** Sin fila de ajustes la Secretaria está apagada, con los valores por defecto del esquema. */
export const AJUSTES_POR_DEFECTO = {
  activa: false,
  maxTurnos: 8,
  maxTokens: 200,
  reglas: null as string | null,
}

export type AjustesDeLaSecretaria = typeof AJUSTES_POR_DEFECTO

/** El WhatsApp del negocio como lo ve la pantalla al entrar. El QR no: lo pide la tarjeta. */
export type CanalDeLaSecretaria = Omit<EstadoDelWhatsapp, "qr">

/** Sin montos: la dueña ve sólo el % del mes usado (el presupuesto lo paga Eli). */
export interface ConsumoDelMes {
  periodo: string
  mensajesEnviados: number
  porcentaje: number
}

export interface ConversacionDerivada {
  id: string
  telefono: string
  nombre: string | null
  motivo: string | null
  /** ISO. */
  derivadaAt: string
}

export interface AvisoDeLaSecretaria {
  id: string
  tipo: string
  titulo: string
  cuerpo: string
  /** ISO. */
  createdAt: string
}

const TOPE_DE_DERIVADAS = 50
const TOPE_DE_AVISOS = 10

export async function leerLaSecretaria(actor: Actor) {
  const businessId = actor.businessId
  const negocio = await prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true, plan: true } })
  const zona = zonaDelNegocio(negocio?.timezone)
  const periodo = periodoDe(new Date(), zona)

  const [ajustes, canal, consumo, derivadas, avisos] = await Promise.all([
    prisma.ajustesDeSecretaria.findUnique({
      where: { businessId },
      select: { activa: true, maxTurnos: true, maxTokens: true, presupuestoMensualCentavos: true, reglas: true },
    }),
    // Sin las credenciales de la conexión: no salen del servidor.
    prisma.canalDeWhatsapp.findUnique({
      where: { businessId },
      select: { estado: true, numero: true, motivoDesconexion: true, condicionesAceptadasAt: true },
    }),
    prisma.consumoDeSecretaria.findUnique({
      where: { businessId_periodo: { businessId, periodo } },
      select: { costoMicrodolares: true, mensajesWhatsappEnviados: true },
    }),
    prisma.conversacionDeSecretaria.findMany({
      where: { businessId, estado: "human", simulacion: false },
      select: {
        id: true,
        telefono: true,
        motivoDerivacion: true,
        derivadaAt: true,
        ultimoMensajeAt: true,
        customer: { select: { name: true, lastName: true } },
      },
      orderBy: { ultimoMensajeAt: "desc" },
      take: TOPE_DE_DERIVADAS,
    }),
    prisma.avisoDelPanel.findMany({
      where: {
        businessId,
        OR: actor.memberId ? [{ memberId: null }, { memberId: actor.memberId }] : [{ memberId: null }],
      },
      select: { id: true, tipo: true, titulo: true, cuerpo: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: TOPE_DE_AVISOS,
    }),
  ])

  const ajustesLeidos: AjustesDeLaSecretaria = ajustes
    ? { activa: ajustes.activa, maxTurnos: ajustes.maxTurnos, maxTokens: ajustes.maxTokens, reglas: ajustes.reglas }
    : AJUSTES_POR_DEFECTO
  const presupuesto = presupuestoDelNegocio(negocio?.plan, ajustes?.presupuestoMensualCentavos)
  const consumoDelMes: ConsumoDelMes = {
    periodo,
    mensajesEnviados: consumo?.mensajesWhatsappEnviados ?? 0,
    porcentaje: porcentajeGastado(consumo?.costoMicrodolares ?? 0, presupuesto),
  }

  return {
    zona,
    ajustes: ajustesLeidos,
    canal: {
      estado: estadoDelWhatsapp(canal?.estado),
      numero: canal?.numero ?? null,
      motivoDesconexion: canal?.motivoDesconexion ?? null,
      condicionesAceptadas: Boolean(canal?.condicionesAceptadasAt),
    } satisfies CanalDeLaSecretaria,
    consumo: consumoDelMes,
    derivadas: derivadas.map(
      (conversacion): ConversacionDerivada => ({
        id: conversacion.id,
        telefono: conversacion.telefono,
        nombre: conversacion.customer
          ? [conversacion.customer.name, conversacion.customer.lastName].filter(Boolean).join(" ")
          : null,
        motivo: conversacion.motivoDerivacion,
        derivadaAt: (conversacion.derivadaAt ?? conversacion.ultimoMensajeAt).toISOString(),
      })
    ),
    avisos: avisos.map(
      (aviso): AvisoDeLaSecretaria => ({
        id: aviso.id,
        tipo: aviso.tipo,
        titulo: aviso.titulo,
        cuerpo: aviso.cuerpo,
        createdAt: aviso.createdAt.toISOString(),
      })
    ),
  }
}
