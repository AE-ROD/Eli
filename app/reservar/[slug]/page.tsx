import type { ReactNode } from "react"
import { notFound } from "next/navigation"
import { CalendarX2 } from "lucide-react"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { Tarjeta } from "@/components/comunes/tarjeta"
import { plazoParaQuienReserva, plazoValido } from "@/lib/gestion-de-cita"
import { prisma } from "@/lib/prisma"
import { esRubroDental } from "@/lib/rubros"
import { zonaDelNegocio } from "@/lib/zona-horaria"
import { descripcionParaCompartir } from "@/lib/pagina-del-negocio"
import { leerPaginaDelNegocio } from "./_pagina/datos-de-la-pagina"
import { ANCLA_DE_RESERVA, MiniPagina } from "./_pagina/mini-pagina"
import { EncabezadoDeReserva } from "./_componentes/encabezado-de-reserva"
import { FormularioReserva } from "./_componentes/formulario-reserva"
import { PieDeEli } from "./_componentes/pie-de-eli"
import { frasesDeLaPagina, pestanaDeLaReserva, tituloDeLaReserva } from "./_frases"

/**
 * Título y descripción al compartir el enlace (WhatsApp, redes, buscadores).
 * La imagen la pone `opengraph-image.tsx`, en esta misma carpeta. La pestaña
 * dice "Reservar hora" o "Reservar cita" según el rubro del negocio.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const pagina = await leerPaginaDelNegocio(slug)
  if (!pagina) return { title: "Negocio no encontrado" }
  const titulo = pagina.comuna ? `${pagina.nombre} · ${pagina.comuna}` : pagina.nombre
  const descripcion = descripcionParaCompartir(pagina.nombre, pagina.comuna, pagina.rubro)
  return {
    title: `${pestanaDeLaReserva(pagina.rubro)} — ${titulo}`,
    description: descripcion,
    openGraph: { title: titulo, description: descripcion, type: "website", locale: "es_CL" },
    twitter: { card: "summary_large_image", title: titulo, description: descripcion },
  }
}

/**
 * El marco de la página: fondo crema y una columna centrada. Es la página de
 * cada negocio, no la de Eli, así que no lleva el encabezado de la landing;
 * sólo, al final de cada pantalla, el pie discreto "Reservas con Eli".
 * `halo-agenda` le da al foco de todo lo de adentro el halo azul de la Agenda.
 *
 * 8px a los lados en el teléfono, como las islas: con el relleno de la
 * tarjeta, a 360px de ancho entran las siete columnas del calendario a 44px.
 */
function MarcoDeReserva({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-crema halo-agenda">
      <div className="mx-auto w-full max-w-[52rem] px-2 pt-10 pb-6 sm:px-4 md:px-6 md:pt-16 md:pb-10">
        {children}
        <PieDeEli />
      </div>
    </main>
  )
}

export default async function PaginaReserva({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const negocio = await prisma.business.findUnique({
    where: { slug },
    select: {
      name: true,
      type: true,
      slug: true,
      // El calendario cuenta "hoy" y la ventana de reserva en este reloj.
      timezone: true,
      listaDeEsperaActiva: true,
      services: {
        where: { active: true },
        select: { id: true, name: true, description: true, duration: true, price: true, category: true, esUrgencia: true },
        orderBy: { createdAt: "asc" },
      },
    },
  })

  // La mini página del negocio va arriba; el flujo de reserva, debajo, en `#reservar`.
  const pagina = await leerPaginaDelNegocio(slug)
  if (!negocio || !pagina) notFound()
  const miniPagina = <MiniPagina pagina={pagina} ahora={new Date()} />

  if (negocio.services.length === 0) {
    return (
      <MarcoDeReserva>
        {miniPagina}
        <div id={ANCLA_DE_RESERVA} className="mt-10 scroll-mt-6 md:mt-14">
        <EncabezadoDeReserva nivel={2} antetitulo={negocio.name} titulo={tituloDeLaReserva(negocio.type)} />
        <Tarjeta className="mx-auto mt-8 flex max-w-xl flex-col items-center gap-5 px-6 py-10 text-center sm:px-10 md:mt-12">
          <CuadroDeIcono icono={CalendarX2} color="azul" tamano="lg" />
          <p className="cuerpo-xl text-pretty text-texto-2">
            {frasesDeLaPagina(negocio.type).sinServicios}
          </p>
        </Tarjeta>
        </div>
      </MarcoDeReserva>
    )
  }

  // El rubro (`negocio.type`) pone las palabras de la reserva: "estilista" en
  // un salón; en una clínica dental, "motivo" y "odontólogo", y además pregunta
  // si es la primera consulta y avisa de la urgencia. Lo único que sale de más
  // es si cada servicio es urgencia, y sólo en una clínica: nada clínico ni de
  // sillones. En otro rubro, los servicios de siempre.
  const clinicaDental = esRubroDental(negocio.type)
  const servicios = negocio.services.map(({ esUrgencia, ...servicio }) =>
    clinicaDental ? { ...servicio, esUrgencia } : servicio
  )

  return (
    <MarcoDeReserva>
      {miniPagina}
      <div id={ANCLA_DE_RESERVA} className="mt-10 scroll-mt-6 md:mt-14">
      <FormularioReserva
        slug={negocio.slug}
        nombreNegocio={negocio.name}
        rubro={negocio.type}
        zona={zonaDelNegocio(negocio.timezone)}
        servicios={servicios}
        // Quién atiende y qué servicios hace cada uno, ya leído: el primer paso
        // filtra los servicios desde la primera pintura, sin esperar a `/profesionales`.
        equipo={pagina.equipo.map((profesional) => ({
          id: profesional.id,
          nombre: profesional.nombre,
          especialidad: profesional.especialidad,
          fotoUrl: profesional.foto,
          servicioIds: profesional.servicioIds,
        }))}
        // El mismo horario que publica la mini página (QA#4): el que la
        // reserva ofrece. El calendario lo usa hasta leer quién atiende.
        horarios={pagina.horario}
        listaDeEsperaActiva={negocio.listaDeEsperaActiva}
        plazoDeCambios={plazoParaQuienReserva(pagina.plazoDeCambiosHoras, negocio.type)}
        plazoDeCambiosHoras={plazoValido(pagina.plazoDeCambiosHoras)}
        // El lugar del evento de "Agregar al calendario": la dirección y la comuna.
        // Sin calle no hay lugar (como los enlaces de mapa): la comuna sola no lleva a ninguna parte.
        direccion={pagina.direccion ? [pagina.direccion, pagina.comuna].filter(Boolean).join(", ") : null}
        // Plan Independiente con dos o más sedes activas: el primer paso es "¿Dónde?".
        // Sólo lo que se muestra de cada sede (sin teléfono ni enlaces de mapa); con
        // una sola, o sin ellas, no se manda nada y la reserva es la de siempre.
        sedes={
          pagina.modoDeSedes === "varias"
            ? (pagina.sedes ?? []).map(({ id, nombre, direccion, comuna, dias, horario }) => ({
                id,
                nombre,
                direccion,
                comuna,
                dias,
                horario,
              }))
            : undefined
        }
      />
      </div>
    </MarcoDeReserva>
  )
}
