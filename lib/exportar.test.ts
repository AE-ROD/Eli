import { describe, it, expect } from "vitest"
import {
  CABECERA_DE_ATENCIONES,
  CABECERA_DE_CLIENTES,
  fechaYHora,
  filasDeAtenciones,
  filasDeClientes,
  montoParaPlanilla,
  nombreDeArchivo,
  rangoDeExportacion,
} from "./exportar"
import { MARCA_DE_CLIENTE_ELIMINADO } from "./clientes-eliminados"
import { aceptaWhatsapp, sugerirMapeo } from "./importar-clientes"

const SANTIAGO = "America/Santiago"

describe("fechaYHora", () => {
  it("escribe el instante en la hora del negocio", () => {
    // 13:30 UTC del 19/10/2026 son las 10:30 en Santiago (UTC-3).
    expect(fechaYHora(new Date("2026-10-19T13:30:00.000Z"), SANTIAGO)).toBe("2026-10-19 10:30")
  })

  it("sin instante, vacío", () => {
    expect(fechaYHora(null, SANTIAGO)).toBe("")
  })
})

describe("filasDeClientes", () => {
  const cliente = {
    name: "Ana",
    lastName: "Pérez",
    cedula: null,
    phone: "+56912345678",
    email: "ana@correo.cl",
    tags: ["VIP", MARCA_DE_CLIENTE_ELIMINADO],
    notes: "Viene los martes",
    whatsappConsentAt: new Date("2026-10-19T13:30:00.000Z"),
    createdAt: new Date("2026-01-02T15:00:00.000Z"),
  }

  it("la cabecera primero y una fila por cliente, sin la marca de eliminado", () => {
    expect(filasDeClientes([cliente], SANTIAGO)).toEqual([
      [...CABECERA_DE_CLIENTES],
      ["Ana", "Pérez", null, "+56912345678", "ana@correo.cl", "VIP", "Viene los martes", "Sí", "2026-10-19 10:30", "2026-01-02 12:00"],
    ])
  })

  it("sin consentimiento dice No y no tiene fecha", () => {
    const [, fila] = filasDeClientes([{ ...cliente, whatsappConsentAt: null }], SANTIAGO)
    expect(fila.slice(7, 9)).toEqual(["No", ""])
  })

  it("lo que exporta lo vuelve a entender la importación: cabeceras y el Sí/No del consentimiento", () => {
    expect(sugerirMapeo([...CABECERA_DE_CLIENTES])).toMatchObject({ nombre: 0, apellido: 1, telefono: 3, email: 4, notas: 6, whatsapp: 7 })
    expect(aceptaWhatsapp("Sí")).toBe(true)
    expect(aceptaWhatsapp("No")).toBe(false)
  })
})

describe("filasDeAtenciones", () => {
  const atencion = {
    arrivedAt: new Date("2026-10-19T13:30:00.000Z"),
    paidAt: new Date("2026-10-19T14:30:00.000Z"),
    customerName: "Ana Pérez",
    status: "finalizada",
    totalCents: 1_800_050,
    services: [
      { serviceName: "Corte", professionalName: "Carla", priceCents: 800_000 },
      { serviceName: "Color", professionalName: "Carla", priceCents: 1_000_050 },
    ],
  }

  it("la cabecera primero; servicios y profesionales sin repetir; el total congelado", () => {
    expect(filasDeAtenciones([atencion], SANTIAGO)).toEqual([
      [...CABECERA_DE_ATENCIONES],
      ["2026-10-19 10:30", "Ana Pérez", "Finalizada", "Corte, Color", "Carla", "18000,5", "2026-10-19 11:30"],
    ])
  })

  it("abierta, el total es la suma de sus líneas y no tiene fecha de cobro", () => {
    const [, fila] = filasDeAtenciones([{ ...atencion, status: "en-espera", totalCents: null, paidAt: null }], SANTIAGO)
    expect(fila[5]).toBe("18000,5")
    expect(fila[6]).toBe("")
  })
})

describe("montoParaPlanilla", () => {
  it.each([
    [800_000, "8000"],
    [50, "0,5"],
    [0, "0"],
  ])("%i centavos → %j", (centavos, esperado) => {
    expect(montoParaPlanilla(centavos)).toBe(esperado)
  })
})

describe("rangoDeExportacion", () => {
  it("los dos días incluidos, en la hora del negocio", () => {
    expect(rangoDeExportacion("2026-10-01", "2026-10-31", SANTIAGO)).toEqual({
      ok: true,
      desde: new Date("2026-10-01T03:00:00.000Z"),
      hasta: new Date("2026-11-01T03:00:00.000Z"),
    })
  })

  it("un solo día", () => {
    const rango = rangoDeExportacion("2026-10-19", "2026-10-19", SANTIAGO)
    expect(rango).toMatchObject({ ok: true })
  })

  it.each([
    ["sin fechas", null, null, /Elige la fecha/],
    ["una fecha que no existe", "2026-02-30", "2026-03-01", /Elige la fecha/],
    ["al revés", "2026-10-31", "2026-10-01", /anterior/],
    ["más de 366 días", "2025-01-01", "2026-01-02", /366 días/],
  ])("rechaza %s", (_caso, desde, hasta, mensaje) => {
    const rango = rangoDeExportacion(desde, hasta, SANTIAGO)
    expect(rango.ok).toBe(false)
    if (!rango.ok) expect(rango.error).toMatch(mensaje)
  })
})

describe("nombreDeArchivo", () => {
  it("arma el nombre y no deja pasar nada raro", () => {
    expect(nombreDeArchivo("clientes", "2026-10-27")).toBe("clientes-2026-10-27.csv")
    expect(nombreDeArchivo("aten\"ciones", "x/y")).toBe("aten-ciones-x-y.csv")
  })
})
