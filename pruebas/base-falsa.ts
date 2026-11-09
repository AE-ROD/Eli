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
    // Default `{}` desde la migración `cierre_de_la_v1` (#160). Un cliente de
    // antes con NULL se carga diciendo `tags: null`.
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
    esUrgencia: false,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  appointment: () => ({
    serviceId: null,
    status: "pendiente",
    source: "panel",
    confirmacionPorFaltas: false,
    primeraVez: false,
    sillonId: null,
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
    // El abono de una prótesis (etapa 7): sin prótesis, sin reparto ni pago al laboratorio.
    protesisId: null,
    odontologoCents: null,
    clinicaCents: null,
    tecnicoCents: null,
    pagoAlLaboratorioId: null,
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
    // Default 0 desde `20261108130000_etapa_7b_abonos_de_protesis`.
    comisionProtesisCents: 0,
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
  // Clínica dental. Sin default en el esquema (los pone quien escribe):
  // `nombre`, `actualizadaPor`, `pieza` y `tipo` de la marca, `texto` y
  // `autorNombre`, `version` y `creadoPorNombre`, `orden` de etapa y
  // prestación, `valorCents`.
  sillon: () => ({ orden: 0, activo: true, createdAt: new Date(), updatedAt: new Date() }),
  fichaClinica: () => ({
    fechaNacimiento: null,
    prevision: null,
    alergias: null,
    antecedentes: null,
    odontogramaActualizadoEn: null,
    odontogramaActualizadoPor: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  marcaDental: () => ({ cara: null, createdAt: new Date() }),
  evolucion: () => ({ autorUserId: null, memberId: null, appointmentId: null, createdAt: new Date() }),
  planDeTratamiento: () => ({ vigente: true, createdAt: new Date() }),
  etapaDelPlan: () => ({
    estado: "por-aprobar",
    presentadaEn: null,
    aprobadaEn: null,
    aprobadaPorNombre: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  prestacionDelPlan: () => ({
    pieza: null,
    caras: [],
    serviceId: null,
    memberId: null,
    profesionalNombre: null,
    estado: "por-agendar",
    appointmentId: null,
    realizadaEn: null,
    protesisId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  // Prótesis. Sin default en el esquema (los pone quien escribe): `nombre`,
  // `unidad`, `tipos`, `precioCents` y las tres partes del material; en la
  // prótesis, el diseño, el material copiado, el valor, el reparto y
  // `creadoPorNombre`; en el evento, `estado` y `autorNombre`.
  laboratorio: () => ({ contacto: null, activo: true, createdAt: new Date(), updatedAt: new Date() }),
  materialDeProtesis: () => ({ laboratorioPorDefectoId: null, orden: 0, activo: true, createdAt: new Date(), updatedAt: new Date() }),
  excepcionDeRepartoDeProtesis: () => ({ createdAt: new Date(), updatedAt: new Date() }),
  cambioDeRepartoDeProtesis: () => ({
    memberId: null,
    memberName: null,
    anteriorPbOdontologo: null,
    anteriorPbClinica: null,
    anteriorPbTecnico: null,
    nuevoPbOdontologo: null,
    nuevoPbClinica: null,
    nuevoPbTecnico: null,
    createdAt: new Date(),
  }),
  protesis: () => ({
    memberId: null,
    byOwner: false,
    pilares: [],
    zonas: [],
    laboratorioId: null,
    laboratorioNombre: null,
    entregaEstimada: null,
    tono: null,
    estado: "impresion",
    entregadaEn: null,
    anuladaEn: null,
    anuladaPorNombre: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  eventoDeProtesis: () => ({ autorUserId: null, createdAt: new Date() }),
  pagoAlLaboratorio: () => ({ pagadoEn: new Date(), anuladoEn: null, anuladoPorNombre: null, createdAt: new Date() }),
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
  /** Los campos que el índice compara con `lower(...)`: sin distinguir mayúsculas. */
  sinMayusculas?: string[]
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
  // Clínica dental. Los `[id, businessId]` que habilitan las FK compuestas no
  // hacen falta: `id` ya es único.
  sillon: [{ campos: ["businessId", "nombre"] }],
  fichaClinica: [{ campos: ["customerId", "businessId"] }],
  marcaDental: [
    // `odontograma_marcas_customerId_pieza_cara_key`: con `cara` null no
    // choca, así que es "una marca por cara".
    { campos: ["customerId", "pieza", "cara"] },
    // `odontograma_marcas_marca_de_pieza_key`, parcial: la misma marca de
    // pieza (cara null) no se repite en la pieza.
    { campos: ["customerId", "pieza", "tipo"], si: (registro) => registro.cara === null || registro.cara === undefined },
  ],
  planDeTratamiento: [
    { campos: ["customerId", "version"] },
    // `planes_de_tratamiento_vigente_key`, parcial: un solo plan vigente por paciente.
    { campos: ["customerId"], si: (registro) => registro.vigente === true },
  ],
  // Prótesis. `laboratorios_businessId_nombre_key` y
  // `materiales_de_protesis_businessId_nombre_key` son sobre `lower("nombre")`.
  laboratorio: [{ campos: ["businessId", "nombre"], sinMayusculas: ["nombre"] }],
  materialDeProtesis: [{ campos: ["businessId", "nombre"], sinMayusculas: ["nombre"] }],
  excepcionDeRepartoDeProtesis: [{ campos: ["memberId", "materialId"] }],
}

/**
 * Lo que hace cada FK del esquema al borrar la fila a la que apunta, todas las
 * de las migraciones (no sólo las que dispara un endpoint): [modelo hijo,
 * campo que apunta al borrado, regla]. `cascade` borra al hijo, `set null`
 * pone el campo en null y `restrict` / `no action` frenan el borrado con
 * P2003 si queda algún hijo.
 *
 * Ninguna FK con SET NULL es compuesta: las compuestas `(id, businessId)` son
 * todas CASCADE, RESTRICT o NO ACTION (una compuesta con SET NULL anularía
 * también `businessId`, que es NOT NULL; ver `CommissionChange` en el
 * esquema), así que SET NULL anula sólo el campo de la lista.
 *
 * Quedan fuera las tablas que la base falsa no tiene: `invitaciones`,
 * `conversaciones`/`mensajes`, `tokens_recuperacion`, `correos_de_cuenta` y
 * `solicitudes_de_soporte` (ésta con SET NULL a negocio y usuario).
 *
 * El orden de cada lista es el de creación de la FK en las migraciones. En
 * Postgres cada FK es un trigger AFTER del padre y se disparan por orden de
 * nombre (`RI_ConstraintTrigger_a_<oid>`); se toma el orden de creación como
 * aproximación del orden de los oid (simplificación: no se reproduce la
 * comparación como texto de esos nombres).
 */
type Regla = "cascade" | "set null" | "restrict" | "no action"
const ACCIONES: Partial<Record<NombreDeModelo, [NombreDeModelo, string, Regla][]>> = {
  user: [
    ["business", "userId", "cascade"], // negocios_userId_fkey
    ["businessMember", "userId", "cascade"], // miembros_negocio_userId_fkey
    ["commissionChange", "changedById", "set null"], // cambios_comision_changedById_fkey
  ],
  business: [
    ["customer", "businessId", "cascade"], // clientes_businessId_fkey
    ["service", "businessId", "cascade"], // servicios_businessId_fkey
    ["workSchedule", "businessId", "cascade"], // horarios_laborales_businessId_fkey
    ["appointment", "businessId", "cascade"], // citas_businessId_fkey
    ["businessMember", "businessId", "cascade"], // miembros_negocio_businessId_fkey
    ["commissionRate", "businessId", "cascade"], // porcentajes_comision_businessId_fkey
    ["commissionChange", "businessId", "cascade"], // cambios_comision_businessId_fkey
    ["visit", "businessId", "cascade"], // atenciones_businessId_fkey
    ["business", "invitadoPorId", "set null"], // negocios_invitadoPorId_fkey
    ["memberService", "businessId", "cascade"], // member_services_businessId_fkey
    ["timeBlock", "businessId", "cascade"], // time_blocks_businessId_fkey
    ["producto", "businessId", "cascade"], // productos_businessId_fkey
    ["propinaDeAtencion", "businessId", "cascade"], // atencion_propinas_businessId_fkey
    ["liquidacion", "businessId", "cascade"], // liquidaciones_businessId_fkey
    ["movimientoDeLiquidacion", "businessId", "cascade"], // movimientos_de_liquidacion_businessId_fkey
    ["cierreDeCaja", "businessId", "cascade"], // cierres_de_caja_businessId_fkey
    ["inscripcionEnEspera", "businessId", "cascade"], // lista_de_espera_businessId_fkey
    ["envioAClientes", "businessId", "cascade"], // envios_a_clientes_businessId_fkey
    ["appointmentService", "businessId", "cascade"], // cita_servicios_businessId_fkey
    ["franjaDeHoraValle", "businessId", "cascade"], // franjas_de_hora_valle_businessId_fkey
    ["sillon", "businessId", "cascade"], // sillones_businessId_fkey
    ["fichaClinica", "businessId", "cascade"], // fichas_clinicas_businessId_fkey
    ["marcaDental", "businessId", "cascade"], // odontograma_marcas_businessId_fkey
    ["evolucion", "businessId", "cascade"], // evoluciones_businessId_fkey
    ["planDeTratamiento", "businessId", "cascade"], // planes_de_tratamiento_businessId_fkey
    ["etapaDelPlan", "businessId", "cascade"], // etapas_del_plan_businessId_fkey
    ["prestacionDelPlan", "businessId", "cascade"], // prestaciones_del_plan_businessId_fkey
    ["laboratorio", "businessId", "cascade"], // laboratorios_businessId_fkey
    ["materialDeProtesis", "businessId", "cascade"], // materiales_de_protesis_businessId_fkey
    ["excepcionDeRepartoDeProtesis", "businessId", "cascade"], // excepciones_de_reparto_de_protesis_businessId_fkey
    ["cambioDeRepartoDeProtesis", "businessId", "cascade"], // cambios_de_reparto_de_protesis_businessId_fkey
    ["protesis", "businessId", "cascade"], // protesis_businessId_fkey
    ["eventoDeProtesis", "businessId", "cascade"], // eventos_de_protesis_businessId_fkey
    ["pagoAlLaboratorio", "businessId", "cascade"], // pagos_al_laboratorio_businessId_fkey
  ],
  businessMember: [
    ["workSchedule", "memberId", "cascade"], // horarios_laborales_memberId_fkey
    ["appointment", "memberId", "set null"], // citas_memberId_fkey
    ["commissionRate", "memberId", "cascade"], // porcentajes_comision_memberId_businessId_fkey
    ["commissionChange", "memberId", "set null"], // cambios_comision_memberId_fkey
    ["visitService", "memberId", "set null"], // atencion_servicios_memberId_fkey
    ["memberService", "memberId", "cascade"], // member_services_memberId_businessId_fkey
    ["timeBlock", "memberId", "cascade"], // time_blocks_memberId_businessId_fkey
    ["propinaDeAtencion", "memberId", "no action"], // atencion_propinas_memberId_businessId_fkey
    ["liquidacion", "memberId", "no action"], // liquidaciones_memberId_businessId_fkey
    ["movimientoDeLiquidacion", "memberId", "no action"], // movimientos_de_liquidacion_memberId_businessId_fkey
    ["inscripcionEnEspera", "memberId", "set null"], // lista_de_espera_memberId_fkey
    ["evolucion", "memberId", "no action"], // evoluciones_memberId_businessId_fkey
    ["prestacionDelPlan", "memberId", "no action"], // prestaciones_del_plan_memberId_businessId_fkey
    ["excepcionDeRepartoDeProtesis", "memberId", "cascade"], // excepciones_de_reparto_de_protesis_memberId_businessId_fkey
    ["protesis", "memberId", "no action"], // protesis_memberId_businessId_fkey
  ],
  customer: [
    ["appointment", "customerId", "set null"], // citas_patientId_fkey
    ["visit", "customerId", "set null"], // atenciones_customerId_fkey
    ["envioAClientes", "customerId", "set null"], // envios_a_clientes_customerId_fkey
    ["fichaClinica", "customerId", "cascade"], // fichas_clinicas_customerId_businessId_fkey
    ["marcaDental", "customerId", "cascade"], // odontograma_marcas_customerId_businessId_fkey
    ["evolucion", "customerId", "cascade"], // evoluciones_customerId_businessId_fkey
    ["planDeTratamiento", "customerId", "cascade"], // planes_de_tratamiento_customerId_businessId_fkey
    ["protesis", "customerId", "cascade"], // protesis_customerId_businessId_fkey
  ],
  service: [
    ["appointment", "serviceId", "set null"], // citas_serviceId_fkey
    ["commissionRate", "serviceId", "restrict"], // porcentajes_comision_serviceId_businessId_fkey
    ["commissionChange", "serviceId", "set null"], // cambios_comision_serviceId_fkey
    ["visitService", "serviceId", "set null"], // atencion_servicios_serviceId_fkey
    ["memberService", "serviceId", "cascade"], // member_services_serviceId_businessId_fkey
    ["inscripcionEnEspera", "serviceId", "cascade"], // lista_de_espera_serviceId_businessId_fkey
    ["appointmentService", "serviceId", "set null"], // cita_servicios_serviceId_fkey
    ["prestacionDelPlan", "serviceId", "no action"], // prestaciones_del_plan_serviceId_businessId_fkey
  ],
  appointment: [
    ["visit", "appointmentId", "set null"], // atenciones_appointmentId_fkey
    ["appointmentService", "appointmentId", "cascade"], // cita_servicios_appointmentId_businessId_fkey
    ["evolucion", "appointmentId", "no action"], // evoluciones_appointmentId_businessId_fkey
    ["prestacionDelPlan", "appointmentId", "no action"], // prestaciones_del_plan_appointmentId_businessId_fkey
  ],
  // Borrar una atención que esperaba (`app/api/atenciones/[id]`) se lleva sus
  // líneas, pagos y propinas. Es también la excepción de los triggers de
  // línea liquidada: cuando la cascada llega a la línea, la atención ya no está.
  visit: [
    ["visitService", "visitId", "cascade"], // atencion_servicios_visitId_fkey
    ["visitPayment", "visitId", "cascade"], // atencion_pagos_visitId_fkey
    ["propinaDeAtencion", "visitId", "cascade"], // atencion_propinas_visitId_businessId_fkey
    ["movimientoDeLiquidacion", "visitId", "no action"], // movimientos_de_liquidacion_visitId_businessId_fkey
  ],
  producto: [
    ["visitService", "productId", "set null"], // atencion_servicios_productId_fkey
    ["commissionChange", "productId", "set null"], // cambios_comision_productId_fkey
  ],
  liquidacion: [
    ["visitService", "liquidacionId", "no action"], // atencion_servicios_liquidacionId_fkey
    ["propinaDeAtencion", "liquidacionId", "no action"], // atencion_propinas_liquidacionId_businessId_fkey
    ["movimientoDeLiquidacion", "liquidacionId", "no action"], // movimientos_de_liquidacion_liquidacionId_businessId_fkey
  ],
  inscripcionEnEspera: [
    ["envioAClientes", "esperaId", "set null"], // envios_a_clientes_esperaId_fkey
  ],
  // Clínica dental (`20261106120000_etapa_6_odontologia`). Lo que cuelga del
  // paciente, del negocio, del plan y de la etapa es CASCADE; lo que apunta a
  // citas, sillones, servicios y miembros es NO ACTION (P2003): el endpoint
  // desvincula antes de borrar, o responde 409. Los sillones no se borran
  // (se desactivan), pero la FK está igual.
  sillon: [
    ["appointment", "sillonId", "no action"], // citas_sillonId_businessId_fkey
  ],
  planDeTratamiento: [
    ["etapaDelPlan", "planId", "cascade"], // etapas_del_plan_planId_businessId_fkey
  ],
  etapaDelPlan: [
    ["prestacionDelPlan", "etapaId", "cascade"], // prestaciones_del_plan_etapaId_businessId_fkey
  ],
  // Prótesis (`20261108120000_etapa_7_protesis`). Lo que cuelga del negocio,
  // del paciente, de la prótesis y (la excepción) del miembro y del material
  // es CASCADE; lo que apunta a una prótesis, un material, un laboratorio o un
  // pago desde otra tabla es NO ACTION. Nada de esto se borra desde un
  // endpoint (se desactiva o se anula), pero las FK están igual.
  protesis: [
    ["visitService", "protesisId", "no action"], // atencion_servicios_protesisId_fkey
    ["prestacionDelPlan", "protesisId", "no action"], // prestaciones_del_plan_protesisId_businessId_fkey
    ["eventoDeProtesis", "protesisId", "cascade"], // eventos_de_protesis_protesisId_businessId_fkey
  ],
  pagoAlLaboratorio: [
    ["visitService", "pagoAlLaboratorioId", "no action"], // atencion_servicios_pagoAlLaboratorioId_fkey
  ],
  laboratorio: [
    ["materialDeProtesis", "laboratorioPorDefectoId", "no action"], // materiales_de_protesis_laboratorioPorDefectoId_businessId_fkey
    ["protesis", "laboratorioId", "no action"], // protesis_laboratorioId_businessId_fkey
    ["pagoAlLaboratorio", "laboratorioId", "no action"], // pagos_al_laboratorio_laboratorioId_businessId_fkey
  ],
  materialDeProtesis: [
    ["excepcionDeRepartoDeProtesis", "materialId", "cascade"], // excepciones_de_reparto_de_protesis_materialId_businessId_fkey
    ["protesis", "materialId", "no action"], // protesis_materialId_businessId_fkey
  ],
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
    sillon: [],
    fichaClinica: [],
    marcaDental: [],
    evolucion: [],
    planDeTratamiento: [],
    etapaDelPlan: [],
    prestacionDelPlan: [],
    laboratorio: [],
    materialDeProtesis: [],
    excepcionDeRepartoDeProtesis: [],
    cambioDeRepartoDeProtesis: [],
    protesis: [],
    eventoDeProtesis: [],
    pagoAlLaboratorio: [],
  }
}

export function crearBaseFalsa() {
  let tablas = tablasVacias()
  let siguienteId = 1

  const filtrar = (modelo: NombreDeModelo, where: unknown) =>
    tablas[modelo].filter((registro) => coincide(tablas, modelo, registro, where))

  /**
   * Una copia de las tablas que sirve para deshacer una sentencia. Es
   * profunda porque el SET NULL de un borrado cambia filas que ya estaban.
   */
  const instantanea = (): Tablas => structuredClone(tablas)

  /**
   * Una sentencia DELETE entera, como la corre Postgres: cada FK es un
   * trigger AFTER del padre, y los que encolan las cascadas (que corren sin
   * disparar los suyos en el acto) se disparan después de los del nivel
   * anterior. Por eso se recorre en anchura: primero todas las acciones de
   * las filas borradas, en el orden de `ACCIONES`, y recién después las de lo
   * que esas cascadas borraron. `RESTRICT` y `NO ACTION` se revisan cuando les
   * toca su turno en la cola (sin diferir, en Postgres sólo los distingue que
   * NO ACTION se puede diferir), así que no frena un hijo que otra acción
   * anterior de la misma sentencia ya se llevó. Si algo falla en cualquier
   * punto, la base queda como estaba: Postgres revierte la sentencia completa.
   */
  function borrarSentencia(modelo: NombreDeModelo, registros: Set<Registro>) {
    const antes = instantanea()
    const cola: (() => void)[] = []
    try {
      borrarFilas(modelo, registros, cola)
      for (let siguiente = cola.shift(); siguiente; siguiente = cola.shift()) siguiente()
    } catch (error) {
      tablas = antes
      throw error
    }
  }

  /**
   * Un DELETE de un nivel: pasa cada fila por su trigger `BEFORE DELETE`, la
   * borra y encola, fila por fila, las acciones de las FK que la referencian.
   * Los triggers de los hijos ven al padre ya borrado, como dentro de la
   * cascada de Postgres.
   */
  function borrarFilas(modelo: NombreDeModelo, registros: Set<Registro>, cola: (() => void)[]) {
    if (registros.size === 0) return
    for (const registro of registros) ANTES_DE_BORRAR[modelo]?.(registro)
    tablas[modelo] = tablas[modelo].filter((registro) => !registros.has(registro))
    for (const registro of registros) {
      for (const accion of ACCIONES[modelo] ?? []) cola.push(() => aplicarAccion(modelo, registro.id, accion, cola))
    }
  }

  /** Lo que hace una FK con los hijos de la fila `id` de `padre`, que ya se borró. */
  function aplicarAccion(padre: NombreDeModelo, id: unknown, [hijo, campo, regla]: [NombreDeModelo, string, Regla], cola: (() => void)[]) {
    const referidos = tablas[hijo].filter((registro) => registro[campo] === id)
    if (referidos.length === 0) return
    if (regla === "cascade") return borrarFilas(hijo, new Set(referidos), cola)
    if (regla === "set null") return anular(hijo, referidos, campo)
    throw errorDePrisma("P2003", `Foreign key constraint violated: ${hijo}.${campo} → ${String(id)} impide borrar ${padre}`)
  }

  /**
   * El UPDATE que hace un `ON DELETE SET NULL`: cada fila pasa por sus
   * triggers `BEFORE UPDATE` (los de `atencion_servicios` sí se disparan con
   * la cascada) y queda con el campo en null. No revisa las demás FK de la
   * fila (Postgres sólo revisa las columnas que cambian, y un null no se
   * revisa) ni toca `updatedAt`, que lo pone Prisma y no la base.
   */
  function anular(modelo: NombreDeModelo, registros: Registro[], campo: string) {
    for (const registro of registros) {
      const nuevo = { ...registro, [campo]: null }
      ANTES_DE_ACTUALIZAR[modelo]?.(registro, nuevo)
      Object.assign(registro, nuevo)
    }
  }

  // ─── Escritura ───────────────────────────────────────────────────────────

  /**
   * Las FK y los únicos de una fila. En un INSERT `anterior` no viene y se
   * revisan todas las FK. En un UPDATE viene la fila como estaba, y sólo se
   * revisan las FK cuyas columnas cambian (en una compuesta, también si cambia
   * `businessId`): Postgres se salta las que quedan igual (#134). Así una fila
   * que ya apuntaba a algo que no está (la de una cascada a medio camino)
   * puede cambiar otro campo, como en la base de verdad.
   */
  function verificarClaves(modelo: NombreDeModelo, registro: Registro, anterior?: Registro) {
    for (const [clave, rel] of Object.entries(RELACIONES[modelo])) {
      // Sólo las FK que guarda este registro (las que apuntan a un `id`).
      if (rel.tipo !== "uno" || rel.remoto !== "id") continue
      const compuesta = (COMPUESTAS[modelo] ?? []).includes(clave)
      if (
        anterior &&
        !distintos(registro[rel.local], anterior[rel.local]) &&
        !(compuesta && distintos(registro.businessId, anterior.businessId))
      ) {
        continue
      }
      const valor = registro[rel.local]
      if (valor === null || valor === undefined) continue
      const otro = tablas[rel.modelo].find((candidato) => candidato.id === valor)
      if (!otro) throw errorDePrisma("P2003", `FK rota: ${modelo}.${clave} → ${String(valor)}`)
      // FK compuesta (id, businessId): el otro tiene que ser del mismo negocio.
      if (compuesta && otro.businessId !== registro.businessId) {
        throw errorDePrisma("P2003", `FK compuesta rota: ${modelo}.${clave} → ${String(valor)} es de otro negocio`)
      }
    }
    for (const { campos, si, sinMayusculas = [] } of UNICOS[modelo] ?? []) {
      if (campos.some((campo) => registro[campo] === null || registro[campo] === undefined)) continue
      if (si && !si(registro)) continue
      const comparable = (fila: Registro, campo: string) =>
        sinMayusculas.includes(campo) && typeof fila[campo] === "string" ? (fila[campo] as string).toLowerCase() : fila[campo]
      const choca = tablas[modelo].some(
        (otro) =>
          otro !== registro &&
          otro !== anterior &&
          (!si || si(otro)) &&
          campos.every((campo) => iguales(comparable(otro, campo), comparable(registro, campo)))
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

  /**
   * El trigger `atencion_servicios_mismo_negocio` (misma migración): la línea
   * no tiene `businessId`, así que sus FK a `productos` y `liquidaciones` no
   * pueden ser compuestas; el trigger exige que el producto y la liquidación
   * sean del negocio de su atención, y también el profesional (su FK a
   * `miembros_negocio` tampoco es compuesta). En un UPDATE sólo mira si cambia
   * la atención, el profesional, el producto o la liquidación, y si la
   * atención ya no existe (cascada del negocio) deja pasar. El NULL que pone
   * la cascada al borrar a un miembro no se revisa. `viejo` es `null` en un
   * INSERT.
   */
  function lineaDelMismoNegocio(viejo: Registro | null, nuevo: Registro) {
    const id = String(nuevo.id)
    const memberId = nuevo.memberId ?? null
    const productId = nuevo.productId ?? null
    const liquidacionId = nuevo.liquidacionId ?? null
    if (memberId === null && productId === null && liquidacionId === null) return
    if (
      viejo &&
      nuevo.visitId === viejo.visitId &&
      !distintos(memberId, viejo.memberId) &&
      !distintos(productId, viejo.productId) &&
      !distintos(liquidacionId, viejo.liquidacionId)
    ) {
      return
    }

    const negocio = tablas.visit.find((atencion) => atencion.id === nuevo.visitId)?.businessId ?? null
    if (negocio === null && viejo) return

    // Con `negocio` en null (un INSERT sin atención), `"businessId" = NULL`
    // no matchea nada en SQL: también se rechaza.
    const delNegocio = (modelo: NombreDeModelo, otroId: unknown) =>
      negocio !== null && tablas[modelo].some((otro) => otro.id === otroId && otro.businessId === negocio)
    if (memberId !== null && !delNegocio("businessMember", memberId)) {
      throw errorDePrisma("P2003", `atencion_servicios ${id}: el profesional es de otro negocio`)
    }
    if (productId !== null && !delNegocio("producto", productId)) {
      throw errorDePrisma("P2003", `atencion_servicios ${id}: el producto es de otro negocio`)
    }
    if (liquidacionId !== null && !delNegocio("liquidacion", liquidacionId)) {
      throw errorDePrisma("P2003", `atencion_servicios ${id}: la liquidación es de otro negocio`)
    }
  }

  /**
   * El trigger `atencion_servicios_liquidada_no_se_borra` (misma migración):
   * una línea en una liquidación no se borra mientras su atención exista. Sin
   * atención es la cascada del negocio entero (o de la atención), y pasa.
   */
  function lineaLiquidadaNoSeBorra(viejo: Registro) {
    if (viejo.liquidacionId === null || viejo.liquidacionId === undefined) return
    if (!tablas.visit.some((atencion) => atencion.id === viejo.visitId)) return
    throw errorDeTrigger(`atencion_servicios ${String(viejo.id)}: la línea está en una liquidación; no se borra`)
  }

  /**
   * El trigger `evoluciones_inmutables` (migración
   * `20261106120000_etapa_6_odontologia`): una evolución no se edita. Se
   * compara la fila entera menos `memberId` y `appointmentId`, y esas dos sólo
   * pueden pasar a null (desvincular la cita o el miembro, para poder
   * borrarlos después). Escribir lo mismo que ya tiene no es un cambio.
   */
  function evolucionInmutable(viejo: Registro, nuevo: Registro) {
    const desvinculables = ["memberId", "appointmentId"]
    const campos = new Set([...Object.keys(viejo), ...Object.keys(nuevo)])
    const cambia = [...campos].some((campo) => !desvinculables.includes(campo) && distintos(nuevo[campo], viejo[campo]))
    const apuntaAOtro = desvinculables.some(
      (campo) => nuevo[campo] !== null && nuevo[campo] !== undefined && distintos(nuevo[campo], viejo[campo])
    )
    if (cambia || apuntaAOtro) {
      throw errorDeTrigger(`evoluciones ${String(viejo.id)}: una evolución no se edita; se anota una nueva`)
    }
  }

  /**
   * El trigger `evoluciones_no_se_borran` (misma migración): una evolución no
   * se borra mientras existan su paciente y su negocio. Sin alguno de los dos
   * es la cascada de borrar el paciente o el negocio entero, y pasa (como
   * `lineaLiquidadaNoSeBorra`). Igual que el de verdad, mira las dos filas:
   * un test que siembra evoluciones sin su negocio no ve el rechazo.
   */
  function evolucionNoSeBorra(viejo: Registro) {
    const existe = (modelo: NombreDeModelo, id: unknown) => tablas[modelo].some((fila) => fila.id === id)
    if (existe("customer", viejo.customerId) && existe("business", viejo.businessId)) {
      throw errorDeTrigger(`evoluciones ${String(viejo.id)}: una evolución no se borra`)
    }
  }

  // ─── Triggers de las prótesis (`20261108120000_etapa_7_protesis`; `protesis_congelada` como la reemplazó `20261109120000_etapa_7c_protesis_por_tipo`) ─

  /** Las columnas de una prótesis que se pueden mover (`protesis_congelada`). */
  const MOVIBLES_DE_PROTESIS = [
    "estado",
    "laboratorioId",
    "laboratorioNombre",
    "entregaEstimada",
    "tono",
    "entregadaEn",
    "anuladaEn",
    "anuladaPorNombre",
    "memberId",
    "updatedAt",
  ]
  /** Los pasos según el tipo (la removible y la total, con rodete y enfilado; el resto, con una prueba). */
  const pasosDeProtesis = (tipo: unknown) =>
    tipo === "removible" || tipo === "total" ? ["impresion", "rodete", "enfilado", "entregada"] : ["impresion", "prueba", "entregada"]

  /** `distintos`, también para listas (piezas, pilares, zonas): Postgres compara el arreglo entero. */
  const distintosOListas = (a: unknown, b: unknown) =>
    Array.isArray(a) || Array.isArray(b) ? JSON.stringify(a ?? null) !== JSON.stringify(b ?? null) : distintos(a, b)

  /**
   * El trigger `protesis_congelada`: lo copiado al crear la prótesis no
   * cambia (se compara la fila entera menos lo movible); `memberId` sólo pasa
   * a null; una entregada o anulada no cambia más (tampoco el tono); el
   * estado sólo avanza por los pasos de su tipo (o pasa a anulada).
   */
  function protesisCongelada(viejo: Registro, nuevo: Registro) {
    const id = String(viejo.id)
    const campos = new Set([...Object.keys(viejo), ...Object.keys(nuevo)])
    if ([...campos].some((campo) => !MOVIBLES_DE_PROTESIS.includes(campo) && distintosOListas(nuevo[campo], viejo[campo]))) {
      throw errorDeTrigger(`protesis ${id}: el diseño, el material, el valor y el reparto no cambian; se anula y se crea otra`)
    }
    if (nuevo.memberId !== null && nuevo.memberId !== undefined && distintos(nuevo.memberId, viejo.memberId)) {
      throw errorDeTrigger(`protesis ${id}: la tratante no cambia`)
    }
    const cierre = MOVIBLES_DE_PROTESIS.filter((campo) => campo !== "memberId" && campo !== "updatedAt")
    if ((viejo.estado === "entregada" || viejo.estado === "anulada") && cierre.some((campo) => distintos(nuevo[campo], viejo[campo]))) {
      throw errorDeTrigger(`protesis ${id}: una prótesis entregada o anulada ya no cambia`)
    }
    if (distintos(nuevo.estado, viejo.estado) && nuevo.estado !== "anulada") {
      const pasos = pasosDeProtesis(viejo.tipo)
      const antes = pasos.indexOf(String(viejo.estado))
      const despues = pasos.indexOf(String(nuevo.estado))
      if (antes < 0 || despues < 0 || despues <= antes) throw errorDeTrigger(`protesis ${id}: el seguimiento sólo avanza por los pasos de su tipo`)
    }
  }

  /** El trigger `protesis_no_se_borra`: sólo en la cascada de su paciente o su negocio, como `evolucionNoSeBorra`. */
  function protesisNoSeBorra(viejo: Registro) {
    const existe = (modelo: NombreDeModelo, id: unknown) => tablas[modelo].some((fila) => fila.id === id)
    if (existe("customer", viejo.customerId) && existe("business", viejo.businessId)) {
      throw errorDeTrigger(`protesis ${String(viejo.id)}: una prótesis no se borra; se anula`)
    }
  }

  /** El trigger `eventos_de_protesis_inmutables`, en el UPDATE: un paso del seguimiento no se edita. */
  function eventoNoSeEdita(viejo: Registro) {
    throw errorDeTrigger(`eventos_de_protesis ${String(viejo.id)}: un paso del seguimiento no se edita`)
  }

  /** El mismo trigger, en el DELETE: sólo en la cascada de su prótesis. */
  function eventoNoSeBorra(viejo: Registro) {
    if (tablas.protesis.some((fila) => fila.id === viejo.protesisId)) {
      throw errorDeTrigger(`eventos_de_protesis ${String(viejo.id)}: un paso del seguimiento no se borra`)
    }
  }

  /**
   * El trigger `atencion_servicios_reparto_de_protesis`: la prótesis y el pago
   * al laboratorio de una línea tienen que ser del negocio de su atención (la
   * línea no tiene `businessId`); un reparto congelado no cambia; una línea
   * pagada no pasa a otro pago. Sin atención (cascada del negocio), pasa.
   * Desde la etapa 7b, además, sólo se le paga al laboratorio de la prótesis
   * y si la prótesis está entregada. Desde la 7d
   * (`20261109130000_etapa_7d_protesis_entrega_con_laboratorio`), un abono es
   * del mismo paciente que su atención, va a nombre de la tratante de la
   * prótesis (`memberId` a null sigue permitido: desvincular) y sólo entra a
   * una liquidación con la prótesis entregada y a nombre de la tratante.
   * `viejo` es `null` en un INSERT.
   */
  function abonoDeProtesis(viejo: Registro | null, nuevo: Registro) {
    const id = String(nuevo.id)
    const atencionExiste = (visitId: unknown) => tablas.visit.some((atencion) => atencion.id === visitId)
    const valor = (registro: Registro | null, campo: string) => (registro ? (registro[campo] ?? null) : null)
    if (viejo) {
      const congelado = viejo.odontologoCents !== null && viejo.odontologoCents !== undefined
      const cambia = ["protesisId", "priceCents", "odontologoCents", "clinicaCents", "tecnicoCents"].some((campo) =>
        distintos(nuevo[campo], viejo[campo])
      )
      if (congelado && cambia && atencionExiste(viejo.visitId)) {
        throw errorDeTrigger(`atencion_servicios ${id}: el reparto del abono ya está congelado`)
      }
      const pagoViejo = viejo.pagoAlLaboratorioId ?? null
      const pagoNuevo = nuevo.pagoAlLaboratorioId ?? null
      if (pagoViejo !== null && pagoNuevo !== null && pagoNuevo !== pagoViejo && atencionExiste(viejo.visitId)) {
        throw errorDeTrigger(`atencion_servicios ${id}: la línea ya está en otro pago al laboratorio`)
      }
    }
    const cambiaLinea = !viejo || nuevo.visitId !== viejo.visitId || distintos(nuevo.protesisId, viejo.protesisId)
    const cambiaPago = distintos(valor(nuevo, "pagoAlLaboratorioId"), valor(viejo, "pagoAlLaboratorioId"))
    const memberId = nuevo.memberId ?? null
    const byOwner = nuevo.byOwner ?? false
    const cambiaTratante = !viejo || distintos(byOwner, viejo.byOwner ?? false) || (memberId !== null && distintos(memberId, viejo.memberId))
    const liquidacionId = nuevo.liquidacionId ?? null
    const entraALiquidacion = liquidacionId !== null && distintos(liquidacionId, valor(viejo, "liquidacionId"))
    if (viejo && !cambiaLinea && !cambiaPago && !cambiaTratante && !entraALiquidacion) return

    const protesisId = nuevo.protesisId ?? null
    const pagoId = nuevo.pagoAlLaboratorioId ?? null
    if (protesisId === null && pagoId === null) return
    const atencion = tablas.visit.find((otra) => otra.id === nuevo.visitId)
    const negocio = atencion?.businessId ?? null
    if (negocio === null && viejo) return
    const delNegocio = (modelo: NombreDeModelo, otroId: unknown) =>
      negocio !== null && tablas[modelo].some((otro) => otro.id === otroId && otro.businessId === negocio)
    const protesis = protesisId === null ? undefined : tablas.protesis.find((otra) => otra.id === protesisId)

    if (cambiaLinea || cambiaPago) {
      if (protesisId !== null && !delNegocio("protesis", protesisId)) {
        throw errorDePrisma("P2003", `atencion_servicios ${id}: la prótesis es de otro negocio`)
      }
      if (pagoId !== null && !delNegocio("pagoAlLaboratorio", pagoId)) {
        throw errorDePrisma("P2003", `atencion_servicios ${id}: el pago al laboratorio es de otro negocio`)
      }
      if (pagoId !== null) {
        const pago = tablas.pagoAlLaboratorio.find((otro) => otro.id === pagoId)
        const entregada = protesis?.entregadaEn !== null && protesis?.entregadaEn !== undefined
        if (!pago || !protesis || protesis.laboratorioId !== pago.laboratorioId || !entregada) {
          throw errorDeTrigger(`atencion_servicios ${id}: el pago es a otro laboratorio o la prótesis no está entregada`)
        }
      }
    }

    // Etapa 7d. `protesis` existe: la FK y la regla de negocio de arriba ya lo exigen.
    if (!protesis) return
    if (cambiaLinea && distintos(protesis.customerId, atencion?.customerId)) {
      throw errorDeTrigger(`atencion_servicios ${id}: la prótesis es de otro paciente`)
    }
    const deLaDuena = protesis.byOwner === true
    if ((cambiaLinea || cambiaTratante) && (distintos(byOwner, deLaDuena) || distintos(memberId, deLaDuena ? null : protesis.memberId))) {
      throw errorDeTrigger(`atencion_servicios ${id}: el abono va a nombre de la tratante de la prótesis`)
    }
    const entregada = protesis.entregadaEn !== null && protesis.entregadaEn !== undefined
    if (entraALiquidacion && (!entregada || memberId === null || distintos(memberId, protesis.memberId) || distintos(byOwner, deLaDuena))) {
      throw errorDeTrigger(`atencion_servicios ${id}: el abono sólo se liquida a la tratante y con la prótesis entregada`)
    }
  }

  /** Los triggers `BEFORE INSERT` de la base de verdad que la falsa reproduce, en el orden de Postgres (alfabético). */
  const ANTES_DE_INSERTAR: Partial<Record<NombreDeModelo, (nuevo: Registro) => void>> = {
    visitService: (nuevo) => {
      lineaDelMismoNegocio(null, nuevo)
      abonoDeProtesis(null, nuevo)
    },
  }

  /** Los triggers `BEFORE UPDATE` de la base de verdad que la falsa reproduce, en el orden de Postgres (alfabético). */
  const ANTES_DE_ACTUALIZAR: Partial<Record<NombreDeModelo, (viejo: Registro, nuevo: Registro) => void>> = {
    visitService: (viejo, nuevo) => {
      comisionInmutable(viejo, nuevo)
      lineaDelMismoNegocio(viejo, nuevo)
      abonoDeProtesis(viejo, nuevo)
    },
    evolucion: evolucionInmutable,
    protesis: protesisCongelada,
    eventoDeProtesis: eventoNoSeEdita,
  }

  /** Los triggers `BEFORE DELETE` de la base de verdad que la falsa reproduce. */
  const ANTES_DE_BORRAR: Partial<Record<NombreDeModelo, (viejo: Registro) => void>> = {
    visitService: lineaLiquidadaNoSeBorra,
    evolucion: evolucionNoSeBorra,
    protesis: protesisNoSeBorra,
    eventoDeProtesis: eventoNoSeBorra,
  }

  /**
   * Un UPDATE de una fila: arma la fila nueva, la pasa por el trigger y recién
   * entonces la escribe, como `BEFORE UPDATE`. Devuelve la escritura para que
   * `updateMany` pueda revisar todas las filas antes de tocar ninguna (en
   * Postgres la sentencia entera falla o pasa). La escritura revisa FK y
   * únicos antes de copiar: si fallan, la fila queda como estaba.
   */
  function prepararActualizacion(modelo: NombreDeModelo, registro: Registro, datos: unknown) {
    const nuevo = { ...registro }
    aplicar(modelo, nuevo, datos)
    ANTES_DE_ACTUALIZAR[modelo]?.(registro, nuevo)
    return () => {
      verificarClaves(modelo, nuevo, registro)
      Object.assign(registro, nuevo)
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
    ANTES_DE_INSERTAR[modelo]?.(registro)
    verificarClaves(modelo, registro)
    tablas[modelo].push(registro)

    for (const [rel, hijos] of anidados) {
      // Por una FK compuesta (las `etapas` de un plan, las `prestaciones` de
      // una etapa), Prisma completa también el `businessId` del hijo con el del
      // padre: el `create` anidado no lo lleva.
      const negocio = esInversaDeCompuesta(modelo, rel) ? { businessId: registro.businessId } : {}
      for (const hijo of Array.isArray(hijos) ? hijos : [hijos]) {
        crear(rel.modelo, { ...(hijo as Registro), [rel.remoto]: registro[rel.local], ...negocio })
      }
    }
    return registro
  }

  /** Si la relación a muchos `rel` de `modelo` es, del lado del hijo, una FK compuesta `(id, businessId)`. */
  function esInversaDeCompuesta(modelo: NombreDeModelo, rel: Relacion): boolean {
    const inversa = Object.entries(RELACIONES[rel.modelo]).find(
      ([, otra]) => otra.tipo === "uno" && otra.modelo === modelo && otra.local === rel.remoto && otra.remoto === rel.local
    )
    return !!inversa && (COMPUESTAS[rel.modelo] ?? []).includes(inversa[0])
  }

  /**
   * `distinct` de Prisma: deja la primera fila (en el orden ya aplicado) de
   * cada combinación de los campos, antes de `skip` y `take`. Sólo la forma
   * de lista de campos escalares; cualquier otra cosa lanza.
   */
  function sinRepetidos(modelo: NombreDeModelo, lista: Registro[], distinct: unknown): Registro[] {
    if (!Array.isArray(distinct) || distinct.length === 0 || !distinct.every((campo) => typeof campo === "string")) {
      return falla(`distinct inválido en ${modelo}: sólo una lista de campos`)
    }
    for (const campo of distinct) {
      if (RELACIONES[modelo][campo] || lista.some((fila) => !(campo in fila))) {
        return falla(`distinct de un campo que no existe: ${modelo}.${campo}`)
      }
    }
    const vistos = new Set<string>()
    return lista.filter((fila) => {
      const clave = JSON.stringify(distinct.map((campo) => fila[campo] ?? null))
      if (vistos.has(clave)) return false
      vistos.add(clave)
      return true
    })
  }

  // ─── El cliente ──────────────────────────────────────────────────────────

  /** Lo que devuelve la base es una copia: el endpoint no puede tocar el estado por referencia. */
  const copia = <T>(valor: T): T => structuredClone(valor)

  function delegado(modelo: NombreDeModelo) {
    type Args = Condicion & {
      where?: unknown
      orderBy?: unknown
      take?: number
      skip?: number
      data?: unknown
      distinct?: unknown
    }

    const buscar = (args: Args = {}) => {
      let lista = ordenar(filtrar(modelo, args.where), args.orderBy)
      if (args.distinct !== undefined) lista = sinRepetidos(modelo, lista, args.distinct)
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
      // Un solo INSERT: si una fila falla un trigger, una FK o un único, no
      // queda ninguna, como en Postgres.
      createMany: vi.fn(async (args: Args) => {
        const lista = Array.isArray(args.data) ? args.data : [args.data]
        const antes = instantanea()
        try {
          lista.forEach((datos) => crear(modelo, datos))
        } catch (error) {
          tablas = antes
          throw error
        }
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
        borrarSentencia(modelo, new Set([registro]))
        return copiaDeSalida
      }),
      // Una sola sentencia: si una fila falla una FK o un único, no queda
      // ninguna cambiada, como en Postgres.
      updateMany: vi.fn(async (args: Args) => {
        const registros = filtrar(modelo, args.where)
        const escrituras = registros.map((registro) => prepararActualizacion(modelo, registro, args.data))
        const antes = instantanea()
        try {
          escrituras.forEach((escribir) => escribir())
        } catch (error) {
          tablas = antes
          throw error
        }
        return { count: registros.length }
      }),
      deleteMany: vi.fn(async (args: Args = {}) => {
        const registros = new Set(filtrar(modelo, args.where))
        borrarSentencia(modelo, registros)
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
    sillon: delegado("sillon"),
    fichaClinica: delegado("fichaClinica"),
    marcaDental: delegado("marcaDental"),
    evolucion: delegado("evolucion"),
    planDeTratamiento: delegado("planDeTratamiento"),
    etapaDelPlan: delegado("etapaDelPlan"),
    prestacionDelPlan: delegado("prestacionDelPlan"),
    laboratorio: delegado("laboratorio"),
    materialDeProtesis: delegado("materialDeProtesis"),
    excepcionDeRepartoDeProtesis: delegado("excepcionDeRepartoDeProtesis"),
    cambioDeRepartoDeProtesis: delegado("cambioDeRepartoDeProtesis"),
    protesis: delegado("protesis"),
    eventoDeProtesis: delegado("eventoDeProtesis"),
    pagoAlLaboratorio: delegado("pagoAlLaboratorio"),
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
