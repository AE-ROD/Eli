import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions, contextosDeLaCuenta } from "@/lib/auth"
import { opcionDeContexto } from "@/lib/contextos"
import { ListaDeNegocios } from "./lista-de-negocios"

export const metadata: Metadata = {
  title: "Elige con qué negocio trabajar — Eli",
}

/**
 * Con qué negocio y con qué rol trabaja esta sesión (PRODUCTO.md, sección 5).
 * Llega quien tiene más de un contexto: al iniciar sesión (el proxy la manda
 * acá mientras no elija), desde el panel para cambiar, o después de aceptar
 * una invitación.
 *
 * La lista sale de la base, no de la sesión: al navegador sólo van el id de
 * cada contexto y lo que se lee en pantalla (negocio, rubro, rol). Elegir
 * manda sólo el id, y `lib/auth.ts` lo vuelve a buscar entre los de la cuenta.
 */
export default async function PaginaElegirNegocio() {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) redirect("/iniciar-sesion")

  const contextos = await contextosDeLaCuenta(userId)
  if (contextos.length === 0) redirect("/completar-perfil")

  return (
    <ListaDeNegocios
      opciones={contextos.map(opcionDeContexto)}
      actual={session?.user?.contexto ?? null}
      puedeCrearSuNegocio={!contextos.some((contexto) => contexto.rol === "owner")}
    />
  )
}
