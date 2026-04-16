"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { EliLogo } from "../eli-logo"
import { AvatarUsuario } from "./avatar-usuario"
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  MessageCircle,
  Settings,
  LogOut,
  ChevronLeft,
  Bell,
  HelpCircle,
} from "lucide-react"

const itemsNavegacion = [
  { id: "dashboard", nombre: "Dashboard", icono: LayoutDashboard, ruta: "/dashboard" },
  { id: "calendario", nombre: "Calendario", icono: CalendarDays, ruta: "/dashboard/calendario" },
  { id: "pacientes", nombre: "Pacientes", icono: Users, ruta: "/dashboard/pacientes" },
  { id: "chats", nombre: "Chats", icono: MessageCircle, ruta: "/dashboard/chats", notificaciones: 3 },
]

const itemsSecundarios = [
  { id: "configuracion", nombre: "Configuración", icono: Settings, ruta: "/dashboard/configuracion" },
  { id: "ayuda", nombre: "Ayuda", icono: HelpCircle, ruta: "/dashboard/ayuda" },
]

interface BarraLateralProps {
  usuario?: {
    nombre: string
    email: string
    imagenUrl?: string
    negocio: string
  }
}

export function BarraLateral({ usuario }: BarraLateralProps) {
  const pathname = usePathname()
  const [colapsado, setColapsado] = useState(false)

  const usuarioDefault = usuario || {
    nombre: "María García",
    email: "maria@salon.com",
    negocio: "Salón María",
  }

  return (
    <motion.aside
      className="fixed left-0 top-0 h-screen bg-card border-r border-border/50 flex flex-col z-40"
      animate={{ width: colapsado ? 80 : 260 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
    >
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
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            onClick={() => setColapsado(!colapsado)}
            animate={{ rotate: colapsado ? 180 : 0 }}
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
        
        {itemsNavegacion.map((item) => {
          const activo = pathname === item.ruta || (item.ruta !== "/dashboard" && pathname.startsWith(item.ruta))
          
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
                {item.notificaciones && item.notificaciones > 0 && (
                  <span className={`
                    flex items-center justify-center text-xs font-medium text-primary-foreground bg-primary rounded-full
                    ${colapsado ? "absolute -top-1 -right-1 w-4 h-4 text-[10px]" : "ml-auto w-5 h-5"}
                  `}>
                    {item.notificaciones}
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
              >
                <LogOut className="h-4 w-4 text-muted-foreground" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  )
}
