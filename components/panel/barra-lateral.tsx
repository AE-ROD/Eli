"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowRight, LogOut, PanelLeftClose, PanelLeftOpen, Sparkles, UserRound, X } from "lucide-react"
import { FONDO_SUAVE, HALO_DE_MODULO } from "@/components/comunes/colores-de-modulo"
import { LogoEli } from "@/components/comunes/logo-eli"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import { AvatarUsuario } from "@/components/panel/avatar-usuario"
import { ID_DEL_CAJON, useBarraLateral } from "@/components/panel/contexto-barra-lateral"
import { usePrecios } from "@/components/panel/contexto-precios"
import { CuadroDeSeccion } from "@/components/panel/icono-de-seccion"
import {
  SECCION_DE_AYUDA,
  SECCION_DE_CONFIGURACION,
  SECCION_DE_INICIO,
  SECCIONES_DE_MODULOS,
  seccionDeLaRuta,
  type SeccionDelPanel,
} from "@/components/panel/secciones-del-panel"
import { moduloPorId } from "@/lib/modulos"
import { DIA_DEL_AVISO_DE_PRUEBA, DIAS_DE_PRUEBA } from "@/lib/precios"
import { cn } from "@/lib/utils"

/** Lo que se puede enfocar con Tab dentro del cajón. */
const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Los botones de sólo ícono de la barra: 44 × 44, lo mínimo para un dedo. */
const BOTON_DE_ICONO =
  "grid size-11 shrink-0 place-items-center rounded-boton text-navy squircle anillo-foco transition-colors duration-150 ease-suave hover:bg-superficie"

/**
 * El ancho de la isla: 240 px, o 76 colapsada (sólo los íconos). El cajón del
 * teléfono es un poco más ancho. `ContenidoDelPanel` corre el contenido lo
 * mismo, más el margen de 24 px de la isla.
 */
const ANCHO_EXPANDIDA = "w-64 lg:w-60"
const ANCHO_COLAPSADA = "w-[76px]"

interface PropsDeBarraLateral {
  usuario?: {
    nombre: string
    email: string
    imagenUrl?: string
    negocio: string
  }
  /** Sólo el dueño ve el aviso de prueba y los planes. Resuelto en el servidor. */
  puedeGestionarSuscripcion?: boolean
  diasTrialRestantes?: number
  /** Dueño y encargado gestionan el equipo; el profesional no ve el enlace. Resuelto en el servidor. */
  puedeVerEquipo?: boolean
}

