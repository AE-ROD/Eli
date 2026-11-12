"use client"

import { SessionProvider } from "next-auth/react"
import { MotionConfig } from "framer-motion"
import { usePathname } from "next/navigation"
import { intervaloDeRelectura } from "@/lib/renovacion-de-sesion"

/**
 * Lo que envuelve a toda la app: la sesión de NextAuth y la configuración de
 * framer-motion. Con `reducedMotion="user"`, si la persona pidió reducir el
 * movimiento en su sistema, framer-motion no anima desplazamientos ni
 * escalas y deja sólo los fundidos. Lo que anima CSS lo apaga la regla de
 * `prefers-reduced-motion` de `app/globals.css`.
 *
 * Dentro del panel la sesión se relee cada poco más de cinco minutos
 * (`lib/renovacion-de-sesion.ts`): es lo único que renueva la cookie, y sin
 * eso cada petición del servidor repite la revalidación contra la base.
 */
export function Proveedores({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <SessionProvider refetchInterval={intervaloDeRelectura(pathname)}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </SessionProvider>
  )
}
