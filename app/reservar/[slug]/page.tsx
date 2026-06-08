import { notFound } from "next/navigation"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { FormularioReserva } from "./_components/formularioReserva"
import { LocaleSwitcher } from "./_components/localeSwitcher"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const negocio = await prisma.business.findUnique({ where: { slug }, select: { name: true } })
  return {
    title: negocio ? `Reservar cita — ${negocio.name}` : "Negocio no encontrado",
  }
}

export default async function PaginaReserva({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const headersList = await headers()
  const locale = headersList.get("x-locale") ?? "es"

  const negocio = await prisma.business.findUnique({
    where: { slug },
    select: {
      name: true,
      type: true,
      slug: true,
      services: {
        where: { active: true },
        select: { id: true, name: true, description: true, duration: true, price: true },
        orderBy: { createdAt: "asc" },
      },
      workSchedules: {
        where: { active: true },
        select: { dayOfWeek: true, startTime: true, endTime: true },
        orderBy: { dayOfWeek: "asc" },
      },
    },
  })

  if (!negocio) notFound()

  if (negocio.services.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">{negocio.name}</h1>
          <p className="text-muted-foreground">Este negocio aún no tiene servicios disponibles para reservar.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-10">
        {/* Header: locale switcher */}
        <header className="flex justify-end mb-6">
          <LocaleSwitcher locale={locale} />
        </header>

        <FormularioReserva
          slug={negocio.slug}
          nombreNegocio={negocio.name}
          servicios={negocio.services}
          horarios={negocio.workSchedules}
          locale={locale}
        />
      </div>
    </main>
  )
}
