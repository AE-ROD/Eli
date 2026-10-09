"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { motion, AnimatePresence } from "framer-motion"
import { LogoEli } from "@/components/comunes/logo-eli"
import { AvatarUsuario } from "@/components/panel/avatar-usuario"
import { ID_DEL_CAJON, useBarraLateral } from "@/components/panel/contexto-barra-lateral"
import { ANILLO_DE_FOCO } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  SquareKanban,
  CalendarDays,
  Users,
  MessageCircle,
  ChartColumn,
  Settings,
  LogOut,
  ChevronLeft,
  HelpCircle,
  UsersRound,
  Sparkles,
  User,
  X,
} from "lucide-react"
import { usePrecios } from "@/components/panel/contexto-precios"

/** Lo que se puede enfocar con Tab dentro del cajón. */
const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * El orden sigue el día del negocio: el tablero, donde se atiende y se cobra,
 * justo después del inicio; agenda, clientes y chats después; los reportes,
 * que miran lo ya cobrado, al final. Tablero y reportes son para todos los
 * roles: cada endpoint ya recorta lo que ve cada uno.
 */
const itemsNavegacion = [
  { id: "dashboard", nombre: "Dashboard", icono: LayoutDashboard, ruta: "/dashboard" },
  { id: "tablero", nombre: "Tablero", icono: SquareKanban, ruta: "/dashboard/tablero" },
  { id: "agenda", nombre: "Agenda", icono: CalendarDays, ruta: "/dashboard/agenda" },
  { id: "clientes", nombre: "Clientes", icono: Users, ruta: "/dashboard/clientes" },
  { id: "chats", nombre: "Chats", icono: MessageCircle, ruta: "/dashboard/chats" },
  { id: "reportes", nombre: "Reportes", icono: ChartColumn, ruta: "/dashboard/reportes" },
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
  esOwner?: boolean
  diasTrialRestantes?: number
  /** Dueño y encargado gestionan el equipo; el profesional no ve el enlace. Resuelto en el servidor. */
  puedeVerEquipo?: boolean
}

