import { cache } from "react"
import {
  filasDeQuienesAtienden,
  horarioSemanalPublicado,
  leerProfesionalesQueAtienden,
  profesionalesConHorarioPublicado,
} from "@/lib/agenda-publica"
import type { FranjaDelDia } from "@/lib/horario-de-atencion"
import {
  apareceEnLaPagina,
  colorDelNegocio,
  enlaceDeInstagram,
  enlaceDeWhatsapp,
  enlacesDeMapa,
  imagenPublica,
  mediosParaMostrar,
  normalizarInstagram,
  sedesParaLaPagina,
  type ColorDelLocal,
  type SedeDeLaPagina,
} from "@/lib/pagina-del-negocio"
import { rubroOfreceHoraValle } from "@/lib/permisos"
import { prisma } from "@/lib/prisma"
import { WHERE_HORARIO_VIGENTE, direccionDeLaCita, modoDeSedes, ordenarSedes, type ModoDeSedes } from "@/lib/sedes"
import { servicioIdsPublicos } from "@/lib/servicios-del-profesional"
import { zonaDelNegocio } from "@/lib/zona-horaria"

/**
 * (servidor) Lo que muestra la mini página pública de un negocio, leído por
 * slug. Es público y sin sesión: el `select` trae sólo lo que se puede
 * mostrar a cualquiera. Ni correos, ni teléfonos de las personas del equipo,
 * ni comisiones, ni ids internos más allá del `memberId` que usa "Reservar
 * con…" (el mismo que la reserva ya acepta), los ids de los servicios activos
 * de este negocio que hace cada uno (los mismos que ya publica
 * `/api/reservar/[slug]/profesionales`) y el id de cada sede activa (el mismo
 * que la reserva ya acepta en `sedeId`).
 *
 * Con `cache`: la página, sus metadatos y la imagen para compartir lo piden
 * en la misma petición y se lee una sola vez.
 */

export interface ProfesionalPublico {
  id: string
  nombre: string
  especialidad: string | null
  foto: string | null
  /**
   * Los servicios que hace: `null` si hace todos (no tiene servicios
   * acotados). Con la lista, sólo servicios ACTIVOS de este negocio, en el
   * orden del catálogo; vacía si ninguno de los que tenía sigue activo.
   */
  servicioIds: string[] | null
}

export interface ServicioDeLaPagina {
  id: string
  name: string
  description: string | null
  duration: number
  price: number | null
  category: string | null
}

export interface PaginaDelNegocio {
  nombre: string
  slug: string
  /**
   * El rubro (`Business.type`): con él la página, sus metadatos y la imagen
   * para compartir hablan con las palabras del rubro (`lib/vocabulario.ts`).
   * Un rubro desconocido recibe las de siempre.
   */
  rubro: string
  zona: string
  /**
   * La dirección y la comuna del local (`lugarDeLaPagina`): las del negocio, o las
   * de su única sede activa si tiene exactamente una (la que llevan la cita y los
   * correos). Con dos o más sedes siguen siendo las del negocio, pero la mini
   * página no las usa: muestra cada sede en "Dónde atiendo".
   */
  direccion: string | null
  comuna: string | null
  color: ColorDelLocal
  logo: string | null
  portada: string | null
  whatsapp: string | null
  instagram: { usuario: string; enlace: string } | null
  /** "Cómo llegar" a `direccion` y `comuna`. */
  mapas: { googleMaps: string; waze: string } | null
  medios: { id: string; nombre: string }[]
  equipo: ProfesionalPublico[]
  servicios: ServicioDeLaPagina[]
  horario: FranjaDelDia[]
  /** Hasta cuántas horas antes se puede cancelar o cambiar (`Business.cancelacionHorasAntes`), dicho antes de reservar (#83). */
  plazoDeCambiosHoras: number
  /** Si hay precios de hora valle (#89c): encendida y con alguna franja. */
  horaValle: boolean
  /**
   * Plan Independiente: `varias` con dos o más sedes activas, `una` en cualquier
   * otro caso (sin sedes, una sola, o el plan Equipo). Ausente es `una`: la
   * página de siempre.
   */
  modoDeSedes?: ModoDeSedes
  /** Las sedes ACTIVAS, en el orden de la lista, con su dirección y su horario. Ausente o vacía: sin sedes. */
  sedes?: SedeDeLaPagina[]
}

const textoONull = (texto: string | null) => (texto ?? "").trim() || null

/**
 * Dónde queda el local que muestra la página (la dirección, la comuna y "Cómo
 * llegar"): con EXACTAMENTE una sede activa, la de esa sede (es la misma que
 * llevan la cita y los correos: `direccionDeLaCita`); sin sedes, la del negocio
 * (`Business.address` y `comuna`), como siempre. Con dos o más no hay un solo
 * lugar: la página muestra el bloque "Dónde atiendo" y esto queda como el
 * negocio, sin que la mini página lo use.
 */
function lugarDeLaPagina(
  sedes: readonly { nombre: string; direccion: string; comuna: string }[],
  negocio: { address: string | null; comuna: string | null }
) {
  return direccionDeLaCita({ sede: sedes.length === 1 ? sedes[0] : null, negocio })
}

