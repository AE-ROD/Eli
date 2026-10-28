import { describe, it, expect, beforeEach } from "vitest"
import type { Prisma } from "@prisma/client"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"
import { advertenciasDeAgenda } from "./advertencias-de-agenda"

/** Santiago en octubre de 2026 está en UTC-3. El 20 de octubre de 2026 es martes. */
const santiago = (hora: string, fecha = "2026-10-20") => new Date(`${fecha}T${hora}:00.000-03:00`)
const tramo = (inicio: string, fin: string) => ({ startTime: santiago(inicio), endTime: santiago(fin) })

const base = crearBaseFalsa()
const db = base.prisma as unknown as Prisma.TransactionClient

beforeEach(() => {
  base.reiniciar({
    ...datosBase(),
    appointment: [
      { id: "cita", businessId: NEGOCIO, memberId: "m-carla", title: "Corte", startTime: santiago("10:00"), endTime: santiago("11:00") },
    ],
    timeBlock: [
      { id: "b", businessId: NEGOCIO, memberId: "m-carla", startTime: santiago("10:30"), endTime: santiago("12:00"), motivo: "Trámite" },
      { id: "b-ajeno", businessId: OTRO_NEGOCIO, memberId: null, startTime: santiago("00:00"), endTime: santiago("23:00") },
    ],
    workSchedule: [{ id: "h", businessId: NEGOCIO, memberId: null, dayOfWeek: 2, startTime: "09:00", endTime: "19:00" }],
  })
})

describe("advertenciasDeAgenda", () => {
  it("junta choque, bloqueo y horario, en ese orden", async () => {
    const advertencias = await advertenciasDeAgenda(db, {
      businessId: NEGOCIO,
      citaId: null,
      tramo: { startTime: santiago("10:45"), endTime: santiago("19:30") },
      memberId: "m-carla",
    })

    expect(advertencias.map((a) => a.tipo)).toEqual(["choque", "bloqueo", "fuera-de-horario"])
    expect(advertencias[1].mensaje).toBe("Carla Profesional tiene bloqueado de 10:30 a 12:00 (Trámite).")
  })

  it("la cita que se mueve no choca consigo misma", async () => {
    const advertencias = await advertenciasDeAgenda(db, {
      businessId: NEGOCIO,
      citaId: "cita",
      tramo: tramo("10:00", "10:30"),
      memberId: "m-carla",
    })

    expect(advertencias).toEqual([])
  })

  it("nada de otro negocio cuenta: su bloqueo de todo el día no se advierte", async () => {
    const advertencias = await advertenciasDeAgenda(db, {
      businessId: NEGOCIO,
      citaId: null,
      tramo: tramo("15:00", "16:00"),
      memberId: null,
    })

    expect(advertencias).toEqual([])
  })
})
