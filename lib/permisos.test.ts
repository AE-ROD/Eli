import { describe, it, expect } from "vitest"
import { coincideConWhere } from "@/pruebas/where-simple"
import { coincide, type Tablas } from "@/pruebas/consultas-falsas"
import {
  actorDeSesion,
  mismoNegocio,
  puedeGestionarEquipo,
  puedeCambiarRolDe,
  puedeEditarComisiones,
  puedeGestionarSuscripcion,
  veLaListaDeInicio,
  puedeInvitarNegocios,
  puedeAsignarCitasAOtros,
  veElPanelDeSuDia,
  puedeVerIngresosDelNegocio,
  puedeVerLiquidacionDe,
  puedeVerTodaLaAgenda,
  puedeEditarHorarioDe,
  puedeGestionarBloqueoDe,
  puedeDefinirServiciosDe,
  puedeEditarPlazoDeCambios,
  puedeVerTodoElTablero,
  puedeCobrar,
  puedeAsignarLineasAOtros,
  puedeAnotarSinReserva,
  puedeAnular,
  puedeDeshacerLlegada,
  puedeVerAnuladas,
  puedeVerCita,
  puedeUsarChats,
  puedeEditarDatosDeCliente,
  puedeBorrarCliente,
  puedeImportarExportarClientes,
  puedeEditarPaginaDelNegocio,
  memberIdParaCita,
  profesionalParaLinea,
  whereDeAgenda,
  whereDeClientes,
  whereDeAtenciones,
  whereDeLineas,
  whereDePagos,
  whereDeBloqueos,
  puedeVerHistorialDeComisiones,
  puedeGestionarProductos,
  puedeFijarComisionDeProducto,
  puedeRegistrarPropina,
  puedeConfigurarLiquidacion,
  puedeVerLiquidacionesDelEquipo,
  puedeCerrarLiquidacion,
  puedePagarLiquidacion,
  puedeAnularLiquidacion,
  puedeRegistrarAjuste,
  puedeRegistrarAdelanto,
  veMiPlata,
  puedeCerrarCaja,
  puedeVerCierresDeCaja,
  puedeReactivarCita,
  whereDeLiquidaciones,
  whereDeMovimientos,
  whereDePropinas,
  whereDeCierresDeCaja,
  whereDeProductos,
  puedeVerClientesQueSeVan,
  puedeEscribirAClienteQueSeVa,
  puedeActivarMensajesAClientes,
  puedeVerMensajesAClientes,
  puedeEditarEnlaceDeResenas,
  puedeVerListaDeEspera,
  puedeQuitarDeListaDeEspera,
  puedeEditarConsentimientoPromocional,
  whereDeListaDeEspera,
  puedeConfigurarPorConfirmar,
  puedeActivarFilaVirtual,
  puedeConfigurarHoraValle,
  puedeResolverPorConfirmar,
  puedeVerPantallaDeFila,
  puedeVaciarFilaVirtual,
  type Actor,
  type Rol,
} from "./permisos"

/** El filtro que no matchea nada, tal como lo devuelve el módulo. */
const NADA = { AND: [{ id: { in: [] } }] }

const NEGOCIO = "negocio-1"
const OTRO_NEGOCIO = "negocio-2"

const actor = (rol: Rol, memberId: string | null = rol === "owner" ? null : "yo"): Actor => ({
  rol,
  businessId: NEGOCIO,
  memberId,
})

const dueño = actor("owner")
const encargado = actor("admin")
const profesional = actor("worker")

const miembro = { id: "colega", businessId: NEGOCIO }
const yoMismo = { id: "yo", businessId: NEGOCIO }
const ajeno = { id: "colega", businessId: OTRO_NEGOCIO }

describe("actorDeSesion", () => {
  const sesion = (user: Record<string, unknown>) => ({ user }) as never

  it("traduce una sesión válida", () => {
    expect(actorDeSesion(sesion({ role: "admin", businessId: NEGOCIO, memberId: "yo" }))).toEqual({
      rol: "admin",
      businessId: NEGOCIO,
      memberId: "yo",
    })
  })

  it("el dueño no tiene memberId", () => {
    expect(actorDeSesion(sesion({ role: "owner", businessId: NEGOCIO }))?.memberId).toBeNull()
  })

  it.each([
    ["sin rol", { businessId: NEGOCIO }],
    ["rol desconocido", { role: "gerente", businessId: NEGOCIO }],
    ["sin negocio", { role: "admin" }],
    ["negocio vacío", { role: "admin", businessId: "" }],
  ])("rechaza una sesión %s", (_caso, user) => {
    expect(actorDeSesion(sesion(user))).toBeNull()
  })

  it("rechaza cuando no hay sesión", () => {
    expect(actorDeSesion(null)).toBeNull()
    expect(actorDeSesion(undefined)).toBeNull()
  })
})

