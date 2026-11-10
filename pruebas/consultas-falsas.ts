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
  | "workSchedule"
  | "timeBlock"
  | "memberService"
  | "commissionRate"
  | "commissionChange"
  | "producto"
  | "propinaDeAtencion"
  | "liquidacion"
  | "movimientoDeLiquidacion"
  | "cierreDeCaja"
  | "inscripcionEnEspera"
  | "envioAClientes"
  | "appointmentService"
  | "franjaDeHoraValle"
  // Clínica dental (migración `20261106120000_etapa_6_odontologia`).
  | "sillon"
  | "fichaClinica"
  | "marcaDental"
  | "evolucion"
  | "planDeTratamiento"
  | "etapaDelPlan"
  | "prestacionDelPlan"
  // Prótesis (migración `20261108120000_etapa_7_protesis`).
  | "laboratorio"
  | "materialDeProtesis"
  | "excepcionDeRepartoDeProtesis"
  | "cambioDeRepartoDeProtesis"
  | "protesis"
  | "eventoDeProtesis"
  | "pagoAlLaboratorio"

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

/**
 * Sólo las relaciones que usan los endpoints. Una que falte acá, lanza. Las
 * de la clínica dental están todas las del esquema (también las inversas en
 * negocio, miembro, cliente, servicio y cita), para los tests de sus
 * endpoints. Cada relación a uno que apunta a un `id` es además una FK que la
 * base revisa al escribir (`verificarClaves` en `base-falsa.ts`).
 */
