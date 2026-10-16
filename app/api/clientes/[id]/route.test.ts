import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseDeClientes, escenarioDeClientes } from "../_pruebas/base-de-clientes"
import { NEGOCIO, conId, pedido, sesiones } from "@/app/api/atenciones/_pruebas/datos"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

/**
 * La base falsa filtra de verdad con el `where` que arma el endpoint, también
 * el de las citas anidadas, y lanza ante lo que no entiende. Así estos tests
 * miran qué devuelve y qué queda escrito, no la forma de la consulta.
 */
const base = crearBaseDeClientes()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** Token viejo o mal formado: hay usuario, pero ningún negocio al que atarlo. */
const sesionSinNegocio = { user: { id: "u-viejo", role: "owner", businessId: "", businessName: "" } }

const URL_DE_MARIA = "http://localhost/api/clientes/c-maria"

interface CitaDelHistorial {
  id: string
}

const idsDeCitas = (cliente: { appointments: CitaDelHistorial[] }) => cliente.appointments.map((c) => c.id)

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar(escenarioDeClientes())
})

describe("GET /api/clientes/[id]", () => {
  it("un cliente de otro negocio: 404, no 403", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await GET(pedido(URL_DE_MARIA), conId("c-ajeno"))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Cliente no encontrado" })
  })

  it("un cliente de otro negocio responde igual que uno que no existe: no se puede averiguar cuál es cuál", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const resAjeno = await GET(pedido(URL_DE_MARIA), conId("c-ajeno"))

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const resInexistente = await GET(pedido(URL_DE_MARIA), conId("cliente-que-no-existe"))

    expect(resAjeno.status).toBe(resInexistente.status)
    expect(await resAjeno.json()).toEqual(await resInexistente.json())
  })

  it("la consulta acota por el negocio de la sesión también en las citas: una de otro negocio que apunte al cliente no aparece", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await GET(pedido(URL_DE_MARIA), conId("c-maria"))
    const cliente = await res.json()

    expect(res.status).toBe(200)
    expect(idsDeCitas(cliente)).not.toContain("cita-cruzada")
    expect(JSON.stringify(cliente)).not.toContain("Nota del otro negocio")
  })

  it("un cliente del propio negocio sí se ve", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await GET(pedido(URL_DE_MARIA), conId("c-maria"))

    expect(res.status).toBe(200)
    expect((await res.json()).id).toBe("c-maria")
  })

  it("los clientes son del negocio, no del profesional: un worker del mismo negocio también llega, aunque no lo haya atendido", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)

    const res = await GET(pedido(URL_DE_MARIA), conId("c-beto"))
    const cliente = await res.json()

    expect(res.status).toBe(200)
    expect(cliente.id).toBe("c-beto")
    // Beto sólo se atendió con Pedro: el cliente existe para Carla, su historial con él no.
    expect(cliente.appointments).toEqual([])
  })

  it("el otro negocio no llega a los clientes de este: el aislamiento va en los dos sentidos", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueñoAjeno)
    const resAjeno = await GET(pedido(URL_DE_MARIA), conId("c-maria"))
    expect(resAjeno.status).toBe(404)

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueñoAjeno)
    const resPropio = await GET(pedido(URL_DE_MARIA), conId("c-ajeno"))
    expect(resPropio.status).toBe(200)
    expect(idsDeCitas(await resPropio.json())).toEqual(["cita-ajena"])
  })

  it("sin sesión recibe 401 y no toca la base", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await GET(pedido(URL_DE_MARIA), conId("c-maria"))

    expect(res.status).toBe(401)
    expect(base.prisma.customer.findFirst).not.toHaveBeenCalled()
  })

  it("una sesión sin negocio recibe 401 y no toca la base", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionSinNegocio)

    const res = await GET(pedido(URL_DE_MARIA), conId("c-maria"))

    expect(res.status).toBe(401)
    expect(base.prisma.customer.findFirst).not.toHaveBeenCalled()
  })

  it.each([
    ["la dueña", sesiones.dueña],
    ["el encargado", sesiones.encargado],
  ])("%s ve todo el historial del cliente en su negocio, de la cita más reciente a la más vieja", async (_quien, sesion) => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesion)

    const res = await GET(pedido(URL_DE_MARIA), conId("c-maria"))

    expect(idsDeCitas(await res.json())).toEqual(["cita-publica", "cita-pedro-otra", "cita-pedro", "cita-carla"])
  })

  it("el profesional ve sólo sus citas con el cliente: ni las de su colega, ni sus notas, ni lo que cobró", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)
    const resCarla = await GET(pedido(URL_DE_MARIA), conId("c-maria"))
    const deCarla = await resCarla.json()

    expect(resCarla.status).toBe(200)
    expect(idsDeCitas(deCarla)).toEqual(["cita-carla"])
    expect(JSON.stringify(deCarla)).not.toContain("Nota interna de Pedro")
    expect(deCarla.appointments.map((c: { price: number | null }) => c.price)).toEqual([8000])

    // Y al revés: Pedro no ve la de Carla.
    mockGetServerSession.mockResolvedValueOnce(sesiones.pedro)
    const dePedro = await (await GET(pedido(URL_DE_MARIA), conId("c-maria"))).json()

    expect(idsDeCitas(dePedro)).toEqual(["cita-pedro-otra", "cita-pedro"])
  })

  it("un profesional sin memberId ve al cliente, pero ningún historial: falla cerrado", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.sinMiembro)

    const res = await GET(pedido(URL_DE_MARIA), conId("c-maria"))
    const cliente = await res.json()

    expect(res.status).toBe(200)
    expect(cliente.id).toBe("c-maria")
    expect(cliente.appointments).toEqual([])
  })

  it("cada cita trae sólo lo que dibuja el historial: ni notas internas ni comentarios del cliente", async () => {
    const { GET } = await import("./route")

    // La dueña ve todas: si algún campo de más se colara, estaría acá.
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const cliente = await (await GET(pedido(URL_DE_MARIA), conId("c-maria"))).json()

    expect(cliente.appointments).toHaveLength(4)
    for (const citaDelHistorial of cliente.appointments) {
      expect(Object.keys(citaDelHistorial).sort()).toEqual(["endTime", "id", "price", "startTime", "status", "title"])
    }
    expect(JSON.stringify(cliente)).not.toMatch(/Nota interna|Prefiere la tarde|Reservé por la web/)
  })

  it("del cliente se sigue devolviendo lo mismo que antes del `select`: sólo cambió el historial", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const cliente = await (await GET(pedido(URL_DE_MARIA), conId("c-maria"))).json()

    expect(Object.keys(cliente).sort()).toEqual([
      "appointments",
      "businessId",
      "cedula",
      "createdAt",
      "email",
      "id",
      "lastName",
      "name",
      "notes",
      "phone",
      "tags",
      "updatedAt",
    ])
    expect(cliente).toMatchObject({ id: "c-maria", name: "María", lastName: "González", businessId: NEGOCIO })
  })
})