describe("jerarquía de roles", () => {
  it.each([
    ["gestionar equipo", puedeGestionarEquipo, true, true, false],
    ["ver toda la agenda", puedeVerTodaLaAgenda, true, true, false],
    ["ver ingresos del negocio", puedeVerIngresosDelNegocio, true, true, false],
    ["editar comisiones", puedeEditarComisiones, true, false, false],
    ["ver todo el tablero", puedeVerTodoElTablero, true, true, false],
    ["cobrar", puedeCobrar, true, true, false],
    ["anotar líneas a nombre de otros", puedeAsignarLineasAOtros, true, true, false],
    ["anotar a alguien sin reserva", puedeAnotarSinReserva, true, true, true],
    ["ver el historial de anuladas", puedeVerAnuladas, true, true, false],
    ["gestionar la suscripción", puedeGestionarSuscripcion, true, false, false],
    ["ver la lista de inicio", veLaListaDeInicio, true, false, false],
    ["invitar a otros negocios", puedeInvitarNegocios, true, false, false],
    ["asignar citas a otros", puedeAsignarCitasAOtros, true, true, false],
    ["ver el panel de su día", veElPanelDeSuDia, false, false, true],
    // Escondido hasta WhatsApp (PRODUCTO.md, sección 10): nadie, ni el dueño.
    ["usar los chats", puedeUsarChats, false, false, false],
    // El profesional ve y crea clientes, y escribe sus notas; los datos y el borrado no (PRODUCTO.md, sección 10).
    ["editar los datos de un cliente", puedeEditarDatosDeCliente, true, true, false],
    ["borrar un cliente", puedeBorrarCliente, true, true, false],
    ["importar y exportar clientes en CSV", puedeImportarExportarClientes, true, true, false],
    // La página pública es la cara del negocio: el profesional la ve, no la edita.
    ["editar la página pública del negocio", puedeEditarPaginaDelNegocio, true, true, false],
  ])("%s — dueño/encargado/profesional", (_que, puede, esperaDueño, esperaEncargado, esperaProfesional) => {
    expect(puede(dueño)).toBe(esperaDueño)
    expect(puede(encargado)).toBe(esperaEncargado)
    expect(puede(profesional)).toBe(esperaProfesional)
  })

  it("el dinero es sólo del dueño: el encargado no toca comisiones", () => {
    expect(puedeEditarComisiones(encargado)).toBe(false)
  })
})

describe("aislamiento entre negocios", () => {
  it("mismoNegocio compara el negocio del actor", () => {
    expect(mismoNegocio(dueño, NEGOCIO)).toBe(true)
    expect(mismoNegocio(dueño, OTRO_NEGOCIO)).toBe(false)
    expect(mismoNegocio(dueño, null)).toBe(false)
  })

  it("ni el dueño alcanza a un miembro de otro negocio", () => {
    expect(puedeCambiarRolDe(dueño, ajeno)).toBe(false)
    expect(puedeVerLiquidacionDe(dueño, ajeno)).toBe(false)
    expect(puedeEditarHorarioDe(dueño, ajeno)).toBe(false)
  })

  // filtroDeAgenda/filtroDeClientes no se exportan: son la primitiva cuyo
  // spread causó la fuga dos veces. Se verifica el mismo comportamiento a
  // través de whereDeAgenda/whereDeClientes, que es la única puerta pública.
  it("el filtro de agenda siempre acota al negocio, incluso para quien ve todo", () => {
    expect(whereDeAgenda(dueño)).toEqual({ AND: [{ businessId: NEGOCIO }, {}] })
    expect(whereDeAgenda(profesional)).toEqual({
      AND: [{ businessId: NEGOCIO, memberId: "yo" }, {}],
    })
  })

  it("el filtro de clientes acota al negocio para cualquier rol", () => {
    expect(whereDeClientes(dueño)).toEqual({ AND: [{ businessId: NEGOCIO }, {}] })
    expect(whereDeClientes(encargado)).toEqual({ AND: [{ businessId: NEGOCIO }, {}] })
    expect(whereDeClientes(profesional)).toEqual({ AND: [{ businessId: NEGOCIO }, {}] })
  })
})

describe("whereDeAgenda / whereDeClientes: combinar el filtro no lo anula", () => {
  it("envuelve el filtro y lo extra en AND, en vez de mezclarlos por spread", () => {
    const extra = { customerId: "cliente-1" }

    expect(whereDeAgenda(profesional, extra)).toEqual({
      AND: [{ businessId: NEGOCIO, memberId: "yo" }, extra],
    })
  })

  it("una clave repetida en `extra` no pisa la del filtro (pasó con `id` y con `AND`)", () => {
    // Mismo tipo de objeto que rompió antes: trae `id` y `AND` propios. Con
    // `{ ...filtroDeAgenda(actor), ...extra }` esto habría reemplazado la
    // condición del actor. Con `whereDeAgenda`, sigue siendo un elemento más
    // del AND exterior, y el filtro del actor no se toca.
    const extraConClavesQuePisan = { id: "cualquiera", AND: [{ startTime: { gte: new Date(0) } }] }

    const resultado = whereDeAgenda(profesional, extraConClavesQuePisan)

    expect(resultado).toEqual({
      AND: [{ businessId: NEGOCIO, memberId: "yo" }, extraConClavesQuePisan],
    })
    // El filtro del actor sigue intacto como primer elemento del AND.
    expect((resultado.AND as unknown[])[0]).toEqual({ businessId: NEGOCIO, memberId: "yo" })
  })

  it("sin actor, whereDeAgenda tampoco matchea nada aunque `extra` lo intente", () => {
    expect(whereDeAgenda(null, { businessId: OTRO_NEGOCIO })).toEqual({
      AND: [NADA, { businessId: OTRO_NEGOCIO }],
    })
  })

  it("whereDeClientes combina igual: el filtro de negocio no se puede pisar", () => {
    const extra = { tags: { has: "vip" } }

    expect(whereDeClientes(profesional, extra)).toEqual({
      AND: [{ businessId: NEGOCIO }, extra],
    })
  })

  it("sin extra, el default es un objeto vacío y el filtro queda igual", () => {
    expect(whereDeAgenda(dueño)).toEqual({ AND: [{ businessId: NEGOCIO }, {}] })
    expect(whereDeClientes(dueño)).toEqual({ AND: [{ businessId: NEGOCIO }, {}] })
  })
})

describe("a quién se asigna una cita", () => {
  it.each([
    ["dueño pide asignar a un miembro", dueño, "colega", "colega"],
    ["dueño pide dejarla sin asignar", dueño, null, null],
    ["encargado pide asignar a un miembro", encargado, "colega", "colega"],
    ["profesional pide asignar a un colega: termina siendo él mismo", profesional, "colega", "yo"],
    ["profesional pide dejarla sin asignar: igual termina siendo él mismo", profesional, null, "yo"],
  ])("%s", (_caso, actor, pedido, esperado) => {
    expect(memberIdParaCita(actor, pedido)).toBe(esperado)
  })

  it("un profesional sin memberId deja la cita sin asignar, no en otro", () => {
    expect(memberIdParaCita(actor("worker", null), "colega")).toBeNull()
  })

  it("un rol desconocido termina asignado a sí mismo", () => {
    // El tipo no lo permite, pero en runtime un token viejo podría traerlo:
    // quien no puede asignar a otros no elige, aunque no sea "worker".
    const desconocido = { rol: "gerente", businessId: NEGOCIO, memberId: "yo" } as unknown as Actor

    expect(memberIdParaCita(desconocido, "colega")).toBe("yo")
    expect(memberIdParaCita(desconocido, null)).toBe("yo")
  })
})

