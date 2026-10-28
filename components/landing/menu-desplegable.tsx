"use client"

import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode, type Ref } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { ChevronDown, Hand, Scissors, Sparkles, type LucideIcon } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { HALO_DE_MODULO } from "@/components/comunes/colores-de-modulo"
import { CuadroDeIcono, IconoDeModulo } from "@/components/comunes/icono-de-modulo"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import { MODULOS, type ColorDeModulo, type ModuloId } from "@/lib/modulos"
import { cn } from "@/lib/utils"

/**
 * Adónde lleva cada módulo desde la landing. `Modulo.ruta` es su pantalla en
 * el panel, que pide sesión: acá se va a la parte de la página que lo
 * muestra. Agenda y clientes son pasos del recorrido, tablero y reportes
 * tienen su sección, y el equipo está entre lo que trae Eli.
 */
export const SECCION_DE_MODULO: Record<ModuloId, string> = {
  agenda: "#recorrido",
  tablero: "#tablero",
  clientes: "#recorrido",
  reportes: "#reportes",
  equipo: "#funciones",
}

export interface Oficio {
  nombre: string
  descripcion: string
  icono: LucideIcon
  color: ColorDeModulo
}

/** Los tres oficios que atiende Eli. En la landing todos llevan a la sección de oficios. */
export const OFICIOS: readonly Oficio[] = [
  { nombre: "Salones de belleza", descripcion: "Varios profesionales en una misma visita.", icono: Sparkles, color: "lila" },
  { nombre: "Barberías", descripcion: "Con reserva o sin ella, en la misma fila.", icono: Scissors, color: "azul" },
  { nombre: "Spas de uñas", descripcion: "Servicios, horarios y pago dividido.", icono: Hand, color: "naranja" },
]

export const SECCION_DE_OFICIOS = "#oficios"

type IdDeMenu = "producto" | "oficios"

interface Medida {
  ancho: number
  alto: number
}

interface EstadoDelMenu {
  abierto: IdDeMenu | null
  /** El último que se abrió: cerrado, el panel guarda su medida para no crecer desde cero al volver. */
  ultimo: IdDeMenu
  /**
   * Abierto con clic o con teclado. El cursor que pasa abre el menú, y el clic
   * que suele venir enseguida lo fija en vez de cerrarlo; el segundo clic cierra.
   */
  fijado: boolean
  /** Se pasó de un menú abierto al otro: sólo entonces el panel anima su medida y su lugar. */
  entreMenus: boolean
  /** El borde izquierdo del botón del menú abierto, que es donde arranca el panel. */
  x: number
}

const SIN_MEDIDA: Medida = { ancho: 0, alto: 0 }

/** Lo que espera el menú antes de cerrarse cuando sale el cursor: alcanza para cruzar al panel. */
const RETARDO_DE_CIERRE = 150

const PILDORA =
  "inline-flex h-11 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-medium text-navy transition-colors duration-150 ease-suave hover:bg-superficie anillo-foco"

/**
 * Un grupo del menú. Va dentro de su `<li>`, justo después de su botón: Tab
 * entra al grupo abierto sin pasar por los otros botones, y el cursor que baja
 * del botón al panel no sale del `<li>` (el `pt-3` cubre el hueco).
 */
const GRUPO = "absolute left-0 top-full z-10 pt-3 ease-suave"
// Al abrir sólo se funde la opacidad: la visibilidad cambia en el acto, para
// que el foco pueda entrar enseguida (flecha abajo). Al cerrar, la
// visibilidad espera a que termine el fundido.
const GRUPO_ABIERTO = "visible opacity-100 transition-opacity duration-200"
const GRUPO_CERRADO = "invisible opacity-0 transition-[opacity,visibility] duration-150"

const ITEM =
  "flex items-start gap-3 rounded-boton-lg px-3 py-[11px] text-navy transition-colors duration-150 ease-suave hover:bg-superficie anillo-foco"

interface PropsDeMenuDesplegable {
  /** El encabezado se fue de la pantalla: un menú abierto se cierra con él. */
  oculto: boolean
  className?: string
}

