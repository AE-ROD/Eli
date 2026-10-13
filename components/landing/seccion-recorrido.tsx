"use client"

import { MaquetaCliente } from "@/components/landing/maquetas/maqueta-cliente"
import { MaquetaCobro } from "@/components/landing/maquetas/maqueta-cobro"
import { MaquetaReserva } from "@/components/landing/maquetas/maqueta-reserva"
import { MaquetaTablero } from "@/components/landing/maquetas/maqueta-tablero"
import { EscenarioConScroll, type PasoDelEscenario } from "@/components/movimiento/escenario-con-scroll"

/** El día de un negocio con Eli, en el orden en que pasa: la reserva, la clienta, el tablero y el cobro. */
const PASOS: readonly PasoDelEscenario[] = [
  {
    id: "agenda",
    modulo: "agenda",
    titulo: "Reservan solas",
    texto:
      "Cada negocio tiene su página de reservas. La clienta elige el servicio, el día y la hora, y deja sus datos.",
    puntos: ["Servicio, día y hora, y sus datos", "Recordatorio por correo antes de la cita", "La cita entra a la agenda con su precio"],
    maqueta: (activa) => <MaquetaReserva activa={activa} />,
  },
  {
    id: "clientes",
    modulo: "clientes",
    titulo: "Cada clienta, con su historia",
    texto: "Cada clienta tiene su ficha con sus datos, tus notas y el historial de sus visitas.",
    puntos: ["Datos de contacto", "Notas que quedan guardadas", "Visitas con servicio, profesional y precio"],
    maqueta: (activa) => <MaquetaCliente activa={activa} />,
  },
  {
    id: "tablero",
    modulo: "tablero",
    titulo: "El día, en columnas",
    texto:
      "Las reservas de hoy entran solas y quien llega sin reserva se anota en el momento. Cada visita avanza hasta que se cobra.",
    puntos: ["Reservas de hoy, En espera, En atención", "Por cobrar y Finalizado", "Cada servicio con su profesional y su precio"],
    maqueta: (activa) => <MaquetaTablero activa={activa} />,
  },
  {
    id: "reportes",
    modulo: "reportes",
    titulo: "Lo cobrado, cuadrado",
    texto:
      "El pago se divide entre los medios que haga falta y cuadra al centavo. Al cerrar sabes cuánto entró, cómo y quién lo generó.",
    puntos: [
      "Efectivo, débito, crédito, transferencia o billetera digital",
      "Por profesional, servicio o medio de pago",
      "Lo anulado queda registrado",
    ],
    maqueta: (activa) => <MaquetaCobro activa={activa} />,
  },
]

/**
 * "Cómo funciona": el recorrido por los cuatro pasos del día. En escritorio
 * la tarjeta queda fija mientras se baja; "Saltar el recorrido" lleva a
 * "Un día con Eli", que es lo que sigue.
 */
export function SeccionRecorrido() {
  return (
    <section id="recorrido" aria-labelledby="recorrido-titulo" className="mx-2 md:mx-6">
      <h2 id="recorrido-titulo" className="sr-only">
        Cómo funciona Eli, en cuatro pasos
      </h2>
      <EscenarioConScroll pasos={PASOS} etiqueta="Pasos del recorrido" saltarA="un-dia" />
    </section>
  )
}