describe("sobre un miembro concreto", () => {
  it("dueño y encargado cambian el rol de otro; el profesional no", () => {
    expect(puedeCambiarRolDe(dueño, miembro)).toBe(true)
    expect(puedeCambiarRolDe(encargado, miembro)).toBe(true)
    expect(puedeCambiarRolDe(profesional, miembro)).toBe(false)
  })

  it("nadie se cambia el rol a sí mismo", () => {
    expect(puedeCambiarRolDe(encargado, yoMismo)).toBe(false)
  })

  it("el profesional ve su liquidación, no la de un colega", () => {
    expect(puedeVerLiquidacionDe(profesional, yoMismo)).toBe(true)
    expect(puedeVerLiquidacionDe(profesional, miembro)).toBe(false)
  })

  it("dueño y encargado ven la liquidación de cualquiera", () => {
    expect(puedeVerLiquidacionDe(dueño, miembro)).toBe(true)
    expect(puedeVerLiquidacionDe(encargado, miembro)).toBe(true)
  })

  it("horarios son operación: el encargado edita el de cualquiera y el general", () => {
    expect(puedeEditarHorarioDe(encargado, miembro)).toBe(true)
    expect(puedeEditarHorarioDe(encargado, null)).toBe(true)
  })

  it("el profesional sólo edita su propio horario", () => {
    expect(puedeEditarHorarioDe(profesional, yoMismo)).toBe(true)
    expect(puedeEditarHorarioDe(profesional, miembro)).toBe(false)
    expect(puedeEditarHorarioDe(profesional, null)).toBe(false)
  })
})

describe("falla cerrado", () => {
  it("sin actor, toda función niega", () => {
    expect(puedeGestionarEquipo(null)).toBe(false)
    expect(puedeVerTodaLaAgenda(null)).toBe(false)
    expect(puedeVerIngresosDelNegocio(null)).toBe(false)
    expect(puedeEditarComisiones(null)).toBe(false)
    expect(puedeCambiarRolDe(null, miembro)).toBe(false)
    expect(puedeVerLiquidacionDe(null, miembro)).toBe(false)
    expect(puedeEditarHorarioDe(null, miembro)).toBe(false)
    expect(puedeVerTodoElTablero(null)).toBe(false)
    expect(puedeCobrar(null)).toBe(false)
    expect(puedeAnotarSinReserva(null)).toBe(false)
    expect(puedeAnular(null, { businessId: NEGOCIO, status: "en-espera" })).toBe(false)
    expect(puedeDeshacerLlegada(null, null)).toBe(false)
    expect(puedeDeshacerLlegada(null, { businessId: NEGOCIO, memberId: "yo" })).toBe(false)
    expect(puedeVerAnuladas(null)).toBe(false)
    expect(puedeVerCita(null, { businessId: NEGOCIO, memberId: "yo" })).toBe(false)
    expect(puedeGestionarSuscripcion(null)).toBe(false)
    expect(veLaListaDeInicio(null)).toBe(false)
    expect(puedeInvitarNegocios(null)).toBe(false)
    expect(puedeAsignarCitasAOtros(null)).toBe(false)
    // Sin actor no se elige el panel del día: así era la comparación a mano que
    // reemplaza. El tablero del negocio igual se llena desde un endpoint que da 401.
    expect(veElPanelDeSuDia(null)).toBe(false)
    expect(puedeUsarChats(null)).toBe(false)
    expect(puedeEditarDatosDeCliente(null)).toBe(false)
    expect(puedeBorrarCliente(null)).toBe(false)
    expect(puedeImportarExportarClientes(null)).toBe(false)
    expect(puedeEditarPaginaDelNegocio(null)).toBe(false)
  })

  it("un rol desconocido no gestiona la suscripción ni asigna citas a otros", () => {
    // El tipo no lo permite, pero en runtime un token viejo podría traerlo.
    const desconocido = { rol: "gerente", businessId: NEGOCIO, memberId: "yo" } as unknown as Actor

    expect(puedeGestionarSuscripcion(desconocido)).toBe(false)
    expect(veLaListaDeInicio(desconocido)).toBe(false)
    expect(puedeAsignarCitasAOtros(desconocido)).toBe(false)
    expect(puedeEditarPaginaDelNegocio(desconocido)).toBe(false)
    // El panel del día es la vista restringida: un rol desconocido cae ahí.
    expect(veElPanelDeSuDia(desconocido)).toBe(true)
  })

  it("una sesión con rol desconocido no produce actor: nada se habilita", () => {
    const sinActor = actorDeSesion({ user: { role: "gerente", businessId: NEGOCIO } } as never)

    expect(puedeGestionarSuscripcion(sinActor)).toBe(false)
    expect(puedeAsignarCitasAOtros(sinActor)).toBe(false)
    expect(veElPanelDeSuDia(sinActor)).toBe(false)
  })

  it("un profesional sin memberId no deshace llegadas ni ve citas sin asignar", () => {
    const roto = actor("worker", null)

    expect(puedeDeshacerLlegada(roto, null)).toBe(false)
    // `null === null` no es "su" cita: falla cerrado.
    expect(puedeDeshacerLlegada(roto, { businessId: NEGOCIO, memberId: null })).toBe(false)
    expect(puedeVerCita(roto, { businessId: NEGOCIO, memberId: null })).toBe(false)
  })

  it("sin actor, los filtros del tablero no devuelven nada", () => {
    expect(whereDeAtenciones(null)).toEqual({ AND: [NADA, {}] })
    expect(whereDeLineas(null)).toEqual({ AND: [NADA, {}] })
    expect(whereDePagos(null)).toEqual({ AND: [NADA, {}] })
  })

  it("un profesional sin memberId no ve ninguna atención ni línea, y no anota a nadie", () => {
    const roto = actor("worker", null)

    expect(whereDeAtenciones(roto)).toEqual({ AND: [{ businessId: NEGOCIO, ...NADA }, {}] })
    expect(whereDeLineas(roto)).toEqual({ AND: [{ visit: { is: { businessId: NEGOCIO } }, ...NADA }, {}] })
    expect(puedeAnotarSinReserva(roto)).toBe(false)
  })

  it("sin actor, el filtro de agenda no devuelve nada", () => {
    expect(whereDeAgenda(null)).toEqual({ AND: [NADA, {}] })
  })

  it("sin actor, el filtro de clientes no devuelve nada", () => {
    expect(whereDeClientes(null)).toEqual({ AND: [NADA, {}] })
  })

  it("un profesional sin memberId no ve ninguna cita, en vez de verlas todas", () => {
    const roto = actor("worker", null)

    expect(whereDeAgenda(roto)).toEqual({ AND: [{ businessId: NEGOCIO, ...NADA }, {}] })
    expect(puedeVerLiquidacionDe(roto, yoMismo)).toBe(false)
    expect(puedeEditarHorarioDe(roto, yoMismo)).toBe(false)
  })

  it("un `extra` con su propio AND no le abre a un profesional sin memberId las citas del negocio", () => {
    const roto = actor("worker", null)
    const citasFake = [
      { id: "cita-1", businessId: NEGOCIO, memberId: "colega-1" },
      { id: "cita-2", businessId: NEGOCIO, memberId: "colega-2" },
    ]

    // Este `extra` es justo el que rompía con spread: `{ ...filtro, ...extra }`
    // pisaba la negación del filtro con el `AND` de `extra` y devolvía todas
    // las citas del negocio (bug de F-002). Con `whereDeAgenda` ambos quedan
    // como elementos separados del AND exterior y ninguno pisa al otro.
    const where = whereDeAgenda(roto, { AND: [{ businessId: NEGOCIO }] })

    expect(citasFake.filter((c) => coincideConWhere(c, where))).toHaveLength(0)
  })
})

