import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseDeClientes, escenarioDeClientes } from "../_pruebas/base-de-clientes"
import { NEGOCIO, atencion, conId, linea, pago, pedido, sesiones } from "@/pruebas/datos"
import { MARCA_DE_CLIENTE_ELIMINADO, NOMBRE_DE_CLIENTE_ELIMINADO, datosDeClienteEliminado } from "@/lib/clientes-eliminados"

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

  it("un cliente del propio negocio se elimina anonimizándolo: sin ningún dato personal, y el ajeno igual que antes", async () => {
    const { DELETE } = await import("./route")

    base.reiniciar({
      ...escenarioDeClientes(),
      customer: escenarioDeClientes().customer.map((cliente) =>
        cliente.id === "c-maria"
          ? {
              ...cliente,
              cedula: "12.345.678-9",
              email: "maria@correo.test",
              phone: "+56 9 1234 5678",
              notes: "Alérgica al amoníaco",
              tags: ["VIP", "Frecuente"],
            }
          : cliente
      ),
    })
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const ajenoAntes = base.buscar("customer", { id: "c-ajeno" })

    const res = await DELETE(pedido(URL_DE_MARIA), conId("c-maria"))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ mensaje: "Cliente eliminado" })
    expect(base.buscar("customer", { id: "c-maria" })[0]).toMatchObject({
      id: "c-maria",
      businessId: NEGOCIO,
      name: NOMBRE_DE_CLIENTE_ELIMINADO,
      lastName: null,
      cedula: null,
      email: null,
      phone: null,
      notes: null,
      tags: [MARCA_DE_CLIENTE_ELIMINADO],
    })
    expect(JSON.stringify(base.buscar("customer", { id: "c-maria" }))).not.toMatch(/María|González|maria@|1234|amoníaco|VIP|12\.345/)
    expect(base.buscar("customer", { id: "c-ajeno" })).toEqual(ajenoAntes)
  })

  /** Las filas del negocio 1 que apuntan a María: lo que la eliminación tiene que dejar sin datos suyos. */
  const lodeMaria = () => ({
    cliente: base.buscar("customer", { id: "c-maria" }),
    citas: base.buscar("appointment", { customerId: "c-maria", businessId: NEGOCIO }),
    atenciones: base.buscar("visit", { customerId: "c-maria", businessId: NEGOCIO }),
  })

  const conAtencionDeMaria = () =>
    base.reiniciar({
      ...escenarioDeClientes(),
      visit: [
        atencion("v-cobrada", {
          status: "finalizada",
          appointmentId: "cita-carla",
          paidAt: new Date("2026-09-01T14:00:00.000Z"),
          totalCents: 800000,
          notes: "Vino con su hija Ana",
        }),
        atencion("v-anulada", {
          status: "anulada",
          voidedAt: new Date("2026-09-02T14:00:00.000Z"),
          voidedById: "u-duena",
          voidedByName: "Ana Dueña",
          voidReason: "María se fue antes, llamar al +56 9 1234 5678",
        }),
      ],
      visitService: [linea("l-1", "v-cobrada")],
      visitPayment: [pago("p-1", "v-cobrada", "efectivo", 8000)],
    })

  it("no queda ningún dato personal suyo en ninguna tabla: ni en la ficha, ni en sus citas, ni en sus atenciones", async () => {
    const { DELETE } = await import("./route")

    conAtencionDeMaria()
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await DELETE(pedido(URL_DE_MARIA), conId("c-maria"))

    expect(res.status).toBe(200)
    const despues = lodeMaria()
    expect(despues.citas).toHaveLength(4)
    expect(despues.atenciones).toHaveLength(2)
    expect(JSON.stringify(despues)).not.toMatch(
      /María|González|Nota interna|Prefiere la tarde|foto de referencia|Reservé por la web|hija Ana|1234 5678/
    )
    for (const cita of despues.citas) expect(cita).toMatchObject({ notes: null, clientComments: null })
    for (const atencionDeMaria of despues.atenciones) {
      expect(atencionDeMaria).toMatchObject({ customerName: NOMBRE_DE_CLIENTE_ELIMINADO, notes: null, voidReason: null })
    }
  })

  it("montos, fechas, servicios, profesionales y pagos no cambian: los reportes suman lo mismo", async () => {
    const { DELETE } = await import("./route")

    conAtencionDeMaria()
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const antes = lodeMaria()
    const lineasAntes = base.buscar("visitService", {})
    const pagosAntes = base.buscar("visitPayment", {})

    await DELETE(pedido(URL_DE_MARIA), conId("c-maria"))

    const despues = lodeMaria()
    const sinTextos = (fila: Record<string, unknown>) => {
      const { notes: _notas, clientComments: _comentarios, customerName: _nombre, voidReason: _motivo, updatedAt: _cambio, ...resto } = fila
      return resto
    }
    expect(despues.citas.map(sinTextos)).toEqual(antes.citas.map(sinTextos))
    expect(despues.atenciones.map(sinTextos)).toEqual(antes.atenciones.map(sinTextos))
    expect(base.buscar("visitService", {})).toEqual(lineasAntes)
    expect(base.buscar("visitPayment", {})).toEqual(pagosAntes)
  })

  it("las escrituras se acotan al negocio: una cita de otro negocio que apunte al cliente no se toca", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const cruzadaAntes = base.buscar("appointment", { id: "cita-cruzada" })

    await DELETE(pedido(URL_DE_MARIA), conId("c-maria"))

    expect(base.buscar("appointment", { id: "cita-cruzada" })).toEqual(cruzadaAntes)
  })

  it("es todo o nada: si una escritura falla, no queda un cliente a medio borrar", async () => {
    const { DELETE } = await import("./route")

    conAtencionDeMaria()
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    vi.mocked(base.prisma.visit.updateMany).mockRejectedValueOnce(new Error("se cayó la base"))
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const antes = base.volcado()

    const res = await DELETE(pedido(URL_DE_MARIA), conId("c-maria"))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "No se pudo eliminar el cliente" })
    expect(base.volcado()).toEqual(antes)
    log.mockRestore()
  })

  it("un cliente eliminado ya no se lee, no se edita ni se vuelve a eliminar: responde como uno que no existe", async () => {
    const { DELETE, GET, PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    await DELETE(pedido(URL_DE_MARIA), conId("c-maria"))
    const despuesDeEliminar = base.volcado()

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const resLeer = await GET(pedido(URL_DE_MARIA), conId("c-maria"))
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const resEditar = await PUT(pedido(URL_DE_MARIA, { name: "María de vuelta", tags: [] }), conId("c-maria"))
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const resEliminar = await DELETE(pedido(URL_DE_MARIA), conId("c-maria"))

    expect([resLeer.status, resEditar.status, resEliminar.status]).toEqual([404, 404, 404])
    expect(base.volcado()).toEqual(despuesDeEliminar)
  })

  it("un PUT que llega mientras se elimina no le devuelve datos al cliente anonimizado: 404, y queda anonimizado", async () => {
    const { PUT } = await import("./route")

    // La eliminación se confirma entre la verificación del PUT y su escritura.
    const escribir = base.prisma.customer.updateMany.getMockImplementation()!
    base.prisma.customer.updateMany.mockImplementationOnce(async (args) => {
      await base.prisma.customer.update({ where: { id: "c-maria" }, data: datosDeClienteEliminado() })
      return escribir(args)
    })
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await PUT(
      pedido(URL_DE_MARIA, { name: "María", email: "maria@correo.test", phone: "+56 9 1234 5678", tags: ["VIP"] }),
      conId("c-maria")
    )

    expect(res.status).toBe(404)
    expect(base.buscar("customer", { id: "c-maria" })[0]).toMatchObject({
      name: NOMBRE_DE_CLIENTE_ELIMINADO,
      email: null,
      phone: null,
      tags: [MARCA_DE_CLIENTE_ELIMINADO],
    })
  })

  it("el título de sus citas con servicio vuelve a ser el nombre del servicio; sin servicio, queda", async () => {
    const { DELETE } = await import("./route")

    base.reiniciar({
      ...escenarioDeClientes(),
      appointment: escenarioDeClientes().appointment.map((cita) =>
        cita.id === "cita-carla"
          ? { ...cita, serviceId: "s-corte", title: "Corte para María González" }
          : cita.id === "cita-pedro"
            ? { ...cita, serviceId: null, title: "Color (sin servicio del catálogo)" }
            : cita
      ),
    })
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    await DELETE(pedido(URL_DE_MARIA), conId("c-maria"))

    expect(base.buscar("appointment", { id: "cita-carla" })[0].title).toBe("Corte")
    expect(base.buscar("appointment", { id: "cita-pedro" })[0].title).toBe("Color (sin servicio del catálogo)")
  })

  it("nadie pone la marca de eliminado a mano: 400, y el cliente sigue igual", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const antes = base.volcado()

    const res = await PUT(pedido(URL_DE_MARIA, { tags: [MARCA_DE_CLIENTE_ELIMINADO] }), conId("c-maria"))

    expect(res.status).toBe(400)
    expect(base.volcado()).toEqual(antes)
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

/**
 * Decisión del dueño (PRODUCTO.md, sección 10): la profesional ve los
 * clientes, los crea y anota en sus notas. Cambiar los datos del cliente y
 * borrarlo es de dueño y encargado. Para un cliente ajeno sigue siendo 404:
 * primero se pregunta si existe en el negocio, después si se puede.
 */
describe("PUT y DELETE /api/clientes/[id] — qué puede la profesional", () => {
  const profesionales = [
    ["la profesional", sesiones.carla],
    ["un profesional sin memberId", sesiones.sinMiembro],
  ] as const

  it.each([
    ["el nombre", { name: "Beto Cambiado" }],
    ["el email", { email: "otro@correo.test" }],
    ["el teléfono", { phone: "+56 9 0000 0000" }],
    ["las etiquetas", { tags: ["VIP"] }],
    ["un dato junto con las notas", { notes: "Viene los martes", name: "Beto Cambiado" }],
  ])("la profesional no cambia %s: 401 como el resto del panel, y la base queda igual", async (_que, cuerpo) => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)
    const antes = base.volcado()

    const res = await PUT(pedido(URL_DE_MARIA, cuerpo), conId("c-beto"))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "No autorizado" })
    expect(base.volcado()).toEqual(antes)
  })

  it.each(profesionales)("%s que edita datos de un cliente ajeno recibe 404, no 401: no se entera de que existe", async (_quien, sesion) => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesion)
    const antes = base.volcado()

    const res = await PUT(pedido(URL_DE_MARIA, { name: "Hackeada" }), conId("c-ajeno"))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Cliente no encontrado" })
    expect(base.volcado()).toEqual(antes)
  })

  it("la profesional sí guarda sólo las notas, y nada más cambia", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)

    const res = await PUT(pedido(URL_DE_MARIA, { notes: "Alérgica al amoníaco" }), conId("c-maria"))

    expect(res.status).toBe(200)
    expect(base.buscar("customer", { id: "c-maria" })[0]).toMatchObject({
      name: "María",
      lastName: "González",
      notes: "Alérgica al amoníaco",
    })
  })

  it.each([
    ["la dueña", sesiones.dueña],
    ["el encargado", sesiones.encargado],
  ])("%s edita los datos del cliente", async (_quien, sesion) => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesion)

    const res = await PUT(pedido(URL_DE_MARIA, { name: "Beto Cambiado", tags: ["VIP"] }), conId("c-beto"))

    expect(res.status).toBe(200)
    expect(base.buscar("customer", { id: "c-beto" })[0]).toMatchObject({ name: "Beto Cambiado", tags: ["VIP"] })
  })

  it.each(profesionales)("%s no borra un cliente del negocio: 401, y el cliente sigue", async (_quien, sesion) => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesion)
    const antes = base.volcado()

    const res = await DELETE(pedido(URL_DE_MARIA), conId("c-maria"))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "No autorizado" })
    expect(base.volcado()).toEqual(antes)
  })

  it.each(profesionales)("%s que borra un cliente ajeno recibe 404, no 401", async (_quien, sesion) => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesion)

    const res = await DELETE(pedido(URL_DE_MARIA), conId("c-ajeno"))

    expect(res.status).toBe(404)
    expect(base.buscar("customer", { id: "c-ajeno" })).toHaveLength(1)
  })

  it("el encargado sí elimina un cliente del negocio", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.encargado)

    const res = await DELETE(pedido(URL_DE_MARIA), conId("c-beto"))

    expect(res.status).toBe(200)
    expect(base.buscar("customer", { id: "c-beto" })[0]).toMatchObject({ name: NOMBRE_DE_CLIENTE_ELIMINADO, tags: [MARCA_DE_CLIENTE_ELIMINADO] })
  })
})

