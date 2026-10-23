import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const contabilizarReferido = async (...args: Parameters<typeof import("./referidos").contabilizarReferido>) =>
  (await import("./referidos")).contabilizarReferido(...args)
const negocioQueInvita = async (...args: Parameters<typeof import("./referidos").negocioQueInvita>) =>
  (await import("./referidos")).negocioQueInvita(...args)

const AHORA = new Date("2026-10-22T12:00:00.000Z")
const EN_TRES_DIAS = new Date("2026-10-25T12:00:00.000Z")
const VENCIDA = new Date("2026-09-01T00:00:00.000Z")

/**
 * A invita a B y a C. B invita a D (la cadena). E no tiene que ver con nadie.
 * Los códigos: A con uno nuevo; B con los 10 hex de un negocio antiguo.
 */
function escenario(cambios: Record<string, Record<string, unknown>> = {}) {
  const negocio = (id: string, datos: Record<string, unknown>) => ({
    id,
    name: `Negocio ${id}`,
    slug: `negocio-${id}`,
    userId: `u-${id}`,
    pruebaTerminaEl: EN_TRES_DIAS,
    ...datos,
    ...cambios[id],
  })
  base.reiniciar({
    user: ["a", "b", "c", "d", "e", "nuevo"].map((id) => ({ id: `u-${id}`, name: id, email: `${id}@x.test` })),
    business: [
      negocio("a", { codigoInvitacion: "ab12cd34ef" }),
      negocio("b", { codigoInvitacion: "0a9f3c7be1", invitadoPorId: "a" }),
      negocio("c", { codigoInvitacion: "zz12cd34ef", invitadoPorId: "a" }),
      negocio("d", { codigoInvitacion: "yy12cd34ef", invitadoPorId: "b" }),
      negocio("e", { codigoInvitacion: "xx12cd34ef" }),
    ],
  })
}

const negocio = (id: string) => base.buscar("business", { id })[0]

beforeEach(() => {
  vi.clearAllMocks()
  escenario()
})

describe("negocioQueInvita", () => {
  it("un código válido devuelve el negocio dueño", async () => {
    expect(await negocioQueInvita("ab12cd34ef")).toBe("a")
  })

  it("acepta el código hex de un negocio antiguo, y en mayúsculas", async () => {
    expect(await negocioQueInvita(" 0A9F3C7BE1 ")).toBe("b")
  })

  it("un código bien formado que no existe → null", async () => {
    expect(await negocioQueInvita("qq12cd34ef")).toBeNull()
  })

  it.each([
    ["vacío", ""],
    ["corto", "ab12"],
    ["con símbolos", "ab12cd34e!"],
    ["un objeto", { codigoInvitacion: "ab12cd34ef" }],
    ["ausente", undefined],
  ])("mal formado (%s) → null, sin consultar la base", async (_caso, valor) => {
    expect(await negocioQueInvita(valor)).toBeNull()
    expect(base.prisma.business.findUnique).not.toHaveBeenCalled()
  })

  it("el propio código de quien se registra → null: nadie se invita a sí mismo", async () => {
    expect(await negocioQueInvita("ab12cd34ef", "u-a")).toBeNull()
    expect(await negocioQueInvita("ab12cd34ef", "u-nuevo")).toBe("a")
  })
})