/**
 * La navegación de escritorio del encabezado: "Producto" y "Para quién" con
 * su menú, y "Cómo funciona".
 *
 * Los dos menús comparten UN panel blanco que no se cierra al pasar de uno al
 * otro: se corre al botón nuevo y anima su ancho y su alto hasta la medida
 * del grupo que muestra, mientras los contenidos se cruzan. El panel es sólo
 * fondo (`aria-hidden`); los enlaces viven en cada grupo.
 *
 * Se abre al pasar el cursor y se cierra 150ms después de que se va. También
 * con clic, Enter o Espacio sobre el botón; flecha abajo lo abre y entra al
 * primer enlace; Escape lo cierra y devuelve el foco al botón; y se cierra
 * cuando el foco sale de su grupo o cuando se toca fuera de la navegación.
 */
export function MenuDesplegable({ oculto, className }: PropsDeMenuDesplegable) {
  const base = useId()
  const reducido = useReducedMotion()
  const nav = useRef<HTMLElement>(null)
  const itemProducto = useRef<HTMLLIElement>(null)
  const itemOficios = useRef<HTMLLIElement>(null)
  const botonProducto = useRef<HTMLButtonElement>(null)
  const botonOficios = useRef<HTMLButtonElement>(null)
  const contenidoProducto = useRef<HTMLDivElement>(null)
  const contenidoOficios = useRef<HTMLDivElement>(null)
  const temporizador = useRef<number | undefined>(undefined)

  const [estado, setEstado] = useState<EstadoDelMenu>({
    abierto: null,
    ultimo: "producto",
    fijado: false,
    entreMenus: false,
    x: 0,
  })
  const [medidas, setMedidas] = useState<Record<IdDeMenu, Medida>>({ producto: SIN_MEDIDA, oficios: SIN_MEDIDA })

  // Si el encabezado se oculta con un menú abierto, el menú se cierra: cuando
  // el encabezado vuelva, tiene que volver cerrado.
  const [ocultoAntes, setOcultoAntes] = useState(oculto)
  if (oculto !== ocultoAntes) {
    setOcultoAntes(oculto)
    if (oculto && estado.abierto !== null) setEstado({ ...estado, abierto: null, fijado: false })
  }

  // La medida de cada grupo, para que el panel crezca hasta ella. Los grupos
  // cerrados siguen ocupando lugar (están invisibles, no fuera del árbol), así
  // que se miden aunque no se vean.
  useEffect(() => {
    const producto = contenidoProducto.current
    const oficios = contenidoOficios.current
    if (!producto || !oficios) return
    const observador = new ResizeObserver(() => {
      setMedidas({
        producto: { ancho: producto.offsetWidth, alto: producto.offsetHeight },
        oficios: { ancho: oficios.offsetWidth, alto: oficios.offsetHeight },
      })
    })
    observador.observe(producto)
    observador.observe(oficios)
    return () => observador.disconnect()
  }, [])

  // Un toque fuera de la navegación cierra el menú. En pantallas táctiles no
  // hay cursor que salga: sin esto, un menú abierto con el dedo quedaría abierto.
  useEffect(() => {
    if (estado.abierto === null) return
    const alTocarAfuera = (evento: PointerEvent) => {
      if (evento.target instanceof Node && nav.current?.contains(evento.target)) return
      window.clearTimeout(temporizador.current)
      setEstado((previo) => ({ ...previo, abierto: null, fijado: false }))
    }
    document.addEventListener("pointerdown", alTocarAfuera)
    return () => document.removeEventListener("pointerdown", alTocarAfuera)
  }, [estado.abierto])

  useEffect(() => {
    const reloj = temporizador
    return () => window.clearTimeout(reloj.current)
  }, [])

  const cancelarCierre = () => window.clearTimeout(temporizador.current)

  const cerrar = () => {
    cancelarCierre()
    setEstado((previo) => (previo.abierto === null ? previo : { ...previo, abierto: null, fijado: false }))
  }

  const cerrarConRetardo = () => {
    cancelarCierre()
    temporizador.current = window.setTimeout(cerrar, RETARDO_DE_CIERRE)
  }

  const abrir = (menu: IdDeMenu, fijado: boolean) => {
    cancelarCierre()
    const izquierdaDelItem = (menu === "producto" ? itemProducto : itemOficios).current?.offsetLeft ?? 0
    setEstado((previo) => ({
      abierto: menu,
      ultimo: menu,
      fijado,
      entreMenus: previo.abierto !== null && previo.abierto !== menu,
      x: izquierdaDelItem,
    }))
  }

  const entrar = (menu: IdDeMenu) => {
    if (estado.abierto === menu) cancelarCierre()
    else abrir(menu, false)
  }

  const alternar = (menu: IdDeMenu) => {
    if (estado.abierto === menu && estado.fijado) cerrar()
    else abrir(menu, true)
  }

  const alTeclear = (menu: IdDeMenu, evento: KeyboardEvent<HTMLLIElement>) => {
    const boton = (menu === "producto" ? botonProducto : botonOficios).current
    if (evento.key === "Escape" && estado.abierto === menu) {
      cerrar()
      boton?.focus()
    } else if (evento.key === "ArrowDown" && evento.target === boton) {
      evento.preventDefault()
      abrir(menu, true)
      // El grupo deja de ser `inert` cuando React lo pinta: el foco entra en el cuadro siguiente.
      const contenido = (menu === "producto" ? contenidoProducto : contenidoOficios).current
      window.requestAnimationFrame(() => contenido?.querySelector<HTMLElement>("a[href]")?.focus())
    }
  }

  // Un menú abierto se cierra en cuanto el foco sale de su grupo (su botón y
  // sus enlaces): al pasar con Tab a "Para quién" o a "Cómo funciona", o fuera
  // de la navegación. Si el abierto ya es otro, no se toca.
  const alSalirElFoco = (menu: IdDeMenu, evento: FocusEvent<HTMLLIElement>) => {
    const destino = evento.relatedTarget
    if (destino instanceof Node && evento.currentTarget.contains(destino)) return
    setEstado((previo) => (previo.abierto === menu ? { ...previo, abierto: null, fijado: false } : previo))
  }

  const abierto = estado.abierto
  const medida = medidas[abierto ?? estado.ultimo]
  // Ancho y alto no son desplazamientos: `MotionConfig` no los frena con
  // movimiento reducido, así que se frenan acá.
  const desplazamiento = {
    duration: estado.entreMenus && !reducido ? DURACION.pildora : 0,
    ease: CURVA.suave,
  }
  const idDelBoton = (menu: IdDeMenu) => `${base}-${menu}-boton`
  const idDelGrupo = (menu: IdDeMenu) => `${base}-${menu}`

  return (
    <nav ref={nav} aria-label="Principal" className={cn("relative h-12", className)}>
      <ul className="flex h-full items-center gap-1">
        <li
          ref={itemProducto}
          className="relative flex h-full items-center"
          onMouseEnter={() => entrar("producto")}
          onMouseLeave={cerrarConRetardo}
          onKeyDown={(evento) => alTeclear("producto", evento)}
          onBlur={(evento) => alSalirElFoco("producto", evento)}
        >
          <BotonDeMenu
            ref={botonProducto}
            id={idDelBoton("producto")}
            controla={idDelGrupo("producto")}
            abierto={abierto === "producto"}
            alPulsar={() => alternar("producto")}
          >
            Producto
          </BotonDeMenu>
          <div
            id={idDelGrupo("producto")}
            inert={abierto !== "producto"}
            className={cn(GRUPO, abierto === "producto" ? GRUPO_ABIERTO : GRUPO_CERRADO)}
          >
            <div ref={contenidoProducto} className="w-[400px] p-3 lg:w-[680px]">
              <ul className="grid gap-1 lg:grid-cols-2">
                {MODULOS.map((modulo) => (
                  <li key={modulo.id}>
                    <a href={SECCION_DE_MODULO[modulo.id]} onClick={cerrar} className={cn(ITEM, HALO_DE_MODULO[modulo.id])}>
                      <IconoDeModulo modulo={modulo.id} />
                      <TextoDeItem titulo={modulo.nombre} descripcion={modulo.descripcion} />
                    </a>
                  </li>
                ))}
              </ul>
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-borde px-3 pt-1">
                <p className="hidden text-sm text-texto-2 lg:block">Todo en un mismo lugar, de la primera reserva al cierre.</p>
                <Boton href="#funciones" variante="enlace" tamano="sm" onClick={cerrar}>
                  Lo que trae Eli
                </Boton>
              </div>
            </div>
          </div>
        </li>

        <li
          ref={itemOficios}
          className="relative flex h-full items-center"
          onMouseEnter={() => entrar("oficios")}
          onMouseLeave={cerrarConRetardo}
          onKeyDown={(evento) => alTeclear("oficios", evento)}
          onBlur={(evento) => alSalirElFoco("oficios", evento)}
        >
          <BotonDeMenu
            ref={botonOficios}
            id={idDelBoton("oficios")}
            controla={idDelGrupo("oficios")}
            abierto={abierto === "oficios"}
            alPulsar={() => alternar("oficios")}
          >
            Para quién
          </BotonDeMenu>
          <div
            id={idDelGrupo("oficios")}
            inert={abierto !== "oficios"}
            className={cn(GRUPO, abierto === "oficios" ? GRUPO_ABIERTO : GRUPO_CERRADO)}
          >
            <div ref={contenidoOficios} className="w-[360px] p-3">
              <ul className="grid gap-1">
                {OFICIOS.map((oficio) => (
                  <li key={oficio.nombre}>
                    <a href={SECCION_DE_OFICIOS} onClick={cerrar} className={ITEM}>
                      <CuadroDeIcono icono={oficio.icono} color={oficio.color} />
                      <TextoDeItem titulo={oficio.nombre} descripcion={oficio.descripcion} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </li>

        <li className="flex h-full items-center">
          <a href="#recorrido" onMouseEnter={cerrar} className={PILDORA}>
            Cómo funciona
          </a>
        </li>
      </ul>

      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-full mt-3 rounded-panel bg-tarjeta shadow-md ring-1 ring-borde squircle"
        initial={false}
        animate={{
          x: estado.x,
          width: medida.ancho,
          height: medida.alto,
          opacity: abierto ? 1 : 0,
          y: abierto ? 0 : -6,
        }}
        transition={{
          x: desplazamiento,
          width: desplazamiento,
          height: desplazamiento,
          opacity: { duration: DURACION.sombra, ease: CURVA.suave },
          y: { duration: DURACION.pildora, ease: CURVA.suave },
        }}
      />
    </nav>
  )
}

interface PropsDeBotonDeMenu {
  ref: Ref<HTMLButtonElement>
  id: string
  /** El id del grupo que abre. */
  controla: string
  abierto: boolean
  alPulsar: () => void
  children: ReactNode
}

/** El botón de un menú: píldora gris mientras está abierto, con la flecha dada vuelta. */
function BotonDeMenu({ ref, id, controla, abierto, alPulsar, children }: PropsDeBotonDeMenu) {
  return (
    <button
      ref={ref}
      id={id}
      type="button"
      aria-expanded={abierto}
      aria-controls={controla}
      onClick={alPulsar}
      className={cn(PILDORA, abierto && "bg-superficie")}
    >
      {children}
      <ChevronDown
        aria-hidden="true"
        strokeWidth={1.75}
        className={cn("size-4 transition-transform duration-300 ease-suave", abierto && "rotate-180")}
      />
    </button>
  )
}

function TextoDeItem({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <span className="min-w-0">
      <span className="block text-[15px] font-medium leading-[1.3]">{titulo}</span>
      <span className="mt-0.5 block text-[13px] leading-[1.35] text-texto-2">{descripcion}</span>
    </span>
  )
}
