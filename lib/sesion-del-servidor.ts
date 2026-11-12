import { cache } from "react"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

/**
 * La sesión del pedido, leída una sola vez por render del servidor.
 *
 * Un render del panel pasa por el layout de `/dashboard`, a veces por un layout
 * de la sección y por la página, y cada uno pedía `getServerSession(authOptions)`
 * por su cuenta. Cada llamada decodifica el JWT de la cookie y, si el token
 * está vencido (`lib/renovacion-de-sesion.ts`), vuelve a contrastar la cuenta
 * con la base. `cache` de React comparte el resultado entre todos los
 * componentes de servidor del MISMO render: una lectura por pedido, no una por
 * componente.
 *
 * Alcance:
 * - Es sólo para componentes de servidor (layouts y páginas). Un route handler
 *   (`app/api/**`) es un pedido y una lectura: ahí se sigue llamando a
 *   `getServerSession(authOptions)` directo.
 * - La memoria vive lo que dura el render: dos pedidos nunca comparten sesión,
 *   así que un cambio de rol o una baja del equipo llega igual que antes.
 * - Fuera de un render de servidor (un test, un script) `cache` no memoiza y
 *   cada llamada lee de nuevo, igual que `getServerSession`.
 * - No cambia lo que se lee ni a quién: el aislamiento por `businessId` y los
 *   permisos siguen saliendo de `actorDeSesion(session)` (`lib/permisos.ts`).
 */
export const sesionDelServidor = cache(() => getServerSession(authOptions))
