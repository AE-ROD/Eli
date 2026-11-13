import { describe, expect, it } from "vitest"
import type { PlanVigenteRespuesta, PrestacionRespuesta } from "@/lib/edicion-del-plan"
import {
  citasParaAgendar,
  citasParaEvolucion,
  PROFESIONAL_ACTUAL,
  PROFESIONAL_DUEÑO,
  PROFESIONAL_SIN_ASIGNAR,
  cambioDeProfesional,
  cuandoEsLaCita,
  etapaEnCurso,
  profesionalDeLaFila,
  fechaCorta,
  fechaYHora,
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
    expect(cuandoEsLaCita("2027-01-12T13:30:00.000Z", ZONA, "2026-11-06")).toBe("mar 12 ene 2027, 10:30")
  })

  it("mañana cruza el fin de mes y de año", () => {
    expect(cuandoEsLaCita("2027-01-01T12:00:00.000Z", ZONA, "2026-12-31")).toBe("Mañana, 09:00")
  })
})

describe("fechas de la ficha: escritas a mano, iguales en el servidor y en el navegador", () => {
  it("el día y la hora en la zona del negocio, no en la del proceso", () => {
    // 02:30 UTC del 1 de octubre es el 30 de septiembre a las 23:30 en Santiago.
    expect(fechaCorta("2026-10-01T02:30:00.000Z", ZONA)).toBe("30 sept 2026")
    expect(fechaYHora("2026-10-01T02:30:00.000Z", ZONA)).toBe("30 sept 2026, 23:30")
    expect(fechaYHora("2026-10-28T13:05:00.000Z", ZONA)).toBe("28 oct 2026, 10:05")
  })

  it("medianoche es 00:00, no 24:00", () => {
    expect(fechaYHora("2026-11-06T03:00:00.000Z", ZONA)).toBe("6 nov 2026, 00:00")
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

describe("profesionalDeLaFila y cambioDeProfesional", () => {
  const DUENA = { rol: "owner", memberId: null, nombre: "Ana" }
  const ODONTOLOGO = { rol: "worker", memberId: "m-luis", nombre: "Luis" }
  const EQUIPO = [{ id: "m-luis", nombre: "Luis" }, { id: "m-eva", nombre: "Eva" }]

  it("la dueña elige entre ella, el equipo y nadie; lo suyo se ve como suyo", () => {
    const { valor, opciones } = profesionalDeLaFila({ memberId: null, profesionalNombre: "Ana" }, DUENA, EQUIPO)
    expect(valor).toBe(PROFESIONAL_DUEÑO)
    expect(opciones.map((o) => o.texto)).toEqual(["Yo (Ana)", "Luis", "Eva", "Sin asignar"])
  })

  it("un odontólogo, entre él y nadie; quien la tiene hoy aparece aunque no se pueda volver a elegir", () => {
    const deEva = profesionalDeLaFila({ memberId: "m-eva", profesionalNombre: "Eva" }, ODONTOLOGO, [])
    expect(deEva.valor).toBe("m-eva")
    expect(deEva.opciones.map((o) => o.valor)).toEqual(["m-luis", "m-eva", PROFESIONAL_SIN_ASIGNAR])

    const deLaDuena = profesionalDeLaFila({ memberId: null, profesionalNombre: "Ana" }, ODONTOLOGO, [])
    expect(deLaDuena.valor).toBe(PROFESIONAL_ACTUAL)
    expect(deLaDuena.opciones[0]).toEqual({ valor: PROFESIONAL_ACTUAL, texto: "Ana" })
  })

  it("sin asignar, y qué se manda al elegir cada cosa", () => {
    expect(profesionalDeLaFila({ memberId: null, profesionalNombre: null }, ODONTOLOGO, []).valor).toBe(PROFESIONAL_SIN_ASIGNAR)
    expect(cambioDeProfesional(PROFESIONAL_DUEÑO)).toEqual({ delDueño: true })
    expect(cambioDeProfesional(PROFESIONAL_SIN_ASIGNAR)).toEqual({ memberId: null })
    expect(cambioDeProfesional("m-eva")).toEqual({ memberId: "m-eva" })
    expect(cambioDeProfesional(PROFESIONAL_ACTUAL)).toBeNull()
  })
})
