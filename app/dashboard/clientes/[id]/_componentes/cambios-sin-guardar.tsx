"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import { destinoInterno, listaDePendientes } from "../_salir-sin-guardar"

/** Anota (con una descripción) o borra (con `null`) lo que una parte de la ficha tiene sin guardar. */
type Anotar = (clave: string, descripcion: string | null) => void

const CambiosSinGuardar = createContext<Anotar | null>(null)

/**
 * Lo que la ficha tiene sin guardar (el odontograma, los antecedentes, una
 * prótesis a medio diseñar), en un solo lugar. Mientras haya algo:
 *
 * - el navegador pregunta antes de cerrar o recargar la pestaña;
 * - un clic en un enlace del panel que lleva a otra página (la barra
 *   lateral, "Pacientes", la agenda) no navega: se pregunta antes, y sólo
 *   "Salir sin guardar" sigue al enlace. Los enlaces se atienden en el
 *   documento, en la captura, antes de que `Link` navegue.
 *
 * Abrir en otra pestaña (Ctrl o Cmd), un enlace a otro sitio o a esta misma
 * página no se frenan: no pierden nada. El botón Atrás del navegador no pasa
 * por acá.
 */
export function ProveedorDeCambiosSinGuardar({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [pendientes, setPendientes] = useState<Record<string, string>>({})
  const [destino, setDestino] = useState<string | null>(null)
  const hayPendientes = Object.keys(pendientes).length > 0

  const anotar = useCallback<Anotar>((clave, descripcion) => {
    setPendientes((previos) => {
      if (descripcion === null) {
        if (!(clave in previos)) return previos
        const siguientes = { ...previos }
        delete siguientes[clave]
        return siguientes
      }
      return previos[clave] === descripcion ? previos : { ...previos, [clave]: descripcion }
    })
  }, [])

  useEffect(() => {
    if (!hayPendientes) return
    const alCerrarLaPestana = (evento: BeforeUnloadEvent) => evento.preventDefault()
    const alTocarUnEnlace = (evento: MouseEvent) => {
      const ruta = destinoInterno(evento, window.location)
      if (ruta === null) return
      evento.preventDefault()
      evento.stopPropagation()
      setDestino(ruta)
    }
    window.addEventListener("beforeunload", alCerrarLaPestana)
    document.addEventListener("click", alTocarUnEnlace, true)
    return () => {
      window.removeEventListener("beforeunload", alCerrarLaPestana)
      document.removeEventListener("click", alTocarUnEnlace, true)
    }
  }, [hayPendientes])

  const salir = () => {
    const ruta = destino
    setDestino(null)
    if (ruta) router.push(ruta)
  }

  return (
    <CambiosSinGuardar.Provider value={anotar}>
      {children}
      <AnimatePresence>
        {destino && (
          <ModalConfirmar
            titulo="¿Salir sin guardar?"
            descripcion={`Tienes cambios sin guardar en ${listaDePendientes(Object.values(pendientes))}. Si sales de la ficha, se pierden.`}
            textoConfirmar="Salir sin guardar"
            textoCancelar="Seguir editando"
            peligro
            onConfirmar={salir}
            onCerrar={() => setDestino(null)}
          />
        )}
      </AnimatePresence>
    </CambiosSinGuardar.Provider>
  )
}

/**
 * Avisa a la ficha si esta parte tiene cambios sin guardar. `descripcion` va
 * en la pregunta: "el odontograma", "los antecedentes". Al desmontarse, deja
 * de contar. Fuera del proveedor no hace nada.
 */
export function useCambiosSinGuardar(clave: string, descripcion: string, hayCambios: boolean) {
  const anotar = useContext(CambiosSinGuardar)
  useEffect(() => {
    anotar?.(clave, hayCambios ? descripcion : null)
  }, [anotar, clave, descripcion, hayCambios])
  useEffect(() => () => anotar?.(clave, null), [anotar, clave])
}
