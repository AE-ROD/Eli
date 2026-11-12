import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase, pedido, sesiones } from "@/pruebas/datos"
import { sesionesDentales } from "@/pruebas/clinica-con-sillones"
import { MAX_SERVICIOS_POR_LOTE, MAX_SERVICIOS_POR_NEGOCIO, type ServicioParaCargar } from "@/lib/servicios-en-lote"

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockVerificarLimite = vi.fn(async (..._args: unknown[]) => ({ permitido: true, restantes: 19 }))
vi.mock("@/lib/rate-limit", () => ({ verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args) }))

vi.mock("@/lib/registro-de-errores", () => ({ registrarError: vi.fn() }))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/configuracion/servicios/lote"

const servicio = (name: string, datos: Partial<ServicioParaCargar> = {}): ServicioParaCargar => ({
  name,
  duration: 30,
  price: null,
  category: null,
  description: null,
  ...datos,
})

async function cargar(sesion: unknown, cuerpo: unknown) {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido(URL, cuerpo))
}

async function cambiar(sesion: unknown, cuerpo: unknown) {
  const { PATCH } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return PATCH(pedido(URL, cuerpo))
}

const delNegocio = (negocio = NEGOCIO) => base.buscar("service", { businessId: negocio })
const nombresDelNegocio = (negocio = NEGOCIO) => delNegocio(negocio).map((s) => s.name)

/** `cantidad` servicios de relleno del negocio, para llegar al tope. */
const deRelleno = (cantidad: number, negocio = NEGOCIO) =>
  Array.from({ length: cantidad }, (_, i) => ({ id: `relleno-${negocio}-${i}`, businessId: negocio, name: `Relleno ${i}` }))

beforeEach(() => {
  vi.clearAllMocks()
  mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 19 })
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    service: [
      ...datos.service,
      { id: "s-hidratacion", businessId: OTRO_NEGOCIO, name: "Tratamiento de hidratación" },
    ],
  })
})

