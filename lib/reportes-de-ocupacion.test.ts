import { describe, it, expect } from "vitest"
import {
  calcularInasistencia,
  calcularOcupacion,
  clasificarClientes,
  comparar,
  diasDelPeriodo,
  restar,
  solape,
  unir,
} from "./reportes-de-ocupacion"

const ZONA = "America/Santiago"
/** Santiago en octubre de 2026 es UTC-3. 19/10 es lunes. */
const s = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00.000-03:00`)
const cita = (memberId: string | null, fecha: string, inicio: string, fin: string, status = "confirmada") => ({
  memberId,
  status,
  startTime: s(fecha, inicio),
  endTime: s(fecha, fin),
})

const HORARIO_DEL_NEGOCIO = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  memberId: null,
  dayOfWeek,
  startTime: "09:00",
  endTime: "19:00",
}))
const MIEMBROS = [
  { id: "m-carla", nombre: "Carla" },
  { id: "m-pedro", nombre: "Pedro" },
]

describe("intervalos", () => {
  it("unir fusiona los que se pisan o se tocan", () => {
    expect(unir([{ inicio: 5, fin: 8 }, { inicio: 0, fin: 5 }, { inicio: 10, fin: 12 }, { inicio: 3, fin: 3 }])).toEqual([
      { inicio: 0, fin: 8 },
      { inicio: 10, fin: 12 },
    ])
  })

  it("restar abre huecos y recorta bordes", () => {
    expect(restar([{ inicio: 0, fin: 10 }], [{ inicio: 2, fin: 4 }, { inicio: 8, fin: 20 }])).toEqual([
      { inicio: 0, fin: 2 },
      { inicio: 4, fin: 8 },
    ])
    expect(restar([{ inicio: 0, fin: 10 }], [{ inicio: -5, fin: 50 }])).toEqual([])
  })

  it("solape no cuenta dos veces lo que se pisa", () => {
    expect(solape([{ inicio: 0, fin: 6 }, { inicio: 3, fin: 9 }], [{ inicio: 2, fin: 20 }])).toBe(7)
  })

  it("diasDelPeriodo incluye los dos extremos y cruza meses", () => {
    expect(diasDelPeriodo("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"])
  })
})

describe("calcularOcupacion", () => {
  const dias = ["2026-10-19", "2026-10-20"]

  it("citas que ocupan, dentro del horario, sin contar dos veces ni las canceladas", () => {
    const resultado = calcularOcupacion({
      dias,
      zona: ZONA,
      miembros: MIEMBROS,
      filas: HORARIO_DEL_NEGOCIO,
      bloqueos: [],
      citas: [
        cita("m-carla", "2026-10-19", "10:00", "11:00"),
        cita("m-carla", "2026-10-19", "10:30", "11:30", "pendiente"),
        cita("m-carla", "2026-10-19", "12:00", "13:00", "cancelada"),
        cita("m-carla", "2026-10-19", "13:00", "14:00", "no-asistio"),
        // Fuera de su horario: no infla la ocupación.
        cita("m-carla", "2026-10-19", "20:00", "21:00"),
        cita("m-carla", "2026-10-20", "09:00", "10:00", "completada"),
      ],
    })
    const carla = resultado.porProfesional[0]
    expect(carla).toMatchObject({ minutosDisponibles: 1200, minutosOcupados: 150 })
    expect(carla.ocupacion).toBeCloseTo(150 / 1200)
  })

  it("sin citas es 0, no NaN; sin horario es null", () => {
    const conHorario = calcularOcupacion({ dias, zona: ZONA, miembros: MIEMBROS, filas: HORARIO_DEL_NEGOCIO, bloqueos: [], citas: [] })
    expect(conHorario.porProfesional.map((p) => p.ocupacion)).toEqual([0, 0])
    expect(conHorario.total.ocupacion).toBe(0)

    const sinHorario = calcularOcupacion({ dias, zona: ZONA, miembros: MIEMBROS, filas: [], bloqueos: [], citas: [] })
    expect(sinHorario.porProfesional.map((p) => p.ocupacion)).toEqual([null, null])
    expect(sinHorario.total.ocupacion).toBeNull()
  })

  it("horario propio manda; el bloqueo de todo el negocio descuenta a todos y el propio sólo al suyo", () => {
    const resultado = calcularOcupacion({
      dias,
      zona: ZONA,
      miembros: MIEMBROS,
      filas: [
        ...HORARIO_DEL_NEGOCIO,
        // Pedro sólo atiende los martes de 15 a 19.
        { memberId: "m-pedro", dayOfWeek: 2, startTime: "15:00", endTime: "19:00" },
      ],
      bloqueos: [
        // El negocio cierra el martes de 9 a 16.
        { memberId: null, startTime: s("2026-10-20", "09:00"), endTime: s("2026-10-20", "16:00") },
        // Carla tiene un trámite el lunes de 9 a 10.
        { memberId: "m-carla", startTime: s("2026-10-19", "09:00"), endTime: s("2026-10-19", "10:00") },
      ],
      citas: [cita("m-pedro", "2026-10-20", "16:00", "17:00")],
    })
    const [carla, pedro] = resultado.porProfesional
    expect(carla.minutosDisponibles).toBe(600 - 60 + 600 - 420)
    expect(pedro.minutosDisponibles).toBe(180)
    expect(pedro.minutosOcupados).toBe(60)
    expect(resultado.total).toMatchObject({ minutosDisponibles: 900, minutosOcupados: 60 })
  })

  it("el día del cambio de hora (domingo 6/9/2026) se mide con su largo real", () => {
    const resultado = calcularOcupacion({
      dias: ["2026-09-06"],
      zona: ZONA,
      miembros: [MIEMBROS[0]],
      filas: [{ memberId: null, dayOfWeek: 0, startTime: "00:00", endTime: "03:00" }],
      bloqueos: [],
      citas: [],
    })
    // 00:00 no existe ese día: el reloj salta a la 01:00. De 01:00 a 03:00 son dos horas.
    expect(resultado.porProfesional[0].minutosDisponibles).toBe(120)
  })
})

describe("calcularInasistencia", () => {
  const ahora = s("2026-10-21", "12:00")

  it("no vino sobre las pasadas no canceladas, total y por profesional", () => {
    const resultado = calcularInasistencia(
      [
        cita("m-carla", "2026-10-19", "10:00", "11:00", "no-asistio"),
        cita("m-carla", "2026-10-19", "12:00", "13:00", "completada"),
        cita("m-carla", "2026-10-19", "14:00", "15:00", "cancelada"),
        cita("m-pedro", "2026-10-20", "10:00", "11:00", "confirmada"),
        cita(null, "2026-10-20", "10:00", "11:00", "no-asistio"),
        // Futura: todavía no cuenta.
        cita("m-pedro", "2026-10-22", "10:00", "11:00", "confirmada"),
      ],
      MIEMBROS,
      ahora
    )
    expect(resultado.total).toEqual({ citas: 4, noVino: 2, tasa: 0.5 })
    expect(resultado.porProfesional).toEqual([
      { id: "m-carla", nombre: "Carla", citas: 2, noVino: 1, tasa: 0.5 },
      { id: "m-pedro", nombre: "Pedro", citas: 1, noVino: 0, tasa: 0 },
      { id: null, nombre: "Sin asignar", citas: 1, noVino: 1, tasa: 1 },
    ])
  })

  it("sin citas, la tasa es null y no NaN", () => {
    expect(calcularInasistencia([], MIEMBROS, ahora).total).toEqual({ citas: 0, noVino: 0, tasa: null })
  })
})

describe("clasificarClientes y comparar", () => {
  it("nuevo es quien no tenía historia; un cliente con dos atenciones cuenta una vez", () => {
    expect(
      clasificarClientes(
        [{ customerId: "c-1" }, { customerId: "c-1" }, { customerId: "c-2" }, { customerId: null }],
        new Set(["c-2", "c-9"])
      )
    ).toEqual({ nuevos: 1, recurrentes: 1, sinFicha: 1 })
  })

  it("comparar: relativo para cantidades, puntos para tasas, null si lo anterior es 0 o no existe", () => {
    expect(comparar(5, 4, "cantidad")).toEqual({ actual: 5, anterior: 4, cambio: 0.25 })
    expect(comparar(0.5, 0.4, "tasa").cambio).toBeCloseTo(0.1)
    expect(comparar(3, 0, "cantidad").cambio).toBeNull()
    expect(comparar(0.3, null, "tasa").cambio).toBeNull()
    expect(comparar(null, 0.3, "tasa").cambio).toBeNull()
  })
})
