"use client"

import { useContext, useMemo, useSyncExternalStore, type ReactNode } from "react"
import type { Session } from "next-auth"
import { SessionContext } from "next-auth/react"
import { sesionDelPanel } from "@/components/panel/sesion-del-panel"

/** Nada que escuchar: sólo sirve para distinguir el servidor (y la hidratación) del navegador ya hidratado. */
const sinSuscripcion = () => () => {}

/**
 * Le da al panel la sesión que ya leyó el servidor: `useSession()` de cada
 * pantalla deja de decir `loading` mientras el navegador pide
 * `/api/auth/session`, y los pedidos que dependen del rol salen en cuanto la
 * página se hidrata, en paralelo con los demás, en vez de esperar esa
 * respuesta. Qué se muestra y cuándo cede al proveedor de la raíz, en
 * `sesion-del-panel.ts`.
 *
 * Se siembra recién hidratada la página, no en el HTML del servidor: varias
 * piezas del panel nunca se dibujaron antes de que llegara la sesión y leen
 * el navegador al dibujarse (`EnlaceDeReservas` escribe `window.location.origin`),
 * así que con la sesión ya en el servidor el HTML y la hidratación no
 * coincidirían. Hasta hidratar, el panel se dibuja igual que siempre.
 *
 * Sólo en el panel: la raíz (landing, reserva pública, acceso) no lee la
 * sesión en el servidor. La sesión es la misma que ya viaja al navegador por
 * `/api/auth/session` (sin secretos) y sólo informa a la interfaz; los permisos
 * los sigue decidiendo el servidor.
 */
export function ProveedorDeSesionDelPanel({ session, children }: { session: Session | null; children: ReactNode }) {
  const delProveedor = useContext(SessionContext)
  const hidratado = useSyncExternalStore(
    sinSuscripcion,
    () => true,
    () => false
  )
  const valor = useMemo(
    () => sesionDelPanel(delProveedor, hidratado ? session : null),
    [delProveedor, hidratado, session]
  )

  // Sin el proveedor de la raíz no hay contexto que sembrar.
  if (!valor) return <>{children}</>

  // Siempre con proveedor, aunque ceda al de la raíz: quitarlo cambiaría la
  // forma del árbol y remontaría las pantallas.
  return <SessionContext.Provider value={valor}>{children}</SessionContext.Provider>
}