export const RELACIONES: Record<NombreDeModelo, Record<string, Relacion>> = {
  user: {},
  business: {
    user: uno("user", "userId"),
    // Las que lee la mini página pública (`leerPaginaDelNegocio`).
    members: muchos("businessMember", "businessId"),
    services: muchos("service", "businessId"),
    workSchedules: muchos("workSchedule", "businessId"),
    franjasDeHoraValle: muchos("franjaDeHoraValle", "businessId"),
    sillones: muchos("sillon", "businessId"),
    fichasClinicas: muchos("fichaClinica", "businessId"),
    marcasDentales: muchos("marcaDental", "businessId"),
    evoluciones: muchos("evolucion", "businessId"),
    planesDeTratamiento: muchos("planDeTratamiento", "businessId"),
    etapasDelPlan: muchos("etapaDelPlan", "businessId"),
    prestacionesDelPlan: muchos("prestacionDelPlan", "businessId"),
    laboratorios: muchos("laboratorio", "businessId"),
    materialesDeProtesis: muchos("materialDeProtesis", "businessId"),
    excepcionesDeReparto: muchos("excepcionDeRepartoDeProtesis", "businessId"),
    cambiosDeReparto: muchos("cambioDeRepartoDeProtesis", "businessId"),
    protesis: muchos("protesis", "businessId"),
    eventosDeProtesis: muchos("eventoDeProtesis", "businessId"),
    pagosAlLaboratorio: muchos("pagoAlLaboratorio", "businessId"),
  },
  businessMember: {
    user: uno("user", "userId"),
    business: uno("business", "businessId"),
    memberServices: muchos("memberService", "memberId"),
    commissionRates: muchos("commissionRate", "memberId"),
    liquidaciones: muchos("liquidacion", "memberId"),
    evoluciones: muchos("evolucion", "memberId"),
    prestacionesDelPlan: muchos("prestacionDelPlan", "memberId"),
    protesis: muchos("protesis", "memberId"),
    excepcionesDeReparto: muchos("excepcionDeRepartoDeProtesis", "memberId"),
  },
  customer: {
    // La ficha guarda la FK: del lado del paciente es la relación inversa (1:1).
    fichaClinica: uno("fichaClinica", "id", "customerId"),
    marcasDentales: muchos("marcaDental", "customerId"),
    evoluciones: muchos("evolucion", "customerId"),
    planesDeTratamiento: muchos("planDeTratamiento", "customerId"),
    protesis: muchos("protesis", "customerId"),
  },
  service: {
    commissionRates: muchos("commissionRate", "serviceId"),
    prestacionesDelPlan: muchos("prestacionDelPlan", "serviceId"),
  },
  appointment: {
    customer: uno("customer", "customerId"),
    member: uno("businessMember", "memberId"),
    service: uno("service", "serviceId"),
    business: uno("business", "businessId"),
    // La atención guarda la FK: del lado de la cita es la relación inversa.
    visit: uno("visit", "id", "appointmentId"),
    servicios: muchos("appointmentService", "appointmentId"),
    sillon: uno("sillon", "sillonId"),
    evoluciones: muchos("evolucion", "appointmentId"),
    prestacionesDelPlan: muchos("prestacionDelPlan", "appointmentId"),
  },
  visit: {
    business: uno("business", "businessId"),
    customer: uno("customer", "customerId"),
    appointment: uno("appointment", "appointmentId"),
    services: muchos("visitService", "visitId"),
    payments: muchos("visitPayment", "visitId"),
    propinas: muchos("propinaDeAtencion", "visitId"),
  },
  visitService: {
    visit: uno("visit", "visitId"),
    member: uno("businessMember", "memberId"),
    service: uno("service", "serviceId"),
    product: uno("producto", "productId"),
    liquidacion: uno("liquidacion", "liquidacionId"),
    protesis: uno("protesis", "protesisId"),
    pagoAlLaboratorio: uno("pagoAlLaboratorio", "pagoAlLaboratorioId"),
  },
  visitPayment: { visit: uno("visit", "visitId") },
  workSchedule: { business: uno("business", "businessId"), member: uno("businessMember", "memberId") },
  timeBlock: { business: uno("business", "businessId"), member: uno("businessMember", "memberId") },
  memberService: {
    business: uno("business", "businessId"),
    member: uno("businessMember", "memberId"),
    service: uno("service", "serviceId"),
  },
  commissionRate: {
    business: uno("business", "businessId"),
    member: uno("businessMember", "memberId"),
    service: uno("service", "serviceId"),
  },
  commissionChange: {
    business: uno("business", "businessId"),
    member: uno("businessMember", "memberId"),
    service: uno("service", "serviceId"),
    product: uno("producto", "productId"),
  },
  producto: { business: uno("business", "businessId"), visitServices: muchos("visitService", "productId") },
  propinaDeAtencion: {
    business: uno("business", "businessId"),
    visit: uno("visit", "visitId"),
    member: uno("businessMember", "memberId"),
    liquidacion: uno("liquidacion", "liquidacionId"),
  },
  liquidacion: {
    business: uno("business", "businessId"),
    member: uno("businessMember", "memberId"),
    lineas: muchos("visitService", "liquidacionId"),
    propinas: muchos("propinaDeAtencion", "liquidacionId"),
    movimientos: muchos("movimientoDeLiquidacion", "liquidacionId"),
  },
  movimientoDeLiquidacion: {
    business: uno("business", "businessId"),
    member: uno("businessMember", "memberId"),
    visit: uno("visit", "visitId"),
    liquidacion: uno("liquidacion", "liquidacionId"),
  },
  cierreDeCaja: { business: uno("business", "businessId") },
  inscripcionEnEspera: {
    business: uno("business", "businessId"),
    service: uno("service", "serviceId"),
    member: uno("businessMember", "memberId"),
    envios: muchos("envioAClientes", "esperaId"),
  },
  envioAClientes: {
    business: uno("business", "businessId"),
    customer: uno("customer", "customerId"),
    espera: uno("inscripcionEnEspera", "esperaId"),
  },
  appointmentService: {
    business: uno("business", "businessId"),
    appointment: uno("appointment", "appointmentId"),
    service: uno("service", "serviceId"),
  },
  franjaDeHoraValle: { business: uno("business", "businessId") },
  sillon: { business: uno("business", "businessId"), citas: muchos("appointment", "sillonId") },
  fichaClinica: { business: uno("business", "businessId"), customer: uno("customer", "customerId") },
  marcaDental: { business: uno("business", "businessId"), customer: uno("customer", "customerId") },
  evolucion: {
    business: uno("business", "businessId"),
    customer: uno("customer", "customerId"),
    member: uno("businessMember", "memberId"),
    appointment: uno("appointment", "appointmentId"),
  },
  planDeTratamiento: {
    business: uno("business", "businessId"),
    customer: uno("customer", "customerId"),
    etapas: muchos("etapaDelPlan", "planId"),
  },
  etapaDelPlan: {
    business: uno("business", "businessId"),
    plan: uno("planDeTratamiento", "planId"),
    prestaciones: muchos("prestacionDelPlan", "etapaId"),
  },
  prestacionDelPlan: {
    business: uno("business", "businessId"),
    etapa: uno("etapaDelPlan", "etapaId"),
    service: uno("service", "serviceId"),
    member: uno("businessMember", "memberId"),
    appointment: uno("appointment", "appointmentId"),
    protesis: uno("protesis", "protesisId"),
  },
  laboratorio: {
    business: uno("business", "businessId"),
    materialesPorDefecto: muchos("materialDeProtesis", "laboratorioPorDefectoId"),
    protesis: muchos("protesis", "laboratorioId"),
    pagos: muchos("pagoAlLaboratorio", "laboratorioId"),
  },
  materialDeProtesis: {
    business: uno("business", "businessId"),
    laboratorioPorDefecto: uno("laboratorio", "laboratorioPorDefectoId"),
    excepciones: muchos("excepcionDeRepartoDeProtesis", "materialId"),
    protesis: muchos("protesis", "materialId"),
  },
  excepcionDeRepartoDeProtesis: {
    business: uno("business", "businessId"),
    member: uno("businessMember", "memberId"),
    material: uno("materialDeProtesis", "materialId"),
  },
  cambioDeRepartoDeProtesis: { business: uno("business", "businessId") },
  protesis: {
    business: uno("business", "businessId"),
    customer: uno("customer", "customerId"),
    member: uno("businessMember", "memberId"),
    material: uno("materialDeProtesis", "materialId"),
    laboratorio: uno("laboratorio", "laboratorioId"),
    eventos: muchos("eventoDeProtesis", "protesisId"),
    prestacionesDelPlan: muchos("prestacionDelPlan", "protesisId"),
    abonos: muchos("visitService", "protesisId"),
  },
  eventoDeProtesis: { business: uno("business", "businessId"), protesis: uno("protesis", "protesisId") },
  pagoAlLaboratorio: {
    business: uno("business", "businessId"),
    laboratorio: uno("laboratorio", "laboratorioId"),
    lineas: muchos("visitService", "pagoAlLaboratorioId"),
  },
}

