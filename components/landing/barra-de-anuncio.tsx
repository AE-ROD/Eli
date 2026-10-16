"use client"

import { useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { BotonIcono } from "@/components/comunes/boton-icono"
import { Insignia } from "@/components/comunes/insignia"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"

/** Lo primero que se puede enfocar después de `nodo`, en el orden del documento. */
function siguienteEnfocable(nodo: HTMLElement): HTMLElement | null {
  for (const candidato of document.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")) {
    const vieneDespues = nodo.compareDocumentPosition(candidato) & Node.DOCUMENT_POSITION_FOLLOWING
    if (vieneDespues && !nodo.contains(candidato) && candidato.getClientRects().length > 0) return candidato
  }
  return null
}

/**
 * El aviso navy de arriba de todo, con una novedad y un enlace. Se cierra con
 * la X y no vuelve mientras dure la visita. No se recuerda entre visitas: el
 * servidor no sabría si pintarlo, y aparecer o desaparecer después de cargar
 * correría toda la página.
 */
export function BarraDeAnuncio() {
  const [abierta, setAbierta] = useState(true)
  const barra = useRef<HTMLDivElement>(null)

  const cerrar = () => {
    // El botón que tenía el foco desaparece con la barra: el foco pasa a lo que
    // sigue (el logo del encabezado) en vez de caer al <body>.
    const siguiente = barra.current ? siguienteEnfocable(barra.current) : null
    setAbierta(false)
    siguiente?.focus({ preventScroll: true })
  }

  return (
    <AnimatePresence initial={false}>
      {abierta && (
        <motion.div
          ref={barra}
          role="region"
          aria-label="Aviso"
          // Sobre navy, el contorno del foco del enlace y de la X pasa a blanco.
          className="relative z-[60] bg-navy text-white anillo-foco-claro"
          exit={{ opacity: 0 }}
          transition={{ duration: DURACION.hover, ease: CURVA.suave }}
        >
          <div className="contenedor flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-1 pl-4 pr-16 text-sm leading-[1.4] md:justify-center md:px-16 md:text-center">
            <Insignia>Nuevo</Insignia>
            <p>El tablero del día, de la reserva al cobro.</p>
            <Boton href="#tablero" variante="enlace" tamano="sm" className="text-white hover:text-azul-suave">
              Conocer el tablero
            </Boton>
          </div>
          <BotonIcono
            etiqueta="Cerrar aviso"
            icono={<X aria-hidden="true" />}
            onClick={cerrar}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent text-white shadow-none hover:bg-white/12 hover:text-white"
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
