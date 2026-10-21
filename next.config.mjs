/**
 * Cabeceras de seguridad para todas las rutas (páginas y API).
 *
 * La Content-Security-Policy NO va acá: lleva un nonce distinto por petición,
 * así que la arma `proxy.ts` con `lib/csp.ts`. Ponerla también acá mandaría dos
 * CSP y el navegador aplicaría las dos a la vez (la estática, sin nonce,
 * bloquearía los scripts de Next). X-Frame-Options sigue acá para navegadores
 * viejos y para lo que no pasa por el proxy (assets estáticos).
 */
const cabecerasDeSeguridad = [
  { key: "X-Frame-Options", value: "DENY" },
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
