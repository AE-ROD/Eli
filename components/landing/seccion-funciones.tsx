import {
  CalendarDays,
  ChartColumn,
  Clock,
  CreditCard,
  Link2,
  Mail,
  RotateCcw,
  SquareKanban,
  StickyNote,
  UsersRound,
} from "lucide-react"
import { EncabezadoDeSeccion, Seccion } from "@/components/comunes/seccion"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { GrillaDeIconos, type TileDeGrilla } from "@/components/movimiento/grilla-de-iconos"
import { Revelar } from "@/components/movimiento/revelar"

/** Lo que el producto hace hoy, cada pieza con el color del módulo donde vive. */
const FUNCIONES: readonly TileDeGrilla[] = [
  {
    id: "agenda",
    titulo: "Agenda por profesional",
    icono: (
      <CuadroDeIcono icono={CalendarDays} color="azul" />
    ),
  },
  {
    id: "pagina-de-reservas",
    titulo: "Página de reservas",
    icono: (
      <CuadroDeIcono icono={Link2} color="azul" />
    ),
  },
  {
    id: "recordatorios",
    titulo: "Recordatorios por correo",
    icono: (
      <CuadroDeIcono icono={Mail} color="azul" />
    ),
  },
  {
    id: "clientes",
    titulo: "Clientes con notas",
    icono: (
      <CuadroDeIcono icono={StickyNote} color="lila" />
    ),
  },
  {
    id: "equipo",
    titulo: "Equipo con roles",
    icono: (
      <CuadroDeIcono icono={UsersRound} color="turquesa" />
    ),
  },
  {
    id: "tablero",
    titulo: "Tablero del día",
    icono: (
      <CuadroDeIcono icono={SquareKanban} color="naranja" />
    ),
  },
  {
    id: "pago-dividido",
    titulo: "Pago dividido",
    icono: (
      <CuadroDeIcono icono={CreditCard} color="lima" />
    ),
  },
  {
    id: "reportes",
    titulo: "Reportes",
    icono: (
      <CuadroDeIcono icono={ChartColumn} color="lima" />
    ),
  },
  {
    id: "anulaciones",
    titulo: "Anulaciones con registro",
    icono: (
      <CuadroDeIcono icono={RotateCcw} color="lima" />
    ),
  },
  {
    id: "servicios-y-horarios",
    titulo: "Servicios y horarios",
    icono: (
      <CuadroDeIcono icono={Clock} color="turquesa" />
    ),
  },
]

/** Lo que trae Eli: una grilla con cada pieza del producto. */
export function SeccionFunciones() {
  return (
    <Seccion
      id="funciones"
      aria-labelledby="funciones-titulo"
      // De blanco arriba a crema abajo, con un filo apenas más oscuro que el fondo de la página.
      className="bg-linear-to-b from-tarjeta to-crema ring-1 ring-[#F0ECE4]"
    >
      <Revelar>
        <EncabezadoDeSeccion
          id="funciones-titulo"
          titulo="Lo que trae Eli"
          subtitulo="Las piezas del día a día de tu negocio, conectadas de la reserva al reporte."
        />
        <GrillaDeIconos tiles={FUNCIONES} className="mt-9 md:mt-14" />
      </Revelar>
    </Seccion>
  )
}