describe("contabilizarReferido", () => {
  it("la primera reserva de B suma 7 días a la prueba de A, desde su fin", async () => {
    expect(await contabilizarReferido("b", AHORA)).toBe("premiado")

    expect(negocio("b").referidoContabilizadoAt).toEqual(AHORA)
    expect(negocio("a").extensionPorReferidoAt).toEqual(AHORA)
    expect(negocio("a").pruebaTerminaEl).toEqual(new Date("2026-11-01T12:00:00.000Z"))
  })

  it("no toca a nadie más: ni a los otros invitados ni a quien no tiene que ver", async () => {
    await contabilizarReferido("b", AHORA)

    for (const id of ["c", "d", "e"]) {
      expect(negocio(id).referidoContabilizadoAt).toBeNull()
      expect(negocio(id).extensionPorReferidoAt).toBeNull()
      expect(negocio(id).pruebaTerminaEl).toEqual(EN_TRES_DIAS)
    }
    // B fue invitado, pero no ganó nada por eso.
    expect(negocio("b").pruebaTerminaEl).toEqual(EN_TRES_DIAS)
    expect(negocio("b").extensionPorReferidoAt).toBeNull()
  })

  it("un referido cuenta una sola vez: la segunda reserva de B no hace nada", async () => {
    await contabilizarReferido("b", AHORA)
    const despues = base.volcado()

    expect(await contabilizarReferido("b", new Date("2026-10-23T12:00:00.000Z"))).toBe("nada")
    expect(base.volcado()).toEqual(despues)
  })

  it("dos reservas simultáneas de B premian una sola vez", async () => {
    const resultados = await Promise.all([contabilizarReferido("b", AHORA), contabilizarReferido("b", AHORA)])

    expect(resultados.sort()).toEqual(["nada", "premiado"])
    expect(negocio("a").pruebaTerminaEl).toEqual(new Date("2026-11-01T12:00:00.000Z"))
  })

  it("A ya premiado: C cuenta, pero A no suma otra vez", async () => {
    await contabilizarReferido("b", AHORA)

    expect(await contabilizarReferido("c", new Date("2026-10-23T12:00:00.000Z"))).toBe("contado")
    expect(negocio("c").referidoContabilizadoAt).toEqual(new Date("2026-10-23T12:00:00.000Z"))
    expect(negocio("a").extensionPorReferidoAt).toEqual(AHORA)
    expect(negocio("a").pruebaTerminaEl).toEqual(new Date("2026-11-01T12:00:00.000Z"))
  })

  it("dos invitados distintos a la vez: A suma una sola vez", async () => {
    const resultados = await Promise.all([contabilizarReferido("b", AHORA), contabilizarReferido("c", AHORA)])

    expect(resultados.sort()).toEqual(["contado", "premiado"])
    expect(negocio("a").pruebaTerminaEl).toEqual(new Date("2026-11-01T12:00:00.000Z"))
  })

  it("con la prueba de A vencida, los 7 días se cuentan desde ahora", async () => {
    escenario({ a: { pruebaTerminaEl: VENCIDA } })

    await contabilizarReferido("b", AHORA)

    expect(negocio("a").pruebaTerminaEl).toEqual(new Date("2026-10-29T12:00:00.000Z"))
  })

  it("la cadena sigue: D premia a B, que a su vez fue invitado por A", async () => {
    expect(await contabilizarReferido("d", AHORA)).toBe("premiado")

    expect(negocio("b").pruebaTerminaEl).toEqual(new Date("2026-11-01T12:00:00.000Z"))
    expect(negocio("a").pruebaTerminaEl).toEqual(EN_TRES_DIAS)
  })

  it("un negocio que nadie invitó no hace nada", async () => {
    const antes = base.volcado()

    expect(await contabilizarReferido("e", AHORA)).toBe("nada")
    expect(base.volcado()).toEqual(antes)
  })

  it("un negocio que figura invitado por sí mismo no se premia", async () => {
    escenario({ e: { invitadoPorId: "e" } })
    const antes = base.volcado()

    expect(await contabilizarReferido("e", AHORA)).toBe("nada")
    expect(base.volcado()).toEqual(antes)
  })

  it("si quien invitó ya no existe, el referido cuenta igual y no falla", async () => {
    escenario({ b: { invitadoPorId: "borrado" } })

    expect(await contabilizarReferido("b", AHORA)).toBe("contado")
    expect(negocio("b").referidoContabilizadoAt).toEqual(AHORA)
  })
})
