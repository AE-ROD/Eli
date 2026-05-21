import type { Metadata } from 'next'
import { Fraunces, Plus_Jakarta_Sans } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Providers } from '@/components/providers'
import './globals.css'

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: '--font-plus-jakarta-sans',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: '--font-fraunces',
  display: 'swap',
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  title: 'Eli - Asistente Inteligente de Reservas',
  description: 'Simplifica la gestión de tu negocio de bienestar y salud. Centraliza reservas, clientes, equipo y comunicación en una sola plataforma.',
  generator: 'v0.app',
  icons: {
    icon: '/images/eli-logo.png',
    apple: '/images/eli-logo.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className="bg-background">
      <body className={`${plusJakarta.variable} ${fraunces.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
