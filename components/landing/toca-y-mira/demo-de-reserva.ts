/*
 * La mini-demo "Reserva como lo haría tu clienta": tres toques (servicio,
 * hora, listo) con datos de ejemplo de un salón. Todo vive en el navegador:
 * no se llama a ninguna API ni se guarda nada. Acá está sólo el estado, sin
 * React, para probarlo solo.
 */

export interface ServicioDeEjemplo {
  id: string
  nombre: string
  duracion: string
  precio: number
}

export interface DiaDeEjemplo {
  id: string
  /** Lo que dice el botón: "jue". */
  corto: string
  numero: number
  /** Para el resumen y el lector de pantalla: "jueves 15 de octubre". */
  largo: string
}

/** Los servicios del salón de ejemplo, con los precios que usan las maquetas de la landing. */
export const SERVICIOS_DE_EJEMPLO: readonly ServicioDeEjemplo[] = [
  { id: "corte", nombre: "Corte", duracion: "45 min", precio: 15000 },
  { id: "color", nombre: "Color", duracion: "1 h 30 min", precio: 22000 },
  { id: "color-corte", nombre: "Color + corte", duracion: "2 h 15 min", precio: 37000 },
  { id: "manicura", nombre: "Manicura", duracion: "45 min", precio: 12000 },
]

/** Octubre de 2026, como la maqueta de la reserva: el 15 es jueves. */
export const DIAS_DE_EJEMPLO: readonly DiaDeEjemplo[] = [
  { id: "15", corto: "jue", numero: 15, largo: "jueves 15 de octubre" },
  { id: "16", corto: "vie", numero: 16, largo: "viernes 16 de octubre" },
  { id: "17", corto: "sáb", numero: 17, largo: "sábado 17 de octubre" },
]

export const HORAS_DE_EJEMPLO = ["09:30", "10:30", "11:00", "12:30", "15:00", "16:30"] as const

export type HoraDeEjemplo = (typeof HORAS_DE_EJEMPLO)[number]

export type EstadoDeLaDemo =
  | { paso: "servicio" }
  | { paso: "hora"; servicio: string; dia: string }
  | { paso: "listo"; servicio: string; dia: string; hora: HoraDeEjemplo }

export type AccionDeLaDemo =
  | { tipo: "elegir-servicio"; servicio: string }
  | { tipo: "elegir-dia"; dia: string }
  | { tipo: "elegir-hora"; hora: string }
  | { tipo: "volver-a-probar" }

export const ESTADO_INICIAL: EstadoDeLaDemo = { paso: "servicio" }

/** El número del paso (1, 2 o 3), para la barra de progreso. */
export function numeroDelPaso(estado: EstadoDeLaDemo): 1 | 2 | 3 {
  return estado.paso === "servicio" ? 1 : estado.paso === "hora" ? 2 : 3
}

export function servicioPorId(id: string): ServicioDeEjemplo | undefined {
  return SERVICIOS_DE_EJEMPLO.find((servicio) => servicio.id === id)
}

export function diaPorId(id: string): DiaDeEjemplo | undefined {
  return DIAS_DE_EJEMPLO.find((dia) => dia.id === id)
}

function esHora(hora: string): hora is HoraDeEjemplo {
  return (HORAS_DE_EJEMPLO as readonly string[]).includes(hora)
}

/**
 * Lo que pasa con cada toque. Lo que no corresponde al paso (o un servicio,
 * día u hora que no existe) deja el estado igual: un toque doble no salta
 * pasos.
 */
export function avanzarLaDemo(estado: EstadoDeLaDemo, accion: AccionDeLaDemo): EstadoDeLaDemo {
  switch (accion.tipo) {
    case "elegir-servicio":
      if (estado.paso !== "servicio" || !servicioPorId(accion.servicio)) return estado
      return { paso: "hora", servicio: accion.servicio, dia: DIAS_DE_EJEMPLO[0].id }
    case "elegir-dia":
      if (estado.paso !== "hora" || !diaPorId(accion.dia)) return estado
      return { ...estado, dia: accion.dia }
    case "elegir-hora":
      if (estado.paso !== "hora" || !esHora(accion.hora)) return estado
      return { paso: "listo", servicio: estado.servicio, dia: estado.dia, hora: accion.hora }
    case "volver-a-probar":
      return ESTADO_INICIAL
  }
}
