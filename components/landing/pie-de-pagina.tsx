"use client"

import Link from "next/link"
import { Antetitulo } from "@/components/comunes/antetitulo"
import { LogoEli } from "@/components/comunes/logo-eli"
import { OFICIOS, SECCION_DE_MODULO, SECCION_DE_OFICIOS } from "@/components/landing/menu-desplegable"
import { Revelar } from "@/components/movimiento/revelar"
import { MODULOS } from "@/lib/modulos"

interface Enlace {
  texto: string
  href: string
}

const ENLACES_DE_PRODUCTO: Enlace[] = MODULOS.map((modulo) => ({ texto: modulo.nombre, href: SECCION_DE_MODULO[modulo.id] }))
const ENLACES_DE_OFICIOS: Enlace[] = OFICIOS.map((oficio) => ({ texto: oficio.nombre, href: SECCION_DE_OFICIOS }))
const ENLACES_DE_CUENTA: Enlace[] = [
  { texto: "Iniciar sesión", href: "/iniciar-sesion" },
  { texto: "Crear cuenta", href: "/crear-cuenta" },
]

/**
 * El pie de la landing: una isla navy con los mismos destinos que el
 * encabezado. `anillo-foco-claro` pasa a blanco el contorno del foco de todo
 * lo de adentro: el navy de `anillo-foco` no se vería contra el fondo.
 */
export function PieDePagina() {
  return (
    <footer className="isla my-2 bg-navy text-white anillo-foco-claro md:my-6">
      <Revelar className="contenedor px-6 pb-8 pt-14 md:px-12 md:pb-10 md:pt-16 xl:px-18 xl:pt-18">
        <div className="grid gap-8 md:grid-cols-2 md:gap-12 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <div>
            <Link
              href="/"
              aria-label="Eli, ir al inicio"
              className="inline-flex min-h-11 items-center rounded-[12px] px-1.5 anillo-foco"
            >
              <LogoEli tamaño="lg" invertido />
            </Link>
            <p className="mt-4 max-w-80 text-[15px] leading-[1.5] text-white/75">
              Reservas y gestión para salones de belleza, barberías y spas de uñas.
            </p>
          </div>
          <ColumnaDelPie titulo="Producto" enlaces={ENLACES_DE_PRODUCTO} />
          <ColumnaDelPie titulo="Para quién" enlaces={ENLACES_DE_OFICIOS} />
          <ColumnaDelPie titulo="Cuenta" enlaces={ENLACES_DE_CUENTA} />
        </div>

        <div className="mt-12 flex flex-wrap justify-between gap-x-4 gap-y-2 border-t border-white/15 pt-6 text-sm text-white/65 md:mt-14">
          <span>© {new Date().getFullYear()} Eli</span>
          <span>Deja de complicarte. Pásate a Eli.</span>
        </div>
      </Revelar>
    </footer>
  )
}

const ENLACE_DEL_PIE =
  "inline-flex min-h-11 items-center rounded-[8px] text-[15px] text-white/80 underline-offset-[3px] transition-colors duration-150 ease-suave hover:text-white hover:underline anillo-foco"

function ColumnaDelPie({ titulo, enlaces }: { titulo: string; enlaces: Enlace[] }) {
  return (
    <nav aria-label={titulo}>
      <Antetitulo className="text-white/70">{titulo}</Antetitulo>
      <ul className="mt-3">
        {enlaces.map((enlace) => (
          <li key={enlace.texto}>
            {/* A una sección de esta página, un `<a>` común: con el `#` ya en
                la dirección, `Link` no hace nada y el navegador sí vuelve a ella. */}
            {enlace.href.startsWith("#") ? (
              <a href={enlace.href} className={ENLACE_DEL_PIE}>
                {enlace.texto}
              </a>
            ) : (
              <Link href={enlace.href} className={ENLACE_DEL_PIE}>
                {enlace.texto}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
