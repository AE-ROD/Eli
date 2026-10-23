import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { MarcaDeEli } from "@/components/comunes/marca-de-eli"
import { DIAS_DE_PRUEBA } from "@/lib/precios"

/**
 * El pie de todas las pantallas de la reserva: una línea discreta que dice que
 * la página es de Eli y lleva a la landing. Sin promesa ni llamado: la página
 * sigue siendo del negocio. El enlace es una píldora de 44px de alto, lo
 * mínimo para un dedo; el gris del texto da 5,1:1 sobre crema.
 */
export function PieDeEli() {
  return (
    <footer className="mt-10 flex justify-center md:mt-14">
      <Link
        href="/"
        className="anillo-foco inline-flex min-h-11 items-center gap-2 rounded-full px-3.5 text-sm text-texto-2 transition-colors duration-150 ease-suave hover:text-navy"
      >
        <MarcaDeEli />
        <span>
          Reservas con <strong className="font-semibold text-navy">Eli</strong>
        </span>
      </Link>
    </footer>
  )
}

/**
 * La invitación a probar Eli, sólo en la confirmación: quien acaba de reservar
 * solo puede tener un negocio que lo necesite. Navy, con el foco en blanco
 * (`anillo-foco-claro`) y el texto secundario al 75%, que pasa AA sobre navy.
 */
export function InvitacionAEli() {
  return (
    <aside
      aria-labelledby="invitacion-a-eli"
      className="anillo-foco-claro mx-auto mt-6 max-w-xl rounded-panel bg-navy p-6 text-white squircle sm:p-8"
    >
      <div className="flex items-center gap-2.5">
        <MarcaDeEli invertida />
        <p className="text-sm text-white/75">Esta página de reservas es de Eli</p>
      </div>
      <h2 id="invitacion-a-eli" className="mt-4 font-serif text-2xl leading-tight font-medium tracking-[-0.5px] text-balance">
        ¿Tienes un salón, barbería o spa de uñas?
      </h2>
      <p className="mt-2.5 text-pretty text-white/75">
        Que tus clientes reserven solos, como acabas de hacerlo tú. Prueba Eli {DIAS_DE_PRUEBA} días, sin tarjeta.
      </p>
      <Boton href="/" variante="invertido" icono={<ArrowUpRight />} className="mt-5">
        Conocer Eli
      </Boton>
    </aside>
  )
}
