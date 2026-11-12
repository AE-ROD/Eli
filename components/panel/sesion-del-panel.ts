import type { Session } from "next-auth"
import type { SessionContextValue } from "next-auth/react"

/** Lo que devuelve `useSession()`: el valor del contexto que arma `SessionProvider`. */
export type ValorDeSesion = SessionContextValue

/**
 * Qué ve `useSession()` dentro del panel.
 *
 * El `SessionProvider` de la raíz (`components/proveedores.tsx`) arranca sin
 * sesión: pide `/api/auth/session` y mientras tanto dice `loading`. El panel
 * ya tiene la sesión del servidor (la lee el layout), así que durante esa
 * primera lectura, y sólo durante ella, se muestra la del servidor como
 * autenticada: las pantallas conocen el rol sin esperar a esa respuesta y
 * piden sus datos de una vez.
 *
 * Todo lo demás es del proveedor de la raíz, sin tocar: cuando termina de
 * leer manda él (incluido "no hay sesión"), y lo mismo la relectura al volver
 * el foco, `update()` y, mientras `update()` está en curso, la sesión que ya
 * tenía (que no es la del servidor, ya vieja).
 *
 * Se siembra el valor del proveedor de la raíz y no se anida un segundo
 * `SessionProvider`: NextAuth guarda su estado de sincronización en un objeto
 * global del módulo, así que dos proveedores se pisan y la relectura al volver
 * el foco (de la que depende `BarraLateral` para saber si cambió el contexto)
 * le llegaría al de la raíz y no al del panel.
 *
 * Sin proveedor en la raíz, o sin sesión del servidor, no hay nada que
 * sembrar: se devuelve lo que haya.
 */
export function sesionDelPanel(
  delProveedor: ValorDeSesion | undefined,
  delServidor: Session | null | undefined
): ValorDeSesion | undefined {
  if (!delProveedor || !delServidor) return delProveedor

  // La primera lectura: cargando y sin ninguna sesión todavía. Durante un
  // `update()` también dice `loading`, pero con la sesión anterior a mano.
  const primeraLectura = delProveedor.status === "loading" && !delProveedor.data
  if (!primeraLectura) return delProveedor

  return { data: delServidor, status: "authenticated", update: delProveedor.update }
}
