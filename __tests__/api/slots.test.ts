import { describe, it, expect } from "vitest"
import { generarSlots } from "@/app/api/reservar/[slug]/slots/route"

function makeAppt(horaIni: string, horaFin: string) {
  const [hI, mI] = horaIni.split(":").map(Number)
  const [hF, mF] = horaFin.split(":").map(Number)
  const start = new Date(2024, 0, 1, hI, mI)
  const end = new Date(2024, 0, 1, hF, mF)
  return { startTime: start, endTime: end }
}

describe("generarSlots()", () => {
  it("returns empty when duration > available window", () => {
    // 1-hour window (09:00–10:00), 90-min duration → no slot fits
    expect(generarSlots("09:00", "10:00", 90, [])).toEqual([])
  })

  it("includes slot exactly at boundary (endTime - duration)", () => {
    // 09:00–10:30 window (90 min), 90-min slot → exactly ["09:00"]
    expect(generarSlots("09:00", "10:30", 90, [])).toEqual(["09:00"])
  })

  it("returns empty when all-day blocking appointment occupies the window", () => {
    // Full window blocked 09:00–19:00
    const allDay = [makeAppt("09:00", "19:00")]
    expect(generarSlots("09:00", "19:00", 60, allDay)).toEqual([])
  })

  it("generates correct intervals for non-standard duration (75 min)", () => {
    // 09:00–12:00 (180 min), 75-min slots → 09:00 (fits), 10:15 (fits), 11:30 → 11:30+75=12:45 > 12:00 → excluded
    expect(generarSlots("09:00", "12:00", 75, [])).toEqual(["09:00", "10:15"])
  })

  it("returns only free slots on a partially occupied day", () => {
    // 09:00–12:00, 60-min slots, 10:00–11:00 booked → 09:00 free, 10:00 blocked, 11:00 free
    const booked = [makeAppt("10:00", "11:00")]
    expect(generarSlots("09:00", "12:00", 60, booked)).toEqual(["09:00", "11:00"])
  })
})