describe("tablero de atenciones", () => {
  const delNegocio = (status: string) => ({ businessId: NEGOCIO, status })

  describe("puedeAnular", () => {
    it.each(["en-espera", "en-atencion", "por-cobrar"])(
      "antes de cobrar (%s) anulan dueño y encargado; el profesional no",
      (status) => {
        expect(puedeAnular(dueño, delNegocio(status))).toBe(true)
        expect(puedeAnular(encargado, delNegocio(status))).toBe(true)
        expect(puedeAnular(profesional, delNegocio(status))).toBe(false)
      }
    )

    it("lo ya cobrado sólo lo anula el dueño: el encargado no", () => {
      expect(puedeAnular(dueño, delNegocio("finalizada"))).toBe(true)
      expect(puedeAnular(encargado, delNegocio("finalizada"))).toBe(false)
      expect(puedeAnular(profesional, delNegocio("finalizada"))).toBe(false)
    })

    it("un estado desconocido se trata como cobrado: pide al dueño (falla cerrado)", () => {
      expect(puedeAnular(encargado, delNegocio("raro"))).toBe(false)
      expect(puedeAnular(dueño, delNegocio("raro"))).toBe(true)
    })

    it("ni el dueño anula una atención de otro negocio", () => {
      expect(puedeAnular(dueño, { businessId: OTRO_NEGOCIO, status: "en-espera" })).toBe(false)
    })
  })

  describe("puedeCobrar", () => {
    /**
     * El cobro congela el total de la atención entera, y el profesional no
     * puede verlo: quien cobra tiene que ver todo el tablero. Si alguien
     * pudiera cobrar sin verlo, cobraría un total que no se le puede mostrar.
     */
    const actores: [string, Actor | null][] = [
      ...(["owner", "admin", "worker"] as const).flatMap((rol): [string, Actor][] => [
        [`${rol} con memberId`, actor(rol, "yo")],
        [`${rol} sin memberId`, actor(rol, null)],
      ]),
      ["sin actor", null],
    ]

    it.each(actores)("%s: si cobra, ve todo el tablero", (_caso, quien) => {
      expect(!puedeCobrar(quien) || puedeVerTodoElTablero(quien)).toBe(true)
    })
  })

  describe("puedeVerCita", () => {
    it("la misma regla que whereDeAgenda: dueño y encargado, todas las del negocio", () => {
      for (const quien of [dueño, encargado]) {
        expect(puedeVerCita(quien, { businessId: NEGOCIO, memberId: "colega" })).toBe(true)
        expect(puedeVerCita(quien, { businessId: NEGOCIO, memberId: null })).toBe(true)
      }
    })

    it("el profesional, sólo las suyas: ni la de un colega ni una sin asignar", () => {
      expect(puedeVerCita(profesional, { businessId: NEGOCIO, memberId: "yo" })).toBe(true)
      expect(puedeVerCita(profesional, { businessId: NEGOCIO, memberId: "colega" })).toBe(false)
      expect(puedeVerCita(profesional, { businessId: NEGOCIO, memberId: null })).toBe(false)
    })

    it("nadie ve una cita de otro negocio, aunque el memberId coincida", () => {
      expect(puedeVerCita(dueño, { businessId: OTRO_NEGOCIO, memberId: null })).toBe(false)
      expect(puedeVerCita(profesional, { businessId: OTRO_NEGOCIO, memberId: "yo" })).toBe(false)
    })
  })

  describe("puedeDeshacerLlegada", () => {
    const suya = { businessId: NEGOCIO, memberId: "yo" }
    const deUnaColega = { businessId: NEGOCIO, memberId: "colega" }
    const sinAsignar = { businessId: NEGOCIO, memberId: null }

    it("dueño y encargado deshacen la llegada de cualquier reserva del negocio", () => {
      for (const quien of [dueño, encargado]) {
        expect(puedeDeshacerLlegada(quien, deUnaColega)).toBe(true)
        expect(puedeDeshacerLlegada(quien, sinAsignar)).toBe(true)
      }
    })

    it("el profesional, sólo la de una reserva suya", () => {
      expect(puedeDeshacerLlegada(profesional, suya)).toBe(true)
      expect(puedeDeshacerLlegada(profesional, sinAsignar)).toBe(false)
    })

    it("ver la atención no alcanza: la reserva de una colega no la deshace, aunque tenga una línea en la atención", () => {
      expect(puedeDeshacerLlegada(profesional, deUnaColega)).toBe(false)
    })

    it("nadie deshace la llegada de una reserva de otro negocio", () => {
      expect(puedeDeshacerLlegada(dueño, { businessId: OTRO_NEGOCIO, memberId: null })).toBe(false)
      expect(puedeDeshacerLlegada(profesional, { businessId: OTRO_NEGOCIO, memberId: "yo" })).toBe(false)
    })

    it("sin la reserva no se sabe de quién es: dueño y encargado sí, el profesional no", () => {
      expect(puedeDeshacerLlegada(dueño, null)).toBe(true)
      expect(puedeDeshacerLlegada(encargado, null)).toBe(true)
      expect(puedeDeshacerLlegada(profesional, null)).toBe(false)
    })
  })

  describe("profesionalParaLinea", () => {
    const aMiembro = { memberId: "colega", byOwner: false }
    const alDueño = { memberId: null, byOwner: true }

    it.each([
      ["dueño anota a un miembro", dueño, aMiembro, aMiembro],
      ["dueño se anota a sí mismo", dueño, alDueño, alDueño],
      ["encargado anota al dueño", encargado, alDueño, alDueño],
      ["encargado anota a un miembro", encargado, aMiembro, aMiembro],
      ["profesional pide a un colega: termina siendo él", profesional, aMiembro, { memberId: "yo", byOwner: false }],
      ["profesional pide al dueño: termina siendo él, nunca del dueño", profesional, alDueño, { memberId: "yo", byOwner: false }],
    ])("%s", (_caso, quien, pedido, esperado) => {
      expect(profesionalParaLinea(quien, pedido)).toEqual(esperado)
    })

    it("al dueño se lo marca con byOwner, nunca con un memberId nulo", () => {
      // Aunque pida un memberId junto con byOwner, la línea del dueño no lleva memberId.
      expect(profesionalParaLinea(dueño, { memberId: "colega", byOwner: true })).toEqual(alDueño)
    })
  })

  describe("whereDeAtenciones", () => {
    it("dueño y encargado ven todas las del negocio, siempre acotadas al negocio", () => {
      expect(whereDeAtenciones(dueño)).toEqual({ AND: [{ businessId: NEGOCIO }, {}] })
      expect(whereDeAtenciones(encargado)).toEqual({ AND: [{ businessId: NEGOCIO }, {}] })
    })

    it("el profesional ve las que tienen una línea suya o nacieron de una cita suya", () => {
      expect(whereDeAtenciones(profesional)).toEqual({
        AND: [
          {
            businessId: NEGOCIO,
            OR: [{ services: { some: { memberId: "yo" } } }, { appointment: { is: { memberId: "yo" } } }],
          },
          {},
        ],
      })
    })

    it("un `extra` con su propio OR o AND no pisa el filtro del profesional", () => {
      const extra = { OR: [{ status: "en-espera" }], AND: [{ businessId: NEGOCIO }] }

      const filtroDelProfesional = (whereDeAtenciones(profesional).AND as unknown[])[0]

      expect(whereDeAtenciones(profesional, extra)).toEqual({ AND: [filtroDelProfesional, extra] })
    })
  })

  describe("whereDeLineas y whereDePagos", () => {
    it("dueño y encargado ven todas las líneas de su negocio; el profesional, sólo las suyas", () => {
      const delNegocioPorLaAtencion = { visit: { is: { businessId: NEGOCIO } } }

      expect(whereDeLineas(dueño)).toEqual({ AND: [delNegocioPorLaAtencion, {}] })
      expect(whereDeLineas(encargado, { visitId: "v-1" })).toEqual({ AND: [delNegocioPorLaAtencion, { visitId: "v-1" }] })
      expect(whereDeLineas(profesional)).toEqual({ AND: [{ ...delNegocioPorLaAtencion, memberId: "yo" }, {}] })
    })

    it("los pagos son facturación: dueño y encargado los ven, el profesional ninguno", () => {
      expect(whereDePagos(dueño)).toEqual({ AND: [{ visit: { is: { businessId: NEGOCIO } } }, {}] })
      expect(whereDePagos(encargado)).toEqual({ AND: [{ visit: { is: { businessId: NEGOCIO } } }, {}] })
      expect(whereDePagos(profesional)).toEqual({ AND: [NADA, {}] })
    })
  })
})

