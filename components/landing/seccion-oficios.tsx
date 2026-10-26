import { EncabezadoDeSeccion, Seccion } from "@/components/comunes/seccion"
import {
  MaquetaDiaSolo,
  MaquetaElegirServicio,
  MaquetaEquipo,
  MaquetaFilaDeEspera,
  MaquetaVisitaCompartida,
} from "@/components/landing/maquetas/maqueta-oficios"
import { CarruselDeHistorias, type Historia } from "@/components/movimiento/carrusel-de-historias"
import { Revelar } from "@/components/movimiento/revelar"

/**
 * Una historia por oficio y dos por tamaño del negocio. Los tres primeros
 * son los del menú "Para quién" del encabezado, en el mismo orden.
 */
const HISTORIAS: readonly Historia[] = [
  {
    id: "salon",
    oficio: "Salón de belleza",
    titulo: "Color + corte, con dos profesionales",
    texto:
      "En una misma visita pueden atender varias personas. Cada servicio lleva su profesional y su precio, y al cobrar todo suma en una sola cuenta.",
    color: "lila",
    escena: <MaquetaVisitaCompartida />,
  },
  {
    id: "barberia",
    oficio: "Barbería",
    titulo: "Con reserva o sin ella, a la misma fila",
    texto:
      "Lo que se reserva en tu página entra solo al tablero. Quien llega sin reserva se anota en el momento, y «Llegó» trae cargado lo reservado.",
    color: "azul",
    escena: <MaquetaFilaDeEspera />,
  },
  {
    id: "spa-de-unas",
    oficio: "Spa de uñas",
    titulo: "Que reserven desde tu página",
    texto:
      "La clienta elige el servicio, el día y la hora, y deja sus datos. Antes de la cita le llega un recordatorio por correo.",
    color: "naranja",
    escena: <MaquetaElegirServicio />,
  },
  {
    id: "solo",
    oficio: "Si trabajas solo",
    titulo: "Tu agenda, tus clientas y tu caja",
    texto:
      "Las citas del día, la ficha de cada clienta con sus notas y lo que cobraste, cuadrado al centavo. Todo en un mismo lugar.",
    color: "lima",
    escena: <MaquetaDiaSolo />,
  },
  {
    id: "equipo",
    oficio: "Si tienes equipo",
    titulo: "Cada uno, con su rol",
    texto:
      "Dueño, encargado y profesional. Invitas a tu equipo con un enlace; cada profesional ve solo lo suyo y cobran el dueño y el encargado.",
    color: "turquesa",
    escena: <MaquetaEquipo />,
  },
]

/** Para quién es Eli: un carrusel de historias, una por oficio y por tamaño de negocio. */
export function SeccionOficios() {
  return (
    <Seccion id="oficios" aria-labelledby="oficios-titulo">
      <Revelar>
        <EncabezadoDeSeccion
          id="oficios-titulo"
          titulo="Hecho para tres oficios"
          subtitulo="Salones de belleza, barberías y spas de uñas, trabajes solo o con equipo."
        />
        <CarruselDeHistorias etiqueta="Historias por oficio" historias={HISTORIAS} className="mt-9 md:mt-14" />
      </Revelar>
    </Seccion>
  )
}
