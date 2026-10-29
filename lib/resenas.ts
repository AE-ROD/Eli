import { prisma } from "@/lib/prisma"
import { enviarPedirResena } from "@/lib/email"
import { enlacesDeBajaDeCliente, type EnlacesDeBajaDeCliente } from "@/lib/baja-de-clientes"
import {
  DIAS_ENTRE_RESENAS,
  conConsentimientoPromocional,
  enviarAClientes,
  resumenVacio,
  type ContextoDeCorrida,
  type ResumenDeTrabajo,
} from "@/lib/envios-a-clientes"
import { normalizarEnlaceDeResenas } from "@/lib/pagina-del-negocio"
import { registrarError } from "@/lib/registro-de-errores"
import { fechaYMinutosEn, rangoDelDiaEn, sumarDias, zonaDelNegocio } from "@/lib/zona-horaria"

/**
 * (servidor) Pedir una reseña en Google (#77) el día siguiente a la visita.
 *
 * Lo corre el cron diario (`lib/mensajes-a-clientes.ts`); la firma de
 * `ejecutarResenas` no se cambia sin cambiarla allá. Por cada negocio con
 * `pideResenas` encendido y un enlace de reseñas válido
 * (`normalizarEnlaceDeResenas`, que se vuelve a mirar acá: un enlace guardado
 * antes de una regla nueva no sale):
 *
 * - "Ayer" es el día anterior a hoy en la zona del negocio, como rango de
 *   instantes (`rangoDelDiaEn`): 23 o 25 horas los días de cambio de hora.
 * - Se toman las atenciones `finalizada` de ayer (por `arrivedAt`, la fecha de
 *   la visita en todo el panel). Una anulada no está `finalizada`: no dispara.
 * - A todos por igual, sin filtrar por satisfacción, pero sólo a clientes con
 *   email y consentimiento promocional vigente (decisión e del dueño). Una
 *   baja borra el consentimiento, así que también corta.
 * - Como máximo una vez cada `DIAS_ENTRE_RESENAS` días calendario por cliente:
 *   si se le pidió una en los últimos 90 días (contando hoy), no sale otra.
 *   Varias visitas de ayer del mismo cliente piden una sola.
 *
 * Cada envío pasa por `enviarAClientes` (tipo "resena", referencia
 * `${customerId}:${fechaDeLaVisita}`), que vuelve a verificar que el cliente
 * sea del negocio y su consentimiento, aplica el tope diario de promocionales
 * y el candado (correr dos veces el mismo día no duplica). El cupo y el plazo
 * de la corrida (`contexto`) se respetan: al acabarse, el trabajo corta y
 * dice `incompleto`; lo que quedó se pierde (al día siguiente "ayer" es otro
 * día), a propósito: una reseña pedida tres días tarde ya no sirve.
 *
 * Ningún dato personal va a los logs.
 */

/** Cuántas atenciones de ayer se miran por negocio, como máximo. */
const ATENCIONES_POR_NEGOCIO = 500

interface Candidato {
  customerId: string
  nombre: string
  email: string
}

