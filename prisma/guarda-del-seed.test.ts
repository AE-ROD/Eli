import { describe, it, expect } from "vitest"
import { verificarQueElSeedPuedeCorrer } from "./guarda-del-seed.mjs"

const local = "postgresql://postgres@localhost:5433/eli?schema=public"

describe("verificarQueElSeedPuedeCorrer", () => {
  it("sin SEED_CONFIRMO=si se niega, aunque la base sea local", () => {
    expect(() => verificarQueElSeedPuedeCorrer({ DATABASE_URL: local })).toThrow(/SEED_CONFIRMO=si/)
    expect(() => verificarQueElSeedPuedeCorrer({ DATABASE_URL: local, SEED_CONFIRMO: "sí" })).toThrow(/SEED_CONFIRMO=si/)
  })

  it("con SEED_CONFIRMO=si corre contra localhost y 127.0.0.1", () => {
    expect(() => verificarQueElSeedPuedeCorrer({ DATABASE_URL: local, SEED_CONFIRMO: "si" })).not.toThrow()
    expect(() =>
      verificarQueElSeedPuedeCorrer({ DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/eli", SEED_CONFIRMO: "si" }),
    ).not.toThrow()
  })

  it("se niega contra un host remoto aunque SEED_CONFIRMO=si: la confirmación sola no alcanza", () => {
    const remoto = "postgresql://u:p@ep-algo-123.us-east-2.aws.neon.tech/eli?sslmode=require"
    expect(() => verificarQueElSeedPuedeCorrer({ DATABASE_URL: remoto, SEED_CONFIRMO: "si" })).toThrow(
      /ep-algo-123\.us-east-2\.aws\.neon\.tech[\s\S]*SEED_HOSTS_PERMITIDOS/,
    )
  })

  it("el mensaje nombra el host pero nunca la contraseña de la URL", () => {
    const remoto = "postgresql://usuario:clave-secreta@db.remoto.example/eli"
    let mensaje = ""
    try {
      verificarQueElSeedPuedeCorrer({ DATABASE_URL: remoto, SEED_CONFIRMO: "si" })
    } catch (error) {
      mensaje = (error as Error).message
    }
    expect(mensaje).toContain("db.remoto.example")
    expect(mensaje).not.toContain("clave-secreta")
  })

  it("acepta un host remoto sólo si está en SEED_HOSTS_PERMITIDOS (lista separada por comas)", () => {
    const remoto = "postgresql://u:p@db.desarrollo.example:5432/eli"
    expect(() =>
      verificarQueElSeedPuedeCorrer({
        DATABASE_URL: remoto,
        SEED_CONFIRMO: "si",
        SEED_HOSTS_PERMITIDOS: "otro.example, DB.Desarrollo.example ,",
      }),
    ).not.toThrow()
    expect(() =>
      verificarQueElSeedPuedeCorrer({
        DATABASE_URL: remoto,
        SEED_CONFIRMO: "si",
        SEED_HOSTS_PERMITIDOS: "desarrollo.example",
      }),
    ).toThrow()
  })

  it("un host que sólo empieza por localhost no cuenta como local", () => {
    expect(() =>
      verificarQueElSeedPuedeCorrer({ DATABASE_URL: "postgresql://u:p@localhost.evil.example/eli", SEED_CONFIRMO: "si" }),
    ).toThrow()
  })

  it("se niega si DATABASE_URL falta o no es una URL", () => {
    expect(() => verificarQueElSeedPuedeCorrer({ SEED_CONFIRMO: "si" })).toThrow(/DATABASE_URL/)
    expect(() => verificarQueElSeedPuedeCorrer({ DATABASE_URL: "no es una url", SEED_CONFIRMO: "si" })).toThrow(
      /DATABASE_URL/,
    )
  })
})
