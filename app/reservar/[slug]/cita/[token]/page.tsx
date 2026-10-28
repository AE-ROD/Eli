import type { Metadata } from "next"
import { PieDeEli } from "../../_componentes/pie-de-eli"
import { GestionDeCita } from "./_componentes/gestion-de-cita"

/**
 * El enlace del correo de confirmación para cancelar o reagendar sin cuenta.
 * La página no lee la base: la cita la pide el navegador al endpoint, que es
 * el que tiene los límites por IP y por token y responde 404 a todo enlace
 * que no sirve. No se indexa: la URL lleva el token.
 */
export const metadata: Metadata = {
  title: "Tu cita",
  robots: { index: false, follow: false },
}

export default async function PaginaGestionDeCita({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params
  return (
    <main className="min-h-dvh bg-crema halo-agenda">
      <div className="mx-auto w-full max-w-[52rem] px-2 pt-10 pb-6 sm:px-4 md:px-6 md:pt-16 md:pb-10">
        <GestionDeCita slug={slug} token={token} />
        <PieDeEli />
      </div>
    </main>
  )
}
