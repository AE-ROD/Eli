import { describe, it, expect } from "vitest"
import {
  actorDeSesion,
  mismoNegocio,
  puedeGestionarEquipo,
  puedeCambiarRolDe,
  puedeEditarComisiones,
  puedeVerIngresosDelNegocio,
  puedeVerLiquidacionDe,
  puedeVerTodaLaAgenda,
  puedeEditarHorarioDe,
  puedeVerTodoElTablero,
  puedeCobrar,
  puedeAsignarLineasAOtros,
  puedeAnotarSinReserva,
  puedeAnular,
  puedeDeshacerLlegada,
  puedeVerAnuladas,
  puedeVerCita,
  memberIdParaCita,
  profesionalParaLinea,
  whereDeAgenda,
  whereDeClientes,
  whereDeAtenciones,
  whereDeLineas,
  whereDePagos,
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
    ["deshacer una llegada que ve", puedeDeshacerLlegada, true, true, true],
    ["ver el historial de anuladas", puedeVerAnuladas, true, true, false],
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
    expect(puedeDeshacerLlegada(null)).toBe(false)
    expect(puedeVerAnuladas(null)).toBe(false)
    expect(puedeVerCita(null, { businessId: NEGOCIO, memberId: "yo" })).toBe(false)
  })

  it("un profesional sin memberId no deshace llegadas ni ve citas sin asignar", () => {
    const roto = actor("worker", null)

    expect(puedeDeshacerLlegada(roto)).toBe(false)
    // `null === null` no es "su" cita: falla cerrado.
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

  /**
   * Mismo helper que `app/api/citas/route.test.ts`: entiende `AND`, igualdad
   * simple y `{ in: [...] }`. Se reusa acá para comprobar, contra datos
   * fake, que la negación de un profesional sin `memberId` sobrevive incluso
   * cuando `extra` trae su propio `AND` (el bug de F-002 con `AND`).
   */
  function coincide(item: Record<string, unknown>, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([clave, valor]) => {
      if (clave === "AND") {
        return (valor as Record<string, unknown>[]).every((sub) => coincide(item, sub))
      }
      if (valor && typeof valor === "object" && "in" in (valor as Record<string, unknown>)) {
        return ((valor as { in: unknown[] }).in).includes(item[clave])
      }
      return item[clave] === valor
    })
  }

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

    expect(citasFake.filter((c) => coincide(c, where))).toHaveLength(0)
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
