"use client"

import { createContext, useContext, useMemo, useState, type ReactNode } from "react"
import { AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import { useBarraLateral } from "@/components/panel/contexto-barra-lateral"
import { ModalFotoDeLaCuenta } from "@/components/panel/modal-foto-de-la-cuenta"

interface ValorDeLaCuenta {
  /**
   * La foto de la CUENTA de quien está en sesión (una ruta del propio sitio),
   * o `null` si no tiene. La lee el layout del panel en el servidor; no viaja
   * en el token de la sesión.
   */
  fotoUrl: string | null
  /** Abre "Mi foto". `undefined` si no hay proveedor: entonces el avatar no es un botón. */
  abrirMiFoto: (() => void) | undefined
}

const SIN_PROVEEDOR: ValorDeLaCuenta = { fotoUrl: null, abrirMiFoto: undefined }

const ContextoDeLaCuenta = createContext<ValorDeLaCuenta>(SIN_PROVEEDOR)

/** La foto de la cuenta y cómo cambiarla, para los avatares del panel (la barra lateral y la fila del teléfono). */
export function useCuentaDelPanel(): ValorDeLaCuenta {
  return useContext(ContextoDeLaCuenta)
}

interface PropsDeProveedorDeLaCuenta {
  nombre: string
  /** Lo que leyó el servidor: ya comprobado como una foto de esta cuenta, o `null`. */
  fotoUrl: string | null
  children: ReactNode
}

/**
 * La foto de la cuenta para todo el panel, más el modal que la cambia. La foto
 * baja por props desde el layout (servidor): tras subirla o quitarla,
 * `router.refresh()` vuelve a leerla y los avatares se actualizan sin recargar
 * la página.
 *
 * Va DENTRO de `ProveedorDeBarraLateral`: en el teléfono el modal se abre desde
 * el cajón, que se cierra antes (un cajón abierto se queda con el foco). Cuando
 * el modal termina de salir, si el foco no tiene dónde volver (lo que lo abrió
 * ya está oculto), va al botón de menú en vez de perderse en la página.
 */
export function ProveedorDeLaCuenta({ nombre, fotoUrl, children }: PropsDeProveedorDeLaCuenta) {
  const router = useRouter()
  const { enfocarBotonMenu } = useBarraLateral()
  const [abierto, setAbierto] = useState(false)
  const valor = useMemo<ValorDeLaCuenta>(() => ({ fotoUrl, abrirMiFoto: () => setAbierto(true) }), [fotoUrl])

  return (
    <ContextoDeLaCuenta.Provider value={valor}>
      {children}
      <AnimatePresence
        onExitComplete={() => {
          const activo = document.activeElement
          if (!activo || activo === document.body) enfocarBotonMenu()
        }}
      >
        {abierto && (
          <ModalFotoDeLaCuenta
            nombre={nombre}
            fotoUrl={fotoUrl}
            alCerrar={() => setAbierto(false)}
            alCambiar={() => router.refresh()}
          />
        )}
      </AnimatePresence>
    </ContextoDeLaCuenta.Provider>
  )
}