describe("PUT /api/clientes/[id] — largos y tipos", () => {
  it.each([
    ["un nombre de 101 caracteres", { name: "a".repeat(101) }, "El nombre no puede tener más de 100 caracteres"],
    ["un teléfono de 31 caracteres", { phone: "1".repeat(31) }, "El teléfono no puede tener más de 30 caracteres"],
    ["un email que no es email", { email: "ana-arroba-correo" }, "El email no es válido"],
    ["unas notas de 2001 caracteres", { notes: "a".repeat(2001) }, "Las notas no pueden tener más de 2000 caracteres"],
    ["21 etiquetas", { tags: Array.from({ length: 21 }, (_, i) => `e${i}`) }, "No puede haber más de 20 etiquetas"],
    ["etiquetas que no son una lista", { tags: "VIP" }, "Datos inválidos"],
  ])("rechaza %s: 400 con un error legible, sin `detalles`, y la base queda igual", async (_caso, cuerpo, mensaje) => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const antes = base.volcado()

    const res = await PUT(pedido(URL_DE_MARIA, cuerpo), conId("c-maria"))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: mensaje })
    expect(base.volcado()).toEqual(antes)
  })

  it("la profesional que manda unas notas demasiado largas recibe 400, no 401: lo que manda es suyo", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)

    const res = await PUT(pedido(URL_DE_MARIA, { notes: "a".repeat(2001) }), conId("c-maria"))

    expect(res.status).toBe(400)
  })
})