export async function ejecutarResenas(contexto: ContextoDeCorrida): Promise<ResumenDeTrabajo> {
  const resumen = resumenVacio()
  const { ahora, cupo } = contexto

  const negocios = await prisma.business.findMany({
    where: { pideResenas: true, enlaceResenas: { not: null } },
    select: { id: true, name: true, timezone: true, enlaceResenas: true },
    orderBy: { id: "asc" },
  })

  for (const negocio of negocios) {
    const enlaceResenas = normalizarEnlaceDeResenas(negocio.enlaceResenas)
    if (!enlaceResenas) continue

    if (Date.now() > contexto.hasta || cupo.restantes <= 0) {
      resumen.incompleto = true
      break
    }

    const zona = zonaDelNegocio(negocio.timezone)
    const hoy = fechaYMinutosEn(ahora, zona).fecha
    const ayer = sumarDias(hoy, -1)
    const { desde, hasta } = rangoDelDiaEn(ayer, zona)

    const atenciones = await prisma.visit.findMany({
      where: {
        businessId: negocio.id,
        status: "finalizada",
        arrivedAt: { gte: desde, lt: hasta },
        customerId: { not: null },
        customer: { is: { businessId: negocio.id, email: { not: null }, ...conConsentimientoPromocional } },
      },
      select: { customerId: true, customer: { select: { id: true, businessId: true, name: true, email: true } } },
      orderBy: { arrivedAt: "asc" },
      take: ATENCIONES_POR_NEGOCIO,
    })

    // Un cliente, una reseña: varias visitas de ayer piden una sola.
    const candidatos = new Map<string, Candidato>()
    for (const atencion of atenciones) {
      const cliente = atencion.customer
      // Defensa en profundidad, como en los recordatorios: el cliente tiene
      // que ser del mismo negocio que la atención.
      if (!cliente || cliente.id !== atencion.customerId || cliente.businessId !== negocio.id) {
        resumen.omitidas++
        continue
      }
      if (!cliente.email || candidatos.has(cliente.id)) continue
      candidatos.set(cliente.id, { customerId: cliente.id, nombre: cliente.name, email: cliente.email })
    }
    if (candidatos.size === 0) continue

    // Los que ya recibieron una en los últimos DIAS_ENTRE_RESENAS días (contando hoy).
    const desdeElTope = rangoDelDiaEn(sumarDias(hoy, -(DIAS_ENTRE_RESENAS - 1)), zona).desde
    const recientes = await prisma.envioAClientes.findMany({
      where: {
        businessId: negocio.id,
        tipo: "resena",
        customerId: { in: [...candidatos.keys()] },
        enviadoAt: { gte: desdeElTope },
      },
      select: { customerId: true },
    })
    const yaPedida = new Set(recientes.map((envio) => envio.customerId))

    for (const candidato of candidatos.values()) {
      if (Date.now() > contexto.hasta || cupo.restantes <= 0) {
        resumen.incompleto = true
        return resumen
      }
      resumen.revisados++
      if (yaPedida.has(candidato.customerId)) continue

      let enlacesDeBaja: EnlacesDeBajaDeCliente
      try {
        enlacesDeBaja = enlacesDeBajaDeCliente(candidato.customerId)
      } catch (error) {
        // Sin NEXTAUTH_SECRET no hay enlace de baja, y sin él no sale ningún
        // promocional: no tiene sentido seguir con nadie.
        registrarError("armando el enlace de baja de la reseña", error)
        resumen.fallidos++
        resumen.incompleto = true
        return resumen
      }

      const resultado = await enviarAClientes({
        businessId: negocio.id,
        zona,
        tipo: "resena",
        canal: "correo",
        referencia: `${candidato.customerId}:${ayer}`,
        customerId: candidato.customerId,
        cupo,
        ahora,
        enviar: () =>
          enviarPedirResena({
            emailCliente: candidato.email,
            nombreCliente: candidato.nombre,
            nombreNegocio: negocio.name,
            enlaceResenas,
            enlaceDeBaja: enlacesDeBaja.enlaceDeBaja,
            enlaceDeBajaEnUnClic: enlacesDeBaja.enlaceDeBajaEnUnClic,
          }),
      })

      if (resultado === "enviado") resumen.enviados++
      else if (resultado === "fallido") resumen.fallidos++
      else if (resultado === "omitido" || resultado === "sin-consentimiento") resumen.omitidas++
      else if (resultado === "tope") {
        // Sin cupo en la corrida: corta todo. Si no, es el tope diario del
        // negocio: corta este negocio y sigue con el próximo.
        if (cupo.restantes <= 0) {
          resumen.incompleto = true
          return resumen
        }
        break
      }
      // "ya-enviado": otra corrida ya lo mandó; nada que contar.
    }
  }

  return resumen
}
