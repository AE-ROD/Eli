import { ArrowUpRight } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { EncabezadoDeSeccion, Seccion } from "@/components/comunes/seccion"
import { Marquesina } from "@/components/movimiento/marquesina"
import { Revelar } from "@/components/movimiento/revelar"

/** Servicios que se reservan en los tres oficios, para la marquesina. */
const SERVICIOS = [
  "Corte",
  "Barba",
  "Color",
  "Mechas",
  "Alisado",
  "Peinado",
  "Manicura",
  "Pedicura",
  "Uñas esculpidas",
  "Cejas",
  "Pestañas",
  "Perfilado",
] as const

/** La isla navy del final: la frase de cierre, el botón para crear la cuenta y la marquesina de servicios. */
export function SeccionCierre() {
  return (
    <Seccion
      id="empezar"
      fondo="navy"
      aria-labelledby="empezar-titulo"
      className="overflow-hidden"
      // Sin relleno a los lados: la marquesina va de borde a borde de la isla.
      interior="px-0 pb-14 md:px-0 md:pb-20 xl:px-0 xl:pb-20"
    >
      <Revelar>
        <div className="px-5 text-center md:px-12">
          <EncabezadoDeSeccion id="empezar-titulo" titulo="Deja de complicarte. Pásate a Eli." tono="oscuro" />
          <Boton href="/crear-cuenta" variante="invertido" tamano="lg" icono={<ArrowUpRight />} className="mt-9">
            Crear mi cuenta
          </Boton>
        </div>
        <Marquesina palabras={SERVICIOS} etiqueta="Servicios que se reservan con Eli" className="mt-10 md:mt-16" />
      </Revelar>
    </Seccion>
  )
}
