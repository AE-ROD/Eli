import type { Metadata } from 'next'
import { Fraunces, Geist } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Proveedores } from '@/components/proveedores'
import './globals.css'

// Geist para la interfaz y el texto.
const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
})

// Fraunces para titulares de sección, citas y chips de palabra, siempre en 500.
// Va con su eje de tamaño óptico: a 48px toma el trazo fino de un titular en
// vez del de un texto chico agrandado. Ese eje sólo viene con el peso
// variable, por eso no lleva `weight`.
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  axes: ['opsz'],
})

export const metadata: Metadata = {
  title: 'Eli — Reservas para salones, barberías y spas de uñas',
  description: 'Agenda, clientes y equipo para salones de belleza, barberías y spas de uñas, en un solo lugar.',
  icons: {
    icon: '/images/logo-eli.png',
    apple: '/images/logo-eli.png',
  },
}

export default function LayoutRaiz({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // Las variables de las fuentes van en el <html> y no en el <body>: los
    // tokens de `app/globals.css` se declaran en :root y las leen desde ahí.
    <html lang="es" className={`${geist.variable} ${fraunces.variable} bg-crema`}>
      <body className="font-sans antialiased">
        <Proveedores>{children}</Proveedores>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
