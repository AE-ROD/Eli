import { beforeEach, describe, expect, it } from "vitest"
import type { Prisma } from "@prisma/client"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, atencion, datosBase, linea, propina } from "@/pruebas/datos"
import { atencionBloqueada } from "./bloqueos-de-dinero"

const base = crearBaseFalsa()
const db = base.prisma as unknown as Prisma.TransactionClient

const PAGADA = new Date("2026-10-28T15:00:00.000Z")

function liquidacion(id: string, datos: Record<string, unknown> = {}) {
  return {
    id,
    businessId: NEGOCIO,
    memberId: "m-carla",
    memberName: "Carla Profesional",
    periodo: "mensual",
    desde: new Date("2026-10-01"),
    hasta: new Date("2026-10-31"),
    zona: "America/Santiago",
    comisionServiciosCents: 0,
    comisionProductosCents: 0,
    propinasCents: 0,
    adelantosCents: 0,
    ajustesCents: 0,
    brutoCents: 0,
    totalCents: 0,
    cerradaPorId: "u-duena",
    cerradaPorNombre: "Ana Dueña",
    ...datos,
  }
}

function cierre(id: string, desde: string, hasta: string, businessId = NEGOCIO) {
  return {
    id,
    businessId,
    desde: new Date(desde),
    hasta: new Date(hasta),
    fecha: new Date("2026-10-28"),
    zona: "America/Santiago",
    fondoInicialCents: 0,
    efectivoCobradoCents: 0,
    propinasEfectivoCents: 0,
    efectivoEsperadoCents: 0,
    efectivoContadoCents: 0,
    diferenciaCents: 0,
    cerradoPorId: "u-duena",
    cerradoPorNombre: "Ana Dueña",
  }
}

function escenario(extra: Record<string, unknown[]> = {}) {
  base.reiniciar({
    ...datosBase(),
    visit: [
      atencion("v1", { status: "finalizada", paidAt: PAGADA, totalCents: 800_000 }),
      atencion("v-abierta"),
      atencion("v-ajena", { businessId: OTRO_NEGOCIO, customerId: "c-ajeno", status: "finalizada", paidAt: PAGADA }),
    ],
    visitService: [linea("l1", "v1"), linea("l-abierta", "v-abierta")],
    ...extra,
  } as never)
}

describe("atencionBloqueada", () => {
  beforeEach(() => escenario())

  it("una atención cobrada sin liquidación ni cierre se puede tocar", async () => {
    expect(await atencionBloqueada(db, NEGOCIO, "v1")).toBeNull()
    expect(await atencionBloqueada(db, NEGOCIO, "v-abierta")).toBeNull()
  })

  describe("liquidación", () => {
    it("una línea en una liquidación cerrada o pagada bloquea", async () => {
      for (const estado of ["cerrada", "pagada"]) {
        escenario({
          liquidacion: [liquidacion("liq", { estado, pagadaAt: estado === "pagada" ? new Date() : null })],
          visitService: [linea("l1", "v1", { liquidacionId: "liq" })],
        })
        expect(await atencionBloqueada(db, NEGOCIO, "v1")).toEqual({ motivo: "liquidacion" })
      }
    })

    it("una propina en una liquidación también bloquea", async () => {
      escenario({
        liquidacion: [liquidacion("liq")],
        propinaDeAtencion: [propina("pr1", "v1", { liquidacionId: "liq" })],
      })
      expect(await atencionBloqueada(db, NEGOCIO, "v1")).toEqual({ motivo: "liquidacion" })
    })

    it("una liquidación anulada no bloquea", async () => {
      escenario({
        liquidacion: [liquidacion("liq", { estado: "anulada", anuladaAt: new Date() })],
        visitService: [linea("l1", "v1", { liquidacionId: "liq" })],
        propinaDeAtencion: [propina("pr1", "v1", { liquidacionId: "liq" })],
      })
      expect(await atencionBloqueada(db, NEGOCIO, "v1")).toBeNull()
    })

    it("la liquidación de otra atención no bloquea ésta", async () => {
      escenario({
        liquidacion: [liquidacion("liq")],
        visitService: [linea("l1", "v1"), linea("l-abierta", "v-abierta", { liquidacionId: "liq" })],
      })
      expect(await atencionBloqueada(db, NEGOCIO, "v1")).toBeNull()
    })
  })

  describe("caja", () => {
    it("un pago dentro del rango de un cierre bloquea", async () => {
      escenario({ cierreDeCaja: [cierre("c1", "2026-10-28T11:00:00Z", "2026-10-28T20:00:00Z")] })
      expect(await atencionBloqueada(db, NEGOCIO, "v1")).toEqual({ motivo: "caja" })
    })

    it("fuera del rango no bloquea", async () => {
      escenario({
        cierreDeCaja: [
          cierre("antes", "2026-10-28T08:00:00Z", "2026-10-28T14:59:59.999Z"),
          cierre("despues", "2026-10-28T15:00:00.001Z", "2026-10-28T20:00:00Z"),
        ],
      })
      expect(await atencionBloqueada(db, NEGOCIO, "v1")).toBeNull()
    })

    it("en el borde exacto: es del cierre que termina ahí, no del que empieza ahí", async () => {
      escenario({ cierreDeCaja: [cierre("termina", "2026-10-28T11:00:00Z", PAGADA.toISOString())] })
      expect(await atencionBloqueada(db, NEGOCIO, "v1")).toEqual({ motivo: "caja" })

      escenario({ cierreDeCaja: [cierre("empieza", PAGADA.toISOString(), "2026-10-28T20:00:00Z")] })
      expect(await atencionBloqueada(db, NEGOCIO, "v1")).toBeNull()
    })

    it("una atención sin cobrar nunca está en un cierre", async () => {
      escenario({ cierreDeCaja: [cierre("c1", "2026-10-01T00:00:00Z", "2026-10-31T00:00:00Z")] })
      expect(await atencionBloqueada(db, NEGOCIO, "v-abierta")).toBeNull()
    })

    it("el cierre de otro negocio no bloquea", async () => {
      escenario({ cierreDeCaja: [cierre("c-ajeno", "2026-10-28T11:00:00Z", "2026-10-28T20:00:00Z", OTRO_NEGOCIO)] })
      expect(await atencionBloqueada(db, NEGOCIO, "v1")).toBeNull()
    })
  })

  it("una atención de otro negocio no existe para éste", async () => {
    escenario({ cierreDeCaja: [cierre("c-ajeno", "2026-10-28T11:00:00Z", "2026-10-28T20:00:00Z", OTRO_NEGOCIO)] })
    expect(await atencionBloqueada(db, NEGOCIO, "v-ajena")).toBeNull()
    expect(await atencionBloqueada(db, OTRO_NEGOCIO, "v-ajena")).toEqual({ motivo: "caja" })
  })
})
