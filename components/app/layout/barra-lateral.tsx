"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { motion, AnimatePresence } from "framer-motion"
import { EliLogo } from "@/components/shared/eli-logo"
import { AvatarUsuario } from "@/components/app/comunes/avatar-usuario"
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  MessageCircle,
  Settings,
  LogOut,
  ChevronLeft,
  HelpCircle,
  UsersRound,
  Sparkles,
  BarChart2,
  Zap,
  FileUp,
  UserPlus,
  ClipboardList,
  FileBarChart,
  StickyNote,
  X,
} from "lucide-react"
import { usePrecios } from "@/components/app/modales/provider-precios"
import { useSidebar } from "./sidebar-context"

const itemsNavegacion = [
  { id: "dashboard", nombre: "Dashboard", icono: LayoutDashboard, ruta: "/dashboard" },
  { id: "calendario", nombre: "Calendario", icono: CalendarDays, ruta: "/dashboard/calendario" },
  { id: "pacientes", nombre: "Usuarios", icono: Users, ruta: "/dashboard/pacientes" },
  { id: "analitica", nombre: "Analítica", icono: BarChart2, ruta: "/dashboard/analytics" },
  { id: "chats", nombre: "Mensajería", icono: MessageCircle, ruta: "/dashboard/chats" },
  { id: "walkin", nombre: "Walk-in", icono: UserPlus, ruta: "/dashboard/walk-in" },
  { id: "agentes", nombre: "Agentes IA", icono: Sparkles, ruta: "/dashboard/agentes" },
]

const itemsSecundarios = [
  { id: "configuracion", nombre: "Configuración", icono: Settings, ruta: "/dashboard/configuracion" },
  { id: "upgrade", nombre: "Actualizar plan", icono: Zap, ruta: "/dashboard/upgrade" },
  { id: "ayuda", nombre: "Ayuda", icono: HelpCircle, ruta: "/dashboard/ayuda" },
]

interface BarraLateralProps {
  usuario?: {
    nombre: string
    email: string
    imagenUrl?: string
    negocio: string
  }
  esOwner?: boolean
  diasTrialRestantes?: number
}