describe("POST /api/configuracion/servicios/lote", () => {
  describe("quién puede", () => {
    it("sin sesión, 401, y no toca nada ni gasta el cupo", async () => {
      const antes = base.volcado()

      const res = await cargar(null, { servicios: [servicio("Nuevo")] })

      expect(res.status).toBe(401)
      expect(base.volcado()).toEqual(antes)
      expect(mockVerificarLimite).not.toHaveBeenCalled()
    })

    it.each([
      ["un profesional", sesiones.carla],
      ["un profesional sin miembro", sesiones.sinMiembro],
    ])("%s recibe 401, no gasta el cupo y no crea nada", async (_quien, sesion) => {
      const antes = base.volcado()

      const res = await cargar(sesion, { servicios: [servicio("Nuevo")] })

      expect(res.status).toBe(401)
      expect(base.volcado()).toEqual(antes)
      expect(mockVerificarLimite).not.toHaveBeenCalled()
    })

    it.each([
      ["la dueña", sesiones.dueña],
      ["el encargado", sesiones.encargado],
    ])("%s carga servicios", async (_quien, sesion) => {
      const res = await cargar(sesion, { servicios: [servicio("Nuevo")] })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ creados: 1, omitidos: [] })
    })
  })

  describe("lo que crea", () => {
    it("crea cada servicio en el negocio de la sesión, con sus datos y el resto por defecto", async () => {
      const res = await cargar(sesiones.dueña, {
        servicios: [
          servicio("Manicure", { duration: 45, price: 10000, category: "Manos", description: "Con esmaltado" }),
          servicio("Pedicure", { duration: 60 }),
        ],
      })

      expect(await res.json()).toEqual({ creados: 2, omitidos: [] })
      const nuevos = delNegocio().filter((s) => ["Manicure", "Pedicure"].includes(s.name as string))
      expect(nuevos).toHaveLength(2)
      expect(nuevos[0]).toMatchObject({
        businessId: NEGOCIO,
        name: "Manicure",
        duration: 45,
        price: 10000,
        category: "Manos",
        description: "Con esmaltado",
        active: true,
        esUrgencia: false,
        frecuenciaDias: null,
      })
      expect(nuevos[1]).toMatchObject({ name: "Pedicure", duration: 60, price: null, category: null, description: null })
    })

    it("guarda el servicio recortado y la categoría vacía como null", async () => {
      await cargar(sesiones.dueña, { servicios: [servicio("  Manicure  ", { category: "   ", description: "" })] })

      expect(delNegocio().find((s) => s.name === "Manicure")).toMatchObject({ category: null, description: null })
    })

    it("el negocio es el de la sesión, nunca el que diga el navegador", async () => {
      const res = await cargar(sesiones.dueñoAjeno, {
        businessId: NEGOCIO,
        servicios: [{ ...servicio("Del otro"), businessId: NEGOCIO }],
      })

      expect(await res.json()).toEqual({ creados: 1, omitidos: [] })
      expect(nombresDelNegocio(OTRO_NEGOCIO)).toContain("Del otro")
      expect(nombresDelNegocio(NEGOCIO)).not.toContain("Del otro")
    })

    it.each([
      ["una clínica", sesionesDentales.dueña],
      ["un salón", sesiones.dueña],
    ])("nunca marca urgencias, ni en %s aunque el navegador lo mande", async (_donde, sesion) => {
      const res = await cargar(sesion, { servicios: [{ ...servicio("Urgencia nueva"), esUrgencia: true }] })

      expect(await res.json()).toEqual({ creados: 1, omitidos: [] })
      expect(delNegocio().find((s) => s.name === "Urgencia nueva")).toMatchObject({ esUrgencia: false })
    })

    it("los crea en el orden en que llegan, de una sola vez", async () => {
      await cargar(sesiones.dueña, { servicios: [servicio("Primero"), servicio("Segundo"), servicio("Tercero")] })

      expect(base.prisma.service.createMany).toHaveBeenCalledTimes(1)
      expect(nombresDelNegocio().slice(-3)).toEqual(["Primero", "Segundo", "Tercero"])
    })

    it("toma el candado del negocio dentro de la transacción", async () => {
      await cargar(sesiones.dueña, { servicios: [servicio("Nuevo")] })

      expect(base.prisma.$transaction).toHaveBeenCalledTimes(1)
      const valores = base.transaccion.$executeRaw.mock.calls.map(([, ...resto]) => resto[0])
      expect(valores).toEqual([`servicios:${NEGOCIO}`])
    })
  })

  describe("revalida todo en el servidor", () => {
    it("omite los que no pasan las reglas, con su motivo y su posición, y crea los demás", async () => {
      const res = await cargar(sesiones.dueña, {
        servicios: [
          servicio("Bueno uno"),
          servicio("C"),
          servicio("Bueno dos", { duration: 10 }),
          { name: "Sin duración", price: null, category: null, description: null },
          servicio("Precio malo", { price: -5 }),
          servicio("Bueno tres", { duration: 480, price: 0 }),
          servicio("Categoría larga", { category: "a".repeat(41) }),
          "no soy un servicio",
          servicio("   "),
        ],
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        creados: 2,
        omitidos: [
          { fila: 2, name: "C", motivo: "El nombre tiene que tener al menos 2 caracteres" },
          { fila: 3, name: "Bueno dos", motivo: "La duración tiene que ser de al menos 15 minutos" },
          { fila: 4, name: "Sin duración", motivo: "Datos inválidos" },
          { fila: 5, name: "Precio malo", motivo: "El precio no puede ser negativo" },
          { fila: 7, name: "Categoría larga", motivo: "La categoría no puede tener más de 40 caracteres" },
          { fila: 8, name: "", motivo: "Datos inválidos" },
          { fila: 9, name: "", motivo: "El nombre tiene que tener al menos 2 caracteres" },
        ],
      })
      expect(nombresDelNegocio().slice(-2)).toEqual(["Bueno uno", "Bueno tres"])
    })

    it("no confía en tipos: una duración o un precio que son texto se omiten", async () => {
      const res = await cargar(sesiones.dueña, {
        servicios: [{ ...servicio("Duración texto"), duration: "45" }, { ...servicio("Precio texto"), price: "9000" }],
      })

      const { creados, omitidos } = await res.json()
      expect(creados).toBe(0)
      expect(omitidos.map((o: { fila: number }) => o.fila)).toEqual([1, 2])
      expect(nombresDelNegocio()).not.toContain("Duración texto")
    })
  })

  describe("repetidos", () => {
    it("omite los que ya existen en el negocio (activos o no), sin mayúsculas, tildes ni espacios de más", async () => {
      const res = await cargar(sesiones.dueña, {
        servicios: [servicio("corte"), servicio("  COLOR "), servicio("alisado"), servicio("Pelo largo")],
      })

      expect(await res.json()).toEqual({
        creados: 1,
        omitidos: [
          { fila: 1, name: "corte", motivo: "Ya existe un servicio con ese nombre" },
          { fila: 2, name: "COLOR", motivo: "Ya existe un servicio con ese nombre" },
          { fila: 3, name: "alisado", motivo: "Ya existe un servicio con ese nombre" },
        ],
      })
      expect(nombresDelNegocio().filter((n) => /^corte$/i.test(n as string))).toHaveLength(1)
    })

    it("compara sin tildes: 'Tratamiento de hidratacion' es 'Tratamiento de hidratación'", async () => {
      await cargar(sesiones.dueña, { servicios: [servicio("Tratamiento de hidratación")] })
      const res = await cargar(sesiones.dueña, { servicios: [servicio("TRATAMIENTO  de hidratacion")] })

      expect(await res.json()).toEqual({
        creados: 0,
        omitidos: [{ fila: 1, name: "TRATAMIENTO  de hidratacion".trim(), motivo: "Ya existe un servicio con ese nombre" }],
      })
    })

    it("omite los repetidos dentro del mismo pedido y deja el primero", async () => {
      const res = await cargar(sesiones.dueña, {
        servicios: [servicio("Brushing"), servicio("Peinado de fiesta"), servicio("  brushing "), servicio("BRUSHING")],
      })

      expect(await res.json()).toEqual({
        creados: 2,
        omitidos: [
          { fila: 3, name: "brushing", motivo: "Repetido en el lote" },
          { fila: 4, name: "BRUSHING", motivo: "Repetido en el lote" },
        ],
      })
      expect(nombresDelNegocio().slice(-2)).toEqual(["Brushing", "Peinado de fiesta"])
    })

    it("un nombre que sólo existe en otro negocio no cuenta como repetido", async () => {
      const res = await cargar(sesiones.dueña, { servicios: [servicio("Tratamiento de hidratación")] })

      expect(await res.json()).toEqual({ creados: 1, omitidos: [] })
    })

    it("cargar dos veces lo mismo no duplica nada", async () => {
      await cargar(sesiones.dueña, { servicios: [servicio("Nuevo")] })
      const segunda = await cargar(sesiones.dueña, { servicios: [servicio("Nuevo")] })

      expect(await segunda.json()).toMatchObject({ creados: 0 })
      expect(nombresDelNegocio().filter((n) => n === "Nuevo")).toHaveLength(1)
    })

    it("las cargas de dos negocios no se ven entre sí", async () => {
      await cargar(sesiones.dueña, { servicios: [servicio("Compartido")] })
      const res = await cargar(sesiones.dueñoAjeno, { servicios: [servicio("Compartido")] })

      expect(await res.json()).toEqual({ creados: 1, omitidos: [] })
      expect(nombresDelNegocio(NEGOCIO)).toContain("Compartido")
      expect(nombresDelNegocio(OTRO_NEGOCIO)).toContain("Compartido")
    })
  })

  describe("topes", () => {
    it(`acepta ${MAX_SERVICIOS_POR_LOTE} servicios en un pedido`, async () => {
      const servicios = Array.from({ length: MAX_SERVICIOS_POR_LOTE }, (_, i) => servicio(`Nuevo ${i}`))

      const res = await cargar(sesiones.dueña, { servicios })

      expect(await res.json()).toEqual({ creados: MAX_SERVICIOS_POR_LOTE, omitidos: [] })
    })

    it(`con ${MAX_SERVICIOS_POR_LOTE + 1} servicios, 400 y no crea ninguno`, async () => {
      const antes = base.volcado()
      const servicios = Array.from({ length: MAX_SERVICIOS_POR_LOTE + 1 }, (_, i) => servicio(`Nuevo ${i}`))

      const res = await cargar(sesiones.dueña, { servicios })

      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe("Una carga puede tener hasta 100 servicios. Divídela en partes.")
      expect(base.volcado()).toEqual(antes)
    })

    it.each([
      ["una lista vacía", { servicios: [] }, "Agrega al menos un servicio"],
      ["sin la lista", {}, "Faltan los servicios"],
      ["una lista que no es lista", { servicios: "Corte" }, "Los servicios tienen que ser una lista"],
      ["un cuerpo que es una lista", [servicio("Nuevo")], "Datos inválidos"],
    ])("%s: 400 con su mensaje y no crea nada", async (_caso, cuerpo, mensaje) => {
      const antes = base.volcado()

      const res = await cargar(sesiones.dueña, cuerpo)

      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: mensaje })
      expect(base.volcado()).toEqual(antes)
    })

    it("un JSON roto es 400", async () => {
      const res = await cargar(sesiones.dueña, "{ no es json")

      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: "El pedido no es un JSON válido" })
    })

    it("un cuerpo de más de 512 KB es 413 y no se lee", async () => {
      const res = await cargar(sesiones.dueña, JSON.stringify({ servicios: [servicio("x".repeat(600 * 1024))] }))

      expect(res.status).toBe(413)
    })

    it("100 servicios con descripciones de 2000 caracteres caben en el tope del cuerpo", async () => {
      const servicios = Array.from({ length: 100 }, (_, i) => servicio(`Nuevo ${i}`, { description: "ñ".repeat(2000) }))

      const res = await cargar(sesiones.dueña, { servicios })

      expect(res.status).toBe(200)
      expect((await res.json()).creados).toBe(100)
    })

    it("con 299 servicios en el negocio todavía cabe uno", async () => {
      const total = delNegocio().length
      base.reiniciar({ ...datosBase(), service: [...datosBase().service, ...deRelleno(MAX_SERVICIOS_POR_NEGOCIO - 1 - total)] })
      expect(delNegocio()).toHaveLength(MAX_SERVICIOS_POR_NEGOCIO - 1)

      const res = await cargar(sesiones.dueña, { servicios: [servicio("El último")] })

      expect(await res.json()).toEqual({ creados: 1, omitidos: [] })
      expect(delNegocio()).toHaveLength(MAX_SERVICIOS_POR_NEGOCIO)
    })

    it("si con los nuevos se pasa de 300, 409 con un mensaje claro y no crea ninguno (ni los válidos)", async () => {
      const total = delNegocio().length
      base.reiniciar({ ...datosBase(), service: [...datosBase().service, ...deRelleno(MAX_SERVICIOS_POR_NEGOCIO - 2 - total)] })
      const antes = base.volcado()

      const res = await cargar(sesiones.dueña, { servicios: [servicio("Uno"), servicio("Dos"), servicio("Tres")] })

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({
        error:
          "Se pueden tener hasta 300 servicios y ya tienes 298: caben 2 más y esta carga trae 3. Quita 1 de la lista o borra los servicios que ya no uses.",
      })
      expect(base.volcado()).toEqual(antes)
    })

    it("cuenta los desactivados, pero no los repetidos ni los inválidos que se omiten", async () => {
      const total = delNegocio().length
      base.reiniciar({ ...datosBase(), service: [...datosBase().service, ...deRelleno(MAX_SERVICIOS_POR_NEGOCIO - 1 - total)] })

      const res = await cargar(sesiones.dueña, {
        servicios: [servicio("Corte"), servicio("C"), servicio("Cabe"), servicio("cabe")],
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ creados: 1 })
      expect(delNegocio()).toHaveLength(MAX_SERVICIOS_POR_NEGOCIO)
    })

    it("con el negocio lleno, sólo omitidos (nada que crear) no es un error", async () => {
      const total = delNegocio().length
      base.reiniciar({ ...datosBase(), service: [...datosBase().service, ...deRelleno(MAX_SERVICIOS_POR_NEGOCIO - total)] })

      const res = await cargar(sesiones.dueña, { servicios: [servicio("Corte")] })

      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ creados: 0 })
    })

    it("con el negocio lleno, uno más es 409, y en una clínica habla de prestaciones", async () => {
      const total = delNegocio().length
      base.reiniciar({ ...datosBase(), service: [...datosBase().service, ...deRelleno(MAX_SERVICIOS_POR_NEGOCIO - total)] })

      const res = await cargar(sesionesDentales.dueña, { servicios: [servicio("Una más")] })

      expect(res.status).toBe(409)
      expect((await res.json()).error).toBe("Ya tienes el máximo de 300 prestaciones. Borra las prestaciones que ya no uses para agregar más.")
    })

    it("los servicios de otro negocio no cuentan para el tope", async () => {
      base.reiniciar({ ...datosBase(), service: [...datosBase().service, ...deRelleno(MAX_SERVICIOS_POR_NEGOCIO, OTRO_NEGOCIO)] })

      const res = await cargar(sesiones.dueña, { servicios: [servicio("Nuevo")] })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ creados: 1, omitidos: [] })
    })
  })

  describe("límite de escrituras masivas", () => {
    it("cuenta por usuario, en su propio balde, después de revisar el permiso", async () => {
      await cargar(sesiones.dueña, { servicios: [servicio("Nuevo")] })
      await cargar(sesiones.encargado, { servicios: [servicio("Otro")] })

      expect(mockVerificarLimite.mock.calls).toEqual([
        ["serviciosEnLote", "usuario:u-duena"],
        ["serviciosEnLote", "usuario:u-encargado"],
      ])
    })

    it("pasado el límite, 429 con un mensaje, sin leer el cuerpo ni crear nada", async () => {
      mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })
      const antes = base.volcado()

      const res = await cargar(sesiones.dueña, { servicios: [servicio("Nuevo")] })

      expect(res.status).toBe(429)
      expect((await res.json()).error).toMatch(/Intenta de nuevo más tarde/)
      expect(base.volcado()).toEqual(antes)
      expect(base.prisma.$transaction).not.toHaveBeenCalled()
    })

    it("sin el id del usuario en la sesión, cuenta por negocio", async () => {
      await cargar({ user: { role: "owner", businessId: NEGOCIO, memberId: null } }, { servicios: [servicio("Nuevo")] })

      expect(mockVerificarLimite).toHaveBeenCalledWith("serviciosEnLote", `negocio:${NEGOCIO}`)
    })
  })

  describe("todo o nada", () => {
    it("si la escritura falla a mitad de camino, no queda ninguno y responde 500", async () => {
      const antes = base.volcado()
      const verdadero = base.prisma.service.createMany.getMockImplementation()!
      // Escribe los servicios y recién después falla, como un error de la base a mitad del lote.
      base.prisma.service.createMany.mockImplementationOnce(async (...args: Parameters<typeof verdadero>) => {
        await verdadero(...args)
        throw new Error("la base se cayó")
      })

      const res = await cargar(sesiones.dueña, { servicios: [servicio("Uno"), servicio("Dos"), servicio("Tres")] })

      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: "Error interno del servidor" })
      expect(base.volcado()).toEqual(antes)
    })

    it("después de un fallo, el mismo pedido se puede repetir y crea todo", async () => {
      const verdadero = base.prisma.service.createMany.getMockImplementation()!
      base.prisma.service.createMany.mockImplementationOnce(async (...args: Parameters<typeof verdadero>) => {
        await verdadero(...args)
        throw new Error("la base se cayó")
      })
      const pedidoDeCarga = { servicios: [servicio("Uno"), servicio("Dos")] }

      await cargar(sesiones.dueña, pedidoDeCarga)
      const reintento = await cargar(sesiones.dueña, pedidoDeCarga)

      expect(await reintento.json()).toEqual({ creados: 2, omitidos: [] })
    })
  })
})