describe("servicios que hace cada profesional", () => {
  it("dueño y encargado los definen para cualquiera del negocio", () => {
    for (const quien of [dueño, encargado]) {
      expect(puedeDefinirServiciosDe(quien, miembro)).toBe(true)
      expect(puedeDefinirServiciosDe(quien, yoMismo)).toBe(true)
    }
  })

  it("el profesional no los define, ni los suyos", () => {
    expect(puedeDefinirServiciosDe(profesional, yoMismo)).toBe(false)
    expect(puedeDefinirServiciosDe(profesional, miembro)).toBe(false)
  })

  it("nadie los define para un miembro de otro negocio", () => {
    expect(puedeDefinirServiciosDe(dueño, ajeno)).toBe(false)
    expect(puedeDefinirServiciosDe(encargado, ajeno)).toBe(false)
  })

  it("falla cerrado sin actor", () => {
    expect(puedeDefinirServiciosDe(null, miembro)).toBe(false)
  })
})

describe("plazo para cancelar o reagendar", () => {
  it("dueño y encargado; el profesional no, y sin actor tampoco", () => {
    expect(puedeEditarPlazoDeCambios(dueño)).toBe(true)
    expect(puedeEditarPlazoDeCambios(encargado)).toBe(true)
    expect(puedeEditarPlazoDeCambios(profesional)).toBe(false)
    expect(puedeEditarPlazoDeCambios(null)).toBe(false)
  })
})

