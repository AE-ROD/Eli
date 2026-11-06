import { ArrowUpRight } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { IlustracionDelEnredo } from "@/components/landing/ilustracion-del-enredo"

/**
 * La portada: el titular, los dos botones y el enredo que Eli acomoda, sobre
 * el fondo de brillos (las tres manchas de la paleta).
 *
 * El fondo sube por detrás del encabezado, que arriba de todo es
 * transparente: la sección se corre hacia arriba lo que mide el lugar del
 * encabezado (68px en teléfono, 80 desde md) y lo devuelve en relleno.
 *
 * El titular y los botones no se animan al entrar: son lo primero que se
 * pinta y no esperan a JavaScript. Lo que se mueve es la ilustración.
 */
export function SeccionPortada() {
  return (
    <section
      id="inicio"
      aria-labelledby="portada-titulo"
      className="fondo-brillos relative -mt-[68px] overflow-hidden pt-[68px] md:-mt-20 md:pt-20"
    >
      <div className="contenedor px-5 pb-14 pt-10 text-center md:px-12 md:pb-20 md:pt-[72px]">
        {/* Un renglón por frase: cada una se equilibra sola y nunca se parte "Eli lo" de "acomoda". */}
        <h1 id="portada-titulo" className="titulo-portada mx-auto max-w-[900px] text-balance">
          <span className="block">
            Llevas todo <span className="text-frambuesa">enredado.</span>
          </span>{" "}
          <span className="block">
            Eli lo <span className="resaltado">acomoda.</span>
          </span>
        </h1>

        <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:justify-center md:gap-3">
          <Boton
            href="/crear-cuenta"
            variante="destacado"
            icono={<ArrowUpRight aria-hidden="true" />}
            className="rounded-boton-lg text-sm"
          >
            Crear mi cuenta
          </Boton>
          <Boton href="#recorrido" variante="secundario" className="rounded-boton-lg text-sm">
            Ver cómo funciona
          </Boton>
        </div>

        <IlustracionDelEnredo className="mt-12 md:mt-16" />
      </div>
    </section>
  )
}