describe("PATCH /api/configuracion/servicios/lote", () => {
  beforeEach(() => {
    const datos = datosBase()
    base.reiniciar({
      ...datos,
      service: [
        { id: "s-corte", businessId: NEGOCIO, name: "Corte", category: "Corte", active: true },
        { id: "s-color", businessId: NEGOCIO, name: "Color", category: "Color", active: true },
        { id: "s-peinado", businessId: NEGOCIO, name: "Peinado", category: null, active: false },
        { id: "s-ajeno", businessId: OTRO_NEGOCIO, name: "Corte", category: "Corte", active: true },
      ],
    })
  })

  const categoriaDe = (id: string) => base.buscar("service", { id })[0].category
  const activoDe = (id: string) => base.buscar("service", { id })[0].active

  describe("quién puede", () => {
    it("sin sesión, 401", async () => {
      const antes = base.volcado()
      expect((await cambiar(null, { ids: ["s-corte"], active: false })).status).toBe(401)
      expect(base.volcado()).toEqual(antes)
    })

    it("un profesional recibe 401 y no cambia nada", async () => {
      const antes = base.volcado()

      const res = await cambiar(sesiones.carla, { ids: ["s-corte"], active: false })

      expect(res.status).toBe(401)
      expect(base.volcado()).toEqual(antes)
      expect(mockVerificarLimite).not.toHaveBeenCalled()
    })

    it.each([
      ["la dueña", sesiones.dueña],
      ["el encargado", sesiones.encargado],
    ])("%s cambia varios a la vez", async (_quien, sesion) => {
      const res = await cambiar(sesion, { ids: ["s-corte", "s-color"], category: "Cabello" })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ actualizados: 2 })
    })
  })

  describe("qué cambia", () => {
    it("cambia la categoría de los elegidos y no la de los demás", async () => {
      await cambiar(sesiones.dueña, { ids: ["s-corte", "s-peinado"], category: "  Cabello " })

      expect(categoriaDe("s-corte")).toBe("Cabello")
      expect(categoriaDe("s-peinado")).toBe("Cabello")
      expect(categoriaDe("s-color")).toBe("Color")
    })

    it.each([[null], [""], ["   "]])("la categoría %j deja los servicios sin categoría", async (categoria) => {
      const res = await cambiar(sesiones.dueña, { ids: ["s-corte", "s-color"], category: categoria })

      expect(await res.json()).toEqual({ actualizados: 2 })
      expect(categoriaDe("s-corte")).toBeNull()
      expect(categoriaDe("s-color")).toBeNull()
    })

    it("desactiva y reactiva, sin tocar la categoría", async () => {
      await cambiar(sesiones.dueña, { ids: ["s-corte", "s-color"], active: false })
      expect([activoDe("s-corte"), activoDe("s-color")]).toEqual([false, false])
      expect(categoriaDe("s-corte")).toBe("Corte")

      await cambiar(sesiones.dueña, { ids: ["s-corte", "s-peinado"], active: true })
      expect([activoDe("s-corte"), activoDe("s-peinado"), activoDe("s-color")]).toEqual([true, true, false])
    })

    it("categoría y estado a la vez", async () => {
      await cambiar(sesiones.dueña, { ids: ["s-corte"], category: "Archivo", active: false })

      expect(categoriaDe("s-corte")).toBe("Archivo")
      expect(activoDe("s-corte")).toBe(false)
    })

    it("un id repetido cuenta una vez", async () => {
      const res = await cambiar(sesiones.dueña, { ids: ["s-corte", "s-corte", "s-corte"], active: false })

      expect(await res.json()).toEqual({ actualizados: 1 })
    })
  })

  describe("aislamiento", () => {
    it("los ids de otro negocio o que no existen no se tocan ni se cuentan", async () => {
      const res = await cambiar(sesiones.dueña, { ids: ["s-corte", "s-ajeno", "no-existe"], category: "Cabello", active: false })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ actualizados: 1 })
      expect(base.buscar("service", { id: "s-ajeno" })[0]).toMatchObject({ category: "Corte", active: true, businessId: OTRO_NEGOCIO })
    })

    it("sólo ids ajenos: 200 con cero, como si no existieran", async () => {
      const antes = base.volcado()

      const res = await cambiar(sesiones.dueña, { ids: ["s-ajeno"], active: false })

      expect(await res.json()).toEqual({ actualizados: 0 })
      expect(base.volcado()).toEqual(antes)
    })

    it("el negocio sale de la sesión: la dueña del otro negocio no toca los del primero", async () => {
      const res = await cambiar(sesiones.dueñoAjeno, { businessId: NEGOCIO, ids: ["s-corte", "s-ajeno"], category: "X" })

      expect(await res.json()).toEqual({ actualizados: 1 })
      expect(categoriaDe("s-corte")).toBe("Corte")
      expect(categoriaDe("s-ajeno")).toBe("X")
    })

    it("sólo se escribe la categoría y el estado: el resto del pedido se descarta", async () => {
      await cambiar(sesiones.dueña, { ids: ["s-corte"], category: "Cabello", name: "Hackeado", businessId: OTRO_NEGOCIO, price: 1 })

      expect(base.buscar("service", { id: "s-corte" })[0]).toMatchObject({ name: "Corte", businessId: NEGOCIO, category: "Cabello" })
    })
  })

  describe("validación", () => {
    it.each([
      ["sin ids", { category: "X" }, "Faltan los servicios a cambiar"],
      ["ids vacíos", { ids: [], category: "X" }, "Elige al menos un servicio"],
      ["201 ids", { ids: Array.from({ length: 201 }, (_, i) => `s-${i}`), category: "X" }, "Se pueden cambiar hasta 200 servicios a la vez"],
      ["ids que no son lista", { ids: "s-corte", category: "X" }, "Los servicios a cambiar tienen que ser una lista"],
      ["un id que no es texto", { ids: [1], category: "X" }, "Datos inválidos"],
      ["un id vacío", { ids: [""], category: "X" }, "Datos inválidos"],
      ["ni categoría ni estado", { ids: ["s-corte"] }, "Indica qué cambiar: la categoría o si están activos"],
      ["una categoría de 41 caracteres", { ids: ["s-corte"], category: "a".repeat(41) }, "La categoría no puede tener más de 40 caracteres"],
      ["un estado que es texto", { ids: ["s-corte"], active: "no" }, "Activo tiene que ser sí o no"],
    ])("%s: 400 con su mensaje y no cambia nada", async (_caso, cuerpo, mensaje) => {
      const antes = base.volcado()

      const res = await cambiar(sesiones.dueña, cuerpo)

      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: mensaje })
      expect(base.volcado()).toEqual(antes)
    })

    it("200 ids es el máximo", async () => {
      const res = await cambiar(sesiones.dueña, { ids: Array.from({ length: 200 }, (_, i) => `s-${i}`), active: false })

      expect(res.status).toBe(200)
    })

    it("un JSON roto es 400 y un cuerpo enorme es 413", async () => {
      expect((await cambiar(sesiones.dueña, "{ no")).status).toBe(400)
      expect((await cambiar(sesiones.dueña, "x".repeat(200 * 1024))).status).toBe(413)
    })
  })

  describe("límite de escrituras masivas", () => {
    it("cuenta por usuario en el balde de escrituras masivas", async () => {
      await cambiar(sesiones.encargado, { ids: ["s-corte"], active: false })

      expect(mockVerificarLimite).toHaveBeenCalledWith("serviciosEnLote", "usuario:u-encargado")
    })

    it("pasado el límite, 429 y no cambia nada", async () => {
      mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })
      const antes = base.volcado()

      const res = await cambiar(sesiones.dueña, { ids: ["s-corte"], active: false })

      expect(res.status).toBe(429)
      expect(base.volcado()).toEqual(antes)
    })
  })
})
