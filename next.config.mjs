/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
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
