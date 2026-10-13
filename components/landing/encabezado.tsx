"use client"

import { useRef, useState, type FocusEvent } from "react"
import Link from "next/link"
import { Menu } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { BotonIcono } from "@/components/comunes/boton-icono"
import { LogoEli } from "@/components/comunes/logo-eli"
import { MenuDesplegable } from "@/components/landing/menu-desplegable"
import { MenuMovil } from "@/components/landing/menu-movil"
import { useDireccionDeScroll } from "@/components/movimiento/usar-direccion-de-scroll"
import type { EstadoDelEncabezado } from "@/lib/direccion-de-scroll"
import { cn } from "@/lib/utils"

const ID_DEL_MENU_MOVIL = "menu-movil"

/**
 * El encabezado de la landing, en tres estados según el scroll
 * (`useDireccionDeScroll`):
 *
 * - `arriba`: en su lugar, transparente y a todo el ancho;
 * - `oculto`: la página baja y el encabezado se va hacia arriba;
 * - `flotante`: la página sube y vuelve como tarjeta blanca fija, a 24px del
 *   borde, con un desplazamiento y un fundido de 200ms.
 *
 * Ocupa siempre su alto en la página aunque se vuelva fijo: lo de abajo no se
 * corre cuando cambia de estado.
 */
export function Encabezado() {
  const direccion = useDireccionDeScroll()
  const [conFoco, setConFoco] = useState(false)
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false)
  const botonDelMenu = useRef<HTMLButtonElement>(null)

  // Lo que tiene el foco del teclado no puede quedar fuera de la vista: si el
  // foco entra al encabezado oculto, el encabezado vuelve como tarjeta. Sólo
  // el del teclado: un botón que quedó enfocado por un clic no tiene que
  // impedir que el encabezado se vaya al bajar.
  const estado: EstadoDelEncabezado = direccion === "oculto" && conFoco ? "flotante" : direccion

  // Al bajar desde arriba de todo el encabezado pasa de su lugar a fijo y
  // oculto de golpe: con transición se vería aparecer la tarjeta un instante
  // para irse enseguida. Las demás idas y vueltas sí se animan.
  const [estadoAnterior, setEstadoAnterior] = useState(estado)
  const [sinTransicion, setSinTransicion] = useState(false)
  if (estado !== estadoAnterior) {
    setEstadoAnterior(estado)
    setSinTransicion(estadoAnterior === "arriba")
  }

  const alRecibirElFoco = (evento: FocusEvent<HTMLElement>) => {
    if (evento.target instanceof Element && evento.target.matches(":focus-visible")) setConFoco(true)
  }

  const alSalirElFoco = (evento: FocusEvent<HTMLElement>) => {
    const destino = evento.relatedTarget
    if (destino instanceof Node && evento.currentTarget.contains(destino)) return
    setConFoco(false)
  }

  const cerrarMenuMovil = (devolverFoco: boolean) => {
    setMenuMovilAbierto(false)
    if (devolverFoco) botonDelMenu.current?.focus({ preventScroll: true })
  }

  const arriba = estado === "arriba"

  return (
    <>
      <div className="relative z-50 h-[68px] md:h-20">
        <header
          onFocus={alRecibirElFoco}
          onBlur={alSalirElFoco}
          className={cn(
            arriba
              ? "absolute inset-x-0 top-0 h-full"
              : "fixed inset-x-2 top-2 h-[60px] md:inset-x-10 md:top-6 md:h-[72px]",
            estado === "oculto" && "pointer-events-none -translate-y-[140%] opacity-0",
            !arriba &&
              !sinTransicion &&
              "transition-[translate,opacity] duration-200 ease-suave motion-reduce:transition-opacity"
          )}
        >
          <div
            aria-hidden="true"
            className={cn(
              "absolute inset-0 rounded-[24px] bg-tarjeta shadow-md ring-1 ring-borde/70 squircle",
              arriba && "opacity-0"
            )}
          />
          <div
            className={cn(
              "contenedor relative flex h-full items-center gap-5 lg:gap-8",
              arriba ? "pl-4 pr-2 md:px-10" : "pl-3 pr-1.5 md:pl-6 md:pr-3"
            )}
          >
            <Link
              href="/"
              aria-label="Eli, ir al inicio"
              className="inline-flex min-h-11 shrink-0 items-center rounded-[12px] px-1.5 anillo-foco"
            >
              <LogoEli tamaño="md" />
            </Link>

            <MenuDesplegable oculto={estado === "oculto"} className="hidden md:flex" />

            <div className="ml-auto flex items-center gap-2">
              <Boton href="/iniciar-sesion" variante="fantasma" className="hidden lg:inline-flex">
                Iniciar sesión
              </Boton>
              <Boton href="/crear-cuenta" className="hidden md:inline-flex">
                Crear cuenta
              </Boton>
              <BotonIcono
                ref={botonDelMenu}
                etiqueta="Abrir menú"
                icono={<Menu aria-hidden="true" />}
                aria-expanded={menuMovilAbierto}
                aria-controls={menuMovilAbierto ? ID_DEL_MENU_MOVIL : undefined}
                onClick={() => setMenuMovilAbierto(true)}
                className="md:hidden"
              />
            </div>
          </div>
        </header>
      </div>

      {/* Fuera del <header>: el encabezado oculto lleva un desplazamiento, y
          un `fixed` dentro de algo desplazado ya no se mide desde la pantalla. */}
      <MenuMovil id={ID_DEL_MENU_MOVIL} abierto={menuMovilAbierto} alCerrar={cerrarMenuMovil} />
    </>
  )
}
