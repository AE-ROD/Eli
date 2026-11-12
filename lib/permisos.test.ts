import { describe, it, expect } from "vitest"
import { coincideConWhere } from "@/pruebas/where-simple"
import { coincide, type NombreDeModelo, type Tablas } from "@/pruebas/consultas-falsas"
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
  puedeEditarNombreDelNegocio,
  puedeConfigurarZonaHoraria,
  puedeMarcarServicioComoUrgencia,
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
  puedeEditarFotosDelNegocio,
  puedeEditarFotoDelMiembro,
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
  esClinicaDental,
  veFichaClinica,
  puedeEditarFichaClinica,
  veAlertaDeAlergias,
  vePlanDeTratamiento,
  puedeEditarPlanDeTratamiento,
  veSillones,
  puedeGestionarSillones,
  puedeAsignarSillon,
  whereDeFichasClinicas,
  whereDeAlertaDeAlergias,
  whereDeMarcasDentales,
  whereDeEvoluciones,
  whereDePlanes,
  whereDeEtapasDelPlan,
  whereDePrestacionesDelPlan,
  whereDeSillones,
  veProtesis,
  puedeEditarProtesis,
  puedeConfigurarRepartoDeProtesis,
  puedeGestionarLaboratorios,
  veMontosDelReparto,
  tratanteParaProtesis,
  whereDeProtesis,
  whereDeEventosDeProtesis,
  whereDeMaterialesDeProtesis,
  whereDeLaboratorios,
  whereDeExcepcionesDeReparto,
  whereDeCambiosDeReparto,
  whereDeAbonosDeProtesis,
  whereDePagosAlLaboratorio,
  puedeCobrarAbonosDeProtesis,
  puedePagarAlLaboratorio,
  veLaLineaDePropinas,
  rubroOfreceFilaVirtual,
  rubroOfreceHoraValle,
  rubroOfrecePropinas,
  whereDeProtesisParaCobrar,
  whereDeAbonosPorPagarAlLaboratorio,
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
    // El logo y la portada son parte de esa cara: el profesional no los cambia.
    ["cambiar el logo y la portada del negocio", puedeEditarFotosDelNegocio, true, true, false],
    // El nombre es lo primero de esa página: lo cambia quien la edita.
    ["cambiar el nombre del negocio", puedeEditarNombreDelNegocio, true, true, false],
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