export function BarraLateral({ usuario, puedeGestionarSuscripcion, diasTrialRestantes, puedeVerEquipo }: PropsDeBarraLateral) {
  const { abrirPrecios } = usePrecios()
  const pathname = usePathname()
  const { cajonAbierto, cerrarCajon, cerrarCajonParaIrA, colapsada, alternarColapso, enfocarBotonMenu } =
    useBarraLateral()
  const refCajon = useRef<HTMLDivElement>(null)
  const seccionActiva = seccionDeLaRuta(pathname)

  /**
   * El orden es el de la referencia aprobada: el inicio, los módulos en el
   * orden del día de trabajo (`lib/modulos.ts`); abajo, aparte,
   * configuración y ayuda. Chats está escondido hasta que exista WhatsApp
   * (`secciones-del-panel.ts`). Tablero y reportes son para todos los roles: cada
   * endpoint ya recorta lo que ve cada uno. Equipo, sólo para quien lo gestiona.
   */
  const principales: SeccionDelPanel[] = [
    SECCION_DE_INICIO,
    ...SECCIONES_DE_MODULOS.filter((seccion) => seccion.id !== "equipo" || puedeVerEquipo),
  ]
  const secundarias: SeccionDelPanel[] = [SECCION_DE_CONFIGURACION, SECCION_DE_AYUDA]

  // Mientras el cajón está abierto el foco vive adentro: entra al abrirse,
  // Tab y Shift+Tab dan la vuelta sin salir y Escape lo cierra. Al cerrarse
  // vuelve al botón de menú; si lo cerró un enlace que lleva a otra página,
  // al botón de menú de la página nueva, cuando llega (`cerrarCajonParaIrA`).
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

  // Del quinto día en adelante quedan 3 o menos (los días restantes se redondean hacia arriba).
  const hayPrueba =
    puedeGestionarSuscripcion &&
    diasTrialRestantes !== undefined &&
    diasTrialRestantes <= DIAS_DE_PRUEBA - DIA_DEL_AVISO_DE_PRUEBA + 1
  const textoDeLaPrueba =
    diasTrialRestantes !== undefined && diasTrialRestantes > 0
      ? `${diasTrialRestantes} día${diasTrialRestantes !== 1 ? "s" : ""} de prueba`
      : "Prueba finalizada"

  return (
    <>
      {/* La superposición del cajón, sólo en el teléfono. Tocarla lo cierra. */}
      <AnimatePresence>
        {cajonAbierto && (
          <motion.div
            className="fixed inset-0 z-40 bg-navy/40 lg:hidden"
            onClick={cerrarCajon}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURACION.pildora, ease: CURVA.suave }}
          />
        )}
      </AnimatePresence>

      {/*
        Desde lg la barra es una isla blanca fija a la izquierda, separada 24 px
        del borde. Por debajo es un cajón fuera de la pantalla; cerrado es
        `invisible`, que lo saca del orden de Tab y del lector de pantalla sin
        esperar al JS. Al abrir se hace visible en el acto (el foco no puede
        entrar a algo invisible) y al cerrar recién cuando termina de deslizarse.

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
          "fixed inset-y-0 left-0 z-40 p-2 duration-300 ease-in-out focus:outline-none motion-reduce:transition-none lg:visible lg:translate-x-0 lg:py-6 lg:pr-0 lg:pl-6",
          cajonAbierto
            ? "visible translate-x-0 transition-[translate]"
            : "invisible -translate-x-full transition-[translate,visibility]"
        )}
      >
        <aside
          aria-label="Barra lateral"
          className={cn(
            "flex h-full flex-col gap-5 rounded-panel bg-tarjeta px-3 pt-3 pb-3 text-navy shadow-sm squircle",
            colapsada ? ANCHO_COLAPSADA : ANCHO_EXPANDIDA
          )}
        >
          <div className={cn("flex min-h-11 items-center gap-2", colapsada ? "justify-center" : "justify-between")}>
            {/*
              Este enlace y los de la navegación cierran el cajón en
              `onNavigate`, no en `onClick`: Next lo llama sólo cuando navega
              en esta pestaña. Con Ctrl, Cmd, Shift o Alt el clic lo resuelve
              el navegador (otra pestaña, otra ventana, una descarga), y el
              cajón queda abierto con el foco en el enlace.
            */}
            {!colapsada && (
              <Link
                href="/dashboard"
                onNavigate={() => cerrarCajonParaIrA("/dashboard")}
                aria-label="Eli, ir al inicio"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[12px] px-2.5 anillo-foco"
              >
                <LogoEli tamaño="md" />
              </Link>
            )}
            {/* Colapsar es cosa del escritorio: en el teléfono el cajón se cierra. */}
            <button
              type="button"
              className={cn(BOTON_DE_ICONO, "hidden lg:grid")}
              onClick={alternarColapso}
              aria-label={colapsada ? "Expandir menú" : "Contraer menú"}
              aria-expanded={!colapsada}
            >
              {colapsada ? (
                <PanelLeftOpen className="size-5" aria-hidden="true" strokeWidth={1.75} />
              ) : (
                <PanelLeftClose className="size-5" aria-hidden="true" strokeWidth={1.75} />
              )}
            </button>
            {/*
              En el teléfono no hay tecla Escape, y con aria-modal el lector de
              pantalla no llega a la superposición: sin este botón, quien lo usa
              sólo saldría del cajón eligiendo una página.
            */}
            <button type="button" className={cn(BOTON_DE_ICONO, "lg:hidden")} onClick={cerrarCajon} aria-label="Cerrar menú">
              <X className="size-5" aria-hidden="true" strokeWidth={1.75} />
            </button>
          </div>

          {/*
            Si el alto no alcanza, la lista se desplaza. El margen negativo con
            su relleno deja lugar al anillo del foco, que un contenedor que
            desplaza recortaría en los bordes.
          */}
          <nav aria-label="Secciones del panel" className="-mx-2 -my-1 min-h-0 flex-1 overflow-y-auto px-2 py-1">
            <ul className="flex flex-col gap-1">
              {principales.map((seccion) => (
                <ItemDeLaBarra
                  key={seccion.id}
                  seccion={seccion}
                  activa={seccionActiva?.id === seccion.id}
                  colapsada={colapsada}
                  alNavegar={() => cerrarCajonParaIrA(seccion.ruta)}
                />
              ))}
            </ul>
            <div aria-hidden="true" className="mx-3 my-3 h-px bg-borde" />
            <ul className="flex flex-col gap-1">
              {secundarias.map((seccion) => (
                <ItemDeLaBarra
                  key={seccion.id}
                  seccion={seccion}
                  activa={seccionActiva?.id === seccion.id}
                  colapsada={colapsada}
                  alNavegar={() => cerrarCajonParaIrA(seccion.ruta)}
                />
              ))}
            </ul>
          </nav>

          <div className="flex flex-col gap-2">
            {hayPrueba && (
              <button
                type="button"
                onClick={() => {
                  // Los planes se abren con el cajón ya cerrado: abierto, seguiría
                  // reteniendo el foco detrás del modal.
                  cerrarCajon()
                  abrirPrecios()
                }}
                title={colapsada ? `${textoDeLaPrueba}. Ver planes` : undefined}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-[20px] p-1.5 text-left text-navy inset-ring-1 inset-ring-borde anillo-foco transition-colors duration-150 ease-suave hover:bg-superficie",
                  colapsada ? "justify-center" : "pr-3"
                )}
              >
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-superficie squircle transition-colors duration-150 ease-suave group-hover:bg-tarjeta"
                >
                  <Sparkles className="size-4" strokeWidth={1.75} />
                </span>
                <span className={cn("min-w-0", colapsada && "sr-only")}>
                  <span className="block text-sm leading-tight font-medium">{textoDeLaPrueba}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-[13px] leading-tight text-texto-2">
                    Ver planes
                    <ArrowRight className="size-3.5" aria-hidden="true" strokeWidth={1.75} />
                  </span>
                </span>
              </button>
            )}

            {/* Quién está en sesión: sin sesión no se inventa nombre ni negocio. */}
            <div
              className={cn("flex items-center rounded-[24px] bg-superficie p-2", colapsada ? "flex-col gap-1.5" : "gap-2")}
            >
              {usuario ? (
                <AvatarUsuario nombre={usuario.nombre} imagenUrl={usuario.imagenUrl} tamaño="md" />
              ) : (
                <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-tarjeta text-texto-2">
                  <UserRound className="size-5" strokeWidth={1.75} />
                </span>
              )}
              {/* Un nombre o un negocio largo se corta con "…": el globo del cursor lo muestra entero. */}
              <div className={cn("min-w-0 flex-1 pl-1", colapsada && "sr-only")}>
                {usuario ? (
                  <>
                    <p title={usuario.nombre} className="truncate text-[15px] leading-tight font-semibold">
                      {usuario.nombre}
                    </p>
                    {usuario.negocio && (
                      <p title={usuario.negocio} className="mt-0.5 truncate text-[13px] leading-tight text-texto-2">
                        {usuario.negocio}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[13px] leading-tight text-texto-2">Sesión no disponible</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/iniciar-sesion" })}
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
                // 40 px a la vista para dejarle lugar al nombre; el ::after lleva el área táctil a 44.
                className={cn(BOTON_DE_ICONO, "relative size-10 rounded-[12px] after:absolute after:-inset-0.5 hover:bg-tarjeta")}
              >
                <LogOut className="size-[18px]" aria-hidden="true" strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}

