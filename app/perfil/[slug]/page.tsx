import { notFound } from "next/navigation"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import type { Metadata } from "next"
import { MapPin, Clock, Star, ArrowRight, Calendar } from "lucide-react"

export const dynamic = "force-dynamic"

const T = {
  es: {
    bookNow: "Reservar cita",
    services: "Servicios",
    schedule: "Horario",
    min: "min",
    fromPrice: "Desde",
    days: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
    open: "Abierto",
    poweredBy: "Reservas con Eli",
    noServices: "Este negocio no tiene servicios disponibles.",
  },
  en: {
    bookNow: "Book appointment",
    services: "Services",
    schedule: "Schedule",
    min: "min",
    fromPrice: "From",
    days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    open: "Open",
    poweredBy: "Bookings powered by Eli",
    noServices: "No services available.",
  },
  pt: {
    bookNow: "Agendar consulta",
    services: "Serviços",
    schedule: "Horário",
    min: "min",
    fromPrice: "A partir de",
    days: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
    open: "Aberto",
    poweredBy: "Agendamentos com Eli",
    noServices: "Sem serviços disponíveis.",
  },
} as const

type Locale = keyof typeof T

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const negocio = await prisma.business.findUnique({
    where: { slug },
    select: { name: true, type: true },
  })
  if (!negocio) return { title: "Negocio no encontrado" }

  const desc = `Reserva tu cita en ${negocio.name}. Confirma tu hora en línea, sin llamadas.`
  return {
    title: negocio.name,
    description: desc,
    openGraph: {
      title: negocio.name,
      description: desc,
      type: "website",
    },
  }
}

export default async function PerfilPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const headersList = await headers()
  const rawLocale = headersList.get("x-locale") ?? "es"
  const locale: Locale = (["es", "en", "pt"].includes(rawLocale) ? rawLocale : "es") as Locale
  const txt = T[locale]

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
        where: { active: true, memberId: null },
        select: { dayOfWeek: true, startTime: true, endTime: true },
        orderBy: { dayOfWeek: "asc" },
      },
    },
  })

  if (!negocio) notFound()

  const minPrice = negocio.services
    .filter((s) => s.price != null)
    .reduce<number | null>((min, s) => (min === null || s.price! < min ? s.price! : min), null)

  return (
    <main className="min-h-screen bg-background">
      {/* Hero */}
      <div className="bg-primary/5 border-b border-border/50">
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <span className="text-3xl font-bold text-primary select-none">
              {negocio.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-1">{negocio.name}</h1>
          {negocio.type && (
            <p className="text-sm text-muted-foreground capitalize mb-6">{negocio.type}</p>
          )}
          {minPrice != null && (
            <p className="text-xs text-muted-foreground mb-4">
              {txt.fromPrice} <span className="font-semibold text-foreground">${minPrice.toLocaleString("es-MX")}</span>
            </p>
          )}
          <Link
            href={`/reservar/${slug}`}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
          >
            <Calendar className="h-4 w-4" />
            {txt.bookNow}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {/* Services */}
        {negocio.services.length > 0 ? (
          <section>
            <h2 className="text-base font-semibold text-foreground mb-4">{txt.services}</h2>
            <div className="space-y-3">
              {negocio.services.map((servicio) => (
                <div
                  key={servicio.id}
                  className="flex items-start justify-between gap-4 bg-card border border-border/50 rounded-xl px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{servicio.name}</p>
                    {servicio.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{servicio.description}</p>
                    )}
                    <div className="flex items-center gap-1 mt-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{servicio.duration} {txt.min}</span>
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    {servicio.price != null && (
                      <p className="text-sm font-semibold text-foreground tabular-nums">
                        ${servicio.price.toLocaleString("es-MX")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">{txt.noServices}</p>
        )}

        {/* Schedule */}
        {negocio.workSchedules.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-foreground mb-4">{txt.schedule}</h2>
            <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
              {negocio.workSchedules.map((h, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-4 py-3 border-b border-border/30 last:border-b-0"
                >
                  <span className="text-sm text-foreground font-medium">{txt.days[h.dayOfWeek]}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-success bg-success/10 px-2 py-0.5 rounded-full font-medium">
                      {txt.open}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {h.startTime} – {h.endTime}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CTA footer */}
        <div className="text-center pt-4 pb-8">
          <Link
            href={`/reservar/${slug}`}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
          >
            <Calendar className="h-4 w-4" />
            {txt.bookNow}
          </Link>
          <p className="text-xs text-muted-foreground mt-4">{txt.poweredBy}</p>
        </div>
      </div>
    </main>
  )
}
