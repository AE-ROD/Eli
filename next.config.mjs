/**
 * Cabeceras de seguridad para todas las rutas (páginas y API).
 *
 * La CSP es a propósito SÓLO `frame-ancestors 'none'` (que nadie embeba Eli en
 * un iframe: clickjacking; X-Frame-Options cubre a navegadores viejos). Una CSP
 * completa (script-src, style-src, connect-src...) queda PENDIENTE: Next.js
 * inyecta scripts inline para hidratar, hay estilos inline y scripts de
 * terceros (Vercel Analytics), así que exige nonces generados en el proxy y
 * probar cada pantalla. Puesta a ciegas rompería la app en producción.
 */
const cabecerasDeSeguridad = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // No anunciar `X-Powered-By: Next.js`: no le regalamos el stack a nadie.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: cabecerasDeSeguridad }]
  },
  // La sección de clientes antes vivía en /dashboard/pacientes. La redirección
  // permanente evita que los marcadores y enlaces guardados terminen en un 404.
  async redirects() {
    return [
      {
        source: "/dashboard/pacientes",
        destination: "/dashboard/clientes",
        permanent: true,
      },
    ]
  },
}

export default nextConfig
