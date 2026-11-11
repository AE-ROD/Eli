import { describe, it, expect } from "vitest"
import {
  estadoDeLosSillones,
  presupuestosPorResponder,
  salaDeEspera,
  type AtencionEnEspera,
  type CitaDelSillon,
  type EtapaPorResponder,
} from "./inicio-de-la-clinica"
import type { Actor } from "./permisos"

const hora = (texto: string) => new Date(`2026-11-05T${texto}:00.000-03:00`)
const AHORA = hora("10:12")

const SILLONES = [
  { id: "sl-1", nombre: "Sillón 1", orden: 1 },
  { id: "sl-2", nombre: "Sillón 2", orden: 2 },
  { id: "sl-3", nombre: "Sillón 3", orden: 3 },
]

function cita(id: string, sillonId: string, inicio: string, fin: string, datos: Partial<CitaDelSillon> = {}): CitaDelSillon {
  return {
    id,
    sillonId,
    title: "Control",
    startTime: hora(inicio),
    endTime: hora(fin),
    status: "confirmada",
    customer: { id: `c-${id}`, name: "Paciente", lastName: id },
    member: { id: "m-1", user: { name: "Dra. Soto" } },
    visit: null,
    ...datos,
  }
}

describe("estadoDeLosSillones", () => {
  it("atendiendo: la cita cuya atención está en atención, desde que empezó", () => {
    const [sillon] = estadoDeLosSillones(
      SILLONES.slice(0, 1),
      [
        cita("jorge", "sl-1", "09:30", "10:30", {
          status: "en-progreso",
          title: "Endodoncia · pieza 36",
          customer: { id: "c-jorge", name: "Jorge", lastName: "Muñoz" },
          visit: { status: "en-atencion", startedAt: hora("09:34") },
        }),
        cita("benja", "sl-1", "10:45", "11:15"),
      ],
      AHORA
    )

    expect(sillon).toEqual({
      id: "sl-1",
      nombre: "Sillón 1",
      orden: 1,
      estado: "atendiendo",
      actual: {
        citaId: "jorge",
        titulo: "Endodoncia · pieza 36",
        paciente: { id: "c-jorge", nombre: "Jorge Muñoz" },
        odontologo: { id: "m-1", nombre: "Dra. Soto" },
        inicio: hora("09:30"),
        fin: hora("10:30"),
        desde: hora("09:34"),
      },
      siguiente: expect.objectContaining({ citaId: "benja", inicio: hora("10:45") }),
      libreHasta: null,
    })
  })

  it("una cita en progreso sin atención en el Tablero cuenta, desde su hora", () => {
    const [sillon] = estadoDeLosSillones(SILLONES.slice(0, 1), [cita("a", "sl-1", "09:50", "10:40", { status: "en-progreso" })], AHORA)

    expect(sillon.estado).toBe("atendiendo")
    expect(sillon.actual?.desde).toEqual(hora("09:50"))
  })

  it("libre: hasta la siguiente cita, que puede ser alguien que ya llegó y espera", () => {
    const [sillon] = estadoDeLosSillones(
      SILLONES.slice(1, 2),
      [
        // Ya cobrada: no cuenta.
        cita("andrea", "sl-2", "09:00", "09:45", { status: "en-progreso", visit: { status: "por-cobrar", startedAt: hora("09:01") } }),
        cita("camila", "sl-2", "10:30", "11:15", { visit: { status: "en-espera", startedAt: null } }),
        cita("rosa", "sl-2", "11:15", "12:00"),
      ],
      AHORA
    )

    expect(sillon).toMatchObject({
      estado: "libre",
      actual: null,
      libreHasta: hora("10:30"),
      siguiente: { citaId: "camila" },
    })
  })

  it("que la hora de la cita contenga ahora no basta para estar atendiendo", () => {
    const [sillon] = estadoDeLosSillones(SILLONES.slice(0, 1), [cita("a", "sl-1", "10:00", "10:30")], AHORA)

    // Atrasada: libre, con la siguiente que ya debió empezar.
    expect(sillon).toMatchObject({ estado: "libre", libreHasta: hora("10:00"), siguiente: { citaId: "a" } })
  })

  it("sin citas que vengan, libre el resto del día; las terminadas y las de otro sillón no cuentan", () => {
    const [sillon] = estadoDeLosSillones(
      SILLONES.slice(2, 3),
      [cita("pasada", "sl-3", "08:00", "09:00"), cita("otro", "sl-1", "11:00", "12:00")],
      AHORA
    )

    expect(sillon).toMatchObject({ estado: "libre", actual: null, siguiente: null, libreHasta: null })
  })

  it("una atención anulada no atiende: manda el estado de la cita", () => {
    const [sillon] = estadoDeLosSillones(
      SILLONES.slice(0, 1),
      [cita("a", "sl-1", "10:00", "10:30", { status: "confirmada", visit: { status: "anulada", startedAt: hora("10:01") } })],
      AHORA
    )

    expect(sillon.estado).toBe("libre")
  })

  it("respeta el orden de los sillones que recibe", () => {
    expect(estadoDeLosSillones(SILLONES, [], AHORA).map((sillon) => sillon.id)).toEqual(["sl-1", "sl-2", "sl-3"])
  })
})