describe("PUT /api/clientes/[id]", () => {
  it("no se puede editar un cliente de otro negocio: 404, no 403, y la base queda igual", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const antes = base.volcado()

    const res = await PUT(pedido(URL_DE_MARIA, { name: "Hackeada" }), conId("c-ajeno"))

    expect(res.status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("un cliente del propio negocio sí se edita, y la respuesta es el cliente actualizado", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await PUT(pedido(URL_DE_MARIA, { name: "María José", notes: "Viene cada mes" }), conId("c-maria"))

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: "c-maria", name: "María José", notes: "Viene cada mes" })
    expect(base.buscar("customer", { id: "c-maria" })[0]).toMatchObject({ name: "María José", notes: "Viene cada mes" })
  })

  it("el cuerpo no puede mudar al cliente a otro negocio: `businessId` nunca llega a la base", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    await PUT(pedido(URL_DE_MARIA, { name: "María", businessId: "negocio-2" }), conId("c-maria"))

    expect(base.buscar("customer", { id: "c-maria" })[0].businessId).toBe(NEGOCIO)
  })

  it("sin sesión recibe 401 y no toca la base", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)
    const antes = base.volcado()

    const res = await PUT(pedido(URL_DE_MARIA, { name: "xx" }), conId("c-maria"))

    expect(res.status).toBe(401)
    expect(base.prisma.customer.findFirst).not.toHaveBeenCalled()
    expect(base.volcado()).toEqual(antes)
  })

  it("una sesión sin negocio recibe 401 y no escribe nada", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionSinNegocio)
    const antes = base.volcado()

    const res = await PUT(pedido(URL_DE_MARIA, { notes: "x" }), conId("c-maria"))

    expect(res.status).toBe(401)
    expect(base.volcado()).toEqual(antes)
  })

  it("el profesional también guarda notas del cliente: el cliente es del negocio, no de quien lo atendió", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)

    const res = await PUT(pedido(URL_DE_MARIA, { notes: "Pidió turno a la tarde" }), conId("c-beto"))

    expect(res.status).toBe(200)
    expect(base.buscar("customer", { id: "c-beto" })[0].notes).toBe("Pidió turno a la tarde")
  })
})

describe("DELETE /api/clientes/[id]", () => {
  it("no se puede borrar un cliente de otro negocio: 404, no 403", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await DELETE(pedido(URL_DE_MARIA), conId("c-ajeno"))

    expect(res.status).toBe(404)
    expect(base.buscar("customer", { id: "c-ajeno" })).toHaveLength(1)
  })

  it("un cliente del propio negocio sí se borra", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await DELETE(pedido(URL_DE_MARIA), conId("c-maria"))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ mensaje: "Cliente eliminado" })
    expect(base.buscar("customer", { id: "c-maria" })).toEqual([])
    expect(base.buscar("customer", { id: "c-ajeno" })).toHaveLength(1)
  })

  it("un id que no existe responde igual que uno de otro negocio", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const resInexistente = await DELETE(pedido(URL_DE_MARIA), conId("cliente-que-no-existe"))

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const resAjeno = await DELETE(pedido(URL_DE_MARIA), conId("c-ajeno"))

    expect(resInexistente.status).toBe(404)
    expect(await resInexistente.json()).toEqual(await resAjeno.json())
  })

  it("sin sesión recibe 401 y no borra nada", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)
    const antes = base.volcado()

    const res = await DELETE(pedido(URL_DE_MARIA), conId("c-maria"))

    expect(res.status).toBe(401)
    expect(base.volcado()).toEqual(antes)
  })
})
