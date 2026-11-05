"use client"

import { useInView } from "framer-motion"
import { Mail } from "lucide-react"
import { useRef, type ReactNode } from "react"
import { EncabezadoDeSeccion, Seccion } from "@/components/comunes/seccion"
import { CuadroDeIcono, IconoDeModulo } from "@/components/comunes/icono-de-modulo"
import { Tarjeta } from "@/components/comunes/tarjeta"
import { MaquetaRecordatorio } from "@/components/landing/maquetas/maqueta-recordatorio"
import { MaquetaReserva } from "@/components/landing/maquetas/maqueta-reserva"
import { Revelar } from "@/components/movimiento/revelar"

/**
 * La reserva corre su animación cuando la tarjeta llega a la pantalla, no al
 * cargar la página: la sección está abajo y, si no, se perdería el momento.
 * Una vez que se vio, se queda como terminó.
 */
function MaquetaReservaAlVerse() {
  const contenedor = useRef<HTMLDivElement>(null)
  const visible = useInView(contenedor, { once: true, amount: 0.5 })
  return (
    <div ref={contenedor} className="flex w-full justify-center">
      <MaquetaReserva activa={visible} />
    </div>
  )
}

interface PuntoDeCrecimiento {
  id: string
  /** El ícono ya en su cuadro de color. Es decoración. */
  icono: ReactNode
  titulo: string
  texto: string
  maqueta: ReactNode
}

// Los dos puntos son de Agenda y llevan su azul, como en "Lo que trae Eli".
const PUNTOS: readonly PuntoDeCrecimiento[] = [
  {
    id: "agenda-con-reservas",
    icono: <IconoDeModulo modulo="agenda" tamano="lg" />,
    titulo: "Tu agenda, en tus manos",
    texto:
      "Defines tus servicios y tus horarios, y la página de reservas ya viene incluida. Tus clientes reservan solos en las horas que tienes libres, y cada cita entra a tu agenda sin que nadie la pase a mano.",
    maqueta: <MaquetaReservaAlVerse />,
  },
  {
    id: "recordatorios-por-correo",
    icono: <CuadroDeIcono icono={Mail} color="azul" tamano="lg" />,
    titulo: "Recordatorios por correo, para que falten menos",
    texto:
      "Si tu cliente deja su correo al reservar, Eli le manda un recordatorio el día antes de su cita, sin que tú hagas nada. Así es más difícil que se le olvide.",
    maqueta: <MaquetaRecordatorio />,
  },
]

/** Cómo Eli ayuda a que el negocio crezca: la agenda con su página de reservas y los recordatorios por correo. */
export function SeccionCrecimiento() {
  return (
    <Seccion id="crecimiento" aria-labelledby="crecimiento-titulo">
      <Revelar>
        <EncabezadoDeSeccion id="crecimiento-titulo" antetitulo="Crecimiento" titulo="¿Cómo hacemos crecer tu negocio?" />
      </Revelar>
      <ul className="mt-9 grid gap-4 md:mt-14 md:grid-cols-2 md:gap-6">
        {PUNTOS.map((punto, indice) => (
          // Las dos tarjetas miden lo mismo aunque sus textos no: el `li` se estira y la tarjeta lo llena.
          <Revelar key={punto.id} como="li" retraso={indice * 0.1} className="flex">
            <Tarjeta className="flex min-w-0 flex-1 flex-col p-6 ring-1 ring-borde md:p-8">
              {punto.icono}
              <h3 className="titulo-3 mt-5">{punto.titulo}</h3>
              <p className="cuerpo-xl mt-3 text-texto-2">{punto.texto}</p>
              {/* La maqueta toma el alto que sobra y queda centrada: la del correo es más baja que la de la reserva. */}
              <div className="mt-8 grid flex-1 place-items-center rounded-[24px] bg-linear-150 from-azul-suave to-lila-suave p-4 squircle sm:p-6">
                {punto.maqueta}
              </div>
            </Tarjeta>
          </Revelar>
        ))}
      </ul>
    </Seccion>
  )
}