export const leerPaginaDelNegocio = cache(async (slug: string): Promise<PaginaDelNegocio | null> => {
  const negocio = await prisma.business.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      address: true,
      comuna: true,
      whatsapp: true,
      instagram: true,
      color: true,
      logoUrl: true,
      coverUrl: true,
      mediosDePago: true,
      cancelacionHorasAntes: true,
      type: true,
      // El plan decide si hay modo de varias sedes (`modoDeSedes`).
      plan: true,
      horaValleActiva: true,
      // Basta saber si hay alguna: la página no lista las franjas.
      franjasDeHoraValle: { select: { id: true }, take: 1 },
      members: {
        select: { id: true, role: true, especialidad: true, fotoUrl: true, user: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
      services: {
        where: { active: true },
        select: { id: true, name: true, description: true, duration: true, price: true, category: true },
        orderBy: { createdAt: "asc" },
      },
      // Sólo las sedes activas, y nada más que lo que se muestra: ni el negocio
      // al que pertenecen ni fechas. El orden de la lista lo da `ordenarSedes`.
      sedes: {
        where: { activo: true },
        select: { id: true, nombre: true, direccion: true, comuna: true, telefono: true, orden: true, activo: true },
      },
      workSchedules: {
        // El horario vigente (sin sede, o de una sede activa): el de una sede
        // desactivada queda guardado pero no se publica.
        where: { active: true, ...WHERE_HORARIO_VIGENTE },
        select: { dayOfWeek: true, memberId: true, sedeId: true, startTime: true, endTime: true },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      },
    },
  })
  if (!negocio) return null

  // Los mismos profesionales que lee la reserva (rol y tope): si hay alguno,
  // la reserva ofrece sólo sus horas, y el horario publicado es el de ellos.
  const profesionales = await leerProfesionalesQueAtienden(prisma, negocio.id)
  // Qué hace cada uno, de lo que ya leyó la reserva (`MemberService` del
  // mismo negocio), acotado a los servicios activos que esta página lista.
  const idsDeServiciosActivos = negocio.services.map((servicio) => servicio.id)
  const serviciosDeCadaUno = new Map(
    profesionales.map((profesional) => [profesional.id, servicioIdsPublicos(profesional.serviceIds, idsDeServiciosActivos)])
  )

  // El horario que cuenta: el general y el de quienes atienden.
  const filasDeHorario = filasDeQuienesAtienden(negocio.workSchedules, profesionales)
  const sedes = ordenarSedes(negocio.sedes)
  const lugar = lugarDeLaPagina(sedes, negocio)

  const usuarioDeInstagram = normalizarInstagram(negocio.instagram)
  const enlaceDelPerfil = enlaceDeInstagram(negocio.instagram)

  return {
    nombre: negocio.name,
    slug: negocio.slug,
    rubro: negocio.type,
    zona: zonaDelNegocio(negocio.timezone),
    direccion: lugar.direccion,
    comuna: lugar.comuna,
    color: colorDelNegocio(negocio.color),
    logo: imagenPublica(negocio.logoUrl),
    portada: imagenPublica(negocio.coverUrl),
    whatsapp: enlaceDeWhatsapp(negocio.whatsapp),
    instagram: usuarioDeInstagram && enlaceDelPerfil ? { usuario: usuarioDeInstagram, enlace: enlaceDelPerfil } : null,
    mapas: enlacesDeMapa(lugar.direccion, lugar.comuna),
    medios: mediosParaMostrar(negocio.mediosDePago),
    // Sólo quien la reserva también lee (`profesionales`): de quien queda
    // fuera del tope no se sabe qué hace, y tampoco se le podría reservar.
    equipo: negocio.members
      .filter((miembro) => apareceEnLaPagina(miembro.role) && serviciosDeCadaUno.has(miembro.id))
      .map((miembro) => ({
        id: miembro.id,
        nombre: miembro.user.name,
        especialidad: textoONull(miembro.especialidad),
        foto: imagenPublica(miembro.fotoUrl),
        servicioIds: serviciosDeCadaUno.get(miembro.id) ?? null,
      })),
    servicios: negocio.services,
    // Exactamente el que la reserva ofrece (QA#4): con profesionales, la
    // unión de sus horarios efectivos (no el del negocio aparte, que prometía
    // horas y días que la reserva no tiene); sin ellos, el del negocio.
    // Sin el horario propio de quien no atiende (un encargado), que abría
    // días sin horario general (#168).
    horario: horarioSemanalPublicado(
      filasDeHorario,
      profesionales.length > 0
        ? profesionalesConHorarioPublicado(
            profesionales,
            negocio.services.map((servicio) => servicio.id)
          )
        : null
    ),
    plazoDeCambiosHoras: negocio.cancelacionHorasAntes,
    // Una clínica dental no tiene hora valle, aunque la bandera siga guardada.
    horaValle: rubroOfreceHoraValle(negocio.type) && negocio.horaValleActiva && negocio.franjasDeHoraValle.length > 0,
    modoDeSedes: modoDeSedes(negocio.plan, sedes),
    sedes: sedesParaLaPagina(sedes, filasDeHorario),
  }
})