interface PropsDeItemDeLaBarra {
  seccion: SeccionDelPanel
  activa: boolean
  colapsada: boolean
  alNavegar: () => void
}

/**
 * Un enlace de la barra: el ícono de la sección y su nombre. El de la página
 * en la que se está lleva la píldora del pastel suave de su módulo (gris si
 * no es un módulo), el texto más grueso y `aria-current`. Colapsada, el
 * nombre queda para el lector de pantalla y para el globo del cursor.
 */
function ItemDeLaBarra({ seccion, activa, colapsada, alNavegar }: PropsDeItemDeLaBarra) {
  const pildora = seccion.modulo ? FONDO_SUAVE[moduloPorId(seccion.modulo).color] : "bg-superficie"

  return (
    <li>
      <Link
        href={seccion.ruta}
        onNavigate={alNavegar}
        aria-current={activa ? "page" : undefined}
        title={colapsada ? seccion.nombre : undefined}
        className={cn(
          "group flex min-h-11 items-center gap-3 rounded-full p-1.5 text-[15px] leading-tight text-navy anillo-foco transition-colors duration-150 ease-suave",
          // Cada módulo enfoca con su pastel.
          seccion.modulo && HALO_DE_MODULO[seccion.modulo],
          activa ? cn(pildora, "font-semibold") : "font-medium hover:bg-superficie",
          colapsada ? "justify-center" : "pr-4"
        )}
      >
        <CuadroDeSeccion
          seccion={seccion}
          fondoSinModulo={cn("bg-superficie", activa ? "bg-tarjeta" : "group-hover:bg-tarjeta")}
        />
        <span className={cn("min-w-0 truncate", colapsada && "sr-only")}>{seccion.nombre}</span>
      </Link>
    </li>
  )
}