describe("bloqueos de horario", () => {
  it("dueño y encargado bloquean a cualquiera del negocio y a todo el negocio", () => {
    for (const quien of [dueño, encargado]) {
      expect(puedeGestionarBloqueoDe(quien, miembro)).toBe(true)
      expect(puedeGestionarBloqueoDe(quien, yoMismo)).toBe(true)
      expect(puedeGestionarBloqueoDe(quien, null)).toBe(true)
    }
  })

  it("el profesional sólo bloquea su propia agenda: ni la de un colega ni la del negocio", () => {
    expect(puedeGestionarBloqueoDe(profesional, yoMismo)).toBe(true)
    expect(puedeGestionarBloqueoDe(profesional, miembro)).toBe(false)
    expect(puedeGestionarBloqueoDe(profesional, null)).toBe(false)
  })

  it("nadie bloquea a un miembro de otro negocio", () => {
    expect(puedeGestionarBloqueoDe(dueño, ajeno)).toBe(false)
    expect(puedeGestionarBloqueoDe(encargado, ajeno)).toBe(false)
    expect(puedeGestionarBloqueoDe(actor("worker", "colega"), ajeno)).toBe(false)
  })

  it("falla cerrado: sin actor, o profesional sin memberId, no bloquea nada", () => {
    expect(puedeGestionarBloqueoDe(null, null)).toBe(false)
    expect(puedeGestionarBloqueoDe(null, yoMismo)).toBe(false)
    const suelto = actor("worker", null)
    expect(puedeGestionarBloqueoDe(suelto, null)).toBe(false)
    expect(puedeGestionarBloqueoDe(suelto, yoMismo)).toBe(false)
  })

  describe("whereDeBloqueos", () => {
    const bloqueos = [
      { id: "b-mio", businessId: NEGOCIO, memberId: "yo" },
      { id: "b-colega", businessId: NEGOCIO, memberId: "colega" },
      { id: "b-negocio", businessId: NEGOCIO, memberId: null },
      { id: "b-ajeno", businessId: OTRO_NEGOCIO, memberId: "yo" },
      { id: "b-ajeno-negocio", businessId: OTRO_NEGOCIO, memberId: null },
    ]
    const tablas = { timeBlock: bloqueos } as unknown as Tablas
    const visibles = (quien: Actor | null, extra = {}) =>
      bloqueos.filter((b) => coincide(tablas, "timeBlock", b, whereDeBloqueos(quien, extra))).map((b) => b.id)

    it("dueño y encargado ven todos los del negocio, ninguno de otro", () => {
      expect(visibles(dueño)).toEqual(["b-mio", "b-colega", "b-negocio"])
      expect(visibles(encargado)).toEqual(["b-mio", "b-colega", "b-negocio"])
    })

    it("el profesional ve los suyos y los de todo el negocio, no los de un colega", () => {
      expect(visibles(profesional)).toEqual(["b-mio", "b-negocio"])
    })

    it("un profesional sin memberId sólo ve los de todo el negocio", () => {
      expect(visibles(actor("worker", null))).toEqual(["b-negocio"])
    })

    it("sin actor no ve nada", () => {
      expect(visibles(null)).toEqual([])
    })

    it("lo que agrega el endpoint no anula el filtro (ni con OR, ni con businessId)", () => {
      expect(visibles(profesional, { OR: [{ memberId: "colega" }] })).toEqual([])
      expect(visibles(dueño, { businessId: OTRO_NEGOCIO })).toEqual([])
      expect(visibles(profesional, { id: "b-colega" })).toEqual([])
    })
  })
})