describe("salaDeEspera", () => {
  const dueña: Actor = { rol: "owner", businessId: "n1", memberId: null, rubro: "odontologia" }
  const carla: Actor = { rol: "worker", businessId: "n1", memberId: "m-carla", rubro: "odontologia" }

  const atenciones: AtencionEnEspera[] = [
    {
      id: "v-pedro",
      customerId: "c-pedro",
      customerName: "Pedro Lagos",
      arrivedAt: hora("10:08"),
      appointmentId: null,
      appointment: null,
    },
    {
      id: "v-camila",
      customerId: "c-camila",
      customerName: "Camila Rojas",
      arrivedAt: hora("10:00"),
      appointmentId: "cita-camila",
      appointment: { businessId: "n1", memberId: "m-pedro", title: "Restauración · pieza 16", sillon: { id: "sl-2", nombre: "Sillón 2" } },
    },
  ]

  it("cuántos esperan, la mayor espera y la lista, de quien más espera a quien menos", () => {
    expect(salaDeEspera(dueña, atenciones, AHORA)).toEqual({
      cantidad: 2,
      mayorEsperaMinutos: 12,
      lista: [
        {
          atencionId: "v-camila",
          citaId: "cita-camila",
          paciente: { id: "c-camila", nombre: "Camila Rojas" },
          minutos: 12,
          titulo: "Restauración · pieza 16",
          sillon: { id: "sl-2", nombre: "Sillón 2" },
        },
        {
          atencionId: "v-pedro",
          citaId: null,
          paciente: { id: "c-pedro", nombre: "Pedro Lagos" },
          minutos: 4,
          titulo: null,
          sillon: null,
        },
      ],
    })
  })

  it("de la cita de un colega, el odontólogo no ve ni el título ni el sillón", () => {
    const [camila] = salaDeEspera(carla, atenciones, AHORA).lista

    expect(camila).toMatchObject({ atencionId: "v-camila", citaId: null, titulo: null, sillon: null })
  })

  it("sin nadie, la mayor espera es null; la lista se corta en el tope pero la cantidad no", () => {
    expect(salaDeEspera(dueña, [], AHORA)).toEqual({ cantidad: 0, mayorEsperaMinutos: null, lista: [] })
    expect(salaDeEspera(dueña, atenciones, AHORA, 1)).toMatchObject({ cantidad: 2, lista: [{ atencionId: "v-camila" }] })
  })
})

describe("presupuestosPorResponder", () => {
  const etapa = (id: string, valores: number[]): EtapaPorResponder => ({
    id,
    nombre: "Etapa 1",
    presentadaEn: hora("09:00"),
    planId: `plan-${id}`,
    plan: { customer: { id: `c-${id}`, name: "Diego", lastName: "Fuentes" } },
    prestaciones: valores.map((valorCents) => ({ valorCents })),
  })

  it("con montos: cantidad, total y el monto de cada una", () => {
    expect(presupuestosPorResponder([etapa("a", [30_000_00, 18_000_00]), etapa("b", [26_500_00])], true)).toEqual({
      cantidad: 2,
      totalCents: 74_500_00,
      lista: [
        { etapaId: "a", planId: "plan-a", etapa: "Etapa 1", paciente: { id: "c-a", nombre: "Diego Fuentes" }, presentadaEn: hora("09:00"), montoCents: 48_000_00 },
        { etapaId: "b", planId: "plan-b", etapa: "Etapa 1", paciente: { id: "c-b", nombre: "Diego Fuentes" }, presentadaEn: hora("09:00"), montoCents: 26_500_00 },
      ],
    })
  })

  it("sin montos, las claves no viajan", () => {
    const resultado = presupuestosPorResponder([etapa("a", [100])], false)

    expect(resultado).not.toHaveProperty("totalCents")
    expect(resultado.lista[0]).not.toHaveProperty("montoCents")
    expect(resultado.cantidad).toBe(1)
  })

  it("la lista se corta en el tope; la cantidad y el total cuentan todas", () => {
    const resultado = presupuestosPorResponder([etapa("a", [1]), etapa("b", [2]), etapa("c", [3])], true, 2)

    expect(resultado.lista.map((presupuesto) => presupuesto.etapaId)).toEqual(["a", "b"])
    expect(resultado).toMatchObject({ cantidad: 3, totalCents: 6 })
  })
})
