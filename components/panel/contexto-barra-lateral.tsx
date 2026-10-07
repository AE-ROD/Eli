"use client"

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react"
import { usePathname } from "next/navigation"

/** El `id` del cajón. El botón de menú lo nombra en `aria-controls` para decir qué abre. */
export const ID_DEL_CAJON = "menu-del-panel"

/**
 * El `lg` de Tailwind, escrito igual que Tailwind (64rem) para que el cambio
 * caiga en el mismo píxel que las clases `lg:`. Desde ahí la barra está fija a
 * la izquierda; por debajo es un cajón que se abre encima del contenido.
 */
const CONSULTA_DE_ESCRITORIO = "(min-width: 64rem)"

function suscribirseAlAncho(avisar: () => void) {
  const consulta = window.matchMedia(CONSULTA_DE_ESCRITORIO)
  consulta.addEventListener("change", avisar)
  return () => consulta.removeEventListener("change", avisar)
}

function esAnchoDeEscritorio() {
  return window.matchMedia(CONSULTA_DE_ESCRITORIO).matches
}

/**
 * En el servidor no hay ventana. Responder "teléfono" no cambia lo que se
 * dibuja: el cajón arranca cerrado, la barra sin colapsar, y el CSS ya ubica
 * cada cosa según el ancho antes de que llegue el JS.
 */
function anchoEnElServidor() {
  return false
}

interface ValorDeLaBarraLateral {
  /** El cajón del teléfono está abierto. En escritorio es siempre `false`: ahí la barra no se abre ni se cierra. */
  cajonAbierto: boolean
  abrirCajon: () => void
  cerrarCajon: () => void
  /** La barra de escritorio muestra sólo los íconos: 80 px en vez de 260. En el teléfono es siempre `false`. */
  colapsada: boolean
  alternarColapso: () => void
  /** Para el botón de menú de la barra superior, que vive en cada vista y no en el layout. */
  refBotonMenu: RefObject<HTMLButtonElement | null>
  /**
   * Lleva el foco al botón de menú, el que esté montado al llamarla: si el
   * cajón se cerró porque se navegó, es el de la página nueva.
   */
  enfocarBotonMenu: () => void
}

const ContextoBarraLateral = createContext<ValorDeLaBarraLateral>({
  cajonAbierto: false,
  abrirCajon: () => {},
  cerrarCajon: () => {},
  colapsada: false,
  alternarColapso: () => {},
  refBotonMenu: { current: null },
  enfocarBotonMenu: () => {},
})

export function useBarraLateral() {
  return useContext(ContextoBarraLateral)
}

/**
 * El estado de la barra lateral, que comparten tres piezas que no se ven entre
 * sí: el botón de menú (en la barra superior de cada vista), la barra misma y
 * el contenido, que se corre según el ancho que ella ocupa.
 */
export function ProveedorDeBarraLateral({ children }: { children: ReactNode }) {
  const esEscritorio = useSyncExternalStore(suscribirseAlAncho, esAnchoDeEscritorio, anchoEnElServidor)
  const ruta = usePathname()
  const [cajonAbierto, setCajonAbierto] = useState(false)
  const [colapsadaEnEscritorio, setColapsadaEnEscritorio] = useState(false)
  const [rutaVista, setRutaVista] = useState(ruta)
  const refBotonMenu = useRef<HTMLButtonElement>(null)

  // Navegar a otra página cierra el cajón: el menú ya cumplió. Se mira la ruta
  // y no sólo el clic en un enlace para cubrir también el "atrás" del teléfono.
  // Pasar a escritorio también lo cierra: ahí no hay cajón, y abierto dejaría
  // el contenido inerte y el foco atrapado en la barra. Se ajusta durante el
  // render, como indica React para el estado que depende de otro valor, y no
  // en un efecto que dibujaría un cuadro con el cajón todavía abierto.
  if (ruta !== rutaVista) {
    setRutaVista(ruta)
    setCajonAbierto(false)
  }
  if (cajonAbierto && esEscritorio) setCajonAbierto(false)

  const abrirCajon = useCallback(() => setCajonAbierto(true), [])
  const cerrarCajon = useCallback(() => setCajonAbierto(false), [])
  const alternarColapso = useCallback(() => setColapsadaEnEscritorio((previa) => !previa), [])
  const enfocarBotonMenu = useCallback(() => refBotonMenu.current?.focus(), [])

  return (
    <ContextoBarraLateral.Provider
      value={{
        cajonAbierto,
        abrirCajon,
        cerrarCajon,
        // Colapsar es cosa del escritorio. En el teléfono el cajón se ve entero
        // aunque se haya colapsado antes en una ventana más ancha: ahí no hay
        // botón para expandirlo.
        colapsada: colapsadaEnEscritorio && esEscritorio,
        alternarColapso,
        refBotonMenu,
        enfocarBotonMenu,
      }}
    >
      {children}
    </ContextoBarraLateral.Provider>
  )
}
