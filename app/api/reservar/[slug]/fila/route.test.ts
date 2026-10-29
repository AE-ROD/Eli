import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"
import { generarToken, hashDeToken } from "@/lib/tokens"
import { MOTIVO_SALIO_DE_LA_FILA } from "@/lib/fila-virtual"

/**
 * La fila virtual pública de punta a punta (#85): anotarse desde
 * `/fila/[slug]`, mirar el turno desde el celular, salir, y el aviso "ya casi
 * es tu turno" una sola vez.
 */

const mockVerificarLimite = vi.fn()
const mockQuedaLimite = vi.fn()
vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
  quedaLimite: (...args: unknown[]) => mockQuedaLimite(...args),
}))

const correos = vi.hoisted(() => ({
  aviso: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ data: { id: "correo" }, error: null })),
}))
vi.mock("@/lib/email", () => ({ enviarAvisoFilaVirtual: correos.aviso }))

// `after` guarda la tarea: el test la corre cuando quiere, como Next después de responder.
const tareas = vi.hoisted(() => [] as Array<() => unknown>)
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (tarea: () => unknown) => {
    tareas.push(tarea)
  },
}))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** El lunes 7 de enero de 2030 a las 12:00 en Santiago (UTC-3 en enero). */
const HOY = "2030-01-07"
const AHORA = new Date("2030-01-07T15:00:00.000Z")
/** El mismo día a las 20:30: el local cerró a las 20:00. */
const DE_NOCHE = new Date("2030-01-07T23:30:00.000Z")

type Registro = Record<string, unknown>

/** Los dos negocios con la fila encendida y abiertos de 9 a 20 todos los días. */
function escenario({ negocio = {} as Registro, visitas = [] as Registro[] } = {}) {
  const datos = datosBase()
  const horario = (businessId: string) =>
    [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      id: `h-${businessId}-${dayOfWeek}`,
      businessId,
      memberId: null,
      dayOfWeek,
      startTime: "09:00",
      endTime: "20:00",
    }))
  base.reiniciar({
    ...datos,
    business: datos.business.map((b) => ({ ...b, filaVirtualActiva: true, ...(b.id === NEGOCIO ? negocio : {}) })),
    workSchedule: [...horario(NEGOCIO), ...horario(OTRO_NEGOCIO)],
    visit: visitas,
  })
}

/** Alguien que ya está en la fila de hoy del negocio 1. */
const enFila = (id: string, numero: number, extra: Registro = {}): Registro => ({
  id,
  businessId: NEGOCIO,
  customerName: `Persona ${numero}`,
  status: "en-espera",
  arrivedAt: AHORA,
  origen: "fila",
  filaTokenHash: `hash-${id}`,
  filaFecha: HOY,
  filaNumero: numero,
  ...extra,
})

const pedidoJson = (cuerpo: unknown) =>
  new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  }) as unknown as NextRequest

const pedidoVacio = (metodo = "GET") => new Request("http://localhost/x", { method: metodo }) as unknown as NextRequest

