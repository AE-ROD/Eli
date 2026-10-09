"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  /**
   * Para los enlaces de la barra: cierra el cajón al elegir una página. Si es
   * otra página, el foco no vuelve al botón de menú de la que se deja: espera
   * a que cambie la ruta y va al de la página nueva (ver el efecto de
   * `ProveedorDeBarraLateral`).
   */
  cerrarCajonParaIrA: (ruta: string) => void
  /** La barra de escritorio muestra sólo los íconos: 80 px en vez de 260. En el teléfono es siempre `false`. */
  colapsada: boolean
  alternarColapso: () => void
  /** Para el botón de menú de la barra superior, que vive en cada vista y no en el layout. */
  refBotonMenu: RefObject<HTMLButtonElement | null>
  /**
   * Lleva el foco al botón de menú, el que esté montado al llamarla. Si el
   * cajón se cerró porque cambió la ruta (el "atrás" del teléfono), es el de
   * la página nueva. Si se cerró al elegir otra página en el cajón, no hace
   * nada: el foco va a la página nueva cuando llegue (`cerrarCajonParaIrA`).
   */
  enfocarBotonMenu: () => void
}

const ContextoBarraLateral = createContext<ValorDeLaBarraLateral>({
  cajonAbierto: false,
  abrirCajon: () => {},
  cerrarCajon: () => {},
  cerrarCajonParaIrA: () => {},
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

  /**
   * Se eligió otra página en el cajón y el foco la espera. El enlace cierra el
   * cajón antes de navegar: si el foco volviera en ese momento al botón de
   * menú, sería el de la página que se deja, que se desmonta con ella y lo
   * tiraba al <body>. Un ref y no un estado: no cambia nada de lo que se dibuja.
   */
  const focoParaLaPaginaNueva = useRef(false)

  const abrirCajon = useCallback(() => {
    // Lo pendiente de una navegación que no llegó (un enlace abierto en otra
    // pestaña) no se arrastra a la próxima vez que se cierre.
    focoParaLaPaginaNueva.current = false
    setCajonAbierto(true)
  }, [])
  const cerrarCajon = useCallback(() => setCajonAbierto(false), [])
  const cerrarCajonParaIrA = useCallback(
    (destino: string) => {
      // En escritorio no hay cajón: la barra queda y el foco, en el enlace. Ir
      // a la misma página no navega: el foco vuelve al botón, como al cerrar.
      if (cajonAbierto && destino !== ruta) focoParaLaPaginaNueva.current = true
      setCajonAbierto(false)
    },
    [cajonAbierto, ruta]
  )
  const alternarColapso = useCallback(() => setColapsadaEnEscritorio((previa) => !previa), [])
  const enfocarBotonMenu = useCallback(() => {
    if (focoParaLaPaginaNueva.current) return
    refBotonMenu.current?.focus()
  }, [])

  // Llegó la página elegida en el cajón: el foco, a su botón de menú. En un
  // efecto, que corre con la página nueva ya montada (el ref apunta a su
  // botón) y después de que Next acomoda el scroll de la navegación.
  useEffect(() => {
    if (!focoParaLaPaginaNueva.current) return
    focoParaLaPaginaNueva.current = false
    refBotonMenu.current?.focus()
  }, [ruta])

  return (
    <ContextoBarraLateral.Provider
      value={{
        cajonAbierto,
        abrirCajon,
        cerrarCajon,
        cerrarCajonParaIrA,
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
