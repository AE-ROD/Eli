import { cache } from "react"
import { horarioSemanalDeAtencion, type FranjaDelDia } from "@/lib/horario-de-atencion"
import {
  apareceEnLaPagina,
  colorDelNegocio,
  enlaceDeInstagram,
  enlaceDeWhatsapp,
  enlacesDeMapa,
  imagenPublica,
  mediosParaMostrar,
  normalizarInstagram,
  type ColorDelLocal,
} from "@/lib/pagina-del-negocio"
import { prisma } from "@/lib/prisma"
import { zonaDelNegocio } from "@/lib/zona-horaria"

/**
 * (servidor) Lo que muestra la mini página pública de un negocio, leído por
 * slug. Es público y sin sesión: el `select` trae sólo lo que se puede
 * mostrar a cualquiera. Ni correos, ni teléfonos de las personas del equipo,
 * ni comisiones, ni ids internos más allá del `memberId` que usa "Reservar
 * con…" (el mismo que la reserva ya acepta).
 *
 * Con `cache`: la página, sus metadatos y la imagen para compartir lo piden
 * en la misma petición y se lee una sola vez.
 */

export interface ProfesionalPublico {
  id: string
  nombre: string
  especialidad: string | null
  foto: string | null
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
  zona: string
  direccion: string | null
  comuna: string | null
  color: ColorDelLocal
  logo: string | null
  portada: string | null
  whatsapp: string | null
  instagram: { usuario: string; enlace: string } | null
  mapas: { googleMaps: string; waze: string } | null
  medios: { id: string; nombre: string }[]
  equipo: ProfesionalPublico[]
  servicios: ServicioDeLaPagina[]
  horario: FranjaDelDia[]
  /** Hasta cuántas horas antes se puede cancelar o cambiar (`Business.cancelacionHorasAntes`), dicho antes de reservar (#83). */
  plazoDeCambiosHoras: number
}

const textoONull = (texto: string | null) => (texto ?? "").trim() || null

export const leerPaginaDelNegocio = cache(async (slug: string): Promise<PaginaDelNegocio | null> => {
  const negocio = await prisma.business.findUnique({
    where: { slug },
    select: {
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
      members: {
        select: { id: true, role: true, especialidad: true, fotoUrl: true, user: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
      services: {
        where: { active: true },
        select: { id: true, name: true, description: true, duration: true, price: true, category: true },
        orderBy: { createdAt: "asc" },
      },
      workSchedules: {
        where: { active: true },
        select: { dayOfWeek: true, memberId: true, startTime: true, endTime: true },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      },
    },
  })
  if (!negocio) return null

  const usuarioDeInstagram = normalizarInstagram(negocio.instagram)
  const enlaceDelPerfil = enlaceDeInstagram(negocio.instagram)

  return {
    nombre: negocio.name,
    slug: negocio.slug,
    zona: zonaDelNegocio(negocio.timezone),
    direccion: textoONull(negocio.address),
    comuna: textoONull(negocio.comuna),
    color: colorDelNegocio(negocio.color),
    logo: imagenPublica(negocio.logoUrl),
    portada: imagenPublica(negocio.coverUrl),
    whatsapp: enlaceDeWhatsapp(negocio.whatsapp),
    instagram: usuarioDeInstagram && enlaceDelPerfil ? { usuario: usuarioDeInstagram, enlace: enlaceDelPerfil } : null,
    mapas: enlacesDeMapa(negocio.address, negocio.comuna),
    medios: mediosParaMostrar(negocio.mediosDePago),
    equipo: negocio.members
      .filter((miembro) => apareceEnLaPagina(miembro.role))
      .map((miembro) => ({
        id: miembro.id,
        nombre: miembro.user.name,
        especialidad: textoONull(miembro.especialidad),
        foto: imagenPublica(miembro.fotoUrl),
      })),
    servicios: negocio.services,
    horario: horarioSemanalDeAtencion(negocio.workSchedules),
    plazoDeCambiosHoras: negocio.cancelacionHorasAntes,
  }
})
