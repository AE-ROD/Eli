import type { ReactNode } from "react"
import { notFound } from "next/navigation"
import { CalendarX2 } from "lucide-react"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { Tarjeta } from "@/components/comunes/tarjeta"
import { horarioSemanalDeAtencion } from "@/lib/horario-de-atencion"
import { prisma } from "@/lib/prisma"
import { zonaDelNegocio } from "@/lib/zona-horaria"
import { descripcionParaCompartir } from "@/lib/pagina-del-negocio"
import { leerPaginaDelNegocio } from "./_pagina/datos-de-la-pagina"
import { ANCLA_DE_RESERVA, MiniPagina } from "./_pagina/mini-pagina"
import { EncabezadoDeReserva } from "./_componentes/encabezado-de-reserva"
import { FormularioReserva } from "./_componentes/formulario-reserva"
import { PieDeEli } from "./_componentes/pie-de-eli"

/**
 * Título y descripción al compartir el enlace (WhatsApp, redes, buscadores).
 * La imagen la pone `opengraph-image.tsx`, en esta misma carpeta.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const pagina = await leerPaginaDelNegocio(slug)
  if (!pagina) return { title: "Negocio no encontrado" }
  const titulo = pagina.comuna ? `${pagina.nombre} · ${pagina.comuna}` : pagina.nombre
  const descripcion = descripcionParaCompartir(pagina.nombre, pagina.comuna)
  return {
    title: `Reservar cita — ${titulo}`,
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
      services: {
        where: { active: true },
        select: { id: true, name: true, description: true, duration: true, price: true },
        orderBy: { createdAt: "asc" },
      },
      // Generales y de miembros: `horarioSemanalDeAtencion` decide cuál manda
      // cada día, con la misma regla que la disponibilidad y `confirmar`.
      workSchedules: {
        where: { active: true },
        select: { dayOfWeek: true, memberId: true, startTime: true, endTime: true },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
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
        <EncabezadoDeReserva antetitulo="Reserva tu cita" titulo={negocio.name} />
        <Tarjeta className="mx-auto mt-8 flex max-w-xl flex-col items-center gap-5 px-6 py-10 text-center sm:px-10 md:mt-12">
          <CuadroDeIcono icono={CalendarX2} color="azul" tamano="lg" />
          <p className="cuerpo-xl text-pretty text-texto-2">
            Este negocio aún no tiene servicios disponibles para reservar.
          </p>
        </Tarjeta>
        </div>
      </MarcoDeReserva>
    )
  }

  return (
    <MarcoDeReserva>
      {miniPagina}
      <div id={ANCLA_DE_RESERVA} className="mt-10 scroll-mt-6 md:mt-14">
      <FormularioReserva
        slug={negocio.slug}
        nombreNegocio={negocio.name}
        zona={zonaDelNegocio(negocio.timezone)}
        servicios={negocio.services}
        horarios={horarioSemanalDeAtencion(negocio.workSchedules)}
      />
      </div>
    </MarcoDeReserva>
  )
}