/**
 * Las relaciones que en la base son FK compuestas contra `(id, businessId)`:
 * además de existir, el otro registro tiene que ser del mismo negocio. Así un
 * test que escribe una propina con la atención de otro negocio falla con P2003,
 * como en Postgres.
 */
export const COMPUESTAS: Partial<Record<NombreDeModelo, string[]>> = {
  commissionRate: ["member", "service"],
  memberService: ["member", "service"],
  timeBlock: ["member"],
  propinaDeAtencion: ["visit", "member", "liquidacion"],
  liquidacion: ["member"],
  movimientoDeLiquidacion: ["member", "visit", "liquidacion"],
  // El servicio de una inscripción es FK compuesta; el profesional, simple.
  inscripcionEnEspera: ["service"],
  // La cita es FK compuesta; el servicio, simple, pero el trigger
  // `cita_servicios_mismo_negocio` exige que sea del mismo negocio: acá se
  // emula igual que una compuesta.
  appointmentService: ["appointment", "service"],
  // Clínica dental: toda FK a otra fila del negocio es compuesta, también el
  // sillón de la cita (`citas_sillonId_businessId_fkey`). Sólo `business` es
  // simple en cada tabla nueva.
  appointment: ["sillon"],
  fichaClinica: ["customer"],
  marcaDental: ["customer"],
  evolucion: ["customer", "member", "appointment"],
  planDeTratamiento: ["customer"],
  etapaDelPlan: ["plan"],
  prestacionDelPlan: ["etapa", "service", "member", "appointment", "protesis"],
  // Prótesis: como las de la clínica dental, toda FK a otra fila del negocio
  // es compuesta. Las dos nuevas de `atencion_servicios` (prótesis y pago al
  // laboratorio) son simples, y el trigger `atencion_servicios_reparto_de_protesis`
  // exige el negocio de la atención: lo emula `base-falsa.ts`.
  materialDeProtesis: ["laboratorioPorDefecto"],
  excepcionDeRepartoDeProtesis: ["member", "material"],
  protesis: ["customer", "member", "material", "laboratorio"],
  eventoDeProtesis: ["protesis"],
  pagoAlLaboratorio: ["laboratorio"],
}

