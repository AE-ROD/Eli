import { createElement, type ReactElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import type { Cita } from "../_datos"
import type { SedesDeLaAgenda } from "../_sedes"
import { ProveedorDeSedes } from "./sedes-de-la-agenda"
import { VistaDia } from "./vista-dia"
import { VistaSemana } from "./vista-semana"

// El rubro del panel lee la sesión; acá no hay sesión.
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null }) }))

/*
 * Las vistas de la agenda con y sin varias sedes (etapa 9, plan
 * Independiente), en su primera pintura. Con varias sedes cada hora dice la
 * suya; con una sola, sin sedes o sin proveedor, la agenda es la de siempre.
 * Santiago en octubre de 2026 está en UTC-3: las 13:00Z son las 10:00.
 */

const CITA: Cita = {
  id: "c1",
  title: "Corte",
  startTime: "2026-10-20T13:00:00.000Z",
  endTime: "2026-10-20T14:00:00.000Z",
  status: "confirmada",
  notes: null,
  price: null,
  customerId: "cl1",
  customer: { id: "cl1", name: "Ana", lastName: "Pérez", email: null, phone: null },
}

const citas: Cita[] = [
  { ...CITA, id: "en-providencia", sede: { id: "sede-providencia", nombre: "Providencia" } },
  { ...CITA, id: "sin-sede", title: "Color", startTime: "2026-10-20T16:00:00.000Z", endTime: "2026-10-20T17:00:00.000Z", sede: null },
]

const VARIAS: SedesDeLaAgenda = {
  modo: "varias",
  sedes: [
    { id: "sede-centro", nombre: "Centro" },
    { id: "sede-providencia", nombre: "Providencia" },
  ],
}
const UNA: SedesDeLaAgenda = { modo: "una", sedes: [{ id: "sede-centro", nombre: "Centro" }] }
const SIN: SedesDeLaAgenda = { modo: "una", sedes: [] }

const martes = new Date(2026, 9, 20)

const dia = () =>
  createElement(VistaDia, { fecha: martes, citas, horario: [], bloqueos: [], onSeleccionar: () => {}, onSeleccionarBloqueo: () => {} })
const semana = () =>
  createElement(VistaSemana, {
    dias: Array.from({ length: 7 }, (_, i) => new Date(2026, 9, 19 + i)),
    citas,
    horario: [],
    bloqueos: [],
    onSeleccionar: () => {},
    onSeleccionarBloqueo: () => {},
  })

const con = (sedes: SedesDeLaAgenda | null, vista: ReactElement) =>
  renderToString(sedes ? createElement(ProveedorDeSedes, { sedes, children: vista }) : vista)

/** El texto visible: sin etiquetas, para buscar frases enteras (React parte el texto con comentarios). */
const texto = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")

describe("VistaDia con sedes", () => {
  it("con varias sedes, la hora dice su sede junto a la hora; la que no tiene sede, nada", () => {
    const html = con(VARIAS, dia())

    expect(texto(html)).toContain("Providencia")
    // Una insignia, de la hora que tiene sede.
    expect(html.match(/lucide-map-pin/g)).toHaveLength(1)
  })

  it.each([
    ["con una sola sede", UNA],
    ["sin sedes", SIN],
    ["sin proveedor", null],
  ])("%s, la agenda es la de siempre: no nombra ninguna sede, aunque la hora traiga la suya", (_caso, sedes) => {
    const html = con(sedes, dia())

    expect(texto(html)).not.toContain("Providencia")
    expect(html).not.toContain("lucide-map-pin")
    // Y es exactamente la misma pintura que sin proveedor.
    expect(html).toBe(con(null, dia()))
  })
})

describe("VistaSemana con sedes", () => {
  it("con varias sedes, el nombre accesible de cada hora dice su sede", () => {
    const html = con(VARIAS, semana())

    expect(html).toMatch(/aria-label="[^"]*Ana Pérez, Corte[^"]*, sede Providencia[^"]*"/)
    // La hora sin sede no inventa una.
    expect(html).not.toMatch(/aria-label="[^"]*Color[^"]*sede /)
  })

  it.each([
    ["con una sola sede", UNA],
    ["sin sedes", SIN],
  ])("%s, la semana es la de siempre", (_caso, sedes) => {
    const html = con(sedes, semana())

    expect(html).not.toContain("sede Providencia")
    expect(html).toBe(con(null, semana()))
  })
})
