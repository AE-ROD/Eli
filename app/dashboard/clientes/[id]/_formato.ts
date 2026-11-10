import { aCentavos, deCentavos, esPrecioValido } from "@/lib/atenciones"
import { formatearMonto, leerMonto } from "@/lib/dinero"
import type { EtapaRespuesta, PlanVigenteRespuesta } from "@/lib/edicion-del-plan"
import { nombreDePrevision } from "@/lib/ficha-clinica"
import { fechaYMinutosEn } from "@/lib/zona-horaria"
import type { CitaDelPaciente } from "./_datos"

/**
 * Los textos de la ficha clínica que salen de los datos: fechas en la zona
 * del negocio, el subtítulo del paciente, la etapa en curso, las citas que se
 * ofrecen y el valor de una prestación. Funciones puras: se prueban solas.
 */

/**
 * Las fechas se escriben a mano, con nombres fijos, y no con
 * `toLocaleDateString`: la ficha se dibuja primero en el servidor y después
 * en el navegador, y si sus versiones de ICU no escriben igual un mes ("sep"
 * o "sept", con punto o sin él), React encuentra un texto distinto al
 * hidratar. Los números del día y la hora en la zona sí son estables
 * (`fechaYMinutosEn`).
 */
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"]
const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]

/** El día, el mes (0 a 11), el año, el día de la semana (0 es domingo) y "HH:MM" de un instante en la zona. */
function partesEn(iso: string, zona: string) {
  const { fecha, minutos } = fechaYMinutosEn(new Date(iso), zona)
  const [anio, mes, dia] = fecha.split("-").map(Number)
  const hora = `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`
  return { fecha, anio, mes: mes - 1, dia, diaDeLaSemana: new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay(), hora }
}

/** "AAAA-MM-DD" del día siguiente. */
function diaSiguiente(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-").map(Number)
  return new Date(Date.UTC(anio, mes - 1, dia + 1)).toISOString().slice(0, 10)
}

/** "$48.000", desde centavos. */
export const pesos = (centavos: number) => formatearMonto(deCentavos(centavos))

/** "28 oct 2026". */
export function fechaCorta(iso: string, zona: string): string {
  const { dia, mes, anio } = partesEn(iso, zona)
  return `${dia} ${MESES_CORTOS[mes]} ${anio}`
}

/** "28 oct 2026, 10:30". */
export function fechaYHora(iso: string, zona: string): string {
  return `${fechaCorta(iso, zona)}, ${partesEn(iso, zona).hora}`
}

/**
 * Cuándo es una cita, para leerla de un vistazo: "Hoy, 10:30", "Mañana,
 * 09:00" o "mié 12 nov, 10:30" (con el año si no es el de `hoy`). `hoy` es el
 * día del negocio ("AAAA-MM-DD").
 */
export function cuandoEsLaCita(iso: string, zona: string, hoy: string): string {
  const { fecha, anio, mes, dia, diaDeLaSemana, hora } = partesEn(iso, zona)
  if (fecha === hoy) return `Hoy, ${hora}`
  if (fecha === diaSiguiente(hoy)) return `Mañana, ${hora}`
  const delAnio = fecha.slice(0, 4) === hoy.slice(0, 4) ? "" : ` ${anio}`
  return `${DIAS_CORTOS[diaDeLaSemana]} ${dia} ${MESES_CORTOS[mes]}${delAnio}, ${hora}`
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
  const { mes, anio } = partesEn(datos.desde, datos.zona)
  partes.push(`${datos.palabraPaciente} desde ${MESES[mes]} de ${anio}`)
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

// ─── Quién hace una prestación (el selector de cada fila del plan) ───────────

/** Los valores del selector que no son el id de un miembro. */
export const PROFESIONAL_SIN_ASIGNAR = ""
export const PROFESIONAL_DUEÑO = "duenio"
/** Quien la tiene hoy y no se puede volver a elegir (una persona que ya no está, o el dueño visto por otro). */
export const PROFESIONAL_ACTUAL = "actual"

interface OpcionDeProfesional {
  valor: string
  texto: string
}

/**
 * Lo que muestra el selector "quién la hace" de una fila: qué está elegido y
 * entre qué se puede elegir. La dueña elige entre ella, el equipo que atiende
 * y nadie; un odontólogo, entre él y nadie (el equipo sólo se le da a la
 * dueña). Quien la tiene hoy aparece siempre, aunque no se pueda elegir de
 * nuevo: si no, el selector mostraría otro nombre que el de la tabla.
 */
export function profesionalDeLaFila(
  prestacion: { memberId: string | null; profesionalNombre: string | null },
  quienMira: { rol: string; memberId: string | null; nombre: string },
  equipo: readonly { id: string; nombre: string }[]
): { valor: string; opciones: OpcionDeProfesional[] } {
  const esLaDuena = quienMira.rol === "owner"
  const yo = quienMira.nombre ? `Yo (${quienMira.nombre})` : "Yo"
  const valor = prestacion.memberId
    ? prestacion.memberId
    : prestacion.profesionalNombre
      ? esLaDuena && prestacion.profesionalNombre === quienMira.nombre
        ? PROFESIONAL_DUEÑO
        : PROFESIONAL_ACTUAL
      : PROFESIONAL_SIN_ASIGNAR

  const opciones: OpcionDeProfesional[] = []
  if (valor === PROFESIONAL_ACTUAL) opciones.push({ valor, texto: prestacion.profesionalNombre ?? "" })
  if (esLaDuena) opciones.push({ valor: PROFESIONAL_DUEÑO, texto: yo })
  else if (quienMira.memberId) opciones.push({ valor: quienMira.memberId, texto: yo })
  for (const miembro of equipo) {
    if (!opciones.some((opcion) => opcion.valor === miembro.id)) opciones.push({ valor: miembro.id, texto: miembro.nombre })
  }
  if (prestacion.memberId && !opciones.some((opcion) => opcion.valor === prestacion.memberId)) {
    opciones.push({ valor: prestacion.memberId, texto: prestacion.profesionalNombre ?? "Otro odontólogo" })
  }
  opciones.push({ valor: PROFESIONAL_SIN_ASIGNAR, texto: "Sin asignar" })
  return { valor, opciones }
}

/** Lo que se le manda al servidor al elegir `valor` en el selector; `null` si no cambia nada. */
export function cambioDeProfesional(valor: string): { delDueño: true } | { memberId: string | null } | null {
  if (valor === PROFESIONAL_ACTUAL) return null
  if (valor === PROFESIONAL_DUEÑO) return { delDueño: true }
  if (valor === PROFESIONAL_SIN_ASIGNAR) return { memberId: null }
  return { memberId: valor }
}
