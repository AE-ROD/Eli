"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AvatarUsuario } from "@/components/app/comunes/avatar-usuario"
import { BotonPrimario } from "@/components/app/formularios/boton-primario"
import { useSidebar } from "@/components/app/layout/sidebar-context"
import {
  Search,
  Bell,
  Plus,
  Menu,
} from "lucide-react"

interface BarraSuperiorProps {
  titulo: string
  subtitulo?: string
  accionPrincipal?: {
    texto: string
    onClick: () => void
  }
  mostrarBusqueda?: boolean
}

export function BarraSuperior({
  titulo,
  subtitulo,
  accionPrincipal,
  mostrarBusqueda = true,
}: BarraSuperiorProps) {
  const [busquedaActiva, setBusquedaActiva] = useState(false)
  const { toggle } = useSidebar()

  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/50">
      <div className="flex items-center justify-between px-6 py-4">
        {/* Titulo */}
        <div className="flex items-center gap-4">
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-muted transition-colors"
            onClick={toggle}
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">{titulo}</h1>
            {subtitulo && (
              <p className="text-sm text-muted-foreground">{subtitulo}</p>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-3">
          {/* Busqueda */}
          {mostrarBusqueda && (
            <AnimatePresence mode="wait">
              {busquedaActiva ? (
                <motion.div
                  key="search-input"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 280, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="relative hidden sm:block"
                >
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar..."
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    autoFocus
                    onBlur={() => setBusquedaActiva(false)}
                  />
                </motion.div>
              ) : (
                <motion.button
                  key="search-button"
                  className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm hover:bg-muted/80 transition-colors"
                  onClick={() => setBusquedaActiva(true)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <Search className="h-4 w-4" />
                  <span>Buscar...</span>
                  <kbd className="hidden md:inline-flex h-5 px-1.5 items-center rounded border border-border bg-background text-xs">
                    ⌘K
                  </kbd>
                </motion.button>
              )}
            </AnimatePresence>
          )}

          {/* Notificaciones */}
          <motion.button
            className="relative p-2 rounded-lg hover:bg-muted transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Notificaciones"
            aria-label="Notificaciones"
          >
            <Bell className="h-5 w-5 text-muted-foreground" />
          </motion.button>

          {/* Accion principal */}
          {accionPrincipal && (
            <BotonPrimario
              onClick={accionPrincipal.onClick}
              icono={<Plus className="h-4 w-4" />}
              tamaño="sm"
              className="hidden sm:flex"
            >
              {accionPrincipal.texto}
            </BotonPrimario>
          )}

          {/* Avatar (solo movil) */}
          <div className="lg:hidden">
            <AvatarUsuario nombre="María García" tamaño="sm" />
          </div>
        </div>
      </div>
    </header>
  )
}
