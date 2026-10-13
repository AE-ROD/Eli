import { CalendarDays, Eye, Lock, Plus } from "lucide-react"
import { EncabezadoDeSeccion, Seccion } from "@/components/comunes/seccion"
import {
  MaquetaAnotarVisita,
  MaquetaQuienCobra,
  MaquetaReservasDeHoy,
  MaquetaVistaDeProfesional,
} from "@/components/landing/maquetas/maqueta-dia-a-la-vista"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { ListaFija, type ItemDeListaFija } from "@/components/movimiento/lista-fija"
import { Revelar } from "@/components/movimiento/revelar"

const ITEMS: readonly ItemDeListaFija[] = [
  {
    id: "reservas-de-hoy",
    icono: (
      <CuadroDeIcono icono={CalendarDays} color="naranja" />
    ),
    titulo: "Las reservas de hoy entran solas",
    texto: "Lo que reservan en tu página aparece en la columna Reservas de hoy. Nadie tiene que pasarlo a mano.",
    visual: <MaquetaReservasDeHoy />,
  },
  {
    id: "sin-reserva",
    icono: (
      <CuadroDeIcono icono={Plus} color="naranja" />
    ),
    titulo: "Quien llega sin reserva, también",
    texto: "Se anota en el momento y entra a la fila En espera, como cualquier otra visita.",
    visual: <MaquetaAnotarVisita />,
  },
  {
    id: "lo-suyo",
    icono: (
      <CuadroDeIcono icono={Eye} color="naranja" />
    ),
    titulo: "Cada profesional ve lo suyo",
    texto: "Cada servicio de la visita lleva su profesional y su precio, y cada profesional ve sólo lo que le toca.",
    visual: <MaquetaVistaDeProfesional />,
  },
  {
    id: "quien-cobra",
    icono: (
      <CuadroDeIcono icono={Lock} color="naranja" />
    ),
    titulo: "Cobran el dueño y el encargado",
    texto: "El profesional atiende y la visita pasa a Por cobrar. El cobro queda en manos del dueño y del encargado.",
    visual: <MaquetaQuienCobra />,
  },
]

/** El tablero del día: la lista a la izquierda y, fija a la derecha, la maqueta del ítem que se está leyendo. */
export function SeccionTablero() {
  return (
    <Seccion id="tablero" aria-labelledby="tablero-titulo">
      <Revelar>
        <ListaFija
          encabezado={
            <EncabezadoDeSeccion
              id="tablero-titulo"
              antetitulo="Tablero"
              titulo="Todo el día, a la vista."
              alineacion="izquierda"
            />
          }
          items={ITEMS}
          fondoDelVisual="bg-linear-150 from-naranja-suave via-[#FFF6EE] via-55% to-lima-suave"
        />
      </Revelar>
    </Seccion>
  )
}
