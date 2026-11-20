"use client"

import { useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Ellipsis } from "lucide-react"
import { FONDO_SUAVE, HALO_DE_MODULO } from "@/components/comunes/colores-de-modulo"
import { ID_DEL_CAJON, useBarraLateral } from "@/components/panel/contexto-barra-lateral"
import { IconoDeSeccion } from "@/components/panel/icono-de-seccion"
import {
  SECCIONES_SECUNDARIAS,
  seccionMarcadaEnLaBarra,
  seccionesDeLaBarraInferior,
  seccionesPrincipales,
  type AccesoAlPanel,
  type SeccionDelPanel,
} from "@/components/panel/secciones-del-panel"
import { moduloPorId } from "@/lib/modulos"
import { cn } from "@/lib/utils"

/**
 * # El panel en el celular (por debajo de `lg`, 1024 px)
 *
 * En el computador (desde `lg`) el panel no cambia: barra lateral fija,
 * encabezado grande en cada página, la acción principal arriba a la derecha y
 * las ventanas centradas. Por debajo de `lg` (el mismo corte en que la barra
 * lateral pasa a cajón) se acomoda para el pulgar:
 *
 * 1. **Barra superior compacta** (`BarraSuperior`): una fila fija de 56 px con
 *    el botón de menú, el título de la página (serif, 20 px) y el avatar. No
 *    hay antetítulo ni título gigante; el subtítulo queda como una línea chica
 *    (13 px, `texto-2`). La página no hace nada distinto: le pasa `titulo` y
 *    `subtitulo` a `BarraSuperior`, como siempre.
 * 2. **Acción principal flotante**: el `accionPrincipal` de `BarraSuperior` se
 *    dibuja como botón flotante (56 px, ícono y texto) abajo a la derecha,
 *    encima de esta barra. Una sola por pantalla.
 * 3. **Barra inferior** (este componente): hasta cuatro secciones y "Más", que
 *    abre el cajón con todo lo demás. Muestra sólo lo que el rol ya ve en la
 *    barra lateral (`seccionesPrincipales` + `seccionesDeLaBarraInferior`, en
 *    `secciones-del-panel.ts`): no hay reglas de permisos propias. Alto de
 *    64 px más el área segura de abajo (`env(safe-area-inset-bottom)`);
 *    `ContenidoDelPanel` deja ese espacio, y el del botón flotante, al final
 *    de cada página (`ESPACIO_DE_LA_BARRA_INFERIOR`).
 * 4. **Ventanas como hojas** (`MarcoDeModal`): suben desde abajo, con asa,
 *    bordes de arriba redondeados, hasta el 90 % del alto y scroll adentro.
 *    Los botones del pie van en la prop `pie` y quedan fijos abajo.
 * 5. **Tamaños**: letra de 14 a 16 px, filas de 44 a 56 px y tarjetas con
 *    16 px de relleno (`RELLENO_DE_TARJETA` en `estilos.ts`).
 *
 * Las capas, de abajo hacia arriba: contenido; barra superior, barra inferior
 * y botón flotante (`z-30`); cajón y su velo (`z-40`); ventanas (`z-50`).
 */

/** Alto de la barra sin el área segura: 64 px. */
const ALTO_DE_LA_BARRA = "h-16"

/**
 * El espacio que deja el contenido al final en el celular para que la barra
 * inferior y el botón flotante no tapen lo último: 64 px de la barra, el área
 * segura y 88 px para el botón flotante (56 px más su margen).
 */
export const ESPACIO_DE_LA_BARRA_INFERIOR = "max-lg:pb-[calc(4rem+env(safe-area-inset-bottom)+5.5rem)]"

/** Dónde va el botón flotante: 16 px por encima de la barra inferior y de su área segura. */
export const POSICION_DEL_BOTON_FLOTANTE = "right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))]"

/** Una pestaña de la barra: 44 px de ancho y alto como mínimo; el ícono en una píldora de 52 × 28. */
const PESTANA =
  "group flex min-h-11 min-w-11 flex-1 flex-col items-center justify-start gap-1 rounded-[14px] px-0.5 pt-2 text-[11px] leading-[1.15] text-texto-2 anillo-foco transition-colors duration-150 ease-suave"

const PILDORA = "grid h-7 w-13 place-items-center rounded-full transition-colors duration-150 ease-suave"

export function BarraInferior({ puedeVerEquipo, accesoALaPlata, rubro }: AccesoAlPanel) {
  const pathname = usePathname()
  const { cajonAbierto, abrirCajon } = useBarraLateral()
  const refMas = useRef<HTMLButtonElement>(null)

  const principales = seccionesPrincipales({ puedeVerEquipo, accesoALaPlata, rubro })
  const enLaBarra = seccionesDeLaBarraInferior(principales)
  // La que marca la barra lateral, con la misma regla; si no está entre las de
  // abajo, está en "Más", que se resalta sin `aria-current` (no es una página).
  const activa = seccionMarcadaEnLaBarra(pathname, [...principales, ...SECCIONES_SECUNDARIAS])
  const activaEnMas = !!activa && !enLaBarra.some((seccion) => seccion.id === activa.id)

  return (
    <nav
      aria-label="Accesos rápidos"
      // Con el cajón abierto, como el contenido: no se enfoca ni se lee detrás del velo.
      inert={cajonAbierto}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-borde bg-tarjeta pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className={cn("mx-auto flex max-w-xl items-stretch gap-1 px-1.5", ALTO_DE_LA_BARRA)}>
        {enLaBarra.map((seccion) => (
          <li key={seccion.id} className="flex flex-1">
            <PestanaDeSeccion seccion={seccion} activa={activa?.id === seccion.id} />
          </li>
        ))}
        <li className="flex flex-1">
          <button
            ref={refMas}
            type="button"
            onClick={() => abrirCajon(refMas.current)}
            aria-controls={ID_DEL_CAJON}
            aria-expanded={cajonAbierto}
            aria-haspopup="dialog"
            className={cn(PESTANA, activaEnMas ? "font-semibold text-navy" : "font-medium hover:text-navy")}
          >
            <span aria-hidden="true" className={cn(PILDORA, activaEnMas ? "bg-superficie" : "group-hover:bg-superficie")}>
              <Ellipsis className="size-5" strokeWidth={1.75} />
            </span>
            Más
          </button>
        </li>
      </ul>
    </nav>
  )
}

/** Un enlace de la barra: el ícono en su píldora (del pastel suave del módulo si está activa) y el nombre debajo. */
function PestanaDeSeccion({ seccion, activa }: { seccion: SeccionDelPanel; activa: boolean }) {
  const pildoraActiva = seccion.modulo ? FONDO_SUAVE[moduloPorId(seccion.modulo).color] : "bg-superficie"

  return (
    <Link
      href={seccion.ruta}
      aria-current={activa ? "page" : undefined}
      className={cn(
        PESTANA,
        seccion.modulo && HALO_DE_MODULO[seccion.modulo],
        activa ? "font-semibold text-navy" : "font-medium hover:text-navy"
      )}
    >
      <span aria-hidden="true" className={cn(PILDORA, activa ? pildoraActiva : "group-hover:bg-superficie")}>
        <IconoDeSeccion id={seccion.id} className="size-5" />
      </span>
      {/* "Sala de espera" puede ocupar dos renglones; más, no. */}
      <span className="line-clamp-2 text-center">{seccion.nombre}</span>
    </Link>
  )
}
