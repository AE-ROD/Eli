import { describe, it, expect, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import {
  ESTADOS_QUE_LIBERAN,
  conflictosDelTramo,
  estaLibre,
  leerOcupacion,
  ocupaElHorario,
  sePisan,
  wheresDeOcupacion,
  type BaseDeOcupacion,
  type Ocupacion,
} from "./ocupacion"

const N1 = "n1"
const N2 = "n2"
/** Horas de un mismo día, en UTC: el módulo no sabe de zonas, compara instantes. */
const h = (hora: string) => new Date(`2026-10-20T${hora}:00.000Z`)

const base = crearBaseFalsa()
const db = base.prisma as unknown as BaseDeOcupacion

beforeEach(() => {
  base.reiniciar({
    user: [{ id: "u1", name: "Ana", email: "a@t" }, { id: "u2", name: "Otro", email: "o@t" }],
    business: [
      { id: N1, name: "Uno", slug: "uno", userId: "u1" },
      { id: N2, name: "Dos", slug: "dos", userId: "u2" },
    ],
    businessMember: [
      { id: "carla", businessId: N1, userId: "u1" },
      { id: "pedro", businessId: N1, userId: "u1" },
    ],
    appointment: [
      { id: "c-carla", businessId: N1, memberId: "carla", title: "Corte", startTime: h("10:00"), endTime: h("11:00") },
      { id: "c-cancelada", businessId: N1, memberId: "carla", title: "Corte", status: "cancelada", startTime: h("12:00"), endTime: h("13:00") },
      { id: "c-no-vino", businessId: N1, memberId: "carla", title: "Corte", status: "no-asistio", startTime: h("14:00"), endTime: h("15:00") },
      { id: "c-pedro", businessId: N1, memberId: "pedro", title: "Corte", startTime: h("10:00"), endTime: h("11:00") },
      { id: "c-sin-asignar", businessId: N1, memberId: null, title: "Corte", startTime: h("10:00"), endTime: h("11:00") },
      // Dato sucio a propósito: otro negocio con el mismo profesional.
      { id: "c-ajena", businessId: N2, memberId: "carla", title: "Corte", startTime: h("16:00"), endTime: h("17:00") },
    ],
    timeBlock: [
      { id: "b-carla", businessId: N1, memberId: "carla", startTime: h("13:00"), endTime: h("14:00"), motivo: "Almuerzo" },
      { id: "b-pedro", businessId: N1, memberId: "pedro", startTime: h("13:00"), endTime: h("14:00") },
      { id: "b-negocio", businessId: N1, memberId: null, startTime: h("18:00"), endTime: h("20:00"), motivo: "Reunión" },
      { id: "b-ajeno", businessId: N2, memberId: "carla", startTime: h("16:00"), endTime: h("17:00") },
      { id: "b-ajeno-negocio", businessId: N2, memberId: null, startTime: h("08:00"), endTime: h("20:00") },
    ],
  })
})

const ids = (ocupacion: Ocupacion) => ({
  citas: ocupacion.citas.map((c) => c.id),
  bloqueos: ocupacion.bloqueos.map((b) => b.id),
})

describe("ocupaElHorario", () => {
  it("las canceladas y las de 'no vino' liberan el horario; el resto lo ocupa", () => {
    expect([...ESTADOS_QUE_LIBERAN].sort()).toEqual(["cancelada", "no-asistio"])
    expect(ocupaElHorario("cancelada")).toBe(false)
    expect(ocupaElHorario("no-asistio")).toBe(false)
    for (const estado of ["pendiente", "confirmada", "en-progreso", "completada", "desconocido"]) {
      expect(ocupaElHorario(estado)).toBe(true)
    }
  })
})

describe("sePisan", () => {
  it("compartir un instante es pisarse; tocarse no", () => {
    expect(sePisan({ startTime: h("10:00"), endTime: h("11:00") }, { startTime: h("10:59"), endTime: h("12:00") })).toBe(true)
    expect(sePisan({ startTime: h("10:00"), endTime: h("11:00") }, { startTime: h("11:00"), endTime: h("12:00") })).toBe(false)
    expect(sePisan({ startTime: h("10:00"), endTime: h("12:00") }, { startTime: h("10:30"), endTime: h("11:00") })).toBe(true)
  })
})

describe("leerOcupacion", () => {
  const todoElDia = { desde: h("00:00"), hasta: new Date("2026-10-21T00:00:00.000Z") }

  it("con profesional: sus citas activas, sus bloqueos y los de todo el negocio", async () => {
    const ocupacion = await leerOcupacion(db, { businessId: N1, memberId: "carla", ...todoElDia })

    expect(ids(ocupacion)).toEqual({ citas: ["c-carla"], bloqueos: ["b-carla", "b-negocio"] })
  })

  it("nada de otro negocio entra, aunque diga el mismo profesional", async () => {
    const ocupacion = await leerOcupacion(db, { businessId: N1, memberId: "carla", ...todoElDia })

    expect(ocupacion.citas.map((c) => c.id)).not.toContain("c-ajena")
    expect(ocupacion.bloqueos.map((b) => b.id)).not.toContain("b-ajeno")
    expect(ocupacion.bloqueos.map((b) => b.id)).not.toContain("b-ajeno-negocio")
  })

  it("sin profesional: ninguna cita (no hay con quién chocar) y sólo los bloqueos de todo el negocio", async () => {
    const ocupacion = await leerOcupacion(db, { businessId: N1, memberId: null, ...todoElDia })

    expect(ids(ocupacion)).toEqual({ citas: [], bloqueos: ["b-negocio"] })
  })

  it("sólo lo que se pisa con el rango: tocar el borde no cuenta", async () => {
    const ocupacion = await leerOcupacion(db, { businessId: N1, memberId: "carla", desde: h("11:00"), hasta: h("13:00") })

    expect(ids(ocupacion)).toEqual({ citas: [], bloqueos: [] })
  })

  it("la cita que se mueve no choca consigo misma", async () => {
    const ocupacion = await leerOcupacion(db, {
      businessId: N1,
      memberId: "carla",
      ...todoElDia,
      ignorarCitaId: "c-carla",
    })

    expect(ocupacion.citas).toEqual([])
  })

  it("devuelve lo necesario para decidir y explicar: tramo, profesional, estado y motivo", async () => {
    const ocupacion = await leerOcupacion(db, { businessId: N1, memberId: "carla", ...todoElDia })

    expect(ocupacion.citas[0]).toEqual({
      id: "c-carla",
      memberId: "carla",
      status: "pendiente",
      startTime: h("10:00"),
      endTime: h("11:00"),
    })
    expect(ocupacion.bloqueos[0]).toEqual({
      id: "b-carla",
      memberId: "carla",
      motivo: "Almuerzo",
      startTime: h("13:00"),
      endTime: h("14:00"),
    })
  })
})

describe("wheresDeOcupacion", () => {
  it("siempre acota al negocio, y sin profesional no consulta citas", () => {
    const conProfesional = wheresDeOcupacion({ businessId: N1, memberId: "carla", desde: h("00:00"), hasta: h("23:00") })
    const sinProfesional = wheresDeOcupacion({ businessId: N1, memberId: null, desde: h("00:00"), hasta: h("23:00") })

    expect(conProfesional.citas).toMatchObject({ businessId: N1, memberId: "carla" })
    expect(conProfesional.bloqueos).toMatchObject({ businessId: N1 })
    expect(sinProfesional.citas).toBeNull()
    expect(sinProfesional.bloqueos).toMatchObject({ businessId: N1, memberId: null })
  })
})

describe("conflictosDelTramo y estaLibre", () => {
  it("se lee el día una vez y se prueba cada tramo sin volver a la base", async () => {
    const dia = await leerOcupacion(db, {
      businessId: N1,
      memberId: "carla",
      desde: h("00:00"),
      hasta: new Date("2026-10-21T00:00:00.000Z"),
    })

    expect(ids(conflictosDelTramo(dia, { startTime: h("10:30"), endTime: h("11:30") }))).toEqual({
      citas: ["c-carla"],
      bloqueos: [],
    })
    expect(ids(conflictosDelTramo(dia, { startTime: h("13:30"), endTime: h("14:30") }))).toEqual({
      citas: [],
      bloqueos: ["b-carla"],
    })
    expect(estaLibre(dia, { startTime: h("11:00"), endTime: h("12:00") })).toBe(true)
    // La cancelada (12–13) y la de "no vino" (14–15) no ocupan.
    expect(estaLibre(dia, { startTime: h("12:00"), endTime: h("13:00") })).toBe(true)
    expect(estaLibre(dia, { startTime: h("14:00"), endTime: h("15:00") })).toBe(true)
    expect(estaLibre(dia, { startTime: h("19:00"), endTime: h("19:30") })).toBe(false)
  })

  it("una cita que libera nunca cuenta, aunque llegue en la lista", () => {
    const armadaAMano: Ocupacion = {
      citas: [{ id: "x", memberId: "carla", status: "no-asistio", startTime: h("10:00"), endTime: h("11:00") }],
      bloqueos: [],
    }

    expect(estaLibre(armadaAMano, { startTime: h("10:00"), endTime: h("11:00") })).toBe(true)
  })
})
