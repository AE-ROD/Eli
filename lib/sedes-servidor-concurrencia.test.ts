import { describe, it, expect } from "vitest"
import { Prisma } from "@prisma/client"
import { MENSAJE_CONFLICTO_DE_CONCURRENCIA, esConflictoDeConcurrencia, respuestaDeErrorDeSedes } from "./sedes-servidor"

const conocido = (code: string, message = "falló") => new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: "test" })
const desconocido = (message: string) => new Prisma.PrismaClientUnknownRequestError(message, { clientVersion: "test" })

describe("esConflictoDeConcurrencia", () => {
  it.each([
    ["conflicto de escritura de Prisma", conocido("P2034")],
    ["la transacción venció (esperando el candado)", conocido("P2028")],
    ["deadlock de Postgres con su código", conocido("P2010", "Raw query failed. Code: `40P01`. Message: deadlock detected")],
    ["no alcanzó el candado (55P03)", desconocido("55P03: canceling statement due to lock timeout")],
    ["deadlock sin código", desconocido("ERROR: deadlock detected")],
  ])("%s: sí", (_caso, error) => {
    expect(esConflictoDeConcurrencia(error)).toBe(true)
  })

  it.each([
    ["un error cualquiera", new Error("boom")],
    ["un rechazo de la base (23514)", desconocido("23514: sedes x: hasta 5 sedes activas")],
    ["un nombre repetido (P2002)", conocido("P2002")],
    ["un valor que no es un error", "deadlock detected"],
    ["null", null],
  ])("%s: no", (_caso, error) => {
    expect(esConflictoDeConcurrencia(error)).toBe(false)
  })
})

describe("respuestaDeErrorDeSedes ante un conflicto de concurrencia", () => {
  it("responde 409 con 'intenta de nuevo', no 500", async () => {
    const respuesta = respuestaDeErrorDeSedes(conocido("P2034"), "guardando la sede")

    expect(respuesta.status).toBe(409)
    expect(await respuesta.json()).toEqual({ error: MENSAJE_CONFLICTO_DE_CONCURRENCIA })
  })

  it("un error que no es de nada de eso sigue siendo 500 y sin datos", async () => {
    const respuesta = respuestaDeErrorDeSedes(new Error("secreto"), "guardando la sede")

    expect(respuesta.status).toBe(500)
    expect(JSON.stringify(await respuesta.json())).not.toContain("secreto")
  })
})
