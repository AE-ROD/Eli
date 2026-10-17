/**
 * La mitad de lectura de la base falsa (`base-falsa.ts`): cómo se evalúa un
 * `where`, un `orderBy` y un `select`/`include` sobre tablas en memoria.
 *
 * La regla que no se negocia: **ante algo que no entiende, lanza**. El helper
 * `coincide` de los tests de citas devolvía `false` ante cualquier clave que
 * no conocía, y un agujero de aislamiento escrito con otro operador pasaba en
 * verde por la razón equivocada (F-018). Acá un operador, un campo o una
 * relación desconocidos rompen el test con un mensaje que dice cuál.
 */

export type Registro = Record<string, unknown>
export type Condicion = Record<string, unknown>

export type NombreDeModelo =
  | "user"
  | "business"
  | "businessMember"
  | "customer"
  | "service"
  | "appointment"
  | "visit"
  | "visitService"
  | "visitPayment"

export type Tablas = Record<NombreDeModelo, Registro[]>

export interface Relacion {
  modelo: NombreDeModelo
  /** `uno`: a lo sumo un registro relacionado; `muchos`: una lista. */
  tipo: "uno" | "muchos"
  /** Campo de este registro... */
  local: string
  /** ...que se compara con este campo del otro. */
  remoto: string
}

const uno = (modelo: NombreDeModelo, local: string, remoto = "id"): Relacion => ({ modelo, tipo: "uno", local, remoto })
const muchos = (modelo: NombreDeModelo, remoto: string): Relacion => ({ modelo, tipo: "muchos", local: "id", remoto })

/** Sólo las relaciones que usan los endpoints. Una que falte acá, lanza. */
export const RELACIONES: Record<NombreDeModelo, Record<string, Relacion>> = {
  user: {},
  business: { user: uno("user", "userId") },
  businessMember: { user: uno("user", "userId"), business: uno("business", "businessId") },
  customer: {},
  service: {},
  appointment: {
    customer: uno("customer", "customerId"),
    member: uno("businessMember", "memberId"),
    service: uno("service", "serviceId"),
    business: uno("business", "businessId"),
    // La atención guarda la FK: del lado de la cita es la relación inversa.
    visit: uno("visit", "id", "appointmentId"),
  },
  visit: {
    business: uno("business", "businessId"),
    customer: uno("customer", "customerId"),
    appointment: uno("appointment", "appointmentId"),
    services: muchos("visitService", "visitId"),
    payments: muchos("visitPayment", "visitId"),
  },
  visitService: {
    visit: uno("visit", "visitId"),
    member: uno("businessMember", "memberId"),
    service: uno("service", "serviceId"),
  },
  visitPayment: { visit: uno("visit", "visitId") },
}

const OPERADORES_DE_CAMPO = new Set(["equals", "in", "notIn", "not", "gt", "gte", "lt", "lte"])

export function falla(mensaje: string): never {
  throw new Error(`base falsa: ${mensaje}`)
}

export function esObjetoPlano(valor: unknown): valor is Condicion {
  return typeof valor === "object" && valor !== null && !(valor instanceof Date) && !Array.isArray(valor)
}

export function iguales(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  return a === b
}

function comparable(valor: unknown): number | string {
  if (valor instanceof Date) return valor.getTime()
  if (typeof valor === "number" || typeof valor === "string") return valor
  return falla(`no sé comparar ${JSON.stringify(valor)}`)
}

export function relacionados(tablas: Tablas, rel: Relacion, registro: Registro): Registro[] {
  const valor = registro[rel.local]
  if (valor === null || valor === undefined) return []
  return tablas[rel.modelo].filter((otro) => iguales(otro[rel.remoto], valor))
}

// ─── where ───────────────────────────────────────────────────────────────────

export function coincide(tablas: Tablas, modelo: NombreDeModelo, registro: Registro, where: unknown): boolean {
  if (where === undefined) return true
  if (!esObjetoPlano(where)) return falla(`where inválido en ${modelo}: ${JSON.stringify(where)}`)

  return Object.entries(where).every(([clave, condicion]) => {
    if (condicion === undefined) return true
    if (clave === "AND") {
      const partes = Array.isArray(condicion) ? condicion : [condicion]
      return partes.every((parte) => coincide(tablas, modelo, registro, parte))
    }
    if (clave === "OR") {
      if (!Array.isArray(condicion)) return falla(`OR sin lista en ${modelo}`)
      return condicion.some((parte) => coincide(tablas, modelo, registro, parte))
    }
    if (clave === "NOT") return falla(`NOT no está implementado (${modelo})`)

    const rel = RELACIONES[modelo][clave]
    if (rel) return coincideRelacion(tablas, rel, registro, condicion, `${modelo}.${clave}`)
    if (!(clave in registro)) return falla(`el campo ${modelo}.${clave} no existe`)
    return coincideCampo(registro[clave], condicion, `${modelo}.${clave}`)
  })
}

