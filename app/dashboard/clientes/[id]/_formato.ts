import { aCentavos, deCentavos, esPrecioValido } from "@/lib/atenciones"
import { formatearMonto, leerMonto } from "@/lib/dinero"
import type { EtapaRespuesta, PlanVigenteRespuesta } from "@/lib/edicion-del-plan"
import { nombreDePrevision } from "@/lib/ficha-clinica"
import { HORA_24 } from "@/lib/fechas"
import { fechaYMinutosEn } from "@/lib/zona-horaria"
import type { CitaDelPaciente } from "./_datos"

/**
 * Los textos de la ficha clínica que salen de los datos: fechas en la zona
 * del negocio, el subtítulo del paciente, la etapa en curso, las citas que se
 * ofrecen y el valor de una prestación. Funciones puras: se prueban solas.
 */

const IDIOMA = "es-CL"

/** "$48.000", desde centavos. */
export const pesos = (centavos: number) => formatearMonto(deCentavos(centavos))

/** "28 oct 2026". */
export function fechaCorta(iso: string, zona: string): string {
  return new Date(iso).toLocaleDateString(IDIOMA, { timeZone: zona, day: "numeric", month: "short", year: "numeric" })
}

/** "28 oct 2026, 10:30". */
export function fechaYHora(iso: string, zona: string): string {
  const hora = new Date(iso).toLocaleTimeString(IDIOMA, { timeZone: zona, hour: "2-digit", minute: "2-digit", ...HORA_24 })
  return `${fechaCorta(iso, zona)}, ${hora}`
}

/**
 * Cuándo es una cita, para leerla de un vistazo: "Hoy, 10:30", "Mañana,
 * 09:00" o "mié 12 nov, 10:30" (con el año si no es el de `hoy`). `hoy` es el
 * día del negocio ("AAAA-MM-DD").
 */
export function cuandoEsLaCita(iso: string, zona: string, hoy: string): string {
  const instante = new Date(iso)
  const hora = instante.toLocaleTimeString(IDIOMA, { timeZone: zona, hour: "2-digit", minute: "2-digit", ...HORA_24 })
  const dia = fechaYMinutosEn(instante, zona).fecha
  if (dia === hoy) return `Hoy, ${hora}`
  const [anio, mes, diaDelMes] = hoy.split("-").map(Number)
  const manana = new Date(Date.UTC(anio, mes - 1, diaDelMes + 1)).toISOString().slice(0, 10)
  if (dia === manana) return `Mañana, ${hora}`
  const mismoAnio = dia.slice(0, 4) === hoy.slice(0, 4)
  const fecha = instante.toLocaleDateString(IDIOMA, {
    timeZone: zona,
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(!mismoAnio && { year: "numeric" }),
  })
  return `${fecha.replace(/,/g, "")}, ${hora}`
}

/** "34 años · RUT 11.111.111-1 · Isapre · paciente desde septiembre de 2026": lo que se sabe, en ese orden. */
export function subtituloDelPaciente(datos: {
  edad: number | null
  documento: string | null
  prevision: string | null
  desde: string
  zona: string
  palabraPaciente: string
}): string {
  const partes: string[] = []
  if (datos.edad !== null) partes.push(datos.edad === 1 ? "1 año" : `${datos.edad} años`)
  // El documento del paciente en Chile es el RUT; se muestra como se guardó.
  if (datos.documento) partes.push(`RUT ${datos.documento}`)
  if (datos.prevision) partes.push(nombreDePrevision(datos.prevision))
  const mes = new Date(datos.desde).toLocaleDateString(IDIOMA, { timeZone: datos.zona, month: "long", year: "numeric" })
  partes.push(`${datos.palabraPaciente} desde ${mes}`)
  return partes.join(" · ")
}

/**
 * La etapa en curso del plan: la primera (en su orden) que tiene algo sin
 * realizar. `null` si el plan no tiene etapas o ya está todo realizado.
 */
export function etapaEnCurso(plan: PlanVigenteRespuesta): { numero: number; de: number; etapa: EtapaRespuesta } | null {
  const indice = plan.etapas.findIndex(
    (etapa) => etapa.prestaciones.length === 0 || etapa.prestaciones.some((prestacion) => prestacion.estado !== "realizada")
  )
  if (indice === -1) return null
  return { numero: indice + 1, de: plan.etapas.length, etapa: plan.etapas[indice] }
}

/** Cuánto de lo aprobado está realizado, en un porcentaje entero de 0 a 100; `null` sin nada aprobado. */
export function porcentajeRealizado(totales: { aprobadoCents: number; realizadoCents: number }): number | null {
  if (totales.aprobadoCents <= 0) return null
  return Math.min(100, Math.round((totales.realizadoCents / totales.aprobadoCents) * 100))
}

/**
 * Las citas a las que se puede agendar una prestación: las que todavía no
 * empezaron y siguen en pie (pendientes o confirmadas), de la más cercana a la
 * más lejana.
 */
export function citasParaAgendar(citas: readonly CitaDelPaciente[], ahora: Date): CitaDelPaciente[] {
  return citas
    .filter((cita) => (cita.status === "pendiente" || cita.status === "confirmada") && new Date(cita.startTime) > ahora)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
}

/**
 * Las citas a las que se puede colgar una evolución: las que ya empezaron
 * (o empiezan hoy) y no se cancelaron, de la más reciente a la más vieja. Una
 * evolución cuenta lo que se hizo: una cita de la semana que viene no va.
 */
export function citasParaEvolucion(citas: readonly CitaDelPaciente[], zona: string, hoy: string): CitaDelPaciente[] {
  return citas
    .filter((cita) => cita.status !== "cancelada" && fechaYMinutosEn(new Date(cita.startTime), zona).fecha <= hoy)
    .sort((a, b) => b.startTime.localeCompare(a.startTime))
}

/**
 * El valor escrito de una prestación, en centavos, o por qué no sirve. Vacío
 * es "sin valor" (`null`): con un servicio, el servidor copia su precio.
 */
export function leerValor(texto: string): { ok: true; centavos: number | null } | { ok: false; error: string } {
  if (texto.trim() === "") return { ok: true, centavos: null }
  const monto = leerMonto(texto)
  if (monto === null) return { ok: false, error: "Escribe el valor en pesos, por ejemplo 45.000" }
  if (!esPrecioValido(monto)) return { ok: false, error: "El valor no puede ser negativo ni tan alto" }
  return { ok: true, centavos: aCentavos(monto) }
}
