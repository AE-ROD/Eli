import type { Metadata } from "next"
import { PieDeEli } from "../../_componentes/pie-de-eli"
import { leerRubroDelNegocio } from "../../_rubro"
import { SalirDeLaLista } from "./_componentes/salir-de-la-lista"

/**
 * El enlace "Salir de la lista de espera" del aviso por correo (#74). No sale
 * al abrirse: pide confirmar con un botón (un POST), porque los antivirus y
 * las vistas previas abren los enlaces solos. La baja en un clic del propio
 * cliente de correo (encabezado `List-Unsubscribe`) va directo al endpoint.
 * La página sólo lee el rubro del negocio por su `slug`, para decir "una hora"
 * o "una cita" con la palabra de su rubro; no lee nada de la inscripción y no
 * se indexa: la URL lleva el token.
 */
export const metadata: Metadata = {
  title: "Lista de espera",
  robots: { index: false, follow: false },
}

export default async function PaginaSalirDeLaLista({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params
  const rubro = await leerRubroDelNegocio(slug)
  return (
    <main className="min-h-dvh bg-crema halo-agenda">
      <div className="mx-auto w-full max-w-[52rem] px-2 pt-10 pb-6 sm:px-4 md:px-6 md:pt-16 md:pb-10">
        <SalirDeLaLista slug={slug} token={token} rubro={rubro} />
        <PieDeEli />
      </div>
    </main>
  )
}
