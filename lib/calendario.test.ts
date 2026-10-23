import { describe, it, expect } from "vitest"
import {
  escaparTexto,
  formatoUtc,
  generarIcs,
  instantesDeLaCita,
  plegarLinea,
  urlDeGoogleCalendar,
  type CitaParaCalendario,
} from "./calendario"

/**
 * Los esperados están escritos a mano, nunca calculados con `Date` local: la
 * suite da lo mismo con cualquier TZ del proceso.
 *
 * Santiago 2026: UTC-3 hasta el sábado 4 de abril a las 24:00 (vuelve a las
 * 23:00, UTC-4) y UTC-4 hasta el sábado 5 de septiembre a las 24:00 (salta a
 * la 01:00 del domingo 6, UTC-3).
 */

const cita: CitaParaCalendario = {
  id: "cita-123",
  servicio: "Corte + barba",
  negocio: "Barbería del Centro",
  fecha: "2026-10-15",
  hora: "10:30",
  duracionMinutos: 50,
  zona: "America/Santiago",
}

const AHORA = new Date("2026-10-10T12:00:00.000Z")

/** Las líneas lógicas del .ics: deshace el plegado y parte en CRLF. */
function lineasLogicas(ics: string): string[] {
  return ics.replace(/\r\n /g, "").split("\r\n").filter(Boolean)
}

describe("instantes de la cita en la zona del negocio", () => {
  it("en octubre Santiago está en UTC-3", () => {
    const { inicio, fin } = instantesDeLaCita(cita)
    expect(inicio.toISOString()).toBe("2026-10-15T13:30:00.000Z")
    expect(fin.toISOString()).toBe("2026-10-15T14:20:00.000Z")
  })

  it("en julio Santiago está en UTC-4", () => {
    const { inicio } = instantesDeLaCita({ ...cita, fecha: "2026-07-15" })
    expect(inicio.toISOString()).toBe("2026-07-15T14:30:00.000Z")
  })

  it("la noche que se atrasa la hora, la duración es real y no de reloj", () => {
    // 23:30 del 4 de abril existe dos veces: se toma la primera (UTC-3).
    const { inicio, fin } = instantesDeLaCita({ ...cita, fecha: "2026-04-04", hora: "23:30", duracionMinutos: 60 })
    expect(inicio.toISOString()).toBe("2026-04-05T02:30:00.000Z")
    expect(fin.toISOString()).toBe("2026-04-05T03:30:00.000Z")
  })

  it("una hora que el salto de septiembre se saltea se corre hacia adelante", () => {
    const { inicio } = instantesDeLaCita({ ...cita, fecha: "2026-09-06", hora: "00:30" })
    expect(inicio.toISOString()).toBe("2026-09-06T04:30:00.000Z")
  })
})

describe("formatoUtc", () => {
  it("escribe YYYYMMDDTHHMMSSZ sin milisegundos", () => {
    expect(formatoUtc(new Date("2026-10-15T13:30:05.123Z"))).toBe("20261015T133005Z")
  })
})