export function BarraLateral({ usuario, esOwner, diasTrialRestantes }: BarraLateralProps) {
  const { abrirPrecios } = usePrecios()
  const pathname = usePathname()
  const [colapsado, setColapsado] = useState(false)
  const [agentesAlta, setAgentesAlta] = useState(0)
  const { abierto, cerrar } = useSidebar()

  const usuarioDefault = usuario || {
    nombre: "María García",
    email: "maria@salon.com",
    negocio: "Salón María",
  }

  useEffect(() => {
    let cancelado = false

    async function cargarConteoAgentes() {
      try {
        const res = await fetch("/api/agents/count")
        if (!res.ok) return

        const data = await res.json()
        if (!cancelado) {
          setAgentesAlta(Number(data.alta) || 0)
        }
      } catch {
        // Silencioso: el badge no debe interrumpir la navegación.
      }
    }

    cargarConteoAgentes()

    return () => {
      cancelado = true
    }
  }, [])

  return (
    <>
      {/* Overlay móvil */}
      <AnimatePresence>
        {abierto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden fixed inset-0 bg-black/40 z-40"
            onClick={cerrar}
          />
        )}
      </AnimatePresence>

    <motion.aside
      className={[
        "fixed left-0 top-0 h-screen bg-card border-r border-border/50 flex flex-col z-50",
        "transition-transform duration-300 ease-in-out",
        // Móvil: oculto por defecto, visible cuando abierto
        abierto ? "translate-x-0" : "-translate-x-full",
        // Desktop: siempre visible (override del translate)
        "lg:translate-x-0",
      ].join(" ")}
      animate={{ width: colapsado ? 80 : 260 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
    >
      {/* Botón cerrar — solo en móvil */}
      <button
        onClick={cerrar}
        className="lg:hidden absolute top-3 right-3 p-1.5 rounded-lg hover:bg-muted transition-colors"
        aria-label="Cerrar menú"
      >
        <X className="h-4 w-4 text-muted-foreground" />
      </button>
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3">
            <motion.div
              className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center"
              whileHover={{ scale: 1.05 }}
            >
              <span className="text-primary-foreground font-bold text-lg">E</span>
            </motion.div>
            <AnimatePresence>
              {!colapsado && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <EliLogo size="sm" />
                </motion.div>
              )}
            </AnimatePresence>
          </Link>
          <motion.button
            className="p-2.5 rounded-lg hover:bg-muted transition-colors"
            onClick={() => setColapsado(!colapsado)}
            animate={{ rotate: colapsado ? 180 : 0 }}
            title={colapsado ? "Expandir menú" : "Colapsar menú"}
          >
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </motion.button>
        </div>
      </div>

      {/* Navegacion principal */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <AnimatePresence>
          {!colapsado && (
            <motion.p
              className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              Menú principal
            </motion.p>
          )}
        </AnimatePresence>
        
        {[
          ...itemsNavegacion,
          ...(esOwner ? [
            { id: "equipo", nombre: "Equipo", icono: UsersRound, ruta: "/dashboard/equipo" },
            { id: "importar", nombre: "Importar datos", icono: FileUp, ruta: "/dashboard/importar" },
            { id: "cierre-turno", nombre: "Cierre de turno", icono: ClipboardList, ruta: "/dashboard/cierre-turno" },
            { id: "notas-turno", nombre: "Notas de turno", icono: StickyNote, ruta: "/dashboard/notas-turno" },
            { id: "reportes", nombre: "Reportes", icono: FileBarChart, ruta: "/dashboard/reportes" },
          ] : []),
        ].map((item) => {
          const activo = pathname === item.ruta || (item.ruta !== "/dashboard" && pathname.startsWith(item.ruta))
          const notificaciones = item.id === "agentes" && agentesAlta > 0
            ? agentesAlta
            : (item as { notificaciones?: number }).notificaciones
          
          return (
            <Link key={item.id} href={item.ruta}>
              <motion.div
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors relative
                  ${activo
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }
                `}
                whileHover={{ x: 2 }}
                title={colapsado ? item.nombre : undefined}
              >
                <item.icono className="h-5 w-5 flex-shrink-0" />
                <AnimatePresence>
                  {!colapsado && (
                    <motion.span
                      className="font-medium text-sm"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                    >
                      {item.nombre}
                    </motion.span>
                  )}
                </AnimatePresence>
                {notificaciones && notificaciones > 0 && (
                  <span className={`
                    flex items-center justify-center text-xs font-medium text-primary-foreground bg-primary rounded-full
                    ${colapsado ? "absolute -top-1 -right-1 w-4 h-4 text-[10px]" : "ml-auto w-5 h-5"}
                  `}>
                    {notificaciones}
                  </span>
                )}
                {activo && (
                  <motion.div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full"
                    layoutId="activeIndicator"
                  />
                )}
              </motion.div>
            </Link>
          )
        })}

        <div className="pt-4 mt-4 border-t border-border/50">
          <AnimatePresence>
            {!colapsado && (
              <motion.p
                className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                Configuración
              </motion.p>
            )}
          </AnimatePresence>
          
          {itemsSecundarios.map((item) => {
            const activo = pathname === item.ruta
            
            return (
              <Link key={item.id} href={item.ruta}>
                <motion.div
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors
                    ${activo
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }
                  `}
                  whileHover={{ x: 2 }}
                  title={colapsado ? item.nombre : undefined}
                >
                  <item.icono className="h-5 w-5 flex-shrink-0" />
                  <AnimatePresence>
                    {!colapsado && (
                      <motion.span
                        className="font-medium text-sm"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                      >
                        {item.nombre}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Banner trial */}
      {esOwner && diasTrialRestantes !== undefined && diasTrialRestantes <= 3 && (
        <div className="px-3 pb-2">
          <motion.button
            onClick={abrirPrecios}
            className="w-full rounded-xl bg-primary/10 border border-primary/20 p-3 text-left hover:bg-primary/15 transition-colors"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              <AnimatePresence>
                {!colapsado && (
                  <motion.span
                    className="text-xs font-semibold text-primary"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {diasTrialRestantes > 0 ? `${diasTrialRestantes} día${diasTrialRestantes !== 1 ? "s" : ""} de prueba` : "Trial finalizado"}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <AnimatePresence>
              {!colapsado && (
                <motion.p
                  className="text-xs text-muted-foreground leading-tight"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  Ver planes →
                </motion.p>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      )}

      {/* Usuario */}
      <div className="p-3 border-t border-border/50">
        <div className={`flex items-center ${colapsado ? "justify-center" : "gap-3"} p-2 rounded-xl hover:bg-muted transition-colors cursor-pointer`}>
          <AvatarUsuario nombre={usuarioDefault.nombre} imagenUrl={usuarioDefault.imagenUrl} tamaño="sm" />
          <AnimatePresence>
            {!colapsado && (
              <motion.div
                className="flex-1 min-w-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <p className="text-sm font-medium text-foreground truncate">{usuarioDefault.nombre}</p>
                <p className="text-xs text-muted-foreground truncate">{usuarioDefault.negocio}</p>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {!colapsado && (
              <motion.button
                className="p-1.5 rounded-lg hover:bg-background transition-colors"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => signOut({ callbackUrl: "/iniciar-sesion" })}
                title="Cerrar sesión"
              >
                <LogOut className="h-4 w-4 text-muted-foreground" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
    </>
  )
}