describe("la plata del equipo", () => {
  type Permiso = (quien: Actor | null) => boolean
  /** Lo que la tabla de permisos de la etapa 2 dice que puede cada rol: [dueña, encargado, profesional]. */
  const TABLA: [string, Permiso, [boolean, boolean, boolean]][] = [
    ["puedeEditarComisiones", puedeEditarComisiones, [true, false, false]],
    ["puedeVerHistorialDeComisiones", puedeVerHistorialDeComisiones, [true, false, false]],
    ["puedeGestionarProductos", puedeGestionarProductos, [true, true, false]],
    ["puedeFijarComisionDeProducto", puedeFijarComisionDeProducto, [true, false, false]],
    ["puedeRegistrarPropina", puedeRegistrarPropina, [true, true, false]],
    ["puedeConfigurarLiquidacion", puedeConfigurarLiquidacion, [true, false, false]],
    ["puedeVerLiquidacionesDelEquipo", puedeVerLiquidacionesDelEquipo, [true, true, false]],
    ["puedeCerrarLiquidacion", puedeCerrarLiquidacion, [true, false, false]],
    ["puedePagarLiquidacion", puedePagarLiquidacion, [true, false, false]],
    ["puedeAnularLiquidacion", puedeAnularLiquidacion, [true, false, false]],
    ["puedeRegistrarAjuste", puedeRegistrarAjuste, [true, false, false]],
    ["puedeRegistrarAdelanto", puedeRegistrarAdelanto, [true, true, false]],
    ["veMiPlata", veMiPlata, [false, true, true]],
    ["puedeCerrarCaja", puedeCerrarCaja, [true, true, false]],
    ["puedeVerCierresDeCaja", puedeVerCierresDeCaja, [true, true, false]],
    ["puedeVerIngresosDelNegocio", puedeVerIngresosDelNegocio, [true, true, false]],
    ["puedeReactivarCita", puedeReactivarCita, [true, true, false]],
  ]

  it.each(TABLA)("%s sigue la tabla por rol", (_nombre, permiso, [deDueña, deEncargado, deProfesional]) => {
    expect(permiso(dueño)).toBe(deDueña)
    expect(permiso(encargado)).toBe(deEncargado)
    expect(permiso(profesional)).toBe(deProfesional)
  })

  it.each(TABLA)("%s falla cerrado sin actor", (_nombre, permiso) => {
    expect(permiso(null)).toBe(false)
  })

  it("Mi plata: la dueña con memberId la ve (si atiende); un profesional sin memberId, no", () => {
    expect(veMiPlata(actor("owner", "m-duena"))).toBe(true)
    expect(veMiPlata(actor("worker", null))).toBe(false)
    expect(veMiPlata(actor("admin", null))).toBe(false)
  })

  it("puedeVerLiquidacionDe: gestión ve la de cualquiera del negocio; el profesional, sólo la suya", () => {
    for (const quien of [dueño, encargado]) {
      expect(puedeVerLiquidacionDe(quien, miembro)).toBe(true)
      expect(puedeVerLiquidacionDe(quien, yoMismo)).toBe(true)
      expect(puedeVerLiquidacionDe(quien, ajeno)).toBe(false)
    }
    expect(puedeVerLiquidacionDe(profesional, yoMismo)).toBe(true)
    expect(puedeVerLiquidacionDe(profesional, miembro)).toBe(false)
    expect(puedeVerLiquidacionDe(actor("worker", "colega"), ajeno)).toBe(false)
    expect(puedeVerLiquidacionDe(actor("worker", null), yoMismo)).toBe(false)
    expect(puedeVerLiquidacionDe(null, yoMismo)).toBe(false)
  })

  describe("whereDeLiquidaciones, whereDeMovimientos y whereDePropinas", () => {
    const filas = [
      { id: "mia", businessId: NEGOCIO, memberId: "yo" },
      { id: "colega", businessId: NEGOCIO, memberId: "colega" },
      { id: "de-la-duena", businessId: NEGOCIO, memberId: null },
      { id: "ajena", businessId: OTRO_NEGOCIO, memberId: "yo" },
    ]
    const FILTROS = [
      ["liquidacion", whereDeLiquidaciones],
      ["movimientoDeLiquidacion", whereDeMovimientos],
      ["propinaDeAtencion", whereDePropinas],
    ] as const

    for (const [modelo, filtro] of FILTROS) {
      // `coincide` de la base falsa entiende OR y lanza ante lo que no conoce.
      const tablas = { [modelo]: filas } as unknown as Tablas
      const visibles = (quien: Actor | null, extra = {}) =>
        filas
          .filter((fila) => coincide(tablas, modelo, fila, (filtro as (a: Actor | null, e: object) => object)(quien, extra)))
          .map((fila) => fila.id)

      describe(modelo, () => {
        it("dueña y encargado ven todo lo del negocio, nada de otro", () => {
          expect(visibles(dueño)).toEqual(["mia", "colega", "de-la-duena"])
          expect(visibles(encargado)).toEqual(["mia", "colega", "de-la-duena"])
        })

        it("el profesional ve sólo lo suyo", () => {
          expect(visibles(profesional)).toEqual(["mia"])
        })

        it("falla cerrado: sin actor o profesional sin memberId, nada", () => {
          expect(visibles(null)).toEqual([])
          expect(visibles(actor("worker", null))).toEqual([])
        })

        it("el dueño de otro negocio no ve nada de éste", () => {
          expect(visibles({ rol: "owner", businessId: OTRO_NEGOCIO, memberId: null })).toEqual(["ajena"])
        })

        it("lo que agrega el endpoint no anula el filtro (id, memberId, businessId, OR, AND)", () => {
          expect(visibles(profesional, { id: "colega" })).toEqual([])
          expect(visibles(profesional, { memberId: "colega" })).toEqual([])
          expect(visibles(profesional, { OR: [{ memberId: "colega" }] })).toEqual([])
          expect(visibles(profesional, { AND: [{ id: "colega" }] })).toEqual([])
          expect(visibles(dueño, { businessId: OTRO_NEGOCIO })).toEqual([])
          expect(visibles(null, { id: "mia" })).toEqual([])
          expect(visibles(actor("worker", null), { id: "mia" })).toEqual([])
        })
      })
    }
  })

  describe("whereDeCierresDeCaja", () => {
    const cierres = [
      { id: "c-1", businessId: NEGOCIO },
      { id: "c-ajeno", businessId: OTRO_NEGOCIO },
    ]
    const tablas = { cierreDeCaja: cierres } as unknown as Tablas
    const visibles = (quien: Actor | null, extra = {}) =>
      cierres.filter((c) => coincide(tablas, "cierreDeCaja", c, whereDeCierresDeCaja(quien, extra))).map((c) => c.id)

    it("sólo dueña y encargado, y sólo los del negocio", () => {
      expect(visibles(dueño)).toEqual(["c-1"])
      expect(visibles(encargado)).toEqual(["c-1"])
    })

    it("el profesional y sin actor no ven ninguno, ni pidiendo uno por id", () => {
      expect(visibles(profesional)).toEqual([])
      expect(visibles(null)).toEqual([])
      expect(visibles(profesional, { id: "c-1" })).toEqual([])
    })

    it("lo que agrega el endpoint no anula el filtro", () => {
      expect(visibles(dueño, { businessId: OTRO_NEGOCIO })).toEqual([])
      expect(visibles(dueño, { id: "c-ajeno" })).toEqual([])
      expect(visibles(encargado, { OR: [{ id: "c-ajeno" }] })).toEqual([])
    })
  })

  describe("whereDeProductos", () => {
    const productos = [
      { id: "p-1", businessId: NEGOCIO },
      { id: "p-ajeno", businessId: OTRO_NEGOCIO },
    ]
    const tablas = { producto: productos } as unknown as Tablas
    const visibles = (quien: Actor | null, extra = {}) =>
      productos.filter((p) => coincide(tablas, "producto", p, whereDeProductos(quien, extra))).map((p) => p.id)

    it("todo rol ve el catálogo de su negocio (el profesional anota lo que vende)", () => {
      expect(visibles(dueño)).toEqual(["p-1"])
      expect(visibles(encargado)).toEqual(["p-1"])
      expect(visibles(profesional)).toEqual(["p-1"])
    })

    it("sin actor nada, y un producto ajeno nunca", () => {
      expect(visibles(null)).toEqual([])
      expect(visibles(dueño, { id: "p-ajeno" })).toEqual([])
      expect(visibles(profesional, { businessId: OTRO_NEGOCIO })).toEqual([])
    })
  })
})

