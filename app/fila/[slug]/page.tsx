import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { estaAbiertoAhora, negocioDeLaFila, personasEsperando } from "@/lib/fila-virtual-servidor"
import { AnotarseEnLaFila } from "./_componentes/anotarse-en-la-fila"
import { MarcoDeFila } from "./_componentes/marco-de-fila"

export const metadata: Metadata = {
  title: "Fila virtual",
  robots: { index: false, follow: false },
}

/** Siempre al momento: si el local está abierto y cuántos esperan cambia a cada rato. */
export const dynamic = "force-dynamic"

/**
 * `/fila/[slug]`: anotarse en la fila virtual del negocio (#85), desde el
 * celular. Con la fila apagada o un negocio que no existe, el mismo 404 que
 * da el endpoint. Fuera del horario de atención se ve, pero no deja anotarse.
 */
export default async function PaginaDeLaFila({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const negocio = await negocioDeLaFila(slug)
  if (!negocio?.filaVirtualActiva) notFound()

  const ahora = new Date()
  const abierto = estaAbiertoAhora(negocio, ahora)
  const esperando = abierto ? await personasEsperando(negocio.id, negocio.timezone, ahora) : 0

  return (
    <MarcoDeFila>
      <AnotarseEnLaFila
        slug={negocio.slug}
        nombreNegocio={negocio.name}
        abierto={abierto}
        esperando={esperando}
        llena={esperando >= negocio.filaVirtualTope}
      />
    </MarcoDeFila>
  )
}
