"use client"

import dynamic from "next/dynamic"
import { Encabezado } from "@/components/landing/encabezado"
import { PieDePagina } from "@/components/landing/pie-de-pagina"
import { SeccionAreas } from "@/components/landing/seccion-areas"
import { SeccionPortada } from "@/components/landing/seccion-portada"
import { SeccionRecorrido } from "@/components/landing/seccion-recorrido"

// Lo que está más abajo llega en paquetes aparte: el servidor igual lo pinta
// entero, pero su JavaScript no demora que el encabezado y la portada
// respondan. Es una página de cliente a propósito: si la importara un
// componente de servidor, `next/dynamic` no separaría los paquetes.
const SeccionUnDia = dynamic(() => import("@/components/landing/seccion-un-dia").then((m) => m.SeccionUnDia))
const SeccionTablero = dynamic(() => import("@/components/landing/seccion-tablero").then((m) => m.SeccionTablero))
const SeccionReportes = dynamic(() => import("@/components/landing/seccion-reportes").then((m) => m.SeccionReportes))
const SeccionOficios = dynamic(() => import("@/components/landing/seccion-oficios").then((m) => m.SeccionOficios))
const SeccionFunciones = dynamic(() =>
  import("@/components/landing/seccion-funciones").then((m) => m.SeccionFunciones)
)
const SeccionPrecios = dynamic(() => import("@/components/landing/seccion-precios").then((m) => m.SeccionPrecios))
const SeccionCierre = dynamic(() => import("@/components/landing/seccion-cierre").then((m) => m.SeccionCierre))

export default function PaginaLanding() {
  return (
    <>
      {/* Lo primero que alcanza el teclado: saltea el menú. Fuera de la
          pantalla hasta que tiene el foco. */}
      <a
        href="#contenido"
        className="fixed left-4 top-4 z-[110] inline-flex h-12 -translate-y-[calc(100%+2rem)] items-center rounded-boton bg-navy px-5 font-medium text-white shadow-md squircle anillo-foco focus:translate-y-0"
      >
        Saltar al contenido
      </a>
      {/* La barra de anuncio (`components/landing/barra-de-anuncio.tsx`) ya no
          se muestra: la landing nueva arranca con el encabezado. */}
      <Encabezado />
      {/* En el orden del diseño de la landing nueva. Las secciones van de borde
          a borde y juntas: el fondo oscurece de forma continua de una a la
          siguiente (el final de una es el comienzo de la otra), sin franjas. */}
      <main id="contenido" data-landing className="flex flex-col">
        <div>
          <SeccionPortada />
          <SeccionAreas />
        </div>
        <SeccionRecorrido />
        <SeccionUnDia />
        <SeccionTablero />
        <SeccionReportes />
        <SeccionOficios />
        <SeccionFunciones />
        <SeccionPrecios />
        <SeccionCierre />
      </main>
      <PieDePagina />
    </>
  )
}