describe("avisos por correo a clientes (etapa 3)", () => {
  type Permiso = (quien: Actor | null) => boolean
  /** Decisiones c y d del dueño: [dueña, encargado, profesional]. */
  const TABLA: [string, Permiso, [boolean, boolean, boolean]][] = [
    ["puedeVerClientesQueSeVan", puedeVerClientesQueSeVan, [true, true, false]],
    ["puedeEscribirAClienteQueSeVa", puedeEscribirAClienteQueSeVa, [true, true, false]],
    ["puedeActivarMensajesAClientes", puedeActivarMensajesAClientes, [true, false, false]],
    ["puedeVerMensajesAClientes", puedeVerMensajesAClientes, [true, true, false]],
    ["puedeEditarEnlaceDeResenas", puedeEditarEnlaceDeResenas, [true, true, false]],
    ["puedeVerListaDeEspera", puedeVerListaDeEspera, [true, true, false]],
    ["puedeQuitarDeListaDeEspera", puedeQuitarDeListaDeEspera, [true, true, false]],
    ["puedeEditarConsentimientoPromocional", puedeEditarConsentimientoPromocional, [true, true, false]],
  ]

  it.each(TABLA)("%s sigue la tabla por rol", (_nombre, permiso, [deDueña, deEncargado, deProfesional]) => {
    expect(permiso(dueño)).toBe(deDueña)
    expect(permiso(encargado)).toBe(deEncargado)
    expect(permiso(profesional)).toBe(deProfesional)
  })

  it.each(TABLA)("%s falla cerrado sin actor", (_nombre, permiso) => {
    expect(permiso(null)).toBe(false)
  })

  describe("whereDeListaDeEspera", () => {
    const inscripciones = [
      { id: "i-1", businessId: NEGOCIO, email: "ana@test" },
      { id: "i-ajena", businessId: OTRO_NEGOCIO, email: "ana@test" },
    ]
    const tablas = { inscripcionEnEspera: inscripciones } as unknown as Tablas
    const visibles = (quien: Actor | null, extra = {}) =>
      inscripciones
        .filter((i) => coincide(tablas, "inscripcionEnEspera", i, whereDeListaDeEspera(quien, extra)))
        .map((i) => i.id)

    it("sólo dueña y encargado, y sólo las del negocio", () => {
      expect(visibles(dueño)).toEqual(["i-1"])
      expect(visibles(encargado)).toEqual(["i-1"])
    })

    it("el profesional y sin actor no ven ninguna, ni pidiendo una por id", () => {
      expect(visibles(profesional)).toEqual([])
      expect(visibles(null)).toEqual([])
      expect(visibles(profesional, { id: "i-1" })).toEqual([])
    })

    it("lo que agrega el endpoint no anula el filtro (businessId, id, email, OR, AND)", () => {
      expect(visibles(dueño, { businessId: OTRO_NEGOCIO })).toEqual([])
      expect(visibles(dueño, { id: "i-ajena" })).toEqual([])
      expect(visibles(encargado, { email: "ana@test" })).toEqual(["i-1"])
      expect(visibles(encargado, { OR: [{ id: "i-ajena" }] })).toEqual([])
      expect(visibles(dueño, { AND: [{ businessId: OTRO_NEGOCIO }] })).toEqual([])
    })
  })
})

describe("reservas seguras y fila virtual (etapa 4)", () => {
  type Permiso = (quien: Actor | null) => boolean
  /** [dueña, encargado, profesional]. */
  const TABLA: [string, Permiso, [boolean, boolean, boolean]][] = [
    ["puedeConfigurarPorConfirmar", puedeConfigurarPorConfirmar, [true, false, false]],
    ["puedeActivarFilaVirtual", puedeActivarFilaVirtual, [true, false, false]],
    ["puedeResolverPorConfirmar", puedeResolverPorConfirmar, [true, true, false]],
    ["puedeVerPantallaDeFila", puedeVerPantallaDeFila, [true, true, false]],
    ["puedeVaciarFilaVirtual", puedeVaciarFilaVirtual, [true, true, false]],
  ]

  it.each(TABLA)("%s sigue la tabla por rol", (_nombre, permiso, [deDueña, deEncargado, deProfesional]) => {
    expect(permiso(dueño)).toBe(deDueña)
    expect(permiso(encargado)).toBe(deEncargado)
    expect(permiso(profesional)).toBe(deProfesional)
  })

  it.each(TABLA)("%s falla cerrado sin actor y con un rol desconocido", (_nombre, permiso) => {
    const desconocido = { rol: "gerente", businessId: NEGOCIO, memberId: "yo" } as unknown as Actor
    expect(permiso(null)).toBe(false)
    expect(permiso(desconocido)).toBe(false)
  })
})

describe("reservas a medida (etapa 5)", () => {
  it("puedeConfigurarHoraValle: sólo la dueña", () => {
    expect(puedeConfigurarHoraValle(dueño)).toBe(true)
    expect(puedeConfigurarHoraValle(encargado)).toBe(false)
    expect(puedeConfigurarHoraValle(profesional)).toBe(false)
  })

  it("puedeConfigurarHoraValle falla cerrado sin actor y con un rol desconocido", () => {
    const desconocido = { rol: "gerente", businessId: NEGOCIO, memberId: "yo" } as unknown as Actor
    expect(puedeConfigurarHoraValle(null)).toBe(false)
    expect(puedeConfigurarHoraValle(desconocido)).toBe(false)
  })
})