function coincideRelacion(tablas: Tablas, rel: Relacion, registro: Registro, condicion: unknown, ruta: string): boolean {
  const otros = relacionados(tablas, rel, registro)
  const cumple = (otro: Registro, sub: unknown) => coincide(tablas, rel.modelo, otro, sub)

  if (rel.tipo === "muchos") {
    if (!esObjetoPlano(condicion)) return falla(`${ruta} espera some/none/every`)
    return Object.entries(condicion).every(([operador, sub]) => {
      if (operador === "some") return otros.some((otro) => cumple(otro, sub))
      if (operador === "none") return !otros.some((otro) => cumple(otro, sub))
      if (operador === "every") return otros.every((otro) => cumple(otro, sub))
      return falla(`operador ${operador} no soportado en ${ruta}`)
    })
  }

  const otro = otros[0] ?? null
  if (condicion === null) return otro === null
  if (!esObjetoPlano(condicion)) return falla(`${ruta} espera un objeto`)

  if ("is" in condicion || "isNot" in condicion) {
    return Object.entries(condicion).every(([operador, sub]) => {
      if (operador === "is") return sub === null ? otro === null : otro !== null && cumple(otro, sub)
      if (operador === "isNot") return sub === null ? otro !== null : otro === null || !cumple(otro, sub)
      return falla(`no se mezcla ${operador} con is/isNot en ${ruta}`)
    })
  }
  return otro !== null && cumple(otro, condicion)
}

function coincideCampo(valor: unknown, condicion: unknown, ruta: string): boolean {
  if (condicion === null) return valor === null
  if (!esObjetoPlano(condicion)) {
    if (Array.isArray(condicion)) return falla(`igualdad contra una lista en ${ruta}`)
    return iguales(valor, condicion)
  }

  return Object.entries(condicion).every(([operador, argumento]) => {
    if (argumento === undefined) return true
    if (!OPERADORES_DE_CAMPO.has(operador)) return falla(`operador ${operador} no soportado en ${ruta}`)
    // Como en SQL: comparar contra NULL no da verdadero (salvo `not: null`).
    if (operador === "not") return argumento === null ? valor !== null : valor !== null && !iguales(valor, argumento)
    if (operador === "equals") return argumento === null ? valor === null : iguales(valor, argumento)
    if (operador === "in" || operador === "notIn") {
      if (!Array.isArray(argumento)) return falla(`${operador} sin lista en ${ruta}`)
      const esta = argumento.some((opcion) => iguales(valor, opcion))
      return operador === "in" ? esta : valor !== null && !esta
    }
    if (valor === null) return false
    const a = comparable(valor)
    const b = comparable(argumento)
    if (operador === "gt") return a > b
    if (operador === "gte") return a >= b
    if (operador === "lt") return a < b
    return a <= b
  })
}

// ─── orderBy ─────────────────────────────────────────────────────────────────

export function ordenar(registros: Registro[], orderBy: unknown): Registro[] {
  if (orderBy === undefined) return registros
  const criterios = (Array.isArray(orderBy) ? orderBy : [orderBy]) as Condicion[]
  return [...registros].sort((x, y) => {
    for (const criterio of criterios) {
      const entradas = Object.entries(criterio)
      if (entradas.length !== 1) return falla(`orderBy con más de un campo por objeto: ${JSON.stringify(criterio)}`)
      const [campo, sentido] = entradas[0]
      if (sentido !== "asc" && sentido !== "desc") return falla(`orderBy ${campo}: ${JSON.stringify(sentido)}`)
      const a = x[campo]
      const b = y[campo]
      if (a === undefined || b === undefined) return falla(`orderBy por un campo que no existe: ${campo}`)
      if (iguales(a, b)) continue
      // Como Postgres: los null van al final en asc y al principio en desc.
      if (a === null) return sentido === "asc" ? 1 : -1
      if (b === null) return sentido === "asc" ? -1 : 1
      const resultado = comparable(a) < comparable(b) ? -1 : 1
      return sentido === "asc" ? resultado : -resultado
    }
    return 0
  })
}

// ─── select / include ────────────────────────────────────────────────────────

/** El registro con la forma que pidió `select` o `include`, relaciones incluidas. */
export function proyectar(tablas: Tablas, modelo: NombreDeModelo, registro: Registro, args: unknown): Registro {
  const opciones = esObjetoPlano(args) ? args : {}
  const salida: Registro = {}

  if (opciones.select !== undefined) {
    if (!esObjetoPlano(opciones.select)) return falla(`select inválido en ${modelo}`)
    for (const [clave, pedido] of Object.entries(opciones.select)) {
      if (!pedido) continue
      const rel = RELACIONES[modelo][clave]
      if (rel) salida[clave] = resolver(tablas, rel, registro, pedido)
      else if (clave in registro) salida[clave] = registro[clave]
      else return falla(`select de un campo que no existe: ${modelo}.${clave}`)
    }
    return salida
  }

  for (const [clave, valor] of Object.entries(registro)) salida[clave] = valor
  if (opciones.include !== undefined) {
    if (!esObjetoPlano(opciones.include)) return falla(`include inválido en ${modelo}`)
    for (const [clave, pedido] of Object.entries(opciones.include)) {
      if (!pedido) continue
      const rel = RELACIONES[modelo][clave]
      if (!rel) return falla(`include de una relación que no existe: ${modelo}.${clave}`)
      salida[clave] = resolver(tablas, rel, registro, pedido)
    }
  }
  return salida
}

function resolver(tablas: Tablas, rel: Relacion, registro: Registro, pedido: unknown): unknown {
  const args = esObjetoPlano(pedido) ? pedido : undefined
  const otros = relacionados(tablas, rel, registro)

  if (rel.tipo === "uno") {
    if (args && ("where" in args || "orderBy" in args || "take" in args)) {
      return falla(`where/orderBy/take en una relación a uno (${rel.modelo})`)
    }
    return otros[0] ? proyectar(tablas, rel.modelo, otros[0], args) : null
  }

  let lista = args?.where === undefined ? otros : otros.filter((otro) => coincide(tablas, rel.modelo, otro, args.where))
  lista = ordenar(lista, args?.orderBy)
  if (args?.take !== undefined) lista = lista.slice(0, args.take as number)
  return lista.map((otro) => proyectar(tablas, rel.modelo, otro, args))
}
