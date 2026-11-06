import { describe, expect, it } from "vitest"
import type { PlanVigenteRespuesta, PrestacionRespuesta } from "@/lib/edicion-del-plan"
import {
  citasParaAgendar,
  citasParaEvolucion,
  cuandoEsLaCita,
  etapaEnCurso,
  leerValor,
  porcentajeRealizado,
  subtituloDelPaciente,
} from "./_formato"

const ZONA = "America/Santiago"

describe("subtituloDelPaciente", () => {
  it("dice lo que se sabe, en orden", () => {
    expect(
      subtituloDelPaciente({
        edad: 34,
        documento: "11.111.111-1",
        prevision: "isapre",
        desde: "2026-09-15T15:00:00.000Z",
        zona: ZONA,
        palabraPaciente: "paciente",
      })
    ).toBe("34 años · RUT 11.111.111-1 · Isapre · paciente desde septiembre de 2026")
  })

  it("sin ficha (el encargado no la ve), sólo el documento y desde cuándo", () => {
    expect(
      subtituloDelPaciente({ edad: null, documento: null, prevision: null, desde: "2026-01-10T15:00:00.000Z", zona: ZONA, palabraPaciente: "paciente" })
    ).toBe("paciente desde enero de 2026")
  })
})

describe("cuandoEsLaCita", () => {
  it("hoy y mañana, en palabras; lo demás con el día", () => {
    expect(cuandoEsLaCita("2026-11-06T13:30:00.000Z", ZONA, "2026-11-06")).toBe("Hoy, 10:30")
    expect(cuandoEsLaCita("2026-11-07T12:00:00.000Z", ZONA, "2026-11-06")).toBe("Mañana, 09:00")
    expect(cuandoEsLaCita("2026-11-12T13:30:00.000Z", ZONA, "2026-11-06")).toMatch(/^jue 12 nov, 10:30$/)
  })

  it("con el año si es de otro", () => {
    expect(cuandoEsLaCita("2027-01-12T13:30:00.000Z", ZONA, "2026-11-06")).toContain("2027")
  })
})

const prestacion = (estado: PrestacionRespuesta["estado"]): PrestacionRespuesta => ({
  id: estado,
  orden: 1,
  pieza: 16,
  caras: ["O"],
  serviceId: null,
  nombre: "Restauración",
  memberId: null,
  profesionalNombre: null,
  estado,
  valorCents: 4_800_000,
  appointmentId: null,
  realizadaEn: null,
  cita: null,
})

const plan = (etapas: PrestacionRespuesta["estado"][][]): PlanVigenteRespuesta => ({
  id: "p",
  version: 1,
  creadoPorNombre: "Valentina",
  createdAt: "2026-10-28T13:00:00.000Z",
  totales: { totalCents: 0, aprobadoCents: 0, realizadoCents: 0 },
  etapas: etapas.map((estados, indice) => ({
    id: `e${indice}`,
    orden: indice + 1,
    nombre: `Etapa ${indice + 1}`,
    estado: "aprobada",
    presentadaEn: null,
    aprobadaEn: null,
    aprobadaPorNombre: null,
    subtotalCents: 0,
    prestaciones: estados.map(prestacion),
  })),
})

describe("etapaEnCurso", () => {
  it("la primera con algo sin realizar", () => {
    expect(etapaEnCurso(plan([["realizada"], ["realizada", "agendada"], ["por-agendar"]]))).toMatchObject({ numero: 2, de: 3 })
  })

  it("una etapa vacía también está en curso", () => {
    expect(etapaEnCurso(plan([[]]))).toMatchObject({ numero: 1, de: 1 })
  })

  it("todo realizado, o sin etapas: ninguna", () => {
    expect(etapaEnCurso(plan([["realizada"], ["realizada"]]))).toBeNull()
    expect(etapaEnCurso(plan([]))).toBeNull()
  })
})

describe("porcentajeRealizado", () => {
  it("de lo aprobado, redondeado", () => {
    expect(porcentajeRealizado({ aprobadoCents: 30_000, realizadoCents: 10_000 })).toBe(33)
    expect(porcentajeRealizado({ aprobadoCents: 0, realizadoCents: 0 })).toBeNull()
    // Lo realizado puede venir de una etapa que volvió a por aprobar: no pasa de 100.
    expect(porcentajeRealizado({ aprobadoCents: 100, realizadoCents: 300 })).toBe(100)
  })
})

const cita = (id: string, startTime: string, status = "pendiente") => ({ id, title: "Control", startTime, status })

describe("citas que se ofrecen", () => {
  const ahora = new Date("2026-11-06T15:00:00.000Z")
  const citas = [
    cita("pasada", "2026-11-01T13:00:00.000Z", "completada"),
    cita("hoy-temprano", "2026-11-06T12:00:00.000Z", "confirmada"),
    cita("lejana", "2026-11-20T13:00:00.000Z"),
    cita("cercana", "2026-11-10T13:00:00.000Z", "confirmada"),
    cita("cancelada", "2026-11-12T13:00:00.000Z", "cancelada"),
    cita("hoy-tarde", "2026-11-06T20:00:00.000Z"),
  ]

  it("para agendar: las que vienen y siguen en pie, de la más cercana a la más lejana", () => {
    expect(citasParaAgendar(citas, ahora).map((c) => c.id)).toEqual(["hoy-tarde", "cercana", "lejana"])
  })

  it("para una evolución: hasta hoy y no canceladas, de la más reciente a la más vieja", () => {
    expect(citasParaEvolucion(citas, ZONA, "2026-11-06").map((c) => c.id)).toEqual(["hoy-tarde", "hoy-temprano", "pasada"])
  })
})

describe("leerValor", () => {
  it("lee pesos chilenos y los pasa a centavos", () => {
    expect(leerValor("45.000")).toEqual({ ok: true, centavos: 4_500_000 })
    expect(leerValor("45000")).toEqual({ ok: true, centavos: 4_500_000 })
  })

  it("vacío es sin valor", () => {
    expect(leerValor("  ")).toEqual({ ok: true, centavos: null })
  })

  it("lo que no se puede leer o no sirve, con su motivo", () => {
    expect(leerValor("cuarenta").ok).toBe(false)
    expect(leerValor("-100").ok).toBe(false)
  })
})
