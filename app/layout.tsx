import type { Metadata } from 'next'
import { Instrument_Sans } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Providers } from '@/components/providers'
import { headers } from 'next/headers'
import './globals.css'

const font = Instrument_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const h = await headers()
  const locale = h.get('x-locale') ?? 'es'
  const htmlLang = locale === 'pt' ? 'pt-BR' : locale === 'en' ? 'en' : 'es'

  return (
    <html lang={htmlLang} className="bg-background">
      <body className={`${font.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