describe("generarIcs", () => {
  const ics = generarIcs(cita, AHORA)

  it("es un VCALENDAR con un VEVENT, en CRLF y terminado en CRLF", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true)
    expect(ics.endsWith("END:VEVENT\r\nEND:VCALENDAR\r\n")).toBe(true)
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/)
  })

  it("trae UID estable, DTSTAMP, inicio y fin en UTC y el título", () => {
    const lineas = lineasLogicas(ics)
    expect(lineas).toContain("UID:cita-123@eli")
    expect(lineas).toContain("DTSTAMP:20261010T120000Z")
    expect(lineas).toContain("DTSTART:20261015T133000Z")
    expect(lineas).toContain("DTEND:20261015T142000Z")
    expect(lineas).toContain("SUMMARY:Corte + barba en Barbería del Centro")
    expect(generarIcs(cita, new Date("2026-10-11T00:00:00Z"))).toContain("UID:cita-123@eli")
  })

  it("sin dirección no lleva LOCATION; con dirección, escapada", () => {
    expect(ics).not.toContain("LOCATION")
    const conDireccion = generarIcs({ ...cita, direccion: "Av. Italia 123, local 4; Ñuñoa" }, AHORA)
    expect(lineasLogicas(conDireccion)).toContain("LOCATION:Av. Italia 123\\, local 4\\; Ñuñoa")
  })

  it("escapa comas, punto y coma, barras y saltos de línea del texto", () => {
    const raro = generarIcs({ ...cita, servicio: "Corte, lavado; y\nbarba \\ extra" }, AHORA)
    expect(lineasLogicas(raro)).toContain("SUMMARY:Corte\\, lavado\\; y\\nbarba \\\\ extra en Barbería del Centro")
  })

  it("ninguna línea física pasa de 75 octetos, aunque el texto sea largo y con tildes", () => {
    const largo = generarIcs({ ...cita, negocio: "Peluquería Ñandú ".repeat(10).trim() }, AHORA)
    for (const linea of largo.split("\r\n")) {
      expect(new TextEncoder().encode(linea).length).toBeLessThanOrEqual(75)
    }
    expect(lineasLogicas(largo)).toContain(`SUMMARY:Corte + barba en ${"Peluquería Ñandú ".repeat(10).trim()}`)
  })
})

describe("escaparTexto", () => {
  it("escapa en el orden correcto: la barra primero", () => {
    expect(escaparTexto("a\\;b")).toBe("a\\\\\\;b")
    expect(escaparTexto("uno\r\ndos")).toBe("uno\\ndos")
  })
})

describe("plegarLinea", () => {
  it("una línea corta no cambia", () => {
    expect(plegarLinea("SUMMARY:Corte")).toBe("SUMMARY:Corte")
  })

  it("75 octetos exactos entran en una sola línea; 76 se pliegan", () => {
    expect(plegarLinea("a".repeat(75))).toBe("a".repeat(75))
    expect(plegarLinea("a".repeat(76))).toBe(`${"a".repeat(75)}\r\n a`)
  })

  it("la continuación lleva el espacio dentro de sus 75 octetos", () => {
    const plegada = plegarLinea("a".repeat(75 + 74 + 1))
    expect(plegada).toBe(`${"a".repeat(75)}\r\n ${"a".repeat(74)}\r\n a`)
  })

  it("no parte un carácter de dos bytes", () => {
    // 74 'a' + 'ñ' (2 bytes) = 76 octetos: la ñ pasa entera a la línea siguiente.
    expect(plegarLinea(`${"a".repeat(74)}ñ`)).toBe(`${"a".repeat(74)}\r\n ñ`)
  })
})

describe("urlDeGoogleCalendar", () => {
  it("arma el enlace de plantilla con título, fechas en UTC y detalles", () => {
    const url = new URL(urlDeGoogleCalendar(cita))
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render")
    expect(url.searchParams.get("action")).toBe("TEMPLATE")
    expect(url.searchParams.get("text")).toBe("Corte + barba en Barbería del Centro")
    expect(url.searchParams.get("dates")).toBe("20261015T133000Z/20261015T142000Z")
    expect(url.searchParams.get("details")).toContain("Barbería del Centro")
    expect(url.searchParams.has("location")).toBe(false)
  })

  it("en invierno las fechas salen con UTC-4", () => {
    const url = new URL(urlDeGoogleCalendar({ ...cita, fecha: "2026-07-15" }))
    expect(url.searchParams.get("dates")).toBe("20260715T143000Z/20260715T152000Z")
  })

  it("con dirección, la manda como location", () => {
    const url = new URL(urlDeGoogleCalendar({ ...cita, direccion: "Av. Italia 123" }))
    expect(url.searchParams.get("location")).toBe("Av. Italia 123")
  })
})
