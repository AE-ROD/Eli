import { vi } from "vitest"
import { Prisma } from "@prisma/client"
import {
  COMPUESTAS,
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
  user: () => ({ password: "", correosDesactivados: false, createdAt: new Date(), updatedAt: new Date() }),
  // `pruebaTerminaEl` y `codigoInvitacion` no tienen default en el esquema: los
  // pone quien crea el negocio, igual que en la base de verdad.
  business: () => ({
    type: "salon",
    teamSize: 1,
    timezone: "America/Santiago",
    recibeCorreosDePrueba: true,
    enlaceCompartidoAt: null,
    invitadoPorId: null,
    referidoContabilizadoAt: null,
    extensionPorReferidoAt: null,
    cancelacionHorasAntes: 24,
    liquidacionPeriodo: "mensual",
    liquidacionInicioSemana: 1,
    liquidacionDesde: null,
    enlaceResenas: null,
    listaDeEsperaActiva: true,
    avisoDeVueltaActivo: false,
    pideResenas: false,
    porConfirmarTrasFaltas: null,
    filaVirtualActiva: false,
    filaVirtualTope: 15,
    horaValleActiva: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  businessMember: () => ({
    role: "worker",
    especialidad: null,
    fotoUrl: null,
    commissionPercent: null,
    createdAt: new Date(),
  }),
  customer: () => ({
    lastName: null,
    cedula: null,
    email: null,
    phone: null,
    tags: [],
    notes: null,
    whatsappConsentAt: null,
    whatsappConsentSource: null,
    correoPromoConsentAt: null,
    correoPromoConsentSource: null,
    correoPromoBajaAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  service: () => ({
    description: null,
    duration: 30,
    price: null,
    frecuenciaDias: null,
    excluidoDeHoraValle: false,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  appointment: () => ({
    serviceId: null,
    status: "pendiente",
    source: "panel",
    confirmacionPorFaltas: false,
    notes: null,
    clientComments: null,
    price: null,
    customerId: null,
    memberId: null,
    manageTokenHash: null,
    canceladaPor: null,
    canceladaEn: null,
    reminderSentAt: null,
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
    origen: "tablero",
    filaTokenHash: null,
    filaEmail: null,
    filaFecha: null,
    filaNumero: null,
    filaAvisadaAt: null,
  }),
  visitService: () => ({
    serviceId: null,
    memberId: null,
    byOwner: false,
    tipo: "servicio",
    productId: null,
    commissionPercent: null,
    commissionCents: null,
    commissionAt: null,
    liquidacionId: null,
  }),
  visitPayment: () => ({ createdAt: new Date() }),
  workSchedule: () => ({ memberId: null, active: true }),
  timeBlock: () => ({ memberId: null, motivo: null, createdById: null, createdAt: new Date() }),
  memberService: () => ({ createdAt: new Date() }),
  commissionRate: () => ({ createdAt: new Date(), updatedAt: new Date() }),
  commissionChange: () => ({
    memberId: null,
    serviceId: null,
    serviceName: null,
    productId: null,
    productName: null,
    changedById: null,
    previousPercent: null,
    newPercent: null,
    createdAt: new Date(),
  }),
  producto: () => ({ priceCents: null, commissionPercent: null, active: true, createdAt: new Date(), updatedAt: new Date() }),
  propinaDeAtencion: () => ({ memberId: null, byOwner: false, liquidacionId: null, createdAt: new Date() }),
  liquidacion: () => ({
    estado: "cerrada",
    cerradaAt: new Date(),
    pagadaAt: null,
    pagadaPorId: null,
    pagadaPorNombre: null,
    medioDePago: null,
    anuladaAt: null,
    anuladaPorId: null,
    anuladaPorNombre: null,
    motivoAnulacion: null,
    nota: null,
  }),
  movimientoDeLiquidacion: () => ({
    motivo: null,
    visitId: null,
    liquidacionId: null,
    anuladoAt: null,
    anuladoPorId: null,
    anuladoPorNombre: null,
    createdAt: new Date(),
  }),
  cierreDeCaja: () => ({ desglose: {}, nota: null, createdAt: new Date() }),
  inscripcionEnEspera: () => ({
    memberId: null,
    telefono: null,
    whatsappConsentAt: null,
    estado: "activa",
    avisos: 0,
    ultimoAvisoAt: null,
    createdAt: new Date(),
    resueltaAt: null,
  }),
  envioAClientes: () => ({ customerId: null, esperaId: null, enviadoAt: new Date() }),
  appointmentService: () => ({ serviceId: null, price: null, createdAt: new Date() }),
  franjaDeHoraValle: () => ({ createdAt: new Date() }),
}

/** Campos `Json` del esquema: aceptan un objeto como valor (cualquier otro objeto es una escritura anidada). */
const CAMPOS_JSON: Partial<Record<NombreDeModelo, string[]>> = { cierreDeCaja: ["desglose"] }
const esJson = (modelo: NombreDeModelo, campo: string) => (CAMPOS_JSON[modelo] ?? []).includes(campo)

/**
 * Únicos (además de `id`) que la base hace respetar: simples o compuestos, y
 * parciales con `si` (el índice sólo cubre las filas que la cumplen). Una fila
 * con algún campo en null no choca, como en Postgres.
 */
interface Unico {
  campos: string[]
  si?: (registro: Registro) => boolean
}
const UNICOS: Partial<Record<NombreDeModelo, Unico[]>> = {
  visit: [{ campos: ["appointmentId"] }, { campos: ["filaTokenHash"] }, { campos: ["businessId", "filaFecha", "filaNumero"] }],
  appointment: [{ campos: ["manageTokenHash"] }],
  commissionRate: [{ campos: ["memberId", "serviceId"] }],
  memberService: [{ campos: ["memberId", "serviceId"] }],
  cierreDeCaja: [{ campos: ["businessId", "hasta"] }],
  // `liquidaciones_businessId_memberId_desde_viva_key`: sólo las no anuladas.
  liquidacion: [{ campos: ["businessId", "memberId", "desde"], si: (registro) => registro.estado !== "anulada" }],
  inscripcionEnEspera: [{ campos: ["tokenHash"] }],
  // El candado de los mensajes a clientes.
  envioAClientes: [{ campos: ["businessId", "tipo", "referencia"] }],
  appointmentService: [{ campos: ["appointmentId", "orden"] }],
}

/**
 * Borrados en cascada que la base hace solos (`onDelete: Cascade`), sólo los
 * que un endpoint dispara: [modelo hijo, campo que apunta al borrado].
 */
const CASCADAS: Partial<Record<NombreDeModelo, [NombreDeModelo, string][]>> = {
  appointment: [["appointmentService", "appointmentId"]],
}

/** Consultas crudas que la base falsa acepta: sólo candados, que en memoria no tienen nada que ordenar. */
const CANDADOS = ["FOR UPDATE", "pg_advisory_xact_lock"]

function errorDePrisma(code: string, mensaje: string) {
  return new Prisma.PrismaClientKnownRequestError(mensaje, { code, clientVersion: "base-falsa" })
}

/**
 * Lo que un trigger de Postgres hace llegar a Prisma: un `RAISE EXCEPTION`
 * (`check_violation`, 23514) no tiene código de Prisma, así que llega como
 * error desconocido con el mensaje de la base.
 */
function errorDeTrigger(mensaje: string) {
  return new Prisma.PrismaClientUnknownRequestError(`23514: ${mensaje}`, { clientVersion: "base-falsa" })
}

const distintos = (a: unknown, b: unknown) => !iguales(a ?? null, b ?? null)

function tablasVacias(): Tablas {
  return {
    user: [],
    business: [],
    commissionRate: [],
    commissionChange: [],
    producto: [],
    propinaDeAtencion: [],
    liquidacion: [],
    movimientoDeLiquidacion: [],
    cierreDeCaja: [],
    inscripcionEnEspera: [],
    envioAClientes: [],
    appointmentService: [],
    franjaDeHoraValle: [],
    businessMember: [],
    customer: [],
    service: [],
    appointment: [],
    visit: [],
    visitService: [],
    visitPayment: [],
    workSchedule: [],
    timeBlock: [],
    memberService: [],
  }
}

export function crearBaseFalsa() {
  let tablas = tablasVacias()
  let siguienteId = 1

  const filtrar = (modelo: NombreDeModelo, where: unknown) =>
    tablas[modelo].filter((registro) => coincide(tablas, modelo, registro, where))

  function borrar(modelo: NombreDeModelo, registros: Set<Registro>) {
    tablas[modelo] = tablas[modelo].filter((registro) => !registros.has(registro))
    for (const [hijo, campo] of CASCADAS[modelo] ?? []) {
      const ids = new Set([...registros].map((registro) => registro.id))
      borrar(hijo, new Set(tablas[hijo].filter((registro) => ids.has(registro[campo]))))
    }
  }

  // ─── Escritura ───────────────────────────────────────────────────────────

  function verificarClaves(modelo: NombreDeModelo, registro: Registro) {
    for (const [clave, rel] of Object.entries(RELACIONES[modelo])) {
      // Sólo las FK que guarda este registro (las que apuntan a un `id`).
      if (rel.tipo !== "uno" || rel.remoto !== "id") continue
      const valor = registro[rel.local]
      if (valor === null || valor === undefined) continue
      const otro = tablas[rel.modelo].find((candidato) => candidato.id === valor)
      if (!otro) throw errorDePrisma("P2003", `FK rota: ${modelo}.${clave} → ${String(valor)}`)
      // FK compuesta (id, businessId): el otro tiene que ser del mismo negocio.
      if ((COMPUESTAS[modelo] ?? []).includes(clave) && otro.businessId !== registro.businessId) {
        throw errorDePrisma("P2003", `FK compuesta rota: ${modelo}.${clave} → ${String(valor)} es de otro negocio`)
      }
    }
    for (const { campos, si } of UNICOS[modelo] ?? []) {
      if (campos.some((campo) => registro[campo] === null || registro[campo] === undefined)) continue
      if (si && !si(registro)) continue
      const choca = tablas[modelo].some(
        (otro) => otro !== registro && (!si || si(otro)) && campos.every((campo) => iguales(otro[campo], registro[campo]))
      )
      if (choca) throw errorDePrisma("P2002", `Unique constraint failed: ${modelo}.${campos.join("_")}`)
    }
  }

  /**
   * El trigger `atencion_servicios_comision_inmutable` (migración
   * `20261028120000_etapa_2_la_plata_del_equipo`), regla por regla: una
   * comisión congelada no cambia; una línea en una liquidación no cambia de
   * precio, profesional ni comisión, ni pasa a otra liquidación (sí se puede
   * soltar, y congelar en la misma escritura que la incluye). Las dos reglas
   * de línea liquidada se saltan si su atención ya no existe: es la excepción
   * del borrado en cascada del negocio entero.
   */
  function comisionInmutable(viejo: Registro, nuevo: Registro) {
    const id = String(viejo.id)
    const cambiaComision = ["commissionPercent", "commissionCents", "commissionAt"].some((campo) =>
      distintos(nuevo[campo], viejo[campo])
    )
    if (viejo.commissionAt !== null && viejo.commissionAt !== undefined && cambiaComision) {
      throw errorDeTrigger(`atencion_servicios ${id}: la comisión ya está congelada`)
    }

    if (viejo.liquidacionId === null || viejo.liquidacionId === undefined) return
    if (!tablas.visit.some((atencion) => atencion.id === viejo.visitId)) return

    if (cambiaComision || distintos(nuevo.priceCents, viejo.priceCents) || distintos(nuevo.memberId, viejo.memberId)) {
      throw errorDeTrigger(`atencion_servicios ${id}: la línea está en una liquidación; corrígela con un ajuste`)
    }
    if (nuevo.liquidacionId !== null && nuevo.liquidacionId !== undefined && nuevo.liquidacionId !== viejo.liquidacionId) {
      throw errorDeTrigger(`atencion_servicios ${id}: la línea ya está en otra liquidación`)
    }
  }

  /** Los triggers `BEFORE UPDATE` de la base de verdad que la falsa reproduce. */
  const ANTES_DE_ACTUALIZAR: Partial<Record<NombreDeModelo, (viejo: Registro, nuevo: Registro) => void>> = {
    visitService: comisionInmutable,
  }

  /**
   * Un UPDATE de una fila: arma la fila nueva, la pasa por el trigger y recién
   * entonces la escribe, como `BEFORE UPDATE`. Devuelve la escritura para que
   * `updateMany` pueda revisar todas las filas antes de tocar ninguna (en
   * Postgres la sentencia entera falla o pasa).
   */
  function prepararActualizacion(modelo: NombreDeModelo, registro: Registro, datos: unknown) {
    const nuevo = { ...registro }
    aplicar(modelo, nuevo, datos)
    ANTES_DE_ACTUALIZAR[modelo]?.(registro, nuevo)
    return () => {
      Object.assign(registro, nuevo)
      verificarClaves(modelo, registro)
    }
  }

  function aplicar(modelo: NombreDeModelo, registro: Registro, datos: unknown) {
    if (!esObjetoPlano(datos)) return falla(`data inválido en ${modelo}`)
    for (const [clave, valor] of Object.entries(datos)) {
      if (valor === undefined) continue
      if (esObjetoPlano(valor) && !esJson(modelo, clave)) {
        return falla(`escritura anidada u operación atómica no soportada: ${modelo}.${clave}`)
      }
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
        if (esObjetoPlano(valor) && !esJson(modelo, clave)) return falla(`valor anidado en un campo: ${modelo}.${clave}`)
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
        prepararActualizacion(modelo, registro, args.data)()
        return salida(registro, args)
      }),
      upsert: vi.fn(async (args: Args & { create?: unknown; update?: unknown }) => {
        const [registro] = filtrar(modelo, args.where)
        if (!registro) return salida(crear(modelo, args.create), args)
        prepararActualizacion(modelo, registro, args.update)()
        return salida(registro, args)
      }),
      delete: vi.fn(async (args: Args) => {
        const [registro] = filtrar(modelo, args.where)
        if (!registro) throw errorDePrisma("P2025", `No existe el registro a borrar en ${modelo}`)
        const copiaDeSalida = salida(registro, args)
        borrar(modelo, new Set([registro]))
        return copiaDeSalida
      }),
      updateMany: vi.fn(async (args: Args) => {
        const registros = filtrar(modelo, args.where)
        const escrituras = registros.map((registro) => prepararActualizacion(modelo, registro, args.data))
        escrituras.forEach((escribir) => escribir())
        return { count: registros.length }
      }),
      deleteMany: vi.fn(async (args: Args = {}) => {
        const registros = new Set(filtrar(modelo, args.where))
        borrar(modelo, registros)
        return { count: registros.size }
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
    workSchedule: delegado("workSchedule"),
    timeBlock: delegado("timeBlock"),
    memberService: delegado("memberService"),
    commissionRate: delegado("commissionRate"),
    commissionChange: delegado("commissionChange"),
    producto: delegado("producto"),
    propinaDeAtencion: delegado("propinaDeAtencion"),
    liquidacion: delegado("liquidacion"),
    movimientoDeLiquidacion: delegado("movimientoDeLiquidacion"),
    cierreDeCaja: delegado("cierreDeCaja"),
    inscripcionEnEspera: delegado("inscripcionEnEspera"),
    envioAClientes: delegado("envioAClientes"),
    appointmentService: delegado("appointmentService"),
    franjaDeHoraValle: delegado("franjaDeHoraValle"),
    /**
     * Sólo para candados (`SELECT … FOR UPDATE` o `pg_advisory_xact_lock`): en
     * memoria no hay concurrencia que ordenar, así que no devuelve nada. Queda
     * registrado para que un test compruebe que se pidió, con qué valores y
     * dentro de la transacción. También responde la hora de la base
     * (`SELECT clock_timestamp() AS ahora`) con `new Date()`, que los tests
     * controlan con el reloj falso de vitest. Cualquier otra consulta cruda
     * lanza: no se sabe leerla.
     */
    $queryRaw: vi.fn(async (partes: TemplateStringsArray, ..._valores: unknown[]) => {
      const sql = partes.join("?")
      if (sql.trim() === "SELECT clock_timestamp() AS ahora") return [{ ahora: new Date() }]
      if (!CANDADOS.some((candado) => sql.includes(candado))) return falla(`$queryRaw sólo para candados: ${sql}`)
      return []
    }),
    /** Como `$queryRaw`, sólo para `pg_advisory_xact_lock`. Devuelve filas afectadas: 0. */
    $executeRaw: vi.fn(async (partes: TemplateStringsArray, ..._valores: unknown[]) => {
      const sql = partes.join("?")
      if (!sql.includes("pg_advisory_xact_lock")) return falla(`$executeRaw sólo para candados: ${sql}`)
      return 0
    }),
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
