import { CalendarDays, Clock, RotateCcw, UsersRound } from "lucide-react"
import { EncabezadoDeSeccion, Seccion } from "@/components/comunes/seccion"
import {
  MaquetaAnuladas,
  MaquetaPorProfesional,
  MaquetaSemana,
  MaquetaTurnos,
} from "@/components/landing/maquetas/maqueta-lo-cobrado"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { ListaFija, type ItemDeListaFija } from "@/components/movimiento/lista-fija"
import { Revelar } from "@/components/movimiento/revelar"

const ITEMS: readonly ItemDeListaFija[] = [
  {
    id: "periodo",
    icono: (
      <CuadroDeIcono icono={CalendarDays} color="lima" />
    ),
    titulo: "Por día, semana o el rango que quieras",
    texto: "El historial de lo cobrado, para un día, una semana o las fechas que elijas.",
    visual: <MaquetaSemana />,
  },
  {
    id: "turno",
    icono: (
      <CuadroDeIcono icono={Clock} color="lima" />
    ),
    titulo: "Por turno: mañana, tarde o noche",
    texto: "Mañana es antes de las 12:00, tarde de 12:00 a 18:00 y noche desde las 18:00. Ves qué parte del día mueve más.",
    visual: <MaquetaTurnos />,
  },
  {
    id: "profesional",
    icono: (
      <CuadroDeIcono icono={UsersRound} color="lima" />
    ),
    titulo: "Por profesional, servicio o medio de pago",
    texto:
      "Cuánto generó cada profesional y cada servicio, y cuánto entró en efectivo, tarjetas, transferencia o billetera digital.",
    visual: <MaquetaPorProfesional />,
  },
  {
    id: "anuladas",
    icono: (
      <CuadroDeIcono icono={RotateCcw} color="lima" />
    ),
    titulo: "Las anuladas, con quién, cuándo y por qué",
    texto: "Lo cobrado no se reescribe. Si hubo un error, se anula y el registro queda a la vista.",
    visual: <MaquetaAnuladas />,
  },
]

/** Los reportes, con la lista invertida: la maqueta fija a la izquierda y la lista a la derecha. */
export function SeccionReportes() {
  return (
    <Seccion id="reportes" fondo="superficie" aria-labelledby="reportes-titulo">
      <Revelar>
        <ListaFija
          invertida
          encabezado={
            <EncabezadoDeSeccion
              id="reportes-titulo"
              antetitulo="Reportes"
              titulo="Sabes cuánto entró, cómo y quién lo generó."
              alineacion="izquierda"
            />
          }
          items={ITEMS}
          fondoDelVisual="bg-linear-150 from-lima-suave via-[#FBFDF3] via-55% to-turquesa-suave"
        />
      </Revelar>
    </Seccion>
  )
}
