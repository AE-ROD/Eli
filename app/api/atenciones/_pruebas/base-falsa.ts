import { vi } from "vitest"
import { Prisma } from "@prisma/client"
import {
  RELACIONES,
  coincide,
  esObjetoPlano,
  falla,
  iguales,
  ordenar,
  proyectar,
  type Condicion,
  type NombreDeModelo,
  type Registro,
  type Relacion,
  type Tablas,
} from "./consultas-falsas"

export type { NombreDeModelo, Tablas } from "./consultas-falsas"

/**
 * Una base en memoria con la forma del cliente de Prisma, para los tests del
 * tablero y de los reportes. Filtra de verdad con el `where` que arma el
 * endpoint (incluidos los filtros por relación de `lib/permisos.ts`), proyecta
 * `select`/`include` con sus `where` anidados, respeta claves foráneas y
 * únicos, y deshace una transacción que lanza. Así un test de aislamiento
 * comprueba lo que la consulta trae, no sólo qué argumento recibió.
 *
 * Cómo se leen `where`, `orderBy` y `select` está en `consultas-falsas.ts`,
 * con la misma regla para todo: ante lo que no entiende, lanza (F-018).
 */

/** Los defaults del esquema: todo campo existe en el registro, aunque sea en null. */
const POR_DEFECTO: Record<NombreDeModelo, () => Registro> = {
  user: () => ({ password: "", createdAt: new Date(), updatedAt: new Date() }),
  business: () => ({ type: "salon", teamSize: 1, createdAt: new Date(), updatedAt: new Date() }),
  businessMember: () => ({ role: "worker", createdAt: new Date() }),
  customer: () => ({
    lastName: null,
    cedula: null,
    email: null,
    phone: null,
    tags: [],
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  service: () => ({ description: null, duration: 30, price: null, active: true, createdAt: new Date(), updatedAt: new Date() }),
  appointment: () => ({
    serviceId: null,
    status: "pendiente",
    notes: null,
    clientComments: null,
    price: null,
    customerId: null,
    memberId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  visit: () => ({
    customerId: null,
    appointmentId: null,
    status: "en-espera",
    notes: null,
    arrivedAt: new Date(),
    startedAt: null,
    readyAt: null,
    paidAt: null,
    voidedAt: null,
    voidReason: null,
    totalCents: null,
    createdById: null,
    paidById: null,
    voidedById: null,
    paidByName: null,
    voidedByName: null,
  }),
  visitService: () => ({ serviceId: null, memberId: null, byOwner: false }),
  visitPayment: () => ({ createdAt: new Date() }),
}

/** Campos `@unique` (además de `id`) que la base hace respetar. */
const UNICOS: Partial<Record<NombreDeModelo, string[]>> = { visit: ["appointmentId"] }

function errorDePrisma(code: string, mensaje: string) {
  return new Prisma.PrismaClientKnownRequestError(mensaje, { code, clientVersion: "base-falsa" })
}

function tablasVacias(): Tablas {
  return {
    user: [],
    business: [],
    businessMember: [],
    customer: [],
    service: [],
    appointment: [],
    visit: [],
    visitService: [],
    visitPayment: [],
  }
}

export function crearBaseFalsa() {
  let tablas = tablasVacias()
  let siguienteId = 1

  const filtrar = (modelo: NombreDeModelo, where: unknown) =>
    tablas[modelo].filter((registro) => coincide(tablas, modelo, registro, where))

  // ─── Escritura ───────────────────────────────────────────────────────────

  function verificarClaves(modelo: NombreDeModelo, registro: Registro) {
    for (const [clave, rel] of Object.entries(RELACIONES[modelo])) {
      // Sólo las FK que guarda este registro (las que apuntan a un `id`).
      if (rel.tipo !== "uno" || rel.remoto !== "id") continue
      const valor = registro[rel.local]
      if (valor === null || valor === undefined) continue
      if (!tablas[rel.modelo].some((otro) => otro.id === valor)) {
        throw errorDePrisma("P2003", `FK rota: ${modelo}.${clave} → ${String(valor)}`)
      }
    }
    for (const campo of UNICOS[modelo] ?? []) {
      const valor = registro[campo]
      if (valor === null || valor === undefined) continue
      if (tablas[modelo].some((otro) => otro !== registro && iguales(otro[campo], valor))) {
        throw errorDePrisma("P2002", `Unique constraint failed: ${modelo}.${campo}`)
      }
    }
  }

  function aplicar(modelo: NombreDeModelo, registro: Registro, datos: unknown) {
    if (!esObjetoPlano(datos)) return falla(`data inválido en ${modelo}`)
    for (const [clave, valor] of Object.entries(datos)) {
      if (valor === undefined) continue
      if (esObjetoPlano(valor)) return falla(`escritura anidada u operación atómica no soportada: ${modelo}.${clave}`)
      if (!(clave in registro)) return falla(`el campo ${modelo}.${clave} no existe`)
      registro[clave] = valor
    }
    if ("updatedAt" in registro) registro.updatedAt = new Date()
  }

  function crear(modelo: NombreDeModelo, datos: unknown): Registro {
    if (!esObjetoPlano(datos)) return falla(`data inválido en ${modelo}`)

    const escalares: Registro = {}
    const anidados: [Relacion, unknown][] = []
    for (const [clave, valor] of Object.entries(datos)) {
      if (valor === undefined) continue
      const rel = RELACIONES[modelo][clave]
      if (!rel) {
        if (esObjetoPlano(valor)) return falla(`valor anidado en un campo: ${modelo}.${clave}`)
        escalares[clave] = valor
        continue
      }
      if (rel.tipo !== "muchos" || !esObjetoPlano(valor) || Object.keys(valor).join() !== "create") {
        return falla(`sólo se soporta { create } anidado en relaciones a muchos (${modelo}.${clave})`)
      }
      anidados.push([rel, valor.create])
    }

    const registro: Registro = { id: `${modelo}-${siguienteId++}`, ...POR_DEFECTO[modelo](), ...escalares }
    verificarClaves(modelo, registro)
    tablas[modelo].push(registro)

    for (const [rel, hijos] of anidados) {
      for (const hijo of Array.isArray(hijos) ? hijos : [hijos]) {
        crear(rel.modelo, { ...(hijo as Registro), [rel.remoto]: registro[rel.local] })
      }
    }
    return registro
  }

  // ─── El cliente ──────────────────────────────────────────────────────────

  /** Lo que devuelve la base es una copia: el endpoint no puede tocar el estado por referencia. */
  const copia = <T>(valor: T): T => structuredClone(valor)

  function delegado(modelo: NombreDeModelo) {
    type Args = Condicion & { where?: unknown; orderBy?: unknown; take?: number; skip?: number; data?: unknown }

    const buscar = (args: Args = {}) => {
      let lista = ordenar(filtrar(modelo, args.where), args.orderBy)
      if (args.skip !== undefined) lista = lista.slice(args.skip)
      if (args.take !== undefined) lista = lista.slice(0, args.take)
      return lista
    }
    const salida = (registro: Registro, args: Args) => copia(proyectar(tablas, modelo, registro, args))

    return {
      findFirst: vi.fn(async (args: Args = {}) => {
        const [primero] = buscar(args)
        return primero ? salida(primero, args) : null
      }),
      findUnique: vi.fn(async (args: Args) => {
        const [unico] = filtrar(modelo, args.where)
        return unico ? salida(unico, args) : null
      }),
      findMany: vi.fn(async (args: Args = {}) => buscar(args).map((registro) => salida(registro, args))),
      count: vi.fn(async (args: Args = {}) => filtrar(modelo, args.where).length),
      create: vi.fn(async (args: Args) => salida(crear(modelo, args.data), args)),
      createMany: vi.fn(async (args: Args) => {
        const lista = Array.isArray(args.data) ? args.data : [args.data]
        lista.forEach((datos) => crear(modelo, datos))
        return { count: lista.length }
      }),
      update: vi.fn(async (args: Args) => {
        const [registro] = filtrar(modelo, args.where)
        if (!registro) throw errorDePrisma("P2025", `No existe el registro a actualizar en ${modelo}`)
        aplicar(modelo, registro, args.data)
        verificarClaves(modelo, registro)
        return salida(registro, args)
      }),
      updateMany: vi.fn(async (args: Args) => {
        const registros = filtrar(modelo, args.where)
        for (const registro of registros) {
          aplicar(modelo, registro, args.data)
          verificarClaves(modelo, registro)
        }
        return { count: registros.length }
      }),
      deleteMany: vi.fn(async (args: Args = {}) => {
        const borrar = new Set(filtrar(modelo, args.where))
        tablas[modelo] = tablas[modelo].filter((registro) => !borrar.has(registro))
        return { count: borrar.size }
      }),
    }
  }

  /** Lo que recibe la función de una transacción: como el cliente real, sin `$transaction`. */
  const cliente = {
    user: delegado("user"),
    business: delegado("business"),
    businessMember: delegado("businessMember"),
    customer: delegado("customer"),
    service: delegado("service"),
    appointment: delegado("appointment"),
    visit: delegado("visit"),
    visitService: delegado("visitService"),
    visitPayment: delegado("visitPayment"),
  }

  const prisma = {
    ...cliente,
    /**
     * Sólo la forma interactiva, que es la que usan estos endpoints. Si la
     * función lanza, la base vuelve a como estaba: igual que Postgres.
     */
    $transaction: vi.fn(async (fn: unknown) => {
      if (typeof fn !== "function") return falla("sólo se soportan transacciones interactivas")
      const antes = structuredClone(tablas)
      try {
        return await fn(cliente)
      } catch (error) {
        tablas = antes
        throw error
      }
    }),
  }

  return {
    prisma,
    /** Vacía la base y carga `datos`, con los defaults del esquema en cada registro. */
    reiniciar(datos: Partial<Record<NombreDeModelo, Registro[]>>) {
      tablas = tablasVacias()
      siguienteId = 1
      for (const [modelo, registros] of Object.entries(datos) as [NombreDeModelo, Registro[]][]) {
        tablas[modelo] = registros.map((registro) => ({ ...POR_DEFECTO[modelo](), ...structuredClone(registro) }))
      }
    },
    /** Una copia del estado entero, para comprobar que un pedido no escribió nada. */
    volcado(): Tablas {
      return structuredClone(tablas)
    },
    /** Los registros de un modelo que cumplen `where` (sin `where`, todos). */
    buscar(modelo: NombreDeModelo, where?: Condicion): Registro[] {
      return structuredClone(filtrar(modelo, where))
    },
  }
}

export type BaseFalsa = ReturnType<typeof crearBaseFalsa>
