"use client"

import { useEffect, useEffectEvent, useId, useRef } from "react"
import Link from "next/link"
import { AnimatePresence, motion, useIsPresent } from "framer-motion"
import { ArrowRight, ChevronRight, X } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { BotonIcono } from "@/components/comunes/boton-icono"
import { HALO_DE_MODULO } from "@/components/comunes/colores-de-modulo"
import { IconoDeModulo } from "@/components/comunes/icono-de-modulo"
import { LogoEli } from "@/components/comunes/logo-eli"
import { OFICIOS, SECCION_DE_MODULO, SECCION_DE_OFICIOS } from "@/components/landing/menu-desplegable"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import { MODULOS } from "@/lib/modulos"
import { cn } from "@/lib/utils"

/** Lo que se puede enfocar con Tab dentro del menú. */
const ENFOCABLES = "a[href], button:not([disabled])"

const FILA =
  "flex items-center justify-between gap-3 rounded-boton px-3 text-base leading-[1.3] text-navy transition-colors duration-150 ease-suave hover:bg-tarjeta anillo-foco"

interface PropsDeMenuMovil {
  /** El id del diálogo, para el `aria-controls` del botón que lo abre. */
  id: string
  abierto: boolean
  /**
   * `devolverFoco` es falso cuando se cierra por un enlace: la página va al
   * destino y el foco no tiene que volver al botón del menú.
   */
  alCerrar: (devolverFoco: boolean) => void
}

/**
 * El menú del teléfono: un panel a pantalla completa que aparece con un
 * fundido. Es un diálogo modal: el foco entra al abrirse (al botón de
 * cerrar), Tab y Shift+Tab dan la vuelta sin salir, Escape lo cierra, y la
 * página de atrás no se desplaza mientras está abierto.
 */
export function MenuMovil({ id, abierto, alCerrar }: PropsDeMenuMovil) {
  return <AnimatePresence>{abierto && <PanelDelMenu key="menu" id={id} alCerrar={alCerrar} />}</AnimatePresence>
}

