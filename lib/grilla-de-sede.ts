import { z } from "zod"
import { diaDeLaSemana } from "@/lib/campos-del-panel"
import { horaAMinutos } from "@/lib/horario-dia"

/**
 * La grilla semanal de una sede (`PUT /api/configuracion/sedes/[id]/horarios`):
 * los días que atiende y, en cada uno, sus franjas "HH:MM". Es la forma que
 * viaja entre la pantalla y el servidor; en la base cada franja es una fila de
 * `horarios_laborales` con el `sedeId` de la sede. Cálculo puro, sin base.
 *
 * Reglas (las de la base, ver `horarios_laborales_sede_horas_check`, más las
 * que la aplicación pide para dar un error claro):
 * - Cada hora es "HH:MM" de 00:00 a 23:59, con dos cifras. Una hora como
 *   "9:00" o "24:00" no la acepta el CHECK de la base: se rechaza acá.
 * - El inicio es anterior al fin.
 * - Dentro de la misma sede y del mismo día las franjas no se pisan. Tocarse
 *   (una termina cuando la otra empieza) vale: 09:00–12:00 y 12:00–15:00.
 * - Un día aparece una sola vez. Un día sin franjas es un día que no se atiende.
 *
 * Lo que choca con OTRA sede lo revisa el endpoint con `choquesEntreSedes`
 * (`lib/sedes.ts`), porque necesita leer las demás sedes.
 */

/** Hasta cuántas franjas tiene un día (el mismo tope del horario general). */
export const FRANJAS_MAXIMAS_POR_DIA = 4

const MENSAJE_DE_HORA = "Las horas van como HH:MM, de 00:00 a 23:59"
const FORMA_DE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/

export interface FranjaDeLaGrilla {
  start: string
  end: string
}

export interface DiaDeLaGrilla {
  /** 0 domingo a 6 sábado. */
  dayOfWeek: number
  franjas: FranjaDeLaGrilla[]
}

/** Una fila de `horarios_laborales`, lo justo para armar la grilla. */
export interface FilaDeLaGrilla {
  dayOfWeek: number
  startTime: string
  endTime: string
  active?: boolean
}

const hora = () =>
  z
    .string({ required_error: MENSAJE_DE_HORA, invalid_type_error: MENSAJE_DE_HORA })
    .regex(FORMA_DE_HORA, MENSAJE_DE_HORA)

const franjaSchema = z
  .object({ start: hora(), end: hora() })
  .refine((franja) => horaAMinutos(franja.start) < horaAMinutos(franja.end), {
    message: "La hora de inicio debe ser anterior a la hora de fin",
    path: ["end"],
  })

const diaSchema = z.object({
  dayOfWeek: diaDeLaSemana(),
  franjas: z
    .array(franjaSchema, { invalid_type_error: "Las franjas de un día van en una lista" })
    .max(FRANJAS_MAXIMAS_POR_DIA, `Un día no puede tener más de ${FRANJAS_MAXIMAS_POR_DIA} franjas`),
})

/** Si dos franjas de la lista se pisan (inicio < fin del otro y fin > inicio del otro). Tocarse no es pisarse. */
export function franjasSePisan(franjas: readonly FranjaDeLaGrilla[]): boolean {
  for (let i = 0; i < franjas.length; i++) {
    for (let j = i + 1; j < franjas.length; j++) {
      if (
        horaAMinutos(franjas[i].start) < horaAMinutos(franjas[j].end) &&
        horaAMinutos(franjas[i].end) > horaAMinutos(franjas[j].start)
      ) {
        return true
      }
    }
  }
  return false
}

export const MENSAJE_DE_DIA_REPETIDO = "Cada día de la semana aparece una sola vez"
export const MENSAJE_DE_FRANJAS_PISADAS = "Las franjas de un mismo día no pueden pisarse"

export const grillaDeSedeSchema = z
  .object(
    {
      dias: z
        .array(diaSchema, { required_error: "Falta el horario de la sede", invalid_type_error: "Los días van en una lista" })
        .max(7, "La semana tiene siete días"),
    },
    { required_error: "Falta el horario de la sede", invalid_type_error: "Falta el horario de la sede" }
  )
  .superRefine((grilla, contexto) => {
    const vistos = new Set<number>()
    grilla.dias.forEach((dia, posicion) => {
      if (vistos.has(dia.dayOfWeek)) {
        contexto.addIssue({ code: z.ZodIssueCode.custom, message: MENSAJE_DE_DIA_REPETIDO, path: ["dias", posicion, "dayOfWeek"] })
      }
      vistos.add(dia.dayOfWeek)
      if (franjasSePisan(dia.franjas)) {
        contexto.addIssue({ code: z.ZodIssueCode.custom, message: MENSAJE_DE_FRANJAS_PISADAS, path: ["dias", posicion, "franjas"] })
      }
    })
  })

export type GrillaDeSede = z.infer<typeof grillaDeSedeSchema>

/**
 * Las filas que se guardan por una grilla ya validada: una por franja, activa,
 * del horario de la sede (`memberId` null, que es el de una sede y no el de un
 * integrante). Los días sin franjas no generan filas.
 */
export function filasDeLaGrilla(grilla: GrillaDeSede, destino: { businessId: string; sedeId: string }) {
  return grilla.dias.flatMap((dia) =>
    dia.franjas.map((franja) => ({
      businessId: destino.businessId,
      sedeId: destino.sedeId,
      memberId: null,
      dayOfWeek: dia.dayOfWeek,
      startTime: franja.start,
      endTime: franja.end,
      active: true,
    }))
  )
}

/**
 * La grilla de las filas guardadas, para la pantalla: sólo las activas, los
 * días de domingo (0) a sábado (6) y las franjas de cada día por hora de
 * inicio. No fusiona las que se tocan: se ve lo mismo que se guardó.
 */
export function grillaDeFilas(filas: readonly FilaDeLaGrilla[]): DiaDeLaGrilla[] {
  const porDia = new Map<number, FranjaDeLaGrilla[]>()
  for (const fila of filas) {
    if (fila.active === false) continue
    const franjas = porDia.get(fila.dayOfWeek) ?? []
    franjas.push({ start: fila.startTime, end: fila.endTime })
    porDia.set(fila.dayOfWeek, franjas)
  }
  return [...porDia.entries()]
    .sort(([a], [b]) => a - b)
    .map(([dayOfWeek, franjas]) => ({
      dayOfWeek,
      franjas: franjas.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end)),
    }))
}

/** Si la fila se puede guardar como franja de una sede (la base lo exige con un CHECK): "HH:MM" válido e inicio < fin. */
export function franjaGuardableEnUnaSede(fila: { startTime: string; endTime: string }): boolean {
  return (
    FORMA_DE_HORA.test(fila.startTime) &&
    FORMA_DE_HORA.test(fila.endTime) &&
    horaAMinutos(fila.startTime) < horaAMinutos(fila.endTime)
  )
}