const OPERADORES_DE_CAMPO = new Set(["equals", "in", "notIn", "not", "gt", "gte", "lt", "lte", "has"])

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

/**
 * Lo que da una condición en SQL: verdadero, falso o desconocido (`null`).
 * Hace falta el tercer valor para las listas en NULL: `has` sobre una lista
 * NULL da desconocido, y `NOT` de desconocido sigue siendo desconocido, así
 * que la fila no sale ni con la condición ni con su negación. Es lo que hace
 * Postgres con `NOT (tags @> ARRAY[...])` cuando `tags` es NULL.
 */
type Logico = boolean | null

function y(valores: Logico[]): Logico {
  if (valores.some((valor) => valor === false)) return false
  return valores.some((valor) => valor === null) ? null : true
}

function o(valores: Logico[]): Logico {
  if (valores.some((valor) => valor === true)) return true
  return valores.some((valor) => valor === null) ? null : false
}

const no = (valor: Logico): Logico => (valor === null ? null : !valor)

/** Si la fila sale con este `where`: sólo cuando la condición es verdadera, como en SQL. */
export function coincide(tablas: Tablas, modelo: NombreDeModelo, registro: Registro, where: unknown): boolean {
  return evaluar(tablas, modelo, registro, where) === true
}

function evaluar(tablas: Tablas, modelo: NombreDeModelo, registro: Registro, where: unknown): Logico {
  if (where === undefined) return true
  if (!esObjetoPlano(where)) return falla(`where inválido en ${modelo}: ${JSON.stringify(where)}`)

  return y(
    Object.entries(where).map(([clave, condicion]): Logico => {
      if (condicion === undefined) return true
      if (clave === "AND") {
        const partes = Array.isArray(condicion) ? condicion : [condicion]
        return y(partes.map((parte) => evaluar(tablas, modelo, registro, parte)))
      }
      if (clave === "OR") {
        if (!Array.isArray(condicion)) return falla(`OR sin lista en ${modelo}`)
        return o(condicion.map((parte) => evaluar(tablas, modelo, registro, parte)))
      }
      // Como Prisma: con una lista, ninguna de las condiciones se cumple.
      if (clave === "NOT") {
        const partes = Array.isArray(condicion) ? condicion : [condicion]
        return no(o(partes.map((parte) => evaluar(tablas, modelo, registro, parte))))
      }

      const rel = RELACIONES[modelo][clave]
      if (rel) return coincideRelacion(tablas, rel, registro, condicion, `${modelo}.${clave}`)
      // Clave de un único compuesto, como la arma Prisma: `memberId_serviceId: { memberId, serviceId }`.
      if (!(clave in registro) && clave.includes("_") && esObjetoPlano(condicion)) {
        const campos = clave.split("_")
        if (Object.keys(condicion).sort().join() !== [...campos].sort().join()) {
          return falla(`clave compuesta ${modelo}.${clave} con otros campos: ${Object.keys(condicion).join()}`)
        }
        return y(
          campos.map((campo) => {
            if (!(campo in registro)) return falla(`el campo ${modelo}.${campo} no existe`)
            return coincideCampo(registro[campo], condicion[campo], `${modelo}.${campo}`)
          })
        )
      }
      if (!(clave in registro)) return falla(`el campo ${modelo}.${clave} no existe`)
      return coincideCampo(registro[clave], condicion, `${modelo}.${clave}`)
    })
  )
}

/**
 * Una relación es un `EXISTS` (o un join): el registro relacionado cuenta
 * sólo si la condición es verdadera para él; desconocido es que no.
 */
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