export function BarraLateral({ usuario, esOwner, diasTrialRestantes, puedeVerEquipo }: BarraLateralProps) {
  const { abrirPrecios } = usePrecios()
  const pathname = usePathname()
  const { cajonAbierto, cerrarCajon, cerrarCajonParaIrA, colapsada: colapsado, alternarColapso, enfocarBotonMenu } =
    useBarraLateral()
  const refCajon = useRef<HTMLDivElement>(null)

  // Mientras el cajón está abierto el foco vive adentro: entra al abrirse,
  // Tab y Shift+Tab dan la vuelta sin salir y Escape lo cierra. Al cerrarse
  // vuelve al botón de menú; si se cerró al elegir otra página, al botón de
  // menú de la página nueva, cuando llega (`cerrarCajonParaIrA`).
  useEffect(() => {
    const cajon = refCajon.current
    if (!cajonAbierto || !cajon) return
    cajon.focus()

    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        cerrarCajon()
        return
      }
      if (evento.key !== "Tab") return

      // Sólo lo que se ve: el botón de colapsar está en el cajón, pero oculto.
      const enfocables = Array.from(cajon.querySelectorAll<HTMLElement>(ENFOCABLES)).filter(
        (elemento) => elemento.getClientRects().length > 0
      )
      if (enfocables.length === 0) return
      const primero = enfocables[0]
      const ultimo = enfocables[enfocables.length - 1]
      const actual = document.activeElement

      if (!cajon.contains(actual)) {
        evento.preventDefault()
        ;(evento.shiftKey ? ultimo : primero).focus()
      } else if (evento.shiftKey && (actual === primero || actual === cajon)) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && actual === ultimo) {
        evento.preventDefault()
        primero.focus()
      }
    }

    // En el documento y no en el cajón: si el foco quedara afuera (en <body>,
    // por ejemplo), Escape y Tab se siguen atendiendo y lo traen de vuelta.
    document.addEventListener("keydown", alTeclear)
    return () => {
      document.removeEventListener("keydown", alTeclear)
      enfocarBotonMenu()
    }
  }, [cajonAbierto, cerrarCajon, enfocarBotonMenu])

  return (
    <>
      {/* La superposición oscura del cajón, sólo en el teléfono. Tocarla lo cierra. */}
      <AnimatePresence>
        {cajonAbierto && (
          <motion.div
            className="fixed inset-0 z-40 bg-foreground/40 lg:hidden"
            onClick={cerrarCajon}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />
        )}
      </AnimatePresence>

      {/*
        Desde lg la barra está fija a la izquierda, como siempre. Por debajo es
        un cajón fuera de la pantalla; cerrado es `invisible`, que lo saca del
        orden de Tab y del lector de pantalla sin esperar al JS. Al abrir se
        hace visible en el acto (el foco no puede entrar a algo invisible) y al
        cerrar recién cuando termina de deslizarse.

        Abierto, es un diálogo modal (role="dialog" con aria-modal): el lector
        lo anuncia como "Menú" y no deja salir de él. Detrás, el contenido queda
        `inert` (ContenidoDelPanel) por si el lector ignora aria-modal. En
        escritorio no lleva esos atributos: ahí la barra es parte de la página,
        no algo que se abre encima.
      */}
      <div
        ref={refCajon}
        id={ID_DEL_CAJON}
        role={cajonAbierto ? "dialog" : undefined}
        aria-modal={cajonAbierto ? true : undefined}
        aria-label={cajonAbierto ? "Menú" : undefined}
        tabIndex={cajonAbierto ? -1 : undefined}
        className={cn(
          "fixed inset-y-0 left-0 z-40 duration-300 ease-in-out focus:outline-none motion-reduce:transition-none lg:visible lg:translate-x-0",
          cajonAbierto
            ? "visible translate-x-0 transition-[translate]"
            : "invisible -translate-x-full transition-[translate,visibility]"
        )}
      >
        <motion.aside
          className="h-full bg-card border-r border-border/50 flex flex-col"
          animate={{ width: colapsado ? 80 : 260 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          {/* Header */}
          <div className="p-4 border-b border-border/50">
            <div className="flex items-center justify-between">
              <Link href="/dashboard" onClick={() => cerrarCajonParaIrA("/dashboard")} className="flex items-center gap-3">
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
                      <LogoEli tamaño="sm" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Link>
              {/* Colapsar es cosa del escritorio: en el teléfono el cajón se cierra. */}
              <motion.button
                type="button"
                className="hidden lg:block p-1.5 rounded-lg hover:bg-muted transition-colors"
                onClick={alternarColapso}
                animate={{ rotate: colapsado ? 180 : 0 }}
                aria-label={colapsado ? "Expandir menú" : "Contraer menú"}
                aria-expanded={!colapsado}
              >
                <ChevronLeft className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </motion.button>
              {/*
                En el teléfono no hay tecla Escape, y con aria-modal el lector de
                pantalla no llega a la superposición: sin este botón, quien lo usa
                sólo saldría del cajón eligiendo una página.
              */}
              <button
                type="button"
                className={cn("lg:hidden p-1.5 rounded-lg hover:bg-muted transition-colors", ANILLO_DE_FOCO)}
                onClick={cerrarCajon}
                aria-label="Cerrar menú"
              >
                <X className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </button>
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
              ...(puedeVerEquipo ? [{ id: "equipo", nombre: "Equipo", icono: UsersRound, ruta: "/dashboard/equipo" }] : []),
            ].map((item) => {
              const activo = pathname === item.ruta || (item.ruta !== "/dashboard" && pathname.startsWith(item.ruta))
          
              return (
                <Link key={item.id} href={item.ruta} onClick={() => cerrarCajonParaIrA(item.ruta)}>
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
                  <Link key={item.id} href={item.ruta} onClick={() => cerrarCajonParaIrA(item.ruta)}>
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

          {/* Banner trial */}
          {esOwner && diasTrialRestantes !== undefined && diasTrialRestantes <= 3 && (
            <div className="px-3 pb-2">
              <motion.button
                onClick={() => {
                  // Los planes se abren con el cajón ya cerrado: abierto, seguiría
                  // reteniendo el foco detrás del modal.
                  cerrarCajon()
                  abrirPrecios()
                }}
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

          {/* Usuario — sin sesión no se inventa nombre ni negocio */}
          <div className="p-3 border-t border-border/50">
            <div className={`flex items-center ${colapsado ? "justify-center" : "gap-3"} p-2 rounded-xl hover:bg-muted transition-colors cursor-pointer`}>
              {usuario ? (
                <AvatarUsuario nombre={usuario.nombre} imagenUrl={usuario.imagenUrl} tamaño="sm" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <AnimatePresence>
                {!colapsado && (
                  <motion.div
                    className="flex-1 min-w-0"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {usuario ? (
                      <>
                        <p className="text-sm font-medium text-foreground truncate">{usuario.nombre}</p>
                        <p className="text-xs text-muted-foreground truncate">{usuario.negocio}</p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground truncate">Sesión no disponible</p>
                    )}
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
      </div>
    </>
  )
}
