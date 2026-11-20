"use client"

import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { Menu, Plus, UserRound, type LucideIcon } from "lucide-react"
import { Antetitulo } from "@/components/comunes/antetitulo"
import { Boton } from "@/components/comunes/boton"
import { POSICION_DEL_BOTON_FLOTANTE } from "@/components/panel/barra-inferior"
import { BotonDeMiFoto } from "@/components/panel/boton-de-mi-foto"
import { ID_DEL_CAJON, useBarraLateral } from "@/components/panel/contexto-barra-lateral"
import { useCuentaDelPanel } from "@/components/panel/contexto-de-la-cuenta"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { CuadroDeSeccion } from "@/components/panel/icono-de-seccion"
import { seccionConNombreDelRubro, seccionDeLaRuta } from "@/components/panel/secciones-del-panel"
import { cn } from "@/lib/utils"

interface PropsDeBarraSuperior {
  titulo: string
  subtitulo?: string
  accionPrincipal?: {
    texto: string
    onClick: () => void
    /** Sin ícono propio va `Plus`. */
    icono?: LucideIcon
  }
  /**
   * @deprecated No hace nada: la búsqueda no existe todavía y no se muestra
   * (un campo que no busca es peor que ninguno). Queda para no tocar las
   * páginas que la apagan; se borra con ellas cuando llegue la búsqueda.
   */
  mostrarBusqueda?: boolean
}

/** Los botones de sólo ícono de la fila del teléfono: 44 × 44, lo mínimo para un dedo. */
const BOTON_DE_LA_FILA =
  "grid size-11 shrink-0 place-items-center rounded-boton text-navy squircle anillo-foco transition-colors duration-150 ease-suave"

/**
 * El encabezado de cada página del panel: el antetítulo con la sección (sale
 * de la ruta, con el color de su módulo o en neutro), el título en la serif de
 * los titulares y el subtítulo; a la derecha, la acción principal.
 *
 * La búsqueda y la campana de notificaciones no están: no existen todavía, y
 * un campo que no busca o una campana que no avisa prometen algo que no hay.
 * Vuelven cuando existan.
 *
 * Por debajo de `lg` (el celular; ver `barra-inferior.tsx`) cambia la forma,
 * no lo que la página le pasa:
 *
 * - el título va en una fila fija de 56 px arriba, junto al botón de menú y
 *   al avatar. Fija y no con el resto del encabezado: el foco vuelve a ese
 *   botón cuando el cajón se cierra, y si hubiera quedado arriba, fuera de la
 *   vista, la página saltaba al principio. El `<h1>` es ése; el del
 *   encabezado grande no se dibuja (`max-lg:hidden`), así hay uno solo;
 * - no hay antetítulo (la sección ya está marcada en la barra inferior) y el
 *   subtítulo es una línea chica;
 * - la acción principal es un botón flotante abajo a la derecha, encima de la
 *   barra inferior. En el DOM hay dos botones, pero uno siempre con
 *   `display: none`: el lector de pantalla y Tab encuentran uno solo.
 *
 * Una página que no usa `BarraSuperior` (la pantalla de la fila) no tiene
 * fila de arriba en el celular, como antes: la barra inferior le da el menú.
 */
export function BarraSuperior({ titulo, subtitulo, accionPrincipal }: PropsDeBarraSuperior) {
  const seccionDeLaPagina = seccionDeLaRuta(usePathname())
  // El antetítulo, con el nombre del rubro: "Pacientes" en una clínica dental.
  const rubro = useRubroDelPanel()
  const seccion = seccionDeLaPagina && seccionConNombreDelRubro(seccionDeLaPagina, rubro)
  const IconoDeLaAccion = accionPrincipal?.icono ?? Plus

  return (
    <>
      {/*
        Hermana del encabezado y no adentro: un `sticky` se pega sólo dentro de
        su padre, y el encabezado es corto. Así su padre es la página entera.
      */}
      <FilaDelTelefono titulo={titulo} />

      <header className="px-4 pt-3 sm:px-6 lg:pt-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-x-6">
          <div className="min-w-0">
            {seccion && (
              <Antetitulo className="flex items-center gap-2 max-lg:hidden">
                <CuadroDeSeccion seccion={seccion} tamano="xs" fondoSinModulo="bg-borde" />
                {seccion.nombre}
              </Antetitulo>
            )}
            <h1 className={cn("titulo-seccion text-balance break-words text-navy max-lg:hidden", seccion && "mt-2.5")}>
              {titulo}
            </h1>
            {subtitulo && (
              <p className="text-[13px] leading-snug text-pretty text-texto-2 lg:mt-2 lg:text-base lg:leading-normal">
                {subtitulo}
              </p>
            )}
          </div>

          {/* Sin acción no queda un hueco a la derecha. */}
          {accionPrincipal && (
            <>
              <div className="flex items-center gap-3 max-lg:hidden">
                <Boton onClick={accionPrincipal.onClick} icono={<IconoDeLaAccion aria-hidden="true" />}>
                  {accionPrincipal.texto}
                </Boton>
              </div>
              {/* En el celular, flotante sobre la barra inferior: siempre a mano del pulgar. */}
              <Boton
                onClick={accionPrincipal.onClick}
                icono={<IconoDeLaAccion aria-hidden="true" />}
                tamano="lg"
                className={cn(
                  "fixed z-30 max-w-[calc(100vw-2rem)] shadow-[0_8px_18px_rgb(7_26_49/0.25)] lg:hidden",
                  POSICION_DEL_BOTON_FLOTANTE
                )}
              >
                <span className="truncate">{accionPrincipal.texto}</span>
              </Boton>
            </>
          )}
        </div>
      </header>
    </>
  )
}

/** La fila fija de arriba en el celular: el menú, el título de la página y quién está en sesión. */
function FilaDelTelefono({ titulo }: { titulo: string }) {
  const { cajonAbierto, abrirCajon, refBotonMenu } = useBarraLateral()
  const { data: sesion } = useSession()
  const { fotoUrl, abrirMiFoto } = useCuentaDelPanel()
  const nombreUsuario = sesion?.user?.name

  return (
    <div className="sticky top-0 z-30 border-b border-borde bg-tarjeta pt-[env(safe-area-inset-top)] lg:hidden">
      <div className="flex h-14 items-center gap-2 px-2">
        {/* Con el cajón abierto la superposición lo tapa: este botón sólo abre. */}
        <button
          ref={refBotonMenu}
          type="button"
          className={cn(BOTON_DE_LA_FILA, "bg-superficie hover:bg-borde")}
          onClick={() => abrirCajon()}
          aria-label="Menú"
          aria-controls={ID_DEL_CAJON}
          aria-expanded={cajonAbierto}
        >
          <Menu className="size-5" aria-hidden="true" strokeWidth={1.75} />
        </button>
        {/* Un título largo se corta con "…": entero está en el `title` y en la pestaña del navegador. */}
        <h1 title={titulo} className="min-w-0 flex-1 truncate pl-1 font-serif text-xl leading-tight font-medium text-navy">
          {titulo}
        </h1>

        <div className="flex shrink-0 items-center">
          {/* Sin sesión no se inventa un nombre: va la silueta. */}
          {nombreUsuario ? (
            // La foto de la cuenta, si la tiene; tocarla abre "Mi foto". Con el cajón cerrado: no hay nada que cerrar.
            <BotonDeMiFoto nombre={nombreUsuario} imagenUrl={fotoUrl ?? undefined} alAbrir={abrirMiFoto} />
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
