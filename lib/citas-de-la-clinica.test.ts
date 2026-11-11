import { describe, it, expect, beforeEach } from "vitest"
import type { Prisma } from "@prisma/client"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { soltarLoClinicoDeLaCita } from "./citas-de-la-clinica"

/**
 * Contra la base falsa, que tiene las FK NO ACTION de la clínica y el trigger
 * de las evoluciones: lo que se suelta tiene que dejar borrar la cita, y lo
 * que no se suelta tiene que seguir igual.
 */

const base = crearBaseFalsa()
const { prisma } = base
const db = prisma as unknown as Prisma.TransactionClient

const prestacion = (id: string, datos: Record<string, unknown>) => ({
  id,
  businessId: "n1",
  etapaId: "et1",
  orden: 1,
  nombre: "Obturación",
  valorCents: 3_500_000,
  ...datos,
})

beforeEach(() =>
  base.reiniciar({
    business: [
      { id: "n1", name: "Uno", slug: "uno", userId: "u1", type: "odontologia" },
      { id: "n2", name: "Dos", slug: "dos", userId: "u2", type: "odontologia" },
    ],
    user: [
      { id: "u1", name: "Ana", email: "a@test" },
      { id: "u2", name: "Otro", email: "o@test" },
    ],
    customer: [
      { id: "c1", businessId: "n1", name: "María" },
      { id: "c2", businessId: "n2", name: "Otra" },
    ],
    appointment: [
      { id: "cita-1", businessId: "n1", title: "Control", startTime: new Date(1), endTime: new Date(2), customerId: "c1" },
      { id: "cita-2", businessId: "n1", title: "Control", startTime: new Date(3), endTime: new Date(4), customerId: "c1" },
      { id: "cita-ajena", businessId: "n2", title: "Control", startTime: new Date(1), endTime: new Date(2), customerId: "c2" },
    ],
    evolucion: [
      { id: "ev1", businessId: "n1", customerId: "c1", texto: "Control", autorNombre: "Ana", appointmentId: "cita-1" },
      { id: "ev-ajena", businessId: "n2", customerId: "c2", texto: "Control", autorNombre: "Otro", appointmentId: "cita-ajena" },
    ],
    planDeTratamiento: [
      { id: "plan-1", businessId: "n1", customerId: "c1", version: 1, creadoPorNombre: "Ana" },
      { id: "plan-2", businessId: "n2", customerId: "c2", version: 1, creadoPorNombre: "Otro" },
    ],
    etapaDelPlan: [
      { id: "et1", businessId: "n1", planId: "plan-1", orden: 1, nombre: "Urgencia" },
      { id: "et2", businessId: "n2", planId: "plan-2", orden: 1, nombre: "Urgencia" },
    ],
    prestacionDelPlan: [
      prestacion("agendada", { estado: "agendada", appointmentId: "cita-1" }),
      prestacion("realizada", { orden: 2, estado: "realizada", appointmentId: "cita-1", realizadaEn: new Date(5) }),
      prestacion("de-otra-cita", { orden: 3, estado: "agendada", appointmentId: "cita-2" }),
      prestacion("ajena", { businessId: "n2", etapaId: "et2", estado: "agendada", appointmentId: "cita-ajena" }),
    ],
  })
)

const fila = (modelo: "prestacionDelPlan" | "evolucion", id: string) => base.buscar(modelo, { id })[0]

describe("soltarLoClinicoDeLaCita", () => {
  it("al cancelar: la agendada vuelve a por agendar; la realizada y la evolución conservan la cita", async () => {
    await soltarLoClinicoDeLaCita(db, "n1", "cita-1", "cancela")

    expect(fila("prestacionDelPlan", "agendada")).toMatchObject({ estado: "por-agendar", appointmentId: null })
    expect(fila("prestacionDelPlan", "realizada")).toMatchObject({ estado: "realizada", appointmentId: "cita-1" })
    expect(fila("evolucion", "ev1")).toMatchObject({ appointmentId: "cita-1" })
    expect(fila("prestacionDelPlan", "de-otra-cita")).toMatchObject({ estado: "agendada", appointmentId: "cita-2" })
  })

  it("al borrar: suelta todo lo de la cita (la realizada sigue realizada) y la cita se puede borrar", async () => {
    await expect(prisma.appointment.delete({ where: { id: "cita-1" } })).rejects.toMatchObject({ code: "P2003" })

    await soltarLoClinicoDeLaCita(db, "n1", "cita-1", "borra")
    await prisma.appointment.delete({ where: { id: "cita-1" } })

    expect(fila("prestacionDelPlan", "agendada")).toMatchObject({ estado: "por-agendar", appointmentId: null })
    expect(fila("prestacionDelPlan", "realizada")).toMatchObject({ estado: "realizada", appointmentId: null, realizadaEn: new Date(5) })
    expect(fila("evolucion", "ev1")).toMatchObject({ appointmentId: null, texto: "Control" })
  })

  it("acotado al negocio: con el id de una cita ajena no toca nada", async () => {
    const antes = base.volcado()

    await soltarLoClinicoDeLaCita(db, "n1", "cita-ajena", "borra")

    expect(base.volcado()).toEqual(antes)
  })
})
