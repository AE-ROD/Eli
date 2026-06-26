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
  title: 'Eli — Sistema de Reservas para Negocios de Servicios',
  description:
    'Eli automatiza tus reservas, elimina el doble-booking y envía recordatorios por WhatsApp y email. Ideal para barberías, salones y consultorios en LATAM. 3 días gratis.',
  keywords: ['reservas online', 'agenda digital', 'barbería', 'salón de belleza', 'LATAM', 'WhatsApp'],
  authors: [{ name: 'Eli' }],
  icons: {
    icon: '/images/eli-logo-icon.png',
    apple: '/images/eli-logo-icon.png',
  },
  openGraph: {
    type: 'website',
    locale: 'es_MX',
    url: 'https://useeli.com',
    siteName: 'Eli',
    title: 'Eli — Simplifica tu agenda, enfócate en tu talento',
    description:
      'Sistema de reservas automático para barberías, salones y negocios de servicios en LATAM. Sin doble-bookings, con WhatsApp y email incluidos.',
    images: [
      {
        url: 'https://useeli.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Eli — Dashboard de reservas',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Eli — Sistema de Reservas para Negocios de Servicios',
    description:
      'Automatiza tus reservas, elimina el caos del WhatsApp y crece con datos reales. Pruébalo gratis 3 días.',
    images: ['https://useeli.com/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
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