function coincideCampo(guardado: unknown, condicion: unknown, ruta: string): Logico {
  if (condicion === null) return guardado === null
  if (!esObjetoPlano(condicion)) {
    if (Array.isArray(condicion)) return falla(`igualdad contra una lista en ${ruta}`)
    return iguales(guardado, condicion)
  }

  // `mode: "insensitive"` (Postgres): los textos se comparan sin mayúsculas.
  const { mode, ...operaciones } = condicion
  if (mode !== undefined && mode !== "insensitive" && mode !== "default") return falla(`mode ${String(mode)} no soportado en ${ruta}`)
  const sinMayusculas = (texto: unknown) => (mode === "insensitive" && typeof texto === "string" ? texto.toLowerCase() : texto)
  const valor = sinMayusculas(guardado)

  return y(
    Object.entries(operaciones).map(([operador, original]): Logico => {
      const argumento = Array.isArray(original) ? original.map(sinMayusculas) : sinMayusculas(original)
      if (argumento === undefined) return true
      if (!OPERADORES_DE_CAMPO.has(operador)) return falla(`operador ${operador} no soportado en ${ruta}`)
      // `has`, de las listas de Postgres (`String[]`): la lista guardada
      // contiene el valor. Sobre una lista NULL (una columna `TEXT[]` sin
      // default que nadie llenó) da desconocido, como `@>` en Postgres.
      if (operador === "has") {
        if (guardado === null) return null
        if (!Array.isArray(guardado)) return falla(`has sobre un campo que no es una lista en ${ruta}`)
        return guardado.some((elemento) => iguales(sinMayusculas(elemento), argumento))
      }
      // Como en SQL: comparar contra NULL no da verdadero (salvo `not: null`).
      if (operador === "not") return argumento === null ? valor !== null : valor !== null && !iguales(valor, argumento)
      if (operador === "equals") {
        if (argumento === null) return valor === null
        if (Array.isArray(argumento)) return falla(`equals contra una lista en ${ruta}`)
        return iguales(valor, argumento)
      }
      if (operador === "in" || operador === "notIn") {
        if (!Array.isArray(argumento)) return falla(`${operador} sin lista en ${ruta}`)
        const esta = argumento.some((opcion) => iguales(valor, opcion))
        return operador === "in" ? esta : valor !== null && !esta
      }
      if (valor === null) return false
      const orden = comparar(valor, argumento)
      if (operador === "gt") return orden > 0
      if (operador === "gte") return orden >= 0
      if (operador === "lt") return orden < 0
      return orden <= 0
    })
  )
}

// ─── orderBy ─────────────────────────────────────────────────────────────────

/**
 * Los textos se ordenan con una collation, como Postgres (`es`: mayúsculas y
 * minúsculas juntas, la tilde junto a su letra), no por punto de código como
 * `<` de JavaScript, que pone "Zoe" antes que "ana" y "Ángela" al final. Los
 * `gt`/`lt` sobre textos usan la misma, para que un keyset (`orderBy` más
 * `where: { campo: { gt } }`) recorra todo sin saltarse ni repetir filas.
 */
const COLLATION = new Intl.Collator("es")

/** -1, 0 o 1: fechas por instante, números por valor, textos con la collation. */
function comparar(a: unknown, b: unknown): number {
  if (typeof a === "string" && typeof b === "string") return Math.sign(COLLATION.compare(a, b))
  // Prisma acepta una fecha ISO en texto donde va un `DateTime`.
  const comoFecha = (valor: unknown, otro: unknown) =>
    otro instanceof Date && typeof valor === "string" && !Number.isNaN(Date.parse(valor)) ? new Date(valor) : valor
  const x = comparable(comoFecha(a, b))
  const y = comparable(comoFecha(b, a))
  if (typeof x !== typeof y) return falla(`no sé comparar ${JSON.stringify(a)} con ${JSON.stringify(b)}`)
  return x < y ? -1 : x > y ? 1 : 0
}

/** El criterio de un `orderBy` como función de comparación para `sort`. */
export function comparador(orderBy: unknown): (x: Registro, y: Registro) => number {
  const criterios = (Array.isArray(orderBy) ? orderBy : [orderBy]) as Condicion[]
  return (x, y) => {
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
      const resultado = comparar(a, b)
      if (resultado === 0) continue
      return sentido === "asc" ? resultado : -resultado
    }
    return 0
  }
}

export function ordenar(registros: Registro[], orderBy: unknown): Registro[] {
  if (orderBy === undefined) return registros
  return [...registros].sort(comparador(orderBy))
}

