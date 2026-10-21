import type { ReactNode } from "react"
import { notFound } from "next/navigation"
import { CalendarX2 } from "lucide-react"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { Tarjeta } from "@/components/comunes/tarjeta"
import { horarioSemanalDeAtencion } from "@/lib/horario-de-atencion"
import { prisma } from "@/lib/prisma"
import { zonaDelNegocio } from "@/lib/zona-horaria"
import { EncabezadoDeReserva } from "./_componentes/encabezado-de-reserva"
import { FormularioReserva } from "./_componentes/formulario-reserva"

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const negocio = await prisma.business.findUnique({ where: { slug }, select: { name: true } })
  return {
    title: negocio ? `Reservar cita — ${negocio.name}` : "Negocio no encontrado",
  }
}

/**
 * El marco de la página: fondo crema y una columna centrada. Es la página de
 * cada negocio, no la de Eli, así que no lleva el encabezado de la landing.
 * `halo-agenda` le da al foco de todo lo de adentro el halo azul de la Agenda.
 *
 * 8px a los lados en el teléfono, como las islas: con el relleno de la
 * tarjeta, a 360px de ancho entran las siete columnas del calendario a 44px.
 */
function MarcoDeReserva({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-crema halo-agenda">
      <div className="mx-auto w-full max-w-[52rem] px-2 py-10 sm:px-4 md:px-6 md:py-16">{children}</div>
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

  if (!negocio) notFound()

  if (negocio.services.length === 0) {
    return (
      <MarcoDeReserva>
        <EncabezadoDeReserva antetitulo="Reserva tu cita" titulo={negocio.name} />
        <Tarjeta className="mx-auto mt-8 flex max-w-xl flex-col items-center gap-5 px-6 py-10 text-center sm:px-10 md:mt-12">
          <CuadroDeIcono icono={CalendarX2} color="azul" tamano="lg" />
          <p className="cuerpo-xl text-pretty text-texto-2">
            Este negocio aún no tiene servicios disponibles para reservar.
          </p>
        </Tarjeta>
      </MarcoDeReserva>
    )
  }

  return (
    <MarcoDeReserva>
      <FormularioReserva
        slug={negocio.slug}
        nombreNegocio={negocio.name}
        zona={zonaDelNegocio(negocio.timezone)}
        servicios={negocio.services}
        horarios={horarioSemanalDeAtencion(negocio.workSchedules)}
      />
    </MarcoDeReserva>
  )
}
