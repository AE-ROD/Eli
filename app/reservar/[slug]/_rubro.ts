import { cache } from "react"
import { prisma } from "@/lib/prisma"

/**
 * (servidor) El rubro de un negocio público (`Business.type`), leído por
 * `slug`: lo único que necesitan para hablar con las palabras del rubro las
 * páginas que no leen nada más del negocio (el enlace para cancelar o cambiar
 * la reserva, la salida de la lista de espera y el turno de la fila virtual).
 *
 * Es el mismo dato que ya publica la página del negocio y no lleva nada de
 * ninguna persona ni de otro negocio. Un `slug` que no existe da `null`, y con
 * `null` la pantalla habla como siempre: el endpoint que atiende el enlace es
 * el que decide si sirve o no.
 *
 * Con `cache`: la página y sus metadatos lo piden en la misma petición y se
 * lee una sola vez.
 */
export const leerRubroDelNegocio = cache(async (slug: string): Promise<string | null> => {
  const negocio = await prisma.business.findUnique({ where: { slug }, select: { type: true } })
  return negocio?.type ?? null
})
