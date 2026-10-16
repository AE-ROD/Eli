"use client"

import { useId, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { Bell, Menu, Plus, Search, UserRound, type LucideIcon } from "lucide-react"
import { Antetitulo } from "@/components/comunes/antetitulo"
import { Boton } from "@/components/comunes/boton"
import { BotonIcono } from "@/components/comunes/boton-icono"
import { LogoEli } from "@/components/comunes/logo-eli"
import { AvatarUsuario } from "@/components/panel/avatar-usuario"
import { ID_DEL_CAJON, useBarraLateral } from "@/components/panel/contexto-barra-lateral"
import { CAMPO } from "@/components/panel/estilos"
import { CuadroDeSeccion } from "@/components/panel/icono-de-seccion"
import { seccionDeLaRuta } from "@/components/panel/secciones-del-panel"
import { cn } from "@/lib/utils"

interface BarraSuperiorProps {
  titulo: string
  subtitulo?: string
  accionPrincipal?: {
    texto: string
    onClick: () => void
    /** Sin ícono propio va `Plus`. */
    icono?: LucideIcon
  }
  mostrarBusqueda?: boolean
}

/** Los botones de sólo ícono de la fila del teléfono: 44 × 44, lo mínimo para un dedo. */
const BOTON_DE_LA_FILA =
  "grid size-11 shrink-0 place-items-center rounded-boton text-navy squircle anillo-foco transition-colors duration-150 ease-suave"

/**
 * El encabezado de cada página del panel: el antetítulo con la sección (sale
 * de la ruta, con el color de su módulo o en neutro), el título en la serif de
 * los titulares y el subtítulo; a la derecha, la búsqueda y la acción
 * principal.
 *
 * Por debajo de `lg` la barra lateral es un cajón, y arriba va una fila fija
 * con el botón que lo abre. Fija y no con el resto del encabezado: el foco
 * vuelve a ese botón cuando el cajón se cierra, y si hubiera quedado arriba,
 * fuera de la vista, la página saltaba al principio.
 */
export function BarraSuperior({ titulo, subtitulo, accionPrincipal, mostrarBusqueda = true }: BarraSuperiorProps) {
  const seccion = seccionDeLaRuta(usePathname())
  const IconoDeLaAccion = accionPrincipal?.icono ?? Plus

  // La fila de la derecha no deja un hueco donde no tiene nada que mostrar:
  // la búsqueda aparece desde sm y la campana, desde lg (antes va en la fila del menú).
  const clasesDeLasAcciones = accionPrincipal ? "flex" : mostrarBusqueda ? "hidden sm:flex" : "hidden lg:flex"

  return (
    <>
      {/*
        Hermana del encabezado y no adentro: un `sticky` se pega sólo dentro de
        su padre, y el encabezado es corto. Así su padre es la página entera.
      */}
      <FilaDelTelefono />

      <header className="px-4 pt-5 sm:px-6 lg:pt-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-x-6">
          <div className="min-w-0">
            {seccion && (
              <Antetitulo className="flex items-center gap-2">
                <CuadroDeSeccion seccion={seccion} tamano="xs" fondoSinModulo="bg-borde" />
                {seccion.nombre}
              </Antetitulo>
            )}
            <h1 className={cn("titulo-seccion text-balance break-words text-navy", seccion && "mt-2.5")}>{titulo}</h1>
            {subtitulo && <p className="mt-2 text-pretty text-texto-2">{subtitulo}</p>}
          </div>

          <div className={cn(clasesDeLasAcciones, "items-center gap-3")}>
            {mostrarBusqueda && <Busqueda />}
            <BotonIcono etiqueta="Notificaciones" icono={<Bell aria-hidden="true" strokeWidth={1.75} />} className="hidden lg:inline-flex" />
            {accionPrincipal && (
              // En el teléfono ocupa el ancho: se lee entera y es fácil de tocar.
              <Boton
                onClick={accionPrincipal.onClick}
                icono={<IconoDeLaAccion aria-hidden="true" />}
                className="w-full sm:w-auto"
              >
                {accionPrincipal.texto}
              </Boton>
            )}
          </div>
        </div>
      </header>
    </>
  )
}

/** La fila fija de arriba en el teléfono y la tableta: el menú, el logo, las notificaciones y quién está en sesión. */
function FilaDelTelefono() {
  const { cajonAbierto, abrirCajon, refBotonMenu } = useBarraLateral()
  const { data: sesion } = useSession()
  const nombreUsuario = sesion?.user?.name

  return (
    <div className="sticky top-0 z-30 px-2 pt-2 lg:hidden">
      <div className="flex items-center justify-between gap-2 rounded-[24px] bg-tarjeta p-2 shadow-sm squircle">
        <div className="flex min-w-0 items-center gap-1">
          {/* Con el cajón abierto la superposición lo tapa: este botón sólo abre. */}
          <button
            ref={refBotonMenu}
            type="button"
            className={cn(BOTON_DE_LA_FILA, "bg-superficie hover:bg-borde")}
            onClick={abrirCajon}
            aria-label="Menú"
            aria-controls={ID_DEL_CAJON}
            aria-expanded={cajonAbierto}
          >
            <Menu className="size-5" aria-hidden="true" strokeWidth={1.75} />
          </button>
          <Link
            href="/dashboard"
            aria-label="Eli, ir al inicio"
            // 44 × 44 como mínimo: el logo chico solo medía 39 de ancho.
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[12px] px-2 anillo-foco"
          >
            <LogoEli tamaño="sm" />
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" aria-label="Notificaciones" className={cn(BOTON_DE_LA_FILA, "hover:bg-superficie")}>
            <Bell className="size-5" aria-hidden="true" strokeWidth={1.75} />
          </button>
          {/* Sin sesión no se inventa un nombre: va la silueta. */}
          {nombreUsuario ? (
            <AvatarUsuario nombre={nombreUsuario} tamaño="md" />
          ) : (
            <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-superficie text-texto-2">
              <UserRound className="size-5" strokeWidth={1.75} />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * La búsqueda: un botón con forma de campo que, al tocarlo, se vuelve el
 * campo. Desde sm; en el teléfono no entra junto a la acción principal.
 */
function Busqueda() {
  const [activa, setActiva] = useState(false)
  const idDelCampo = useId()

  if (!activa) {
    return (
      <button
        type="button"
        onClick={() => setActiva(true)}
        className={cn(CAMPO, "hidden h-12 w-auto items-center gap-2 px-4 text-texto-2 sm:inline-flex")}
      >
        <Search className="size-4 shrink-0" aria-hidden="true" strokeWidth={1.75} />
        <span>Buscar</span>
      </button>
    )
  }

  return (
    <div className="relative hidden w-56 sm:block lg:w-72">
      <label htmlFor={idDelCampo} className="sr-only">
        Buscar
      </label>
      <Search
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-texto-2"
        aria-hidden="true"
        strokeWidth={1.75}
      />
      <input
        id={idDelCampo}
        type="search"
        placeholder="Buscar"
        autoFocus
        onBlur={() => setActiva(false)}
        className={cn(CAMPO, "h-12 pl-10")}
      />
    </div>
  )
}
