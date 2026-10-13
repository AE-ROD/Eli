"use client"

import { SessionProvider } from "next-auth/react"
import { MotionConfig } from "framer-motion"

/**
 * Lo que envuelve a toda la app: la sesión de NextAuth y la configuración de
 * framer-motion. Con `reducedMotion="user"`, si la persona pidió reducir el
 * movimiento en su sistema, framer-motion no anima desplazamientos ni
 * escalas y deja sólo los fundidos. Lo que anima CSS lo apaga la regla de
 * `prefers-reduced-motion` de `app/globals.css`.
 */
export function Proveedores({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </SessionProvider>
  )
}