async function anotarse(cuerpo: unknown = { nombre: "Juan Pérez" }, slug = "salon-uno") {
  const { POST } = await import("./route")
  const respuesta = await POST(pedidoJson(cuerpo), { params: Promise.resolve({ slug }) })
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function miTurno(token: string, slug = "salon-uno") {
  const { GET } = await import("./[token]/route")
  const respuesta = await GET(pedidoVacio(), { params: Promise.resolve({ slug, token }) })
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function salir(token: string, slug = "salon-uno") {
  const { POST } = await import("./[token]/route")
  const respuesta = await POST(pedidoVacio("POST"), { params: Promise.resolve({ slug, token }) })
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

/** El token que viaja en el enlace `/fila/[slug]/[token]`. */
const tokenDe = (enlace: string) => enlace.split("/").pop() ?? ""

const visitas = () => base.buscar("visit", {})
const deLaFila = (businessId = NEGOCIO) => visitas().filter((v) => v.businessId === businessId && v.origen === "fila")

async function correrTareas() {
  const pendientes = tareas.splice(0)
  for (const tarea of pendientes) await tarea()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  tareas.length = 0
  mockVerificarLimite.mockResolvedValue({ permitido: true })
  mockQuedaLimite.mockResolvedValue({ permitido: true })
  correos.aviso.mockResolvedValue({ data: { id: "correo" }, error: null })
  escenario()
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── Anotarse ────────────────────────────────────────────────────────────────

describe("POST /api/reservar/[slug]/fila: anotarse", () => {
  it("crea una atención en espera de origen fila, con el número 1 y sólo el hash del token", async () => {
    const { status, cuerpo } = await anotarse({ nombre: "  Juan Pérez ", email: "juan@correo.test" })
    expect(status).toBe(201)
    expect(cuerpo.numero).toBe(1)
    expect(cuerpo.enlace).toMatch(/^\/fila\/salon-uno\/[A-Za-z0-9_-]{43}$/)

    const [creada] = deLaFila()
    const token = tokenDe(cuerpo.enlace)
    expect(creada).toMatchObject({
      businessId: NEGOCIO,
      customerId: null,
      customerName: "Juan Pérez",
      status: "en-espera",
      origen: "fila",
      filaEmail: "juan@correo.test",
      filaFecha: HOY,
      filaNumero: 1,
      filaTokenHash: hashDeToken(token),
      filaAvisadaAt: null,
    })
    expect(JSON.stringify(visitas())).not.toContain(token)
  })

  it("el correo es opcional; vacío es sin correo", async () => {
    expect((await anotarse({ nombre: "Beto", email: "" })).status).toBe(201)
    expect(deLaFila()[0].filaEmail).toBeNull()
  })

  it.each([[{}], [{ nombre: "J" }], [{ nombre: "Juan", email: "no-es-correo" }], [null], ["texto"]])(
    "datos inválidos (%j): 400 sin crear nada",
    async (cuerpo) => {
      expect((await anotarse(cuerpo)).status).toBe(400)
      expect(deLaFila()).toHaveLength(0)
    }
  )

  it("numera sin repetir: sigue el mayor del día aunque se haya anulado, y cada día empieza en 1", async () => {
    escenario({
      visitas: [
        enFila("ayer", 9, { filaFecha: "2030-01-06" }),
        enFila("uno", 1, { status: "en-atencion" }),
        enFila("cuatro", 4, { status: "anulada" }),
      ],
    })
    const numeros = []
    for (const nombre of ["Ana Uno", "Bea Dos", "Cata Tres"]) numeros.push((await anotarse({ nombre })).cuerpo.numero)
    expect(numeros).toEqual([5, 6, 7])
    // Otro negocio, otra cuenta: su primera persona es la 1.
    expect((await anotarse({ nombre: "Otro" }, "salon-dos")).cuerpo.numero).toBe(1)
  })

  it("si dos se anotan a la vez y el número choca (P2002), reintenta con el siguiente", async () => {
    escenario({ visitas: [enFila("uno", 1)] })
    // La primera lectura del mayor llega vieja (como si otro se anotara entremedio).
    base.prisma.visit.findFirst.mockResolvedValueOnce({ filaNumero: 0 })
    const { status, cuerpo } = await anotarse()
    expect(status).toBe(201)
    expect(cuerpo.numero).toBe(2)
    expect(deLaFila().map((v) => v.filaNumero)).toEqual([1, 2])
  })

  it("toma el candado del negocio antes de contar y numerar", async () => {
    await anotarse()
    expect(base.prisma.$executeRaw).toHaveBeenCalled()
    const valores = base.prisma.$executeRaw.mock.calls[0].slice(1)
    expect(valores).toEqual([`fila:${NEGOCIO}`])
  })

  it("con la fila apagada o un negocio que no existe: el mismo 404, sin crear nada", async () => {
    escenario({ negocio: { filaVirtualActiva: false } })
    const apagada = await anotarse()
    const inexistente = await anotarse({ nombre: "Juan Pérez" }, "no-existe")
    expect(apagada).toEqual({ status: 404, cuerpo: { error: "No encontrado" } })
    expect(inexistente).toEqual(apagada)
    expect(deLaFila()).toHaveLength(0)
  })

  it("fuera del horario de atención: 409 y no se anota", async () => {
    vi.setSystemTime(DE_NOCHE)
    const { status, cuerpo } = await anotarse()
    expect(status).toBe(409)
    expect(cuerpo.error).toMatch(/no está atendiendo/)
    expect(deLaFila()).toHaveLength(0)
  })

  it("un día sin horario cargado también está cerrado", async () => {
    base.reiniciar({ ...datosBase(), business: datosBase().business.map((b) => ({ ...b, filaVirtualActiva: true })) })
    expect((await anotarse()).status).toBe(409)
  })

  it("con tantas personas esperando como el tope: 409; las que ya se atienden o salieron no cuentan", async () => {
    escenario({
      negocio: { filaVirtualTope: 2 },
      visitas: [
        enFila("a", 1),
        enFila("b", 2, { status: "en-atencion" }),
        enFila("c", 3, { status: "anulada" }),
        enFila("ayer", 1, { filaFecha: "2030-01-06" }),
      ],
    })
    expect((await anotarse({ nombre: "Entra Justo" })).status).toBe(201)
    const llena = await anotarse({ nombre: "No Entra" })
    expect(llena.status).toBe(409)
    expect(llena.cuerpo.error).toMatch(/llena/)
    expect(deLaFila().filter((v) => v.filaFecha === HOY && v.status === "en-espera")).toHaveLength(2)
  })

  it("cuenta por IP y por negocio; si cualquiera se pasa, 429 sin crear nada", async () => {
    await anotarse()
    expect(mockVerificarLimite).toHaveBeenCalledWith("filaVirtual", "203.0.113.7")
    expect(mockQuedaLimite).toHaveBeenCalledWith("filaVirtualPorNegocio", NEGOCIO)
    expect(mockVerificarLimite).toHaveBeenCalledWith("filaVirtualPorNegocio", NEGOCIO)

    mockVerificarLimite.mockResolvedValueOnce({ permitido: false })
    expect((await anotarse({ nombre: "Por IP" })).status).toBe(429)
    mockQuedaLimite.mockResolvedValueOnce({ permitido: false })
    expect((await anotarse({ nombre: "Por Negocio" })).status).toBe(429)
    expect(deLaFila()).toHaveLength(1)
  })

  it("el balde del negocio sólo se descuenta cuando la persona quedó anotada, no en los rechazos", async () => {
    const descuentosDelNegocio = () =>
      mockVerificarLimite.mock.calls.filter(([tipo]) => tipo === "filaVirtualPorNegocio").length

    // Local cerrado: no se descuenta.
    vi.setSystemTime(DE_NOCHE)
    for (let i = 0; i < 5; i++) expect((await anotarse({ nombre: `Cerrado ${i}` })).status).toBe(409)
    expect(descuentosDelNegocio()).toBe(0)

    // Fila llena: tampoco.
    vi.setSystemTime(AHORA)
    escenario({ negocio: { filaVirtualTope: 1 }, visitas: [enFila("a", 1)] })
    for (let i = 0; i < 5; i++) expect((await anotarse({ nombre: `Llena ${i}` })).status).toBe(409)
    expect(descuentosDelNegocio()).toBe(0)

    // Datos inválidos y negocio sin fila: ni se pregunta.
    expect((await anotarse({ nombre: "J" })).status).toBe(400)
    expect((await anotarse({ nombre: "Juan" }, "no-existe")).status).toBe(404)
    expect(descuentosDelNegocio()).toBe(0)

    // Anotada: una vez.
    escenario()
    expect((await anotarse()).status).toBe(201)
    expect(descuentosDelNegocio()).toBe(1)
  })

  it("al anotarse se programa el aviso: quien queda con 0 o 1 adelante y dejó correo lo recibe", async () => {
    escenario({ visitas: [enFila("a", 1)] })
    await anotarse({ nombre: "Bea Segunda", email: "bea@correo.test" })
    expect(tareas).toHaveLength(1)
    await correrTareas()
    expect(correos.aviso).toHaveBeenCalledTimes(1)
    expect(correos.aviso.mock.calls[0][0]).toMatchObject({ emailCliente: "bea@correo.test", nombreCliente: "Bea", numero: 2 })

    // Un rechazo no programa nada.
    tareas.length = 0
    escenario({ negocio: { filaVirtualTope: 1 }, visitas: [enFila("a", 1)] })
    await anotarse({ nombre: "No Entra", email: "no@correo.test" })
    expect(tareas).toHaveLength(0)
  })

  it("un nombre de más de 40 caracteres: 400 sin crear nada", async () => {
    expect((await anotarse({ nombre: "a".repeat(41) })).status).toBe(400)
    expect((await anotarse({ nombre: "a".repeat(40) })).status).toBe(201)
    expect(deLaFila()).toHaveLength(1)
  })
})

// ─── Mi turno ────────────────────────────────────────────────────────────────

describe("GET /api/reservar/[slug]/fila/[token]: mi turno", () => {
  it("número, posición (cuántos esperan antes) y tiempo estimado; sin datos de otras personas", async () => {
    escenario({ visitas: [enFila("a", 1, { filaEmail: "a@correo.test" }), enFila("b", 2, { status: "en-atencion" }), enFila("c", 3)] })
    const { cuerpo } = await anotarse({ nombre: "Juan Pérez" })
    const token = tokenDe(cuerpo.enlace)

    const turno = await miTurno(token)
    expect(turno.status).toBe(200)
    // Los servicios activos del negocio duran 30 min (el default): 2 adelante × 30.
    expect(turno.cuerpo).toEqual({
      negocio: "Salón Uno",
      numero: 4,
      nombre: "Juan Pérez",
      estado: "esperando",
      adelante: 2,
      minutos: 60,
    })
    const texto = JSON.stringify(turno.cuerpo)
    expect(texto).not.toMatch(/Persona|a@correo/)
    expect(mockVerificarLimite).toHaveBeenCalledWith("lecturaPublica", "203.0.113.7")
    expect(mockVerificarLimite).toHaveBeenCalledWith("posicionEnFila", hashDeToken(token))
  })

  it("el primero de la fila no tiene a nadie adelante", async () => {
    const { cuerpo } = await anotarse()
    expect((await miTurno(tokenDe(cuerpo.enlace))).cuerpo).toMatchObject({ estado: "esperando", adelante: 0, minutos: 0 })
  })

  it("dice cuándo lo están atendiendo, cuándo terminó y si ya no está en la fila", async () => {
    const tokens = { espera: generarToken(), atencion: generarToken(), cobrada: generarToken(), anulada: generarToken(), vieja: generarToken() }
    escenario({
      visitas: [
        enFila("atencion", 1, { status: "en-atencion", filaTokenHash: tokens.atencion.tokenHash }),
        enFila("cobrada", 2, { status: "finalizada", filaTokenHash: tokens.cobrada.tokenHash }),
        enFila("anulada", 3, { status: "anulada", filaTokenHash: tokens.anulada.tokenHash }),
        enFila("vieja", 3, { filaFecha: "2030-01-06", filaTokenHash: tokens.vieja.tokenHash }),
      ],
    })
    expect((await miTurno(tokens.atencion.token)).cuerpo.estado).toBe("atendiendo")
    expect((await miTurno(tokens.cobrada.token)).cuerpo.estado).toBe("terminado")
    expect((await miTurno(tokens.anulada.token)).cuerpo.estado).toBe("fuera")
    expect((await miTurno(tokens.vieja.token)).cuerpo).toMatchObject({ estado: "vencido", adelante: 0 })
  })

  it("un token de otro negocio, inventado o mal formado: 404", async () => {
    const ajeno = await anotarse({ nombre: "De Otro" }, "salon-dos")
    const tokenAjeno = tokenDe(ajeno.cuerpo.enlace)
    expect((await miTurno(tokenAjeno, "salon-dos")).status).toBe(200)

    expect(await miTurno(tokenAjeno, "salon-uno")).toEqual({ status: 404, cuerpo: { error: "No encontrado" } })
    expect((await miTurno(generarToken().token)).status).toBe(404)
    expect((await miTurno("corto")).status).toBe(404)
    expect((await miTurno(tokenAjeno, "no-existe")).status).toBe(404)
  })

  it("con el límite agotado: 429", async () => {
    const { cuerpo } = await anotarse()
    mockVerificarLimite.mockResolvedValueOnce({ permitido: true }).mockResolvedValueOnce({ permitido: false })
    expect((await miTurno(tokenDe(cuerpo.enlace))).status).toBe(429)
  })
})

// ─── Salir ───────────────────────────────────────────────────────────────────

describe("POST /api/reservar/[slug]/fila/[token]: salir de la fila", () => {
  it("anula la atención, los que venían atrás avanzan y se programa el aviso", async () => {
    const primero = await anotarse({ nombre: "Ana Primera" })
    const segundo = await anotarse({ nombre: "Bea Segunda" })
    expect((await miTurno(tokenDe(segundo.cuerpo.enlace))).cuerpo.adelante).toBe(1)
    // Las de anotarse no importan acá.
    tareas.length = 0

    expect(await salir(tokenDe(primero.cuerpo.enlace))).toEqual({ status: 200, cuerpo: { mensaje: "Listo. Saliste de la fila." } })
    const anulada = deLaFila().find((v) => v.customerName === "Ana Primera")
    expect(anulada).toMatchObject({ status: "anulada", voidReason: MOTIVO_SALIO_DE_LA_FILA })
    expect(anulada?.voidedAt).toEqual(AHORA)
    expect(tareas).toHaveLength(1)

    expect((await miTurno(tokenDe(primero.cuerpo.enlace))).cuerpo.estado).toBe("fuera")
    expect((await miTurno(tokenDe(segundo.cuerpo.enlace))).cuerpo.adelante).toBe(0)
  })

  it("salir dos veces responde lo mismo y no programa otro aviso", async () => {
    const { cuerpo } = await anotarse()
    tareas.length = 0
    await salir(tokenDe(cuerpo.enlace))
    expect((await salir(tokenDe(cuerpo.enlace))).status).toBe(200)
    expect(tareas).toHaveLength(1)
  })

  it("a quien ya están atendiendo no se lo saca: 409", async () => {
    const { token, tokenHash } = generarToken()
    escenario({ visitas: [enFila("a", 1, { status: "en-atencion", filaTokenHash: tokenHash })] })
    expect((await salir(token)).status).toBe(409)
    expect(deLaFila()[0].status).toBe("en-atencion")
  })

  it("con un token de otro negocio: 404 y no toca nada", async () => {
    const ajeno = await anotarse({ nombre: "De Otro" }, "salon-dos")
    expect((await salir(tokenDe(ajeno.cuerpo.enlace), "salon-uno")).status).toBe(404)
    expect(deLaFila(OTRO_NEGOCIO)[0].status).toBe("en-espera")
    expect(mockVerificarLimite).toHaveBeenCalledWith("bajaPorToken", "fila:203.0.113.7")
  })
})

// ─── Aviso "ya casi es tu turno" ─────────────────────────────────────────────

describe("aviso por correo cuando queda 1 persona adelante", () => {
  it("le llega una sola vez a quien quedó con 1 (o 0) adelante y dejó correo", async () => {
    const { avisarFilaVirtual } = await import("@/lib/fila-virtual-servidor")
    escenario({
      visitas: [
        enFila("a", 1),
        enFila("b", 2, { filaEmail: "b@correo.test", customerName: "Bea <b>Dos</b>" }),
        enFila("c", 3, { filaEmail: "c@correo.test" }),
        enFila("de-otro", 1, { businessId: OTRO_NEGOCIO, filaEmail: "otro@correo.test" }),
      ],
    })

    expect(await avisarFilaVirtual(NEGOCIO)).toBe(1)
    expect(correos.aviso).toHaveBeenCalledTimes(1)
    expect(correos.aviso).toHaveBeenCalledWith({
      emailCliente: "b@correo.test",
      // Sólo el primer nombre.
      nombreCliente: "Bea",
      nombreNegocio: "Salón Uno",
      numero: 2,
    })
    expect(base.buscar("visit", { id: "b" })[0].filaAvisadaAt).toEqual(AHORA)

    // Otra vuelta sin cambios: nadie más.
    expect(await avisarFilaVirtual(NEGOCIO)).toBe(0)
    expect(correos.aviso).toHaveBeenCalledTimes(1)
  })

  it("salir de la fila dispara el aviso al que quedó segundo", async () => {
    const { token, tokenHash } = generarToken()
    escenario({
      visitas: [enFila("a", 1, { filaTokenHash: tokenHash }), enFila("b", 2), enFila("c", 3, { filaEmail: "c@correo.test" })],
    })
    await salir(token)
    await correrTareas()
    expect(correos.aviso).toHaveBeenCalledTimes(1)
    expect(correos.aviso.mock.calls[0][0]).toMatchObject({ emailCliente: "c@correo.test", numero: 3 })
    expect(base.buscar("visit", { id: "c" })[0].filaAvisadaAt).not.toBeNull()
  })

  it("si el envío falla (o no hay clave de Resend), la marca se borra y el próximo cambio lo reintenta", async () => {
    const { avisarFilaVirtual } = await import("@/lib/fila-virtual-servidor")
    escenario({ visitas: [enFila("a", 1, { filaEmail: "a@correo.test" })] })

    correos.aviso.mockResolvedValueOnce(null)
    expect(await avisarFilaVirtual(NEGOCIO)).toBe(0)
    expect(base.buscar("visit", { id: "a" })[0].filaAvisadaAt).toBeNull()

    correos.aviso.mockRejectedValueOnce(new Error("Resend caído"))
    expect(await avisarFilaVirtual(NEGOCIO)).toBe(0)
    expect(base.buscar("visit", { id: "a" })[0].filaAvisadaAt).toBeNull()

    expect(await avisarFilaVirtual(NEGOCIO)).toBe(1)
    expect(base.buscar("visit", { id: "a" })[0].filaAvisadaAt).toEqual(AHORA)
  })

  it("la fila de otro día no se avisa", async () => {
    const { avisarFilaVirtual } = await import("@/lib/fila-virtual-servidor")
    escenario({ visitas: [enFila("vieja", 1, { filaFecha: "2030-01-06", filaEmail: "v@correo.test" })] })
    expect(await avisarFilaVirtual(NEGOCIO)).toBe(0)
    expect(correos.aviso).not.toHaveBeenCalled()
  })
})
