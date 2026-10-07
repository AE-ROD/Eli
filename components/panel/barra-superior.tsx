"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { motion, AnimatePresence } from "framer-motion"
import { AvatarUsuario } from "@/components/panel/avatar-usuario"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { ID_DEL_CAJON, useBarraLateral } from "@/components/panel/contexto-barra-lateral"
import {
  Search,
  Bell,
  Plus,
  Menu,
  User,
  type LucideIcon,
} from "lucide-react"

interface BarraSuperiorProps {
  titulo: string
  subtitulo?: string
  accionPrincipal?: {
    texto: string
    onClick: () => void
    /** Sin ícono propio va `Plus`. En el teléfono es lo único que se ve del botón. */
    icono?: LucideIcon
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
  const { cajonAbierto, abrirCajon, refBotonMenu } = useBarraLateral()
  const { data: session } = useSession()
  const nombreUsuario = session?.user?.name
  const IconoDeLaAccion = accionPrincipal?.icono ?? Plus

  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/50">
      {/*
        Tiene que entrar en 320 px con menú, título, campana, acción y avatar.
        Bajo sm el margen y los espacios son menores y el título baja a 18 px:
        así "Dashboard", el más largo de los que llevan acción, entra entero.
        Si aun así faltara lugar, cede el título (se corta con "…") en vez de
        empujar los botones fuera de la pantalla.
      */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4">
        {/* Titulo */}
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          {/* Con el cajón abierto la superposición lo tapa: este botón sólo abre. */}
          <button
            ref={refBotonMenu}
            type="button"
            className="lg:hidden p-2 rounded-lg hover:bg-muted transition-colors"
            onClick={abrirCajon}
            aria-label="Menú"
            aria-controls={ID_DEL_CAJON}
            aria-expanded={cajonAbierto}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">{titulo}</h1>
            {subtitulo && (
              <p className="text-sm text-muted-foreground">{subtitulo}</p>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
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

          {/* Notificaciones — sin conteo real que mostrar, el ícono no lleva indicador */}
          <motion.button
            className="relative p-2 rounded-lg hover:bg-muted transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Notificaciones"
          >
            <Bell className="h-5 w-5 text-muted-foreground" />
          </motion.button>

          {/*
            Accion principal. En el teléfono no se puede perder (es por donde se
            crea una cita, un cliente o una invitación), pero su texto no entra
            en 320 px: bajo sm va sólo el ícono, con el texto como nombre
            (aria-label) y como globo (title), en un botón de 44 × 44 px, lo
            mínimo para un dedo. Desde sm, el botón con texto.
          */}
          {accionPrincipal && (
            <>
              <BotonPrimario
                onClick={accionPrincipal.onClick}
                aria-label={accionPrincipal.texto}
                title={accionPrincipal.texto}
                className="sm:hidden h-11 w-11 p-0"
              >
                <IconoDeLaAccion className="h-5 w-5" aria-hidden="true" />
              </BotonPrimario>
              <BotonPrimario
                onClick={accionPrincipal.onClick}
                icono={<IconoDeLaAccion className="h-4 w-4" aria-hidden="true" />}
                tamaño="sm"
                className="hidden sm:inline-flex"
              >
                {accionPrincipal.texto}
              </BotonPrimario>
            </>
          )}

          {/* Avatar (solo movil) — sin sesión no se inventa nombre */}
          <div className="lg:hidden">
            {nombreUsuario ? (
              <AvatarUsuario nombre={nombreUsuario} tamaño="sm" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