// ─── select / include ────────────────────────────────────────────────────────

/** El registro con la forma que pidió `select` o `include`, relaciones incluidas. */
export function proyectar(tablas: Tablas, modelo: NombreDeModelo, registro: Registro, args: unknown): Registro {
  const opciones = esObjetoPlano(args) ? args : {}
  const salida: Registro = {}
  if (opciones.select !== undefined && opciones.omit !== undefined) return falla(`select y omit juntos en ${modelo}`)

  if (opciones.select !== undefined) {
    if (!esObjetoPlano(opciones.select)) return falla(`select inválido en ${modelo}`)
    for (const [clave, pedido] of Object.entries(opciones.select)) {
      if (!pedido) continue
      if (clave === "_count") {
        salida._count = contar(tablas, modelo, registro, pedido)
        continue
      }
      const rel = RELACIONES[modelo][clave]
      if (rel) salida[clave] = resolver(tablas, rel, registro, pedido)
      else if (clave in registro) salida[clave] = registro[clave]
      else return falla(`select de un campo que no existe: ${modelo}.${clave}`)
    }
    return salida
  }

  for (const [clave, valor] of Object.entries(registro)) salida[clave] = valor
  // `omit`: todos los campos menos los marcados en `true`.
  if (opciones.omit !== undefined) {
    if (!esObjetoPlano(opciones.omit)) return falla(`omit inválido en ${modelo}`)
    for (const [clave, fuera] of Object.entries(opciones.omit)) {
      if (!(clave in registro) || RELACIONES[modelo][clave]) return falla(`omit de un campo que no existe: ${modelo}.${clave}`)
      if (fuera) delete salida[clave]
    }
  }
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

/**
 * `_count: { select: { relacion: true | { where } } }`: cuántos registros
 * relacionados hay, con el `where` de cada uno si lo trae. Sólo relaciones a
 * muchos, como en Prisma.
 */
function contar(tablas: Tablas, modelo: NombreDeModelo, registro: Registro, pedido: unknown): Registro {
  if (!esObjetoPlano(pedido) || !esObjetoPlano(pedido.select)) return falla(`_count sin select en ${modelo}`)
  const cuentas: Registro = {}
  for (const [clave, opciones] of Object.entries(pedido.select)) {
    if (!opciones) continue
    const rel = RELACIONES[modelo][clave]
    if (!rel || rel.tipo !== "muchos") return falla(`_count de algo que no es una relación a muchos: ${modelo}.${clave}`)
    const otros = relacionados(tablas, rel, registro)
    const where = esObjetoPlano(opciones) ? opciones.where : undefined
    cuentas[clave] = otros.filter((otro) => coincide(tablas, rel.modelo, otro, where)).length
  }
  return cuentas
}

/** Lo que entiende un `select`/`include` anidado; `distinct` y `cursor` anidados lanzan en vez de ignorarse. */
const OPCIONES_A_UNO = ["select", "include", "omit"]
const OPCIONES_A_MUCHOS = [...OPCIONES_A_UNO, "where", "orderBy", "take", "skip"]

function resolver(tablas: Tablas, rel: Relacion, registro: Registro, pedido: unknown): unknown {
  const args = esObjetoPlano(pedido) ? pedido : undefined
  const otros = relacionados(tablas, rel, registro)
  const permitidas = rel.tipo === "uno" ? OPCIONES_A_UNO : OPCIONES_A_MUCHOS
  for (const [clave, valor] of Object.entries(args ?? {})) {
    if (valor !== undefined && !permitidas.includes(clave)) {
      return falla(`${clave} no está soportado en una relación a ${rel.tipo} (${rel.modelo})`)
    }
  }

  if (rel.tipo === "uno") return otros[0] ? proyectar(tablas, rel.modelo, otros[0], args) : null

  let lista = args?.where === undefined ? otros : otros.filter((otro) => coincide(tablas, rel.modelo, otro, args.where))
  lista = ordenar(lista, args?.orderBy)
  if (args?.skip !== undefined) lista = lista.slice(args.skip as number)
  if (args?.take !== undefined) lista = lista.slice(0, args.take as number)
  return lista.map((otro) => proyectar(tablas, rel.modelo, otro, args))
}
