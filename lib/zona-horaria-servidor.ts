import { cache } from "react"
import { prisma } from "@/lib/prisma"
import { zonaDelNegocio } from "@/lib/zona-horaria"

/**
 * La zona horaria con la que se calcula para un negocio (`Business.timezone`),
 * leída una sola vez por render del servidor.
 *
 * Un layout de sección y su página la pedían los dos por su cuenta
 * (`/dashboard/clientes/[id]`: el layout de clientes y la ficha): la misma
 * consulta dos veces en el mismo pedido. `cache` de React comparte el resultado
 * entre todos los componentes de servidor del MISMO render; no guarda nada
 * entre pedidos, así que una zona recién cambiada se ve en el siguiente.
 *
 * Misma regla de siempre: si lo guardado no es una zona válida (o el negocio no
 * está), la de por defecto (`zonaDelNegocio`). Si la lectura falla, el error
 * llega a quien pregunta, y cada uno decide qué hacer: la ficha lo deja subir y
 * el layout cae a la zona por defecto con `.catch`.
 *
 * El `businessId` es el de la sesión (`actorDeSesion`), nunca uno del pedido.
 * Sólo para componentes de servidor: fuera de un render `cache` no memoiza y
 * cada llamada consulta, como la consulta suelta de antes.
 */
export const zonaHorariaDelNegocio = cache(async (businessId: string): Promise<string> => {
  const negocio = await prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true } })
  return zonaDelNegocio(negocio?.timezone)
})
