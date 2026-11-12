import type { Metadata } from "next"
import { leerRubroDelNegocio } from "@/app/reservar/[slug]/_rubro"
import { MarcoDeFila } from "../_componentes/marco-de-fila"
import { MiTurno } from "./_componentes/mi-turno"

/**
 * `/fila/[slug]/[token]`: el turno de una persona en la fila virtual (#85),
 * en su celular. El turno lo trae el navegador del endpoint (con sus límites)
 * y lo actualiza solo; la página sólo lee el rubro del negocio por su `slug`
 * (`leerRubroDelNegocio`), para nombrar el lugar con su palabra ("el salón").
 * No se indexa: la URL lleva el token.
 */
export const metadata: Metadata = {
  title: "Mi turno",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default async function PaginaDeMiTurno({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params
  const rubro = await leerRubroDelNegocio(slug)
  return (
    <MarcoDeFila>
      <MiTurno slug={slug} token={token} rubro={rubro} />
    </MarcoDeFila>
  )
}
