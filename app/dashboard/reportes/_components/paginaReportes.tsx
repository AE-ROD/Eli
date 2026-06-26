"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { BarraSuperior } from "@/components/app/layout/barra-superior"
import {
  DollarSign,
  CalendarCheck,
  Scissors,
  Users,
  UserCircle,
  Clock,
  Pin,
  PinOff,
  Trash2,
  Star,
} from "lucide-react"

interface Props {
  puedeVerIngresos: boolean
  puedeVerStaff: boolean
  puedeProgramar: boolean
  puedeExportar: boolean
}

interface SavedReportAPI {
  id: string
  name: string
  description: string | null
  reportType: string
  isPinned: boolean
  createdAt: string
  createdBy: { user: { name: string } }
}

const REPORT_CARDS = [
  { tipo: "ingresos", label: "Ingresos", desc: "Revenue, comparativas y desglose por método de pago", icono: DollarSign, color: "text-amber-500", requiereRevenue: true },
  { tipo: "citas", label: "Citas", desc: "Volumen, cancelaciones y completitud", icono: CalendarCheck, color: "text-primary", requiereRevenue: false },
  { tipo: "servicios", label: "Servicios", desc: "Ranking y distribución de servicios", icono: Scissors, color: "text-violet-500", requiereRevenue: false },
  { tipo: "trabajadores", label: "Trabajadores", desc: "Desempeño y ocupación por miembro del equipo", icono: Users, color: "text-emerald-500", requiereStaff: true },
  { tipo: "clientes", label: "Clientes", desc: "Retención, nuevos clientes e inactivos", icono: UserCircle, color: "text-sky-500", requiereRevenue: false },
  { tipo: "ocupacion", label: "Ocupación", desc: "Horas pico, horas valle y slots desperdiciados", icono: Clock, color: "text-rose-500", requiereRevenue: false },
] as const

const REPORT_TYPE_LABEL: Record<string, string> = {
  INGRESOS: "Ingresos",
  CITAS: "Citas",
  SERVICIOS: "Servicios",
  TRABAJADORES: "Trabajadores",
  CLIENTES: "Clientes",
  OCUPACION: "Ocupación",
  CIERRES: "Cierres de turno",
}

const REPORT_TYPE_SLUG: Record<string, string> = {
  INGRESOS: "ingresos",
  CITAS: "citas",
  SERVICIOS: "servicios",
  TRABAJADORES: "trabajadores",
  CLIENTES: "clientes",
  OCUPACION: "ocupacion",
  CIERRES: "cierres",
}

export function PaginaReportes({ puedeVerIngresos, puedeVerStaff }: Props) {
  const [guardados, setGuardados] = useState<SavedReportAPI[]>([])
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    setCargando(true)
    const res = await fetch("/api/reports/saved")
    if (res.ok) {
      const data = await res.json()
      setGuardados(data.reports)
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const fijados = guardados.filter((r) => r.isPinned)

  const togglePin = async (r: SavedReportAPI) => {
    await fetch("/api/reports/saved", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, isPinned: !r.isPinned }),
    })
    cargar()
  }

  const eliminar = async (id: string) => {
    if (!confirm("¿Eliminar este reporte guardado?")) return
    await fetch(`/api/reports/saved?id=${id}`, { method: "DELETE" })
    cargar()
  }

  const tarjetasVisibles = REPORT_CARDS.filter((c) => {
    if ("requiereStaff" in c && c.requiereStaff && !puedeVerStaff) return false
    return true
  })

  return (
    <div className="min-h-screen">
      <BarraSuperior titulo="Reportes" subtitulo="Centro de reportes predefinidos de tu negocio" />

      <div className="p-6 space-y-8">
        {fijados.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <Star className="h-3.5 w-3.5" />
              Accesos fijados
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {fijados.map((r) => (
                <Link
                  key={r.id}
                  href={`/dashboard/reportes/${REPORT_TYPE_SLUG[r.reportType] ?? "citas"}?savedId=${r.id}`}
                  className="bg-card border border-border/50 rounded-xl p-4 hover:border-primary/40 transition-colors"
                >
                  <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{REPORT_TYPE_LABEL[r.reportType]}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Reportes disponibles
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tarjetasVisibles.map((c, i) => (
              <motion.div
                key={c.tipo}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link
                  href={`/dashboard/reportes/${c.tipo}`}
                  className="block bg-card border border-border/50 rounded-xl p-5 hover:border-primary/40 hover:shadow-md transition-all h-full"
                >
                  <div className={`p-3 rounded-xl bg-muted ${c.color} inline-flex mb-4`}>
                    <c.icono className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-1">{c.label}</h3>
                  <p className="text-sm text-muted-foreground">{c.desc}</p>
                  {"requiereRevenue" in c && c.requiereRevenue && !puedeVerIngresos && (
                    <p className="text-xs text-amber-600 mt-2">Cifras de ingresos ocultas (sin permiso)</p>
                  )}
                </Link>
              </motion.div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Mis Reportes Guardados
          </h2>
          {cargando ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : guardados.length === 0 ? (
            <div className="bg-card border border-border/50 rounded-xl p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Aún no tienes reportes guardados. Abre un reporte y usa &quot;Guardar&quot; para conservar tus filtros favoritos.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {guardados.map((r) => (
                <div key={r.id} className="bg-card border border-border/50 rounded-xl p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{REPORT_TYPE_LABEL[r.reportType]}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => togglePin(r)}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                        title={r.isPinned ? "Quitar de fijados" : "Fijar"}
                      >
                        {r.isPinned ? (
                          <PinOff className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Pin className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </button>
                      <button
                        onClick={() => eliminar(r.id)}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  </div>
                  {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                    {" · "}
                    {r.createdBy?.user.name}
                  </p>
                  <Link
                    href={`/dashboard/reportes/${REPORT_TYPE_SLUG[r.reportType] ?? "citas"}?savedId=${r.id}`}
                    className="text-xs font-medium text-primary hover:underline mt-1"
                  >
                    Abrir con estos filtros →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
