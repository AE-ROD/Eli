"use client"

import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
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
  { texto: "Ayuda y soporte", href: "/soporte" },
]

const SISTEMA_ONE = "https://sistemaone.com"

/**
 * El pie de la landing: un bloque navy con los brillos de la paleta, los
 * mismos destinos que el encabezado, la palabra "Eli" gigante en el degradado
 * de la marca y el bloque de Sistema One, que es quien hace Eli.
 *
 * `anillo-foco-claro` pasa a blanco el contorno del foco de todo lo de
 * adentro: el navy de `anillo-foco` no se vería contra el fondo. Sobre navy,
 * el texto secundario va en blanco al 75% o más (5,9:1 o más).
 */
export function PieDePagina() {
  const año = new Date().getFullYear()
  return (
    <footer className="fondo-brillos-navy mx-2 my-2 overflow-hidden rounded-tarjeta text-white anillo-foco-claro squircle md:mx-6 md:my-6 xl:mx-18 min-[1440px]:mx-auto min-[1440px]:max-w-[1296px]">
      <Revelar className="px-6 pb-8 pt-12 md:px-12 md:pb-12 md:pt-[52px] xl:px-14">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:gap-x-8 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] lg:gap-x-10">
          <p className="col-span-2 max-w-[300px] text-[19px] font-medium leading-[1.45] tracking-[-0.01em] lg:col-span-1">
            Reservas y gestión para salones de belleza, barberías, spas de uñas y odontología.
          </p>
          <ColumnaDelPie titulo="Producto" enlaces={ENLACES_DE_PRODUCTO} />
          <ColumnaDelPie titulo="Para quién" enlaces={ENLACES_DE_OFICIOS} />
          <ColumnaDelPie titulo="Cuenta" enlaces={ENLACES_DE_CUENTA} />
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-white/18 pt-5 text-white/80 md:flex-row md:items-center md:justify-between md:gap-6">
          {/*
            El año se calcula en el servidor y otra vez al hidratar: en Nochevieja
            pueden no coincidir (otra zona, o la medianoche entre medio). Es sólo
            el año del pie: se acepta el del servidor sin avisar.
          */}
          <p suppressHydrationWarning className="text-[12.5px] font-medium uppercase tracking-[0.14em]">
            © {año} Eli · Sistema One
          </p>
          <p className="text-[12.5px] font-medium uppercase tracking-[0.14em]">
            Reservas{" "}
            <span className="text-[15px] font-semibold normal-case tracking-normal text-pistacho">
              <span aria-hidden="true">/</span>y gestión
            </span>
          </p>
          <p className="text-sm">Deja de complicarte. Pásate a Eli.</p>
        </div>

        <div className="mt-8 flex flex-col gap-10 lg:mt-6 lg:flex-row lg:items-center lg:gap-14">
          {/* La marca en grande. Decorativa: quién la hace lo dice el bloque de al lado. */}
          <div aria-hidden="true" className="flex shrink-0 select-none flex-col items-center self-center lg:self-auto">
            <span className="degradado-frutos bg-clip-text px-[0.05em] text-[length:clamp(8rem,40vw,21.25rem)] font-bold leading-none tracking-[-0.03em] text-transparent">
              Eli
            </span>
            <span className="-mt-1.5 text-[15px] uppercase leading-none tracking-[0.2em] text-white/60 md:text-[19px]">
              by <b className="font-bold text-white">Sistema One</b>
            </span>
          </div>

          <div className="lg:max-w-[700px]">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-pistacho">
              <span aria-hidden="true" className="size-2 rounded-full bg-pistacho" />
              Un producto de
            </p>
            <p className="mt-3.5 text-[40px] font-semibold leading-none tracking-[-0.04em] md:text-[52px]">Sistema One</p>
            <p className="mt-[18px] max-w-[560px] text-base leading-[1.55] text-white/80">
              Eli es el sistema de reservas y gestión que desarrolla y ofrece Sistema One, para que tu negocio se agende,
              se cobre y crezca en un solo lugar.
            </p>
            <a
              href={SISTEMA_ONE}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-[22px] inline-flex min-h-11 items-center gap-2 rounded-full border-[1.5px] border-white/40 px-5 text-sm font-semibold transition-colors duration-150 ease-suave hover:border-white hover:bg-white/8 anillo-foco"
            >
              Conocer Sistema One
              <ArrowUpRight aria-hidden="true" strokeWidth={1.75} className="size-4" />
              <span className="sr-only">(se abre en otra pestaña)</span>
            </a>
          </div>
        </div>
      </Revelar>
    </footer>
  )
}

const ENLACE_DEL_PIE =
  "inline-flex min-h-11 items-center rounded-[8px] text-[15px] font-medium text-white/90 underline-offset-[3px] transition-colors duration-150 ease-suave hover:text-white hover:underline anillo-foco"

function ColumnaDelPie({ titulo, enlaces }: { titulo: string; enlaces: Enlace[] }) {
  return (
    <nav aria-label={titulo}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-pistacho">{titulo}</p>
      <ul className="mt-2">
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
