import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { registrarError } from "@/lib/registro-de-errores"
import { clienteNoEliminado } from "@/lib/clientes-eliminados"
import {
  DIAS_DE_HISTORIAL,
  DIAS_OCULTO_TRAS_CONTACTO,
  diasSinVenir,
  fechaDeVisita,
  frecuenciasPorCliente,
  seEstaYendo,
  type OrigenDelCiclo,
} from "@/lib/frecuencia-de-visitas"
import { rangoDelDiaEn, sumarDias, zonaDelNegocio } from "@/lib/zona-horaria"
import { actorDeSesion, puedeVerClientesQueSeVan, whereDeAgenda, whereDeAtenciones } from "@/lib/permisos"

/**
 * "Clientes que se están yendo" (#76): los del negocio con ciclo conocido que
 * no vienen hace al menos 1,5 ciclos y no tienen una cita en pie. El ciclo y
 * la regla son los mismos del correo "te toca" (`lib/frecuencia-de-visitas.ts`).
 *
 * Dueña y encargado (decisión c): son los contactos de toda la base, por el
 * mismo criterio que exportar. El profesional recibe 401. El límite de pedidos
 * lo pone `proxy.ts`, como a todo el panel.
 *
 * A quien se le escribió desde acá ("Escribirle", `POST
 * /api/clientes/[id]/contacto`) no aparece por `DIAS_OCULTO_TRAS_CONTACTO`
 * días: la lista es de pendientes, no de a quién ya se le habló.
 */

/** Filas que devuelve la lista, como mucho. `total` dice cuántos son en realidad. */
const TOPE_DE_FILAS = 200

/** Atenciones que se leen, como mucho: con esto una consulta nunca trae la tabla entera. */
const TOPE_DE_ATENCIONES = 20_000

export interface ClienteQueSeVa {
  id: string
  nombre: string
  apellido: string | null
  email: string | null
  /** E.164, como se guarda: la pantalla arma el enlace de WhatsApp con esto. */
  telefono: string | null
  /** "AAAA-MM-DD" de su última visita, en la zona del negocio. */
  ultimaVisita: string
  diasSinVenir: number
  ciclo: number
  origenDelCiclo: OrigenDelCiclo
  ultimoServicio: string | null
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor || !puedeVerClientesQueSeVan(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const ahora = new Date()
    const negocio = await prisma.business.findUnique({ where: { id: actor.businessId }, select: { timezone: true } })
    const zona = zonaDelNegocio(negocio?.timezone)
    const hoy = fechaDeVisita(ahora, zona)

    const atenciones = await prisma.visit.findMany({
      where: whereDeAtenciones(actor, {
        status: "finalizada",
        arrivedAt: { gte: rangoDelDiaEn(sumarDias(hoy, -DIAS_DE_HISTORIAL), zona).desde },
        customer: { is: clienteNoEliminado },
      }),
      select: {
        id: true,
        arrivedAt: true,
        customer: { select: { id: true, businessId: true, name: true, lastName: true, email: true, phone: true } },
        services: { where: { tipo: "servicio" }, select: { serviceId: true, serviceName: true } },
      },
      orderBy: { arrivedAt: "desc" },
      take: TOPE_DE_ATENCIONES,
    })

    type Datos = NonNullable<(typeof atenciones)[number]["customer"]>
    const clientes = new Map<string, Datos>()
    const visitas = []
    for (const atencion of atenciones) {
      const cliente = atencion.customer
      if (!cliente) continue
      // La FK de la atención al cliente es simple: uno de otro negocio no se muestra.
      if (cliente.businessId !== actor.businessId) {
        console.error("Se van: la atención y su cliente son de negocios distintos", { visitId: atencion.id })
        continue
      }
      clientes.set(cliente.id, cliente)
      visitas.push({
        customerId: cliente.id,
        arrivedAt: atencion.arrivedAt,
        servicios: atencion.services.map((s) => ({ serviceId: s.serviceId, nombre: s.serviceName })),
      })
    }

    const idsDeServicios = [...new Set(visitas.flatMap((v) => v.servicios.map((s) => s.serviceId)).filter((id): id is string => !!id))]
    const servicios = idsDeServicios.length
      ? await prisma.service.findMany({
          where: { businessId: actor.businessId, id: { in: idsDeServicios } },
          select: { id: true, frecuenciaDias: true },
        })
      : []
    const frecuencias = frecuenciasPorCliente(visitas, zona, new Map(servicios.map((s) => [s.id, s.frecuenciaDias])))

    const seVan = [...frecuencias.values()].filter((f) => f.ciclo && seEstaYendo(f.ultimaVisita, f.ciclo.dias, hoy))
    const ids = seVan.map((f) => f.customerId)

    const [conCita, contactados] = ids.length
      ? await Promise.all([
          prisma.appointment.findMany({
            where: whereDeAgenda(actor, {
              customerId: { in: ids },
              startTime: { gt: ahora },
              status: { in: ["pendiente", "confirmada"] },
            }),
            select: { customerId: true },
          }),
          prisma.envioAClientes.findMany({
            where: {
              businessId: actor.businessId,
              tipo: "contacto-manual",
              customerId: { in: ids },
              enviadoAt: { gte: rangoDelDiaEn(sumarDias(hoy, -(DIAS_OCULTO_TRAS_CONTACTO - 1)), zona).desde },
            },
            select: { customerId: true },
          }),
        ])
      : [[], []]
    const descartados = new Set([...conCita, ...contactados].map((fila) => fila.customerId))

    const filas: ClienteQueSeVa[] = seVan
      .filter((f) => !descartados.has(f.customerId))
      .map((f) => {
        const cliente = clientes.get(f.customerId)!
        return {
          id: cliente.id,
          nombre: cliente.name,
          apellido: cliente.lastName,
          email: cliente.email,
          telefono: cliente.phone,
          ultimaVisita: f.ultimaVisita,
          diasSinVenir: diasSinVenir(f.ultimaVisita, hoy),
          ciclo: f.ciclo!.dias,
          origenDelCiclo: f.ciclo!.origen,
          ultimoServicio: f.ultimoServicio,
        }
      })
      // Primero los que recién se pasaron (en ciclos): son los que todavía se recuperan.
      .sort((a, b) => a.diasSinVenir / a.ciclo - b.diasSinVenir / b.ciclo || a.diasSinVenir - b.diasSinVenir)

    return NextResponse.json({
      clientes: filas.slice(0, TOPE_DE_FILAS),
      total: filas.length,
      diasOcultoTrasContacto: DIAS_OCULTO_TRAS_CONTACTO,
    })
  } catch (error) {
    registrarError("listando los clientes que se están yendo", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
