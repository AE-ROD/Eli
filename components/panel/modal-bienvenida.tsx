"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, Clock, Copy, Link2, Scissors } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { marcarEnlaceCompartido } from "@/lib/lista-de-inicio"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "eli_onboarding_completado"

const PASOS = [
  {
    icono: Clock,
    titulo: "Configura tu horario",
    descripcion: "Define los días y horas en que atiendes. Así tus clientes solo podrán reservar en tu disponibilidad real.",
    accion: "Ir a configuración",
    ruta: "/dashboard/configuracion",
  },
  {
    icono: Scissors,
    titulo: "Agrega tus servicios",
    descripcion: "Crea el catálogo de servicios que ofreces con su duración y precio. Esto aparecerá en tu página de reservas.",
    accion: "Agregar servicios",
    ruta: "/dashboard/configuracion",
  },
  {
    icono: Link2,
    titulo: "Comparte tu enlace",
    descripcion: "Este es tu link único de reservas. Compártelo con tus clientes por WhatsApp, redes sociales o donde quieras.",
    accion: null,
    ruta: null,
  },
]

interface PropsDeModalBienvenida {
  nombreNegocio: string
  slug: string
  /** Si copiar el enlace cuenta para la lista de inicio (sólo el dueño la tiene). */
  marcarAlCopiar?: boolean
}

/**
 * Los tres primeros pasos, la primera vez que se entra al panel: horario,
 * servicios y el enlace de reservas. Es un diálogo (`MarcoDeModal`): se
 * anuncia con su título, el foco no sale y Escape lo cierra. Cerrarlo de
 * cualquier forma lo da por visto.
 *
 * Al cambiar de paso el foco se queda en el botón que se apretó, para seguir
 * con Enter; el paso nuevo se anuncia al lector de pantalla.
 */
export function ModalBienvenida({ nombreNegocio, slug, marcarAlCopiar = false }: PropsDeModalBienvenida) {
  const [visible, setVisible] = useState(false)
  const [paso, setPaso] = useState(0)
  const [cambioDePaso, setCambioDePaso] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const refBotonPrincipal = useRef<HTMLButtonElement>(null)
  const enfocarElBotonPrincipal = useRef(false)

  const enlace = typeof window !== "undefined" ? `${window.location.origin}/reservar/${slug}` : `/reservar/${slug}`

  useEffect(() => {
    const completado = localStorage.getItem(STORAGE_KEY)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only available client-side, can't read during SSR render
    if (!completado) setVisible(true)
  }, [])

  // "Atrás" no existe en el primer paso: si era lo que tenía el foco, el foco
  // pasa a "Siguiente" en vez de caer al <body>.
  useEffect(() => {
    if (!enfocarElBotonPrincipal.current) return
    enfocarElBotonPrincipal.current = false
    refBotonPrincipal.current?.focus()
  }, [paso])

  const cerrar = () => {
    localStorage.setItem(STORAGE_KEY, "1")
    setVisible(false)
  }

  const copiar = async () => {
    await navigator.clipboard.writeText(enlace)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
    // Sin esperarla: si falla, el enlace ya está copiado.
    if (marcarAlCopiar) void marcarEnlaceCompartido()
  }

  const irAlPaso = (nuevo: number) => {
    if (nuevo === 0) enfocarElBotonPrincipal.current = true
    setCambioDePaso(true)
    setPaso(nuevo)
  }

  const pasoActual = PASOS[paso]
  const esElUltimo = paso === PASOS.length - 1

  return (
    <AnimatePresence>
      {visible && (
        <MarcoDeModal
          titulo={`¡Bienvenido a Eli, ${nombreNegocio}!`}
          antetitulo={`Paso ${paso + 1} de ${PASOS.length}`}
          alCerrar={cerrar}
        >
          {/* El avance ya lo dice el antetítulo: las barras son para el ojo. */}
          <div aria-hidden="true" className="-mt-2 mb-7 flex gap-1.5">
            {PASOS.map((_, indice) => (
              <span
                key={indice}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors duration-300 ease-suave",
                  indice <= paso ? "bg-navy" : "bg-borde"
                )}
              />
            ))}
          </div>

          <p aria-live="polite" className="sr-only">
            {cambioDePaso ? `Paso ${paso + 1} de ${PASOS.length}: ${pasoActual.titulo}` : ""}
          </p>

          {/* La clave rearma el paso: entra con un fundido corto, sin desplazarse. */}
          <motion.div
            key={paso}
            initial={cambioDePaso ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: DURACION.sombra, ease: CURVA.fundido }}
          >
            <CuadroDeIcono icono={pasoActual.icono} color="azul" tamano="lg" />
            <h3 className="mt-4 text-lg leading-snug font-semibold">{pasoActual.titulo}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-pretty text-texto-2">{pasoActual.descripcion}</p>

            {esElUltimo && (
              <div className="mt-5">
                <div className="flex items-center gap-2 rounded-campo bg-superficie py-1.5 pr-1.5 pl-3.5 squircle">
                  <p className="min-w-0 flex-1 truncate font-mono text-sm" title={enlace}>
                    {enlace}
                  </p>
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    onClick={copiar}
                    icono={copiado ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  >
                    {copiado ? "Copiado" : "Copiar"}
                  </Boton>
                </div>
                <p role="status" className="sr-only">
                  {copiado ? "Enlace copiado" : ""}
                </p>
              </div>
            )}

            {pasoActual.ruta && pasoActual.accion && (
              <Boton href={pasoActual.ruta} onClick={cerrar} variante="enlace" tamano="sm" className="mt-2">
                {pasoActual.accion}
              </Boton>
            )}
          </motion.div>

          {/* En el teléfono, uno debajo del otro: el que avanza arriba y de ancho completo. */}
          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            {paso > 0 ? (
              <Boton variante="fantasma" onClick={() => irAlPaso(paso - 1)} className="w-full sm:w-auto">
                Atrás
              </Boton>
            ) : (
              <span aria-hidden="true" className="hidden sm:block" />
            )}
            {esElUltimo ? (
              <Boton ref={refBotonPrincipal} onClick={cerrar} icono={<Check aria-hidden="true" />} className="w-full sm:w-auto">
                ¡Entendido, empecemos!
              </Boton>
            ) : (
              <Boton ref={refBotonPrincipal} onClick={() => irAlPaso(paso + 1)} className="w-full sm:w-auto">
                Siguiente
              </Boton>
            )}
          </div>
        </MarcoDeModal>
      )}
    </AnimatePresence>
  )
}
