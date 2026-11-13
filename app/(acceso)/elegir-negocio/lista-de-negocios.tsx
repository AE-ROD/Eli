"use client"

import { useState } from "react"
import { signOut, useSession } from "next-auth/react"
import { Building2, ChevronRight, LoaderCircle } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import type { OpcionDeContexto } from "@/lib/contextos"
import { cn } from "@/lib/utils"
import { AvisoDeError } from "../_componentes/aviso-de-error"
import { MarcoDeAcceso } from "../_componentes/marco-de-acceso"

interface PropsDeListaDeNegocios {
  opciones: readonly OpcionDeContexto[]
  /** El contexto con el que trabaja la sesión ahora, si ya eligió uno. */
  actual: string | null
  /** Quien no es dueño de ningún negocio puede crear el suyo. */
  puedeCrearSuNegocio: boolean
}

const NO_SE_PUDO = "No se pudo entrar a ese negocio. Recarga la página e intenta de nuevo."

/**
 * Una fila por contexto: el negocio, su rubro y el rol en palabras. Cada fila
 * es un botón: elegirla cambia la sesión (`update({ contexto })`, que el
 * servidor verifica contra la base) y lleva al panel. Si el servidor no la
 * acepta (la membresía ya no existe, o se pasó el límite de pedidos), la
 * sesión queda como estaba y se dice.
 */
export function ListaDeNegocios({ opciones, actual, puedeCrearSuNegocio }: PropsDeListaDeNegocios) {
  // `update` no hace nada mientras la sesión todavía se está leyendo: hasta
  // entonces las filas esperan.
  const { update, status } = useSession()
  const lista = status === "authenticated"
  const [eligiendo, setEligiendo] = useState<string | null>(null)
  const [error, setError] = useState("")

  const elegir = async (id: string) => {
    if (eligiendo || !lista) return
    setError("")
    setEligiendo(id)

    let elegido = false
    try {
      const sesion = await update({ contexto: id })
      elegido = sesion?.user?.contexto === id
    } catch {
      elegido = false
    }

    if (!elegido) {
      setError(NO_SE_PUDO)
      setEligiendo(null)
      return
    }

    // Navegación completa y no `router.push`: el enrutador del navegador
    // guarda que "/dashboard" redirigía acá (cuando la sesión no tenía
    // negocio elegido) y con `push` volvía a esta misma pantalla. Además el
    // panel se arma de cero, sin nada del contexto anterior en memoria.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- ver arriba
    window.location.assign("/dashboard")
  }

  return (
    <MarcoDeAcceso
      antetitulo="Tu cuenta"
      titulo="¿Con qué negocio vas a trabajar?"
      bajada="Tu cuenta está en más de un negocio, o con más de un rol. Elige uno; después puedes cambiarlo desde el panel."
      ocupado={eligiendo !== null || !lista}
    >
      <ul className="flex flex-col gap-2" aria-label="Tus negocios">
        {opciones.map((opcion) => {
          const esElActual = opcion.id === actual
          const cargando = eligiendo === opcion.id
          return (
            <li key={opcion.id}>
              <button
                type="button"
                onClick={() => elegir(opcion.id)}
                aria-disabled={eligiendo !== null || !lista || undefined}
                aria-current={esElActual || undefined}
                className={cn(
                  "group flex min-h-16 w-full items-center gap-3 rounded-campo border-[1.5px] bg-tarjeta py-3 pl-3 pr-4 text-left text-navy squircle anillo-foco transition-colors duration-150 ease-suave",
                  esElActual ? "border-navy" : "border-borde hover:border-texto-2",
                  eligiendo !== null && !cargando && "opacity-60"
                )}
              >
                <CuadroDeIcono icono={Building2} color="turquesa" activo={esElActual} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{opcion.negocio}</span>
                  <span className="mt-0.5 block text-sm text-texto-2">
                    {opcion.rubro} · {opcion.rol}
                    {esElActual && " · Ahora"}
                  </span>
                </span>
                {cargando ? (
                  <LoaderCircle aria-hidden="true" className="size-5 shrink-0 animate-spin motion-reduce:animate-none" />
                ) : (
                  <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-texto-2" strokeWidth={1.75} />
                )}
                {cargando && <span className="sr-only">Entrando…</span>}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-5">
        <AvisoDeError mensaje={error} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4">
        {puedeCrearSuNegocio ? (
          <Boton href="/completar-perfil" variante="enlace" tamano="sm">
            Crear mi propio negocio
          </Boton>
        ) : (
          <span />
        )}
        <Boton variante="enlace" tamano="sm" onClick={() => signOut({ callbackUrl: "/iniciar-sesion" })}>
          Cerrar sesión
        </Boton>
      </div>
    </MarcoDeAcceso>
  )
}
