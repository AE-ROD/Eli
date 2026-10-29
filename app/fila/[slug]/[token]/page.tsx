import type { Metadata } from "next"
import { MarcoDeFila } from "../_componentes/marco-de-fila"
import { MiTurno } from "./_componentes/mi-turno"

/**
 * `/fila/[slug]/[token]`: el turno de una persona en la fila virtual (#85),
 * en su celular. La página no lee la base: el turno lo trae el navegador del
 * endpoint (con sus límites) y lo actualiza solo. No se indexa: la URL lleva
 * el token.
 */
export const metadata: Metadata = {
  title: "Mi turno",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default async function PaginaDeMiTurno({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params
  return (
    <MarcoDeFila>
      <MiTurno slug={slug} token={token} />
    </MarcoDeFila>
  )
}