describe("fotos de la página pública", () => {
  const rubros = ["salon", "barberia", "odontologia", "salud", "otro", "", undefined, null, 7] as const
  const conRubro = (rol: Rol, rubro: unknown, memberId?: string | null): Actor =>
    ({ ...actor(rol, memberId), rubro }) as Actor

  it("la foto de un integrante: dueño y encargado cambian la de cualquiera; el profesional sólo la suya", () => {
    // [dueño, encargado, profesional] sobre un colega y sobre sí mismo.
    expect([dueño, encargado, profesional].map((quien) => puedeEditarFotoDelMiembro(quien, miembro))).toEqual([true, true, false])
    expect([dueño, encargado, profesional].map((quien) => puedeEditarFotoDelMiembro(quien, yoMismo))).toEqual([true, true, true])
  })

  it("lo mismo en todos los rubros: ninguno cambia quién puede", () => {
    for (const rubro of rubros) {
      expect(puedeEditarFotosDelNegocio(conRubro("owner", rubro))).toBe(true)
      expect(puedeEditarFotosDelNegocio(conRubro("admin", rubro))).toBe(true)
      expect(puedeEditarFotosDelNegocio(conRubro("worker", rubro))).toBe(false)
      expect(puedeEditarFotoDelMiembro(conRubro("owner", rubro), miembro)).toBe(true)
      expect(puedeEditarFotoDelMiembro(conRubro("admin", rubro), miembro)).toBe(true)
      expect(puedeEditarFotoDelMiembro(conRubro("worker", rubro), miembro)).toBe(false)
      expect(puedeEditarFotoDelMiembro(conRubro("worker", rubro), yoMismo)).toBe(true)
    }
  })

  it("un integrante de otro negocio no se alcanza, ni siendo la dueña", () => {
    expect(puedeEditarFotoDelMiembro(dueño, ajeno)).toBe(false)
    expect(puedeEditarFotoDelMiembro(encargado, ajeno)).toBe(false)
    // Mismo id de membresía, pero de otro negocio: no es "la suya".
    expect(puedeEditarFotoDelMiembro(profesional, { id: "yo", businessId: OTRO_NEGOCIO })).toBe(false)
  })

  it("sin `businessId` (la interfaz sólo tiene el id) decide el rol y la membresía", () => {
    expect(puedeEditarFotoDelMiembro(dueño, { id: "colega" })).toBe(true)
    expect(puedeEditarFotoDelMiembro(profesional, { id: "colega" })).toBe(false)
    expect(puedeEditarFotoDelMiembro(profesional, { id: "yo" })).toBe(true)
  })

  it("un profesional sin memberId no cambia ninguna foto, ni una sin id que coincida", () => {
    const roto = actor("worker", null)
    expect(puedeEditarFotoDelMiembro(roto, yoMismo)).toBe(false)
    expect(puedeEditarFotoDelMiembro(roto, miembro)).toBe(false)
    expect(puedeEditarFotoDelMiembro(roto, { id: "", businessId: NEGOCIO })).toBe(false)
  })

  it("el dueño no es miembro: tiene permiso por rol, no por memberId", () => {
    expect(dueño.memberId).toBeNull()
    expect(puedeEditarFotoDelMiembro(dueño, miembro)).toBe(true)
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
    expect(puedeEditarFotosDelNegocio(null)).toBe(false)
    expect(puedeEditarNombreDelNegocio(null)).toBe(false)
    expect(puedeEditarFotoDelMiembro(null, miembro)).toBe(false)
  })

  it("un rol desconocido no gestiona la suscripción ni asigna citas a otros", () => {
    // El tipo no lo permite, pero en runtime un token viejo podría traerlo.
    const desconocido = { rol: "gerente", businessId: NEGOCIO, memberId: "yo" } as unknown as Actor

    expect(puedeGestionarSuscripcion(desconocido)).toBe(false)
    expect(veLaListaDeInicio(desconocido)).toBe(false)
    expect(puedeAsignarCitasAOtros(desconocido)).toBe(false)
    expect(puedeEditarPaginaDelNegocio(desconocido)).toBe(false)
    expect(puedeEditarFotosDelNegocio(desconocido)).toBe(false)
    expect(puedeEditarNombreDelNegocio(desconocido)).toBe(false)
    expect(puedeEditarFotoDelMiembro(desconocido, miembro)).toBe(false)
    // Ni siquiera con su propia membresía: un rol que no existe no cuenta como profesional.
    expect(puedeEditarFotoDelMiembro(desconocido, yoMismo)).toBe(false)
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

    expect(citasFake.filter((c) => coincideConWhere("appointment", c, where))).toHaveLength(0)
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

describe("zona horaria del negocio", () => {
  const conRubro = (rol: Rol, rubro: unknown): Actor => ({ ...actor(rol), rubro }) as Actor
  const desconocido = { rol: "gerente", businessId: NEGOCIO, memberId: "yo" } as unknown as Actor

  it("sólo la dueña; el encargado y el profesional no", () => {
    expect(puedeConfigurarZonaHoraria(dueño)).toBe(true)
    expect(puedeConfigurarZonaHoraria(encargado)).toBe(false)
    expect(puedeConfigurarZonaHoraria(profesional)).toBe(false)
  })

  it("no depende del rubro: la dueña de una clínica dental y la de un salón la configuran igual", () => {
    for (const rubro of ["odontologia", "salon", "barberia", "spa-de-unas", "salud", "", undefined, null]) {
      expect(puedeConfigurarZonaHoraria(conRubro("owner", rubro))).toBe(true)
      expect(puedeConfigurarZonaHoraria(conRubro("admin", rubro))).toBe(false)
      expect(puedeConfigurarZonaHoraria(conRubro("worker", rubro))).toBe(false)
    }
  })

  it("falla cerrado sin actor y con un rol desconocido", () => {
    expect(puedeConfigurarZonaHoraria(null)).toBe(false)
    expect(puedeConfigurarZonaHoraria(desconocido)).toBe(false)
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

describe("lo de salón que la clínica dental no usa (propinas, hora valle y fila virtual)", () => {
  type Permiso = (quien: Actor | null) => boolean
  const conRubro = (rol: Rol, rubro: unknown): Actor => ({ ...actor(rol), rubro }) as Actor
  const desconocido = { rol: "gerente", businessId: NEGOCIO, memberId: "yo", rubro: "odontologia" } as unknown as Actor

  /** Lo que cada rol puede fuera de una clínica dental: [dueña, encargado, profesional]. */
  const TABLA: [string, Permiso, [boolean, boolean, boolean]][] = [
    ["puedeRegistrarPropina", puedeRegistrarPropina, [true, true, false]],
    ["puedeConfigurarHoraValle", puedeConfigurarHoraValle, [true, false, false]],
    ["puedeActivarFilaVirtual", puedeActivarFilaVirtual, [true, false, false]],
    ["puedeVerPantallaDeFila", puedeVerPantallaDeFila, [true, true, false]],
    ["puedeVaciarFilaVirtual", puedeVaciarFilaVirtual, [true, true, false]],
  ]

  it.each(TABLA)("%s: en una clínica dental, nadie (ni la dueña)", (_nombre, permiso) => {
    for (const rol of ["owner", "admin", "worker"] as const) {
      expect(permiso(conRubro(rol, "odontologia"))).toBe(false)
    }
  })

  it.each(TABLA)("%s: salón, barbería, salón de uñas, rubros viejos y sin rubro siguen como siempre", (_nombre, permiso, [deDueña, deEncargado, deProfesional]) => {
    for (const rubro of ["salon", "barberia", "spa-de-unas", "salud", "fitness", "otro", "Odontologia", "odontología", "", undefined, null, 7, ["odontologia"]]) {
      expect(permiso(conRubro("owner", rubro))).toBe(deDueña)
      expect(permiso(conRubro("admin", rubro))).toBe(deEncargado)
      expect(permiso(conRubro("worker", rubro))).toBe(deProfesional)
    }
  })

  it.each(TABLA)("%s falla cerrado sin actor y con un rol desconocido (también en una clínica)", (_nombre, permiso) => {
    expect(permiso(null)).toBe(false)
    expect(permiso(desconocido)).toBe(false)
    expect(permiso({ ...desconocido, rubro: "salon" })).toBe(false)
  })

  describe("las preguntas por rubro (sin actor)", () => {
    const rubrosQueSi = ["salon", "barberia", "spa-de-unas", "salud", "fitness", "otro", "Odontologia", "odontología", "", undefined, null, 7, ["odontologia"]]

    it("sólo el rubro dental dice que no; todo lo demás, también lo desconocido, sigue como siempre", () => {
      for (const pregunta of [rubroOfrecePropinas, rubroOfreceHoraValle, rubroOfreceFilaVirtual]) {
        expect(pregunta("odontologia")).toBe(false)
        for (const rubro of rubrosQueSi) expect(pregunta(rubro)).toBe(true)
      }
    })

    it("veLaLineaDePropinas: donde hay propinas, siempre; en una clínica dental, sólo si hay plata (nunca esconde dinero)", () => {
      for (const rubro of rubrosQueSi) {
        expect(veLaLineaDePropinas(rubro, 0)).toBe(true)
        expect(veLaLineaDePropinas(rubro, 2500)).toBe(true)
      }
      expect(veLaLineaDePropinas("odontologia", 0)).toBe(false)
      expect(veLaLineaDePropinas("odontologia", 2500)).toBe(true)
      expect(veLaLineaDePropinas("odontologia", 25)).toBe(true)
      expect(veLaLineaDePropinas("odontologia", -2500)).toBe(true)
    })
  })
})

describe("clínica dental (rubro odontología)", () => {
  type Permiso = (quien: Actor | null) => boolean
  const dental = (rol: Rol): Actor => ({ ...actor(rol), rubro: "odontologia" })
  const duenaDental = dental("owner")
  const recepcion = dental("admin")
  const odontologo = dental("worker")
  const desconocido = { rol: "gerente", businessId: NEGOCIO, memberId: "yo", rubro: "odontologia" } as unknown as Actor

  /** Decisión del dueño: [dueña, encargado, odontólogo]. */
  const TABLA: [string, Permiso, [boolean, boolean, boolean]][] = [
    ["esClinicaDental", esClinicaDental, [true, true, true]],
    ["veFichaClinica", veFichaClinica, [true, false, true]],
    ["puedeEditarFichaClinica", puedeEditarFichaClinica, [true, false, true]],
    ["veAlertaDeAlergias", veAlertaDeAlergias, [true, true, true]],
    ["vePlanDeTratamiento", vePlanDeTratamiento, [true, true, true]],
    ["puedeEditarPlanDeTratamiento", puedeEditarPlanDeTratamiento, [true, false, true]],
    ["veSillones", veSillones, [true, true, true]],
    ["puedeGestionarSillones", puedeGestionarSillones, [true, true, false]],
    ["puedeAsignarSillon", puedeAsignarSillon, [true, true, true]],
    // Marcar un servicio como urgencia: dueño y encargado, como el resto del catálogo; el odontólogo no.
    ["puedeMarcarServicioComoUrgencia", puedeMarcarServicioComoUrgencia, [true, true, false]],
  ]

  it.each(TABLA)("%s sigue la tabla por rol en una clínica dental", (_nombre, permiso, [deDueña, deEncargado, deOdontologo]) => {
    expect(permiso(duenaDental)).toBe(deDueña)
    expect(permiso(recepcion)).toBe(deEncargado)
    expect(permiso(odontologo)).toBe(deOdontologo)
  })

  it.each(TABLA)("%s falla cerrado sin actor y con un rol desconocido", (_nombre, permiso) => {
    expect(permiso(null)).toBe(false)
    expect(permiso(desconocido)).toBe(false)
  })

  it.each(TABLA)("%s: en un negocio que no es dental, nadie (ni la dueña)", (_nombre, permiso) => {
    for (const rubro of ["salon", "barberia", "spa-de-unas", "salud", "Odontologia", "odontología", ""]) {
      for (const rol of ["owner", "admin", "worker"] as const) {
        expect(permiso({ ...actor(rol), rubro })).toBe(false)
      }
    }
  })

  it.each(TABLA)("%s: sin rubro (un actor de antes, o una sesión vieja), nadie", (_nombre, permiso) => {
    expect(permiso(dueño)).toBe(false)
    expect(permiso(encargado)).toBe(false)
    expect(permiso(profesional)).toBe(false)
  })

  it("el rubro de otro tipo que no es texto no cuenta", () => {
    const conRubroRaro = { ...dueño, rubro: ["odontologia"] } as unknown as Actor
    expect(esClinicaDental(conRubroRaro)).toBe(false)
  })

  describe("actorDeSesion lleva el rubro", () => {
    const sesion = (user: Record<string, unknown>) => ({ user }) as never

    it("copia el rubro de la sesión", () => {
      const desdeLaSesion = actorDeSesion(sesion({ role: "worker", businessId: NEGOCIO, memberId: "yo", rubro: "odontologia" }))
      expect(desdeLaSesion).toEqual({ rol: "worker", businessId: NEGOCIO, memberId: "yo", rubro: "odontologia" })
      expect(esClinicaDental(desdeLaSesion)).toBe(true)
    })

    it.each([
      ["sin rubro (sesión de antes del campo)", {}],
      ["rubro null", { rubro: null }],
      ["rubro vacío", { rubro: "" }],
      ["rubro que no es texto", { rubro: 1 }],
      ["rubro en una lista", { rubro: ["odontologia"] }],
    ])("%s: el actor sale igual, sin rubro, y no es dental", (_caso, extra) => {
      const desdeLaSesion = actorDeSesion(sesion({ role: "owner", businessId: NEGOCIO, ...extra }))
      expect(desdeLaSesion).toEqual({ rol: "owner", businessId: NEGOCIO, memberId: null })
      expect(desdeLaSesion).not.toHaveProperty("rubro")
      expect(esClinicaDental(desdeLaSesion)).toBe(false)
    })

    it("con el rubro de un salón no es dental", () => {
      expect(esClinicaDental(actorDeSesion(sesion({ role: "owner", businessId: NEGOCIO, rubro: "salon" })))).toBe(false)
    })
  })

  describe("filtros", () => {
    type Filtro = (quien: Actor | null, extra?: object) => object
    const DEL_NEGOCIO = { AND: [{ businessId: NEGOCIO }, {}] }
    const NADA_SIN_EXTRA = { AND: [NADA, {}] }

    /** [nombre, filtro, lo que ve cada uno: dueña, encargado, odontólogo]. */
    const FILTROS: [string, Filtro, [boolean, boolean, boolean]][] = [
      ["whereDeFichasClinicas", whereDeFichasClinicas as Filtro, [true, false, true]],
      ["whereDeAlertaDeAlergias", whereDeAlertaDeAlergias as Filtro, [true, true, true]],
      ["whereDeMarcasDentales", whereDeMarcasDentales as Filtro, [true, false, true]],
      ["whereDeEvoluciones", whereDeEvoluciones as Filtro, [true, false, true]],
      ["whereDePlanes", whereDePlanes as Filtro, [true, true, true]],
      ["whereDeEtapasDelPlan", whereDeEtapasDelPlan as Filtro, [true, true, true]],
      ["whereDePrestacionesDelPlan", whereDePrestacionesDelPlan as Filtro, [true, true, true]],
      ["whereDeSillones", whereDeSillones as Filtro, [true, true, true]],
    ]

    const filas = [
      { id: "propia", businessId: NEGOCIO, customerId: "paciente-1" },
      { id: "ajena", businessId: OTRO_NEGOCIO, customerId: "paciente-9" },
    ]
    /** El modelo que filtra cada uno, para leer su `where` con la base falsa (lanza ante un campo que no tiene). */
    const MODELO = new Map<Filtro, NombreDeModelo>([
      [whereDeFichasClinicas as Filtro, "fichaClinica"],
      [whereDeAlertaDeAlergias as Filtro, "fichaClinica"],
      [whereDeMarcasDentales as Filtro, "marcaDental"],
      [whereDeEvoluciones as Filtro, "evolucion"],
      [whereDePlanes as Filtro, "planDeTratamiento"],
      [whereDeEtapasDelPlan as Filtro, "etapaDelPlan"],
      [whereDePrestacionesDelPlan as Filtro, "prestacionDelPlan"],
      [whereDeSillones as Filtro, "sillon"],
    ])
    const visibles = (filtro: Filtro, quien: Actor | null, extra: object = {}) =>
      filas.filter((fila) => coincideConWhere(MODELO.get(filtro)!, fila, filtro(quien, extra))).map((fila) => fila.id)

    it.each(FILTROS)("%s acota al negocio de quien puede, y a nada a quien no", (_nombre, filtro, [deDueña, deEncargado, deOdontologo]) => {
      expect(filtro(duenaDental)).toEqual(deDueña ? DEL_NEGOCIO : NADA_SIN_EXTRA)
      expect(filtro(recepcion)).toEqual(deEncargado ? DEL_NEGOCIO : NADA_SIN_EXTRA)
      expect(filtro(odontologo)).toEqual(deOdontologo ? DEL_NEGOCIO : NADA_SIN_EXTRA)
      expect(visibles(filtro, duenaDental)).toEqual(deDueña ? ["propia"] : [])
      expect(visibles(filtro, recepcion)).toEqual(deEncargado ? ["propia"] : [])
    })

    it.each(FILTROS)("%s falla cerrado: sin actor, rol desconocido, sin rubro o en otro rubro, nada", (_nombre, filtro) => {
      for (const quien of [null, desconocido, dueño, encargado, profesional, { ...dueño, rubro: "salon" }]) {
        expect(filtro(quien)).toEqual(NADA_SIN_EXTRA)
        expect(visibles(filtro, quien)).toEqual([])
        expect(visibles(filtro, quien, { id: "propia" })).toEqual([])
      }
    })

    it.each(FILTROS)("%s: lo que agrega el endpoint va en el AND y no pisa el filtro", (_nombre, filtro) => {
      const extraQuePisa = { businessId: OTRO_NEGOCIO, AND: [{ id: "ajena" }] }
      expect(filtro(duenaDental, extraQuePisa)).toEqual({ AND: [{ businessId: NEGOCIO }, extraQuePisa] })
      expect(visibles(filtro, duenaDental, { businessId: OTRO_NEGOCIO })).toEqual([])
      expect(visibles(filtro, duenaDental, { id: "ajena" })).toEqual([])
      expect(visibles(filtro, duenaDental, { customerId: "paciente-1" })).toEqual(["propia"])
    })

    it("la dueña de otra clínica no ve nada de ésta", () => {
      const otraClinica: Actor = { rol: "owner", businessId: OTRO_NEGOCIO, memberId: null, rubro: "odontologia" }
      for (const [, filtro] of FILTROS) expect(visibles(filtro, otraClinica)).toEqual(["ajena"])
    })
  })
})


describe("prótesis (clínica dental)", () => {
  type Permiso = (quien: Actor | null) => boolean
  const dental = (rol: Rol, memberId?: string | null): Actor => ({ ...actor(rol, memberId), rubro: "odontologia" })
  const duenaDental = dental("owner")
  const recepcion = dental("admin")
  const odontologo = dental("worker")
  const desconocido = { rol: "gerente", businessId: NEGOCIO, memberId: "yo", rubro: "odontologia" } as unknown as Actor

  /** Decisión del dueño: [dueña, encargado, odontólogo]. */
  const TABLA: [string, Permiso, [boolean, boolean, boolean]][] = [
    ["veProtesis", veProtesis, [true, false, true]],
    ["puedeEditarProtesis", puedeEditarProtesis, [true, false, true]],
    ["puedeConfigurarRepartoDeProtesis", puedeConfigurarRepartoDeProtesis, [true, false, false]],
    ["puedeGestionarLaboratorios", puedeGestionarLaboratorios, [true, false, false]],
    // Los abonos se cobran en la Sala de espera: quien cobra, también el encargado.
    ["puedeCobrarAbonosDeProtesis", puedeCobrarAbonosDeProtesis, [true, true, false]],
    ["puedePagarAlLaboratorio", puedePagarAlLaboratorio, [true, false, false]],
  ]

  it.each(TABLA)("%s sigue la tabla por rol", (_nombre, permiso, [deDueña, deEncargado, deOdontologo]) => {
    expect(permiso(duenaDental)).toBe(deDueña)
    expect(permiso(recepcion)).toBe(deEncargado)
    expect(permiso(odontologo)).toBe(deOdontologo)
  })

  it.each(TABLA)("%s falla cerrado: sin actor, rol desconocido, sin rubro o en otro rubro", (_nombre, permiso) => {
    for (const quien of [null, desconocido, dueño, encargado, profesional]) expect(permiso(quien)).toBe(false)
    for (const rubro of ["salon", "barberia", "spa-de-unas", "odontología", ""]) {
      for (const rol of ["owner", "admin", "worker"] as const) expect(permiso({ ...actor(rol), rubro })).toBe(false)
    }
  })

  describe("veMontosDelReparto", () => {
    const suya = { businessId: NEGOCIO, memberId: "yo" }
    const deUnColega = { businessId: NEGOCIO, memberId: "colega" }
    const deLaDuena = { businessId: NEGOCIO, memberId: null }

    it("la dueña ve todo el reparto de cualquier prótesis de su clínica", () => {
      for (const protesis of [suya, deUnColega, deLaDuena]) expect(veMontosDelReparto(duenaDental, protesis)).toBe("todo")
    })

    it("la odontóloga ve sólo su parte, y sólo en las suyas", () => {
      expect(veMontosDelReparto(odontologo, suya)).toBe("suyo")
      expect(veMontosDelReparto(odontologo, deUnColega)).toBe("nada")
      expect(veMontosDelReparto(odontologo, deLaDuena)).toBe("nada")
    })

    it("un odontólogo sin memberId no ve nada, ni en una prótesis sin tratante", () => {
      expect(veMontosDelReparto(dental("worker", null), deLaDuena)).toBe("nada")
    })

    it("el encargado no ve nada", () => {
      expect(veMontosDelReparto(recepcion, suya)).toBe("nada")
    })

    it("falla cerrado: sin actor, rol desconocido, otro rubro u otro negocio", () => {
      expect(veMontosDelReparto(null, suya)).toBe("nada")
      expect(veMontosDelReparto(desconocido, suya)).toBe("nada")
      expect(veMontosDelReparto(dueño, suya)).toBe("nada")
      expect(veMontosDelReparto({ ...duenaDental, rubro: "salon" }, suya)).toBe("nada")
      expect(veMontosDelReparto(duenaDental, { businessId: OTRO_NEGOCIO, memberId: null })).toBe("nada")
      expect(veMontosDelReparto(odontologo, { businessId: OTRO_NEGOCIO, memberId: "yo" })).toBe("nada")
    })
  })

  describe("tratanteParaProtesis", () => {
    it("la dueña elige: ella misma por defecto o con duenio, o un miembro", () => {
      expect(tratanteParaProtesis(duenaDental, undefined)).toEqual({ memberId: null, byOwner: true })
      expect(tratanteParaProtesis(duenaDental, "duenio")).toEqual({ memberId: null, byOwner: true })
      expect(tratanteParaProtesis(duenaDental, "colega")).toEqual({ memberId: "colega", byOwner: false })
    })

    it("el odontólogo queda siempre él, pida lo que pida", () => {
      for (const pedido of [undefined, "duenio", "colega", "yo"]) {
        expect(tratanteParaProtesis(odontologo, pedido)).toEqual({ memberId: "yo", byOwner: false })
      }
    })

    it("falla cerrado: encargado, odontólogo sin memberId, sin actor, rol desconocido u otro rubro", () => {
      for (const quien of [recepcion, dental("worker", null), null, desconocido, dueño, profesional]) {
        expect(tratanteParaProtesis(quien, "colega")).toBeNull()
      }
    })
  })

  describe("filtros", () => {
    type Filtro = (quien: Actor | null, extra?: object) => object
    const DEL_NEGOCIO = { AND: [{ businessId: NEGOCIO }, {}] }
    const NADA_SIN_EXTRA = { AND: [NADA, {}] }

    /** [nombre, filtro, lo que ve cada uno: dueña, encargado, odontólogo]. */
    const FILTROS: [string, Filtro, [boolean, boolean, boolean]][] = [
      ["whereDeProtesis", whereDeProtesis as Filtro, [true, false, true]],
      ["whereDeEventosDeProtesis", whereDeEventosDeProtesis as Filtro, [true, false, true]],
      ["whereDeMaterialesDeProtesis", whereDeMaterialesDeProtesis as Filtro, [true, false, true]],
      ["whereDeLaboratorios", whereDeLaboratorios as Filtro, [true, false, true]],
      ["whereDeCambiosDeReparto", whereDeCambiosDeReparto as Filtro, [true, false, false]],
      ["whereDePagosAlLaboratorio", whereDePagosAlLaboratorio as Filtro, [true, false, false]],
      ["whereDeProtesisParaCobrar", whereDeProtesisParaCobrar as Filtro, [true, true, false]],
    ]

    const filas = [
      { id: "propia", businessId: NEGOCIO, memberId: "yo" },
      { id: "de-colega", businessId: NEGOCIO, memberId: "colega" },
      { id: "ajena", businessId: OTRO_NEGOCIO, memberId: "yo" },
    ]
    /** El modelo que filtra cada uno, para leer su `where` con la base falsa (lanza ante un campo que no tiene). */
    const MODELO = new Map<Filtro, NombreDeModelo>([
      [whereDeProtesis as Filtro, "protesis"],
      [whereDeEventosDeProtesis as Filtro, "eventoDeProtesis"],
      [whereDeMaterialesDeProtesis as Filtro, "materialDeProtesis"],
      [whereDeLaboratorios as Filtro, "laboratorio"],
      [whereDeCambiosDeReparto as Filtro, "cambioDeRepartoDeProtesis"],
      [whereDePagosAlLaboratorio as Filtro, "pagoAlLaboratorio"],
      [whereDeProtesisParaCobrar as Filtro, "protesis"],
      [whereDeExcepcionesDeReparto as Filtro, "excepcionDeRepartoDeProtesis"],
    ])
    const visibles = (filtro: Filtro, quien: Actor | null, extra: object = {}) =>
      filas.filter((fila) => coincideConWhere(MODELO.get(filtro)!, fila, filtro(quien, extra))).map((fila) => fila.id)

    it.each(FILTROS)("%s acota al negocio de quien puede, y a nada a quien no", (_nombre, filtro, [deDueña, deEncargado, deOdontologo]) => {
      expect(filtro(duenaDental)).toEqual(deDueña ? DEL_NEGOCIO : NADA_SIN_EXTRA)
      expect(filtro(recepcion)).toEqual(deEncargado ? DEL_NEGOCIO : NADA_SIN_EXTRA)
      expect(filtro(odontologo)).toEqual(deOdontologo ? DEL_NEGOCIO : NADA_SIN_EXTRA)
      expect(visibles(filtro, duenaDental)).toEqual(deDueña ? ["propia", "de-colega"] : [])
    })

    it.each(FILTROS)("%s falla cerrado: sin actor, rol desconocido, sin rubro o en otro rubro, nada", (_nombre, filtro) => {
      for (const quien of [null, desconocido, dueño, encargado, profesional, { ...duenaDental, rubro: "salon" }]) {
        expect(filtro(quien)).toEqual(NADA_SIN_EXTRA)
        expect(visibles(filtro, quien, { id: "propia" })).toEqual([])
      }
    })

    it.each(FILTROS)("%s: lo que agrega el endpoint va en el AND y no pisa el filtro", (_nombre, filtro) => {
      const extraQuePisa = { businessId: OTRO_NEGOCIO, AND: [{ id: "ajena" }] }
      expect(filtro(duenaDental, extraQuePisa)).toEqual({ AND: [{ businessId: NEGOCIO }, extraQuePisa] })
      expect(visibles(filtro, duenaDental, { id: "ajena" })).toEqual([])
    })

    it("whereDeExcepcionesDeReparto: la dueña, todas; el odontólogo, sólo las suyas; nadie más, ninguna", () => {
      expect(visibles(whereDeExcepcionesDeReparto as Filtro, duenaDental)).toEqual(["propia", "de-colega"])
      expect(visibles(whereDeExcepcionesDeReparto as Filtro, odontologo)).toEqual(["propia"])
      expect(visibles(whereDeExcepcionesDeReparto as Filtro, odontologo, { memberId: "colega" })).toEqual([])
      for (const quien of [recepcion, dental("worker", null), null, desconocido, dueño, profesional, { ...duenaDental, rubro: "salon" }]) {
        expect(whereDeExcepcionesDeReparto(quien)).toEqual(NADA_SIN_EXTRA)
        expect(visibles(whereDeExcepcionesDeReparto as Filtro, quien)).toEqual([])
      }
      const otraClinica: Actor = { rol: "owner", businessId: OTRO_NEGOCIO, memberId: null, rubro: "odontologia" }
      expect(visibles(whereDeExcepcionesDeReparto as Filtro, otraClinica)).toEqual(["ajena"])
    })

    it("la dueña de otra clínica no ve nada de ésta", () => {
      const otraClinica: Actor = { rol: "owner", businessId: OTRO_NEGOCIO, memberId: null, rubro: "odontologia" }
      for (const [, filtro] of FILTROS) expect(visibles(filtro, otraClinica)).toEqual(["ajena"])
    })

    describe("whereDeAbonosDeProtesis", () => {
      const tablas = {
        visit: [
          { id: "at-1", businessId: NEGOCIO },
          { id: "at-2", businessId: OTRO_NEGOCIO },
        ],
        visitService: [
          { id: "abono-propio", visitId: "at-1", protesisId: "pr-1", memberId: "colega" },
          { id: "linea-normal", visitId: "at-1", protesisId: null, memberId: "yo" },
          { id: "abono-ajeno", visitId: "at-2", protesisId: "pr-9", memberId: "yo" },
        ],
      } as unknown as Tablas
      const abonos = (quien: Actor | null, extra: object = {}) =>
        tablas.visitService
          .filter((linea) => coincide(tablas, "visitService", linea, whereDeAbonosDeProtesis(quien, extra)))
          .map((linea) => linea.id)

      it("quien ve prótesis ve los abonos de su negocio, de cualquier profesional; no las líneas normales", () => {
        expect(abonos(duenaDental)).toEqual(["abono-propio"])
        expect(abonos(odontologo)).toEqual(["abono-propio"])
        expect(abonos(duenaDental, { protesisId: "pr-9" })).toEqual([])
      })

      it("falla cerrado: encargado, sin actor, rol desconocido u otro rubro", () => {
        for (const quien of [recepcion, null, desconocido, dueño, { ...duenaDental, rubro: "salon" }]) expect(abonos(quien)).toEqual([])
      })
    })

    describe("whereDeAbonosPorPagarAlLaboratorio", () => {
      const tablas = {
        visit: [
          { id: "at-1", businessId: NEGOCIO },
          { id: "at-2", businessId: OTRO_NEGOCIO },
        ],
        visitService: [
          { id: "abono-propio", visitId: "at-1", protesisId: "pr-1", memberId: "colega" },
          { id: "linea-normal", visitId: "at-1", protesisId: null, memberId: "yo" },
          { id: "abono-ajeno", visitId: "at-2", protesisId: "pr-9", memberId: "yo" },
        ],
      } as unknown as Tablas
      const abonos = (quien: Actor | null, extra: object = {}) =>
        tablas.visitService
          .filter((linea) => coincide(tablas, "visitService", linea, whereDeAbonosPorPagarAlLaboratorio(quien, extra)))
          .map((linea) => linea.id)

      it("sólo la dueña, los abonos de su clínica; el extra no pisa el negocio", () => {
        expect(abonos(duenaDental)).toEqual(["abono-propio"])
        expect(abonos(duenaDental, { visit: { is: { businessId: OTRO_NEGOCIO } } })).toEqual([])
      })

      it("falla cerrado: encargado, odontólogo, sin actor, rol desconocido u otro rubro", () => {
        for (const quien of [recepcion, odontologo, null, desconocido, dueño, { ...duenaDental, rubro: "salon" }]) expect(abonos(quien)).toEqual([])
      })
    })
  })
})
