import type { Metadata } from "next"
import { frasesDeLaGestion } from "../../_frases"
import { PieDeEli } from "../../_componentes/pie-de-eli"
import { leerRubroDelNegocio } from "../../_rubro"
import { GestionDeCita } from "./_componentes/gestion-de-cita"

/**
 * El enlace del correo de confirmación para cancelar o reagendar sin cuenta.
 * La cita la pide el navegador al endpoint, que es el que tiene los límites
 * por IP y por token y responde 404 a todo enlace que no sirve. La página
 * sólo lee el rubro del negocio por su `slug` (`leerRubroDelNegocio`), para
 * hablar con sus palabras: "Tu hora" en un salón, "Tu cita" si el rubro no se
 * conoce. No lee nada de la cita y no se indexa: la URL lleva el token.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string; token: string }> }): Promise<Metadata> {
  const { slug } = await params
  return {
    title: frasesDeLaGestion(await leerRubroDelNegocio(slug)).tuCita,
    robots: { index: false, follow: false },
  }
}

export default async function PaginaGestionDeCita({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params
  const rubro = await leerRubroDelNegocio(slug)
  return (
    <main className="min-h-dvh bg-crema halo-agenda">
      <div className="mx-auto w-full max-w-[52rem] px-2 pt-10 pb-6 sm:px-4 md:px-6 md:pt-16 md:pb-10">
        <GestionDeCita slug={slug} token={token} rubro={rubro} />
        <PieDeEli />
      </div>
    </main>
  )
}
