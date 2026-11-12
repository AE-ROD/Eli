import { describe, it, expect } from "vitest"
import { Prisma } from "@prisma/client"
import {
  MENSAJE_SEDE_DE_LA_HORA_DESACTIVADA,
  MENSAJE_SEDE_DESACTIVADA_AL_AGENDAR,
  MENSAJE_SEDE_YA_NO_DISPONIBLE,
  esRechazoPorSedeInactiva,
} from "./rechazo-de-sede-inactiva"

/** Como llega de Prisma 6 cuando un trigger levanta una excepción (probado contra Postgres 16 con la migración aplicada). */
const delTrigger = (mensajeDePostgres: string) =>
  new Prisma.PrismaClientUnknownRequestError(
    `\nInvalid \`prisma.appointment.create()\` invocation:\n\nError occurred during query execution:\nConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "23514", message: "${mensajeDePostgres}", severity: "ERROR", detail: None, column: None, hint: None }), transient: false })`,
    { clientVersion: "test" }
  )

describe("esRechazoPorSedeInactiva", () => {
  it("reconoce el rechazo del trigger de las citas", () => {
    expect(esRechazoPorSedeInactiva(delTrigger("citas cmwduohqw00017ddtxr7qkf1i: la sede r7-b no está activa"))).toBe(true)
  })

  it("reconoce el rechazo del trigger de la lista de espera", () => {
    expect(esRechazoPorSedeInactiva(delTrigger("lista_de_espera cmwduohr600057ddttnw0gsss: la sede r7-b no está activa"))).toBe(true)
  })

  it("lo reconoce también con el formato corto que arma la base falsa de las pruebas", () => {
    expect(esRechazoPorSedeInactiva(new Error("23514: citas c-1: la sede sede-b no está activa"))).toBe(true)
  })

  it.each([
    ["otro rechazo de sedes (el tope)", delTrigger("sedes s-1: un negocio tiene hasta 5 sedes activas")],
    ["otro rechazo de sedes (el plan)", delTrigger("sedes s-1: sólo el plan Independiente tiene sedes")],
    ["el choque de horarios entre sedes", delTrigger("horarios_laborales h-1: la franja se pisa con la de la sede \\\"Centro\\\" (09:00 a 13:00) el mismo día")],
    ["un CHECK de la tabla", new Error('23514: new row for relation "citas" violates check constraint "citas_status_check"')],
    ["la FK de la sede (P2003)", new Prisma.PrismaClientKnownRequestError("Foreign key constraint violated on the constraint: `citas_sedeId_businessId_fkey`", { code: "P2003", clientVersion: "test" })],
    ["el conflicto de serialización (P2034)", new Prisma.PrismaClientKnownRequestError("Transaction failed due to a write conflict or a deadlock", { code: "P2034", clientVersion: "test" })],
    ["el texto sin el código de Postgres", new Error("citas c-1: la sede s-1 no está activa")],
    ["el código sin el texto", new Error("23514: citas c-1: otra cosa")],
    ["un error cualquiera", new Error("boom")],
    ["un texto suelto (no es un Error)", "23514: citas c-1: la sede s-1 no está activa"],
    ["un objeto cualquiera", { message: "23514: citas c-1: la sede s-1 no está activa" }],
    ["null", null],
    ["undefined", undefined],
  ])("%s no es un rechazo por sede inactiva", (_caso, error) => {
    expect(esRechazoPorSedeInactiva(error)).toBe(false)
  })
})

describe("los mensajes", () => {
  it("el de la reserva pública y la lista de espera pide elegir otra sede", () => {
    expect(MENSAJE_SEDE_YA_NO_DISPONIBLE).toBe("Esa sede ya no está disponible. Elige otra.")
  })

  it("los del panel dicen qué pasó y qué hacer, sin datos de la base", () => {
    for (const mensaje of [MENSAJE_SEDE_DESACTIVADA_AL_AGENDAR, MENSAJE_SEDE_DE_LA_HORA_DESACTIVADA]) {
      expect(mensaje).toMatch(/sede/)
      expect(mensaje).not.toMatch(/23514|trigger|check/i)
    }
  })
})
