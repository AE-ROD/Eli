import { notFound } from "next/navigation"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { FormularioReserva } from "./_components/formularioReserva"
import { LocaleSwitcher } from "./_components/localeSwitcher"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const negocio = await prisma.business.findUnique({ where: { slug }, select: { name: true, type: true } })
  if (!negocio) return { title: "Negocio no encontrado" }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://useeli.com"
  const url = `${baseUrl}/reservar/${slug}`
  const descriptions = {
    es: `Reserva tu cita en ${negocio.name} fácil y rápido. Confirma tu hora en línea, sin llamadas.`,
    en: `Book your appointment at ${negocio.name} easily and quickly. Confirm your slot online, no calls needed.`,
    pt: `Agende sua consulta em ${negocio.name} de forma fácil e rápida. Confirme seu horário online.`,
  }

  return {
    title: `Reservar cita — ${negocio.name}`,
    description: descriptions.es,
    openGraph: {
      title: `${negocio.name} — Book Online`,
      description: descriptions.en,
      url,
      type: "website",
      locale: "es_MX",
      alternateLocale: ["en_US", "pt_BR"],
    },
    twitter: {
      card: "summary",
      title: `${negocio.name} — Book Online`,
      description: descriptions.en,
    },
    alternates: { canonical: url },
  }
}

export default async function PaginaReserva({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const headersList = await headers()
  const explicitLocale = headersList.get("x-locale-explicit") || null

  const negocio = await prisma.business.findUnique({
    where: { slug },
    select: {
      name: true,
      type: true,
      slug: true,
      preferredLocale: true,
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

  const locale = explicitLocale ?? negocio.preferredLocale ?? "es"

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