function PanelDelMenu({ id, alCerrar }: Omit<PropsDeMenuMovil, "abierto">) {
  const idProducto = useId()
  const idOficios = useId()
  const panel = useRef<HTMLDivElement>(null)
  const botonCerrar = useRef<HTMLButtonElement>(null)
  const presente = useIsPresent()
  const cerrarConEscape = useEffectEvent(() => alCerrar(true))
  const cerrarPorAncho = useEffectEvent(() => alCerrar(false))

  useEffect(() => {
    botonCerrar.current?.focus()
  }, [])

  // Escape y Tab se atienden en el documento y no sólo en el panel: así
  // funcionan aunque el foco haya caído afuera, y Tab lo trae de vuelta.
  // Mientras sale (el fundido de cierre) ya no atrapa nada.
  useEffect(() => {
    const nodo = panel.current
    if (!presente || !nodo) return

    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.preventDefault()
        cerrarConEscape()
        return
      }
      if (evento.key !== "Tab") return

      const enfocables = Array.from(nodo.querySelectorAll<HTMLElement>(ENFOCABLES)).filter(
        (elemento) => elemento.getClientRects().length > 0
      )
      if (enfocables.length === 0) return
      const primero = enfocables[0]
      const ultimo = enfocables[enfocables.length - 1]
      const actual = document.activeElement

      if (!nodo.contains(actual)) {
        evento.preventDefault()
        ;(evento.shiftKey ? ultimo : primero).focus()
      } else if (evento.shiftKey && actual === primero) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && actual === ultimo) {
        evento.preventDefault()
        primero.focus()
      }
    }

    document.addEventListener("keydown", alTeclear)
    return () => document.removeEventListener("keydown", alTeclear)
  }, [presente])

  // Con el panel encima, la rueda o el dedo no mueven la página de atrás.
  useEffect(() => {
    const raiz = document.documentElement
    const antes = raiz.style.overflow
    raiz.style.overflow = "hidden"
    return () => {
      raiz.style.overflow = antes
    }
  }, [])

  // Es el menú del teléfono: si la ventana se agranda hasta mostrar el de
  // escritorio, se cierra en vez de quedar tapando la página.
  useEffect(() => {
    const consulta = window.matchMedia("(min-width: 768px)")
    const alCambiar = () => {
      if (consulta.matches) cerrarPorAncho()
    }
    consulta.addEventListener("change", alCambiar)
    return () => consulta.removeEventListener("change", alCambiar)
  }, [])

  const irA = () => alCerrar(false)

  return (
    <motion.div
      ref={panel}
      id={id}
      role="dialog"
      aria-modal="true"
      aria-label="Menú"
      className="fixed inset-0 z-[100] flex flex-col bg-crema text-navy md:hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: DURACION.sombra, ease: CURVA.suave }}
    >
      <div className="flex h-[68px] shrink-0 items-center justify-between pl-4 pr-2">
        <Link
          href="/"
          onClick={irA}
          aria-label="Eli, ir al inicio"
          className="inline-flex min-h-11 items-center rounded-[12px] px-1.5 anillo-foco"
        >
          <LogoEli tamaño="md" />
        </Link>
        <BotonIcono ref={botonCerrar} etiqueta="Cerrar menú" icono={<X aria-hidden="true" />} onClick={() => alCerrar(true)} />
      </div>

      <nav aria-label="Menú principal" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-1">
        <h2 id={idProducto} className="antetitulo m-2">
          Producto
        </h2>
        <ul
          aria-labelledby={idProducto}
          className="flex flex-col gap-0.5 rounded-panel bg-tarjeta p-2 shadow-sm squircle"
        >
          {MODULOS.map((modulo) => (
            <li key={modulo.id}>
              <a
                href={SECCION_DE_MODULO[modulo.id]}
                onClick={irA}
                className={cn(
                  "flex min-h-14 items-center gap-3.5 rounded-[24px] p-2 text-navy transition-colors duration-150 ease-suave hover:bg-superficie anillo-foco squircle",
                  HALO_DE_MODULO[modulo.id]
                )}
              >
                <IconoDeModulo modulo={modulo.id} activo />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold leading-[1.3]">{modulo.nombre}</span>
                  <span className="line-clamp-2 text-[13px] leading-[1.35] text-texto-2">{modulo.descripcion}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>

        <h2 id={idOficios} className="antetitulo mx-2 mb-1.5 mt-5">
          Para quién
        </h2>
        <ul aria-labelledby={idOficios} className="flex flex-col gap-0.5">
          {OFICIOS.map((oficio) => (
            <li key={oficio.nombre}>
              <a href={SECCION_DE_OFICIOS} onClick={irA} className={cn(FILA, "min-h-11 font-medium")}>
                <span>{oficio.nombre}</span>
                <ChevronRight aria-hidden="true" strokeWidth={1.75} className="size-[18px] shrink-0 text-texto-2" />
              </a>
            </li>
          ))}
        </ul>

        <div aria-hidden="true" className="mx-2 my-3.5 h-px bg-borde" />

        <a href="#recorrido" onClick={irA} className={cn(FILA, "group min-h-12 font-semibold")}>
          <span>Cómo funciona</span>
          <ArrowRight
            aria-hidden="true"
            strokeWidth={1.75}
            className="size-[18px] shrink-0 transition-transform duration-150 ease-suave group-hover:translate-x-0.5"
          />
        </a>
      </nav>

      <div className="flex shrink-0 flex-col gap-2.5 border-t border-borde px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3.5">
        <Boton href="/iniciar-sesion" variante="secundario" tamano="lg" onClick={irA}>
          Iniciar sesión
        </Boton>
        <Boton href="/crear-cuenta" tamano="lg" onClick={irA}>
          Crear cuenta
        </Boton>
      </div>
    </motion.div>
  )
}
