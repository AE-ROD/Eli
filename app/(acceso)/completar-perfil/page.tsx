import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { negociosDeLosQueSalio } from "@/lib/salidas-del-equipo"
import { FormularioDeNegocio } from "./formulario-de-negocio"

export const metadata: Metadata = {
  title: "Crea tu negocio — Eli",
}

/**
 * Crear el negocio propio. Llega quien recién se registró con Google, y
 * también quien se quedó sin ningún negocio porque la sacaron del equipo en
 * el que trabajaba: a ella hay que decirle primero qué pasó
 * (`lib/salidas-del-equipo.ts`), o cree que Eli la obliga a crear un negocio.
 *
 * Quién puede entrar acá lo decide el proxy, como siempre. Esto sólo lee, con
 * el id de la cuenta de la sesión, los nombres para el aviso.
 */
export default async function PaginaCompletarPerfil() {
  const session = await getServerSession(authOptions)
  const salidas = await negociosDeLosQueSalio(session?.user?.id, new Date())

  return <FormularioDeNegocio salidas={salidas} />
}
