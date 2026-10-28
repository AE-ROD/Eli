import {
  Banknote,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock,
  CreditCard,
  List,
  LogIn,
  Scissors,
  Sparkles,
  User,
  UsersRound,
  type LucideIcon,
} from "lucide-react"
import { EncabezadoDeSeccion, Seccion } from "@/components/comunes/seccion"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { Revelar } from "@/components/movimiento/revelar"
import { TarjetasExpandibles, type CuatroTarjetas, type PasoDeTarjeta } from "@/components/movimiento/tarjetas-expandibles"
import type { ColorDeModulo } from "@/lib/modulos"

/**
 * Un paso de la línea de tiempo de una tarjeta. El cuadro mide 36px y no 32
 * (el `sm`): la línea punteada de `TarjetasExpandibles` está medida para ese
 * tamaño (arranca a 46px y va a 18px de alto, el centro del cuadro).
 */
function paso(texto: string, color: ColorDeModulo, icono: LucideIcon): PasoDeTarjeta {
  return {
    texto,
    icono: (
      <CuadroDeIcono icono={icono} color={color} tamano="sm" className="size-9 rounded-[12px] [&_svg]:size-5" />
    ),
  }
}

/** Cada momento lleva el color del módulo donde pasa: agenda, tablero, equipo y reportes. */
const MOMENTOS: CuatroTarjetas = [
  {
    id: "reserva",
    titulo: "Reserva",
    icono: (
      <CuadroDeIcono icono={CalendarDays} color="azul" tamano="lg" />
    ),
    corto: "Tus clientes reservan solos, desde tu página.",
    largo:
      "En la página de reservas de tu negocio eligen el servicio, el día y la hora, y dejan sus datos. Antes de la cita les llega un recordatorio por correo.",
    pasos: [paso("Servicio", "azul", List), paso("Día y hora", "azul", Clock), paso("Sus datos", "azul", User)],
  },
  {
    id: "llegada",
    titulo: "Llegada",
    icono: (
      <CuadroDeIcono icono={LogIn} color="naranja" tamano="lg" />
    ),
    corto: "Tocas «Llegó» y pasa a En espera.",
    largo:
      "«Llegó» precarga lo que se reservó y la visita pasa a En espera. Quien llega sin reserva se anota en el momento y entra a la misma fila.",
    pasos: [
      paso("Reservas de hoy", "naranja", CalendarDays),
      paso("Llegó", "naranja", LogIn),
      paso("En espera", "naranja", Clock),
    ],
  },
  {
    id: "atencion",
    titulo: "Atención",
    icono: (
      <CuadroDeIcono icono={UsersRound} color="turquesa" tamano="lg" />
    ),
    corto: "Cada servicio, con su profesional.",
    largo:
      "Una visita puede tener varios servicios, y cada uno lleva su profesional y su precio. Cada profesional ve solo lo suyo.",
    pasos: [
      paso("Color · Lucía", "turquesa", Sparkles),
      paso("Corte · Carla", "turquesa", Scissors),
      paso("Por cobrar", "turquesa", CircleDollarSign),
    ],
  },
  {
    id: "cobro",
    titulo: "Cobro",
    icono: (
      <CuadroDeIcono icono={CircleDollarSign} color="lima" tamano="lg" />
    ),
    corto: "Pago dividido, cuadrado al centavo.",
    largo:
      "Cobran el dueño o el encargado, y el pago se divide entre efectivo, tarjetas, transferencia o billetera digital. Si hubo un error, se anula: queda quién, cuándo y por qué.",
    pasos: [
      paso("Efectivo $20.000", "lima", Banknote),
      paso("Débito $17.000", "lima", CreditCard),
      paso("Finalizado", "lima", Check),
    ],
  },
]

/** El recorrido de una visita en cuatro momentos, de la reserva al cobro. */
export function SeccionUnDia() {
  return (
    <Seccion id="un-dia" fondo="superficie" aria-labelledby="un-dia-titulo">
      <Revelar>
        <EncabezadoDeSeccion
          id="un-dia-titulo"
          titulo="Un día con Eli"
          subtitulo="De la reserva al cobro, sin papeles ni planillas."
        />
        <TarjetasExpandibles tarjetas={MOMENTOS} className="mt-9 md:mt-14" />
      </Revelar>
    </Seccion>
  )
}
