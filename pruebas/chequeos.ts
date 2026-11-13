import type { NombreDeModelo, Registro } from "./consultas-falsas"

/**
 * Las restricciones CHECK de las migraciones (`prisma/migrations/**`), escritas
 * a mano en la base y por eso invisibles para Prisma: la base falsa las revisa
 * en cada INSERT y UPDATE (también en el SET NULL de una cascada), después de
 * los triggers `BEFORE`, como Postgres. Una fila que no cumple lanza el mismo
 * error que la base de verdad: `23514`, con el nombre de la restricción.
 *
 * Están todas las de las tablas que la base falsa tiene, en la versión vigente
 * (la de la última migración que la reemplazó). Cada una se traduce a mano;
 * si una migración cambia o agrega un CHECK, se cambia acá también.
 *
 * Como en SQL, una restricción se cumple si su expresión es verdadera **o
 * desconocida**: comparar contra NULL no la viola. Así un test que siembra una
 * fila sin una columna NOT NULL (que en la base de verdad no podría existir)
 * no ve rechazos por esa columna; sí los ve por lo que la escritura deja
 * incoherente, que es lo que importa.
 */

type Logico = boolean | null

export interface Chequeo {
  /** El nombre de la restricción en Postgres. */
  nombre: string
  cumple: (fila: Registro) => Logico
}

/** El nombre de la tabla de cada modelo (`@@map`), para el mensaje del error. */
export const TABLAS_SQL: Record<NombreDeModelo, string> = {
  user: "usuarios",
  business: "negocios",
  businessMember: "miembros_negocio",
  customer: "clientes",
  service: "servicios",
  appointment: "citas",
  visit: "atenciones",
  visitService: "atencion_servicios",
  visitPayment: "atencion_pagos",
  workSchedule: "horarios_laborales",
  timeBlock: "time_blocks",
  memberService: "member_services",
  commissionRate: "porcentajes_comision",
  commissionChange: "cambios_comision",
  producto: "productos",
  propinaDeAtencion: "atencion_propinas",
  liquidacion: "liquidaciones",
  movimientoDeLiquidacion: "movimientos_de_liquidacion",
  cierreDeCaja: "cierres_de_caja",
  inscripcionEnEspera: "lista_de_espera",
  envioAClientes: "envios_a_clientes",
  appointmentService: "cita_servicios",
  franjaDeHoraValle: "franjas_de_hora_valle",
  sillon: "sillones",
  fichaClinica: "fichas_clinicas",
  marcaDental: "odontograma_marcas",
  evolucion: "evoluciones",
  planDeTratamiento: "planes_de_tratamiento",
  etapaDelPlan: "etapas_del_plan",
  prestacionDelPlan: "prestaciones_del_plan",
  laboratorio: "laboratorios",
  materialDeProtesis: "materiales_de_protesis",
  excepcionDeRepartoDeProtesis: "excepciones_de_reparto_de_protesis",
  cambioDeRepartoDeProtesis: "cambios_de_reparto_de_protesis",
  protesis: "protesis",
  eventoDeProtesis: "eventos_de_protesis",
  pagoAlLaboratorio: "pagos_al_laboratorio",
  sede: "sedes",
  workerInvitation: "invitaciones",
}

// ─── Lógica de tres valores, como SQL ────────────────────────────────────────

const nulo = (valor: unknown): valor is null | undefined => valor === null || valor === undefined
/** `x IS NULL` (nunca desconocido). */
const esNulo = (valor: unknown): boolean => nulo(valor)
/** `x IS NOT NULL`. */
const noNulo = (valor: unknown): boolean => !nulo(valor)
const Y = (...partes: Logico[]): Logico => (partes.includes(false) ? false : partes.includes(null) ? null : true)
const O = (...partes: Logico[]): Logico => (partes.includes(true) ? true : partes.includes(null) ? null : false)
const NO = (parte: Logico): Logico => (parte === null ? null : !parte)
/** El `=` entre dos booleanos de SQL: desconocido si alguno lo es. */
const MISMO = (a: Logico, b: Logico): Logico => (a === null || b === null ? null : a === b)
/** Una columna booleana usada como condición. */
const SI = (valor: unknown): Logico => (nulo(valor) ? null : valor === true)

/** Fechas como milisegundos (también una fecha en texto contra una `Date`); números y textos, tal cual. */
function comparables(a: unknown, b: unknown): [number | string, number | string] {
  const fechas = a instanceof Date || b instanceof Date
  const valor = (x: unknown) => (x instanceof Date ? x.getTime() : fechas && typeof x === "string" ? Date.parse(x) : (x as number | string))
  return [valor(a), valor(b)]
}
const IGUAL = (a: unknown, b: unknown): Logico => {
  if (nulo(a) || nulo(b)) return null
  const [x, y] = comparables(a, b)
  return x === y
}
const DISTINTO = (a: unknown, b: unknown): Logico => NO(IGUAL(a, b))
const MENOR = (a: unknown, b: unknown): Logico => {
  if (nulo(a) || nulo(b)) return null
  const [x, y] = comparables(a, b)
  return x < y
}
const MAYOR = (a: unknown, b: unknown): Logico => MENOR(b, a)
const MAYOR_O_IGUAL = (a: unknown, b: unknown): Logico => NO(MENOR(a, b))
const ENTRE = (valor: unknown, desde: number, hasta: number): Logico => Y(MAYOR_O_IGUAL(valor, desde), MAYOR_O_IGUAL(hasta, valor))
const EN = (valor: unknown, opciones: readonly unknown[]): Logico => (nulo(valor) ? null : opciones.includes(valor))
/** `x IS NULL OR x BETWEEN desde AND hasta`, la forma de casi todos los montos y porcentajes opcionales. */
const NULO_O_ENTRE = (valor: unknown, desde: number, hasta: number): Logico => O(esNulo(valor), ENTRE(valor, desde, hasta))

/** Una suma de enteros de SQL: NULL si algún sumando lo es. */
function suma(...valores: unknown[]): number | null {
  if (valores.some(nulo)) return null
  return (valores as number[]).reduce((total, valor) => total + valor, 0)
}

/** `btrim(x)` sin argumentos: quita sólo espacios, no otros blancos. */
const sinEspacios = (texto: string) => texto.replace(/^ +| +$/g, "")
/** `length(btrim(x)) > 0`. */
const NO_VACIO = (texto: unknown): Logico => (nulo(texto) ? null : sinEspacios(String(texto)).length > 0)
/** `x = btrim(x) AND length(x) BETWEEN desde AND hasta`. */
const NOMBRE_LIMPIO = (texto: unknown, desde: number, hasta: number): Logico => {
  if (nulo(texto)) return null
  const largo = [...String(texto)].length
  return String(texto) === sinEspacios(String(texto)) && largo >= desde && largo <= hasta
}
const CALZA = (texto: unknown, patron: RegExp): Logico => (nulo(texto) ? null : patron.test(String(texto)))

// Listas de Postgres.
const lista = (valor: unknown): unknown[] | null => (nulo(valor) ? null : (valor as unknown[]))
/** `cardinality(x)`. */
const CARDINALIDAD = (valor: unknown): number | null => lista(valor)?.length ?? null
/** `a <@ b`: todo lo de `a` está en `b`. */
const DENTRO_DE = (valor: unknown, permitidos: readonly unknown[]): Logico =>
  nulo(valor) ? null : (valor as unknown[]).every((elemento) => permitidos.includes(elemento))
/** `a @> b`: `a` contiene todo lo de `b`. */
const CONTIENE = (valor: unknown, requeridos: readonly unknown[]): Logico =>
  nulo(valor) ? null : requeridos.every((elemento) => (valor as unknown[]).includes(elemento))
/** `a && b`: tienen algo en común. */
const SOLAPA = (valor: unknown, otros: readonly unknown[]): Logico =>
  nulo(valor) ? null : (valor as unknown[]).some((elemento) => otros.includes(elemento))
/** `'x' = ANY (lista)`. */
const TIENE = (valor: unknown, elemento: unknown): Logico => (nulo(valor) ? null : (valor as unknown[]).includes(elemento))
/** `a || b` de dos listas. */
const UNIDAS = (a: unknown, b: unknown): unknown[] | null => (nulo(a) || nulo(b) ? null : [...(a as unknown[]), ...(b as unknown[])])

/** `pieza / 10` y `pieza % 10`, división entera de INTEGER. */
const cuadrante = (pieza: unknown): number | null => (nulo(pieza) ? null : Math.trunc((pieza as number) / 10))
const posicion = (pieza: unknown): number | null => (nulo(pieza) ? null : (pieza as number) % 10)

const TOPE = 2000000000
const MEDIOS_DE_PAGO = ["efectivo", "tarjeta-debito", "tarjeta-credito", "transferencia", "billetera-digital"]
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/
const TELEFONO_E164 = /^\+[0-9]{8,15}$/
const SUPERIOR = [11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28]
const INFERIOR = [31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48]
const CORDALES = [18, 28, 38, 48]
const CARAS = ["V", "P", "L", "M", "D", "O", "I"]

/** La pieza FDI de `odontograma_marcas_pieza_check` y `prestaciones_del_plan_pieza_check`. */
const piezaFdi = (pieza: unknown): Logico =>
  O(
    ENTRE(pieza, 11, 18),
    ENTRE(pieza, 21, 28),
    ENTRE(pieza, 31, 38),
    ENTRE(pieza, 41, 48),
    ENTRE(pieza, 51, 55),
    ENTRE(pieza, 61, 65),
    ENTRE(pieza, 71, 75),
    ENTRE(pieza, 81, 85)
  )

/** `pbOdontologo`, `pbClinica` y `pbTecnico` entre 0 y 10.000 y sumando 10.000. */
const repartoCompleto = (odontologo: unknown, clinica: unknown, tecnico: unknown): Logico =>
  Y(ENTRE(odontologo, 0, 10000), ENTRE(clinica, 0, 10000), ENTRE(tecnico, 0, 10000), IGUAL(suma(odontologo, clinica, tecnico), 10000))

/** Las tres columnas nulas, o las tres presentes y con un reparto completo (`cambios_de_reparto_de_protesis`). */
const repartoOpcional = (odontologo: unknown, clinica: unknown, tecnico: unknown) => ({
  vacio: esNulo(odontologo) && esNulo(clinica) && esNulo(tecnico),
  lleno: Y(noNulo(odontologo), noNulo(clinica), noNulo(tecnico), repartoCompleto(odontologo, clinica, tecnico)),
})

const chequeo = (nombre: string, cumple: (fila: Registro) => Logico): Chequeo => ({ nombre, cumple })

export const CHEQUEOS: Partial<Record<NombreDeModelo, Chequeo[]>> = {
  // ─── 20260907190000_add_commissions, 20261105120000_cierre_de_la_v1 ───────
  businessMember: [
    chequeo("miembros_negocio_commissionPercent_check", (f) => NULO_O_ENTRE(f.commissionPercent, 0, 100)),
    chequeo("miembros_negocio_role_check", (f) => EN(f.role, ["admin", "worker"])),
  ],
  commissionRate: [chequeo("porcentajes_comision_percent_check", (f) => ENTRE(f.percent, 0, 100))],
  commissionChange: [
    chequeo("cambios_comision_previousPercent_check", (f) => NULO_O_ENTRE(f.previousPercent, 0, 100)),
    chequeo("cambios_comision_newPercent_check", (f) => NULO_O_ENTRE(f.newPercent, 0, 100)),
    chequeo("cambios_comision_scope_check", (f) => EN(f.scope, ["default", "service", "product"])),
  ],
  appointment: [
    chequeo("citas_commissionPercent_check", (f) => NULO_O_ENTRE(f.commissionPercent, 0, 100)),
    chequeo(
      "citas_comision_congelada_check",
      (f) =>
        (esNulo(f.commissionPercent) && esNulo(f.commissionAmount) && esNulo(f.commissionAt)) ||
        (noNulo(f.commissionPercent) && noNulo(f.commissionAmount) && noNulo(f.commissionAt))
    ),
    chequeo("citas_source_check", (f) => EN(f.source, ["panel", "reserva-publica"])),
    chequeo("citas_status_check", (f) =>
      EN(f.status, ["pendiente", "confirmada", "en-progreso", "completada", "cancelada", "no-asistio"])
    ),
    chequeo("citas_canceladaPor_check", (f) => O(esNulo(f.canceladaPor), EN(f.canceladaPor, ["cliente", "negocio"]))),
  ],
  service: [
    chequeo("servicios_frecuenciaDias_check", (f) => NULO_O_ENTRE(f.frecuenciaDias, 7, 365)),
    chequeo("servicios_duration_check", (f) => MAYOR(f.duration, 0)),
  ],
  customer: [
    chequeo("clientes_correoPromoConsentSource_check", (f) =>
      O(esNulo(f.correoPromoConsentSource), EN(f.correoPromoConsentSource, ["reserva-publica", "panel"]))
    ),
    chequeo("clientes_correoPromoConsent_coherente_check", (f) => esNulo(f.correoPromoConsentAt) === esNulo(f.correoPromoConsentSource)),
    chequeo("clientes_whatsappConsentSource_check", (f) =>
      O(esNulo(f.whatsappConsentSource), EN(f.whatsappConsentSource, ["reserva-publica", "panel", "importacion"]))
    ),
  ],
  workSchedule: [
    chequeo("horarios_laborales_dayOfWeek_check", (f) => ENTRE(f.dayOfWeek, 0, 6)),
    // `20261112120000_etapa_9_planes_y_sedes`: la franja de una sede exige "HH:MM" y inicio < fin; las sin sede no entran.
    chequeo("horarios_laborales_sede_horas_check", (f) =>
      O(esNulo(f.sedeId), Y(CALZA(f.startTime, HORA), CALZA(f.endTime, HORA), MENOR(f.startTime, f.endTime)))
    ),
  ],
  timeBlock: [chequeo("time_blocks_endTime_check", (f) => MAYOR(f.endTime, f.startTime))],
  business: [
    chequeo("negocios_liquidacionPeriodo_check", (f) => EN(f.liquidacionPeriodo, ["semanal", "quincenal", "mensual"])),
    chequeo("negocios_liquidacionInicioSemana_check", (f) => ENTRE(f.liquidacionInicioSemana, 0, 6)),
    chequeo("negocios_porConfirmarTrasFaltas_check", (f) => NULO_O_ENTRE(f.porConfirmarTrasFaltas, 1, 20)),
    chequeo("negocios_filaVirtualTope_check", (f) => ENTRE(f.filaVirtualTope, 1, 100)),
    chequeo("negocios_cancelacionHorasAntes_check", (f) => ENTRE(f.cancelacionHorasAntes, 0, 72)),
    chequeo("negocios_type_check", (f) => EN(f.type, ["salon", "barberia", "spa-de-unas", "odontologia", "salud", "fitness", "otro"])),
    // `20261112120000_etapa_9_planes_y_sedes`: los ids de `PLANES` (lib/planes.ts).
    chequeo("negocios_plan_check", (f) => EN(f.plan, ["independiente", "equipo"])),
  ],
  workerInvitation: [chequeo("invitaciones_role_check", (f) => EN(f.role, ["admin", "worker"]))],

  // ─── 20261006122500_tablero_de_atenciones, 20261030120000_etapa_4_reservas_seguras ─
  visit: [
    chequeo("atenciones_totalCents_check", (f) => NULO_O_ENTRE(f.totalCents, 0, TOPE)),
    chequeo("atenciones_status_check", (f) => EN(f.status, ["en-espera", "en-atencion", "por-cobrar", "finalizada", "anulada"])),
    chequeo("atenciones_origen_check", (f) => EN(f.origen, ["tablero", "fila"])),
    // Fuera de la fila, todas en null; dentro, token, día y número siempre presentes.
    chequeo("atenciones_fila_coherente_check", (f) =>
      O(
        Y(
          IGUAL(f.origen, "tablero"),
          esNulo(f.filaTokenHash),
          esNulo(f.filaEmail),
          esNulo(f.filaFecha),
          esNulo(f.filaNumero),
          esNulo(f.filaAvisadaAt)
        ),
        Y(IGUAL(f.origen, "fila"), noNulo(f.filaTokenHash), noNulo(f.filaFecha), noNulo(f.filaNumero))
      )
    ),
    chequeo("atenciones_filaFecha_check", (f) => O(esNulo(f.filaFecha), CALZA(f.filaFecha, FECHA))),
    chequeo("atenciones_filaNumero_check", (f) => O(esNulo(f.filaNumero), MAYOR_O_IGUAL(f.filaNumero, 1))),
  ],
  visitPayment: [
    chequeo("atencion_pagos_amountCents_check", (f) => Y(MAYOR(f.amountCents, 0), MAYOR_O_IGUAL(TOPE, f.amountCents))),
    chequeo("atencion_pagos_method_check", (f) => EN(f.method, MEDIOS_DE_PAGO)),
  ],

  // ─── 20261028120000_etapa_2_la_plata_del_equipo y las prótesis (7, 7b) ────
  visitService: [
    chequeo("atencion_servicios_priceCents_check", (f) => ENTRE(f.priceCents, 0, TOPE)),
    chequeo("atencion_servicios_tipo_check", (f) => EN(f.tipo, ["servicio", "producto"])),
    // Una línea de servicio no lleva producto, y una de producto no lleva servicio.
    chequeo("atencion_servicios_tipo_coherente_check", (f) =>
      Y(O(IGUAL(f.tipo, "producto"), esNulo(f.productId)), O(IGUAL(f.tipo, "servicio"), esNulo(f.serviceId)))
    ),
    chequeo("atencion_servicios_commissionPercent_check", (f) => NULO_O_ENTRE(f.commissionPercent, 0, 100)),
    chequeo("atencion_servicios_commissionCents_check", (f) =>
      O(esNulo(f.commissionCents), Y(MAYOR_O_IGUAL(f.commissionCents, 0), MAYOR_O_IGUAL(f.priceCents, f.commissionCents)))
    ),
    // Todo o nada: los tres null es "pendiente"; nunca un monto con el % en null.
    chequeo(
      "atencion_servicios_comision_congelada_check",
      (f) =>
        (esNulo(f.commissionPercent) && esNulo(f.commissionCents) && esNulo(f.commissionAt)) ||
        (noNulo(f.commissionPercent) && noNulo(f.commissionCents) && noNulo(f.commissionAt))
    ),
    chequeo("atencion_servicios_duena_sin_comision_check", (f) => NO(Y(SI(f.byOwner), noNulo(f.commissionAt)))),
    chequeo("atencion_servicios_protesis_check", (f) =>
      O(esNulo(f.protesisId), Y(IGUAL(f.tipo, "servicio"), esNulo(f.serviceId), esNulo(f.productId), esNulo(f.commissionAt)))
    ),
    // El reparto del abono: los tres juntos o ninguno, sólo en un abono, y suman lo abonado.
    chequeo("atencion_servicios_reparto_check", (f) =>
      O(
        esNulo(f.odontologoCents) && esNulo(f.clinicaCents) && esNulo(f.tecnicoCents),
        Y(
          noNulo(f.protesisId),
          noNulo(f.odontologoCents),
          noNulo(f.clinicaCents),
          noNulo(f.tecnicoCents),
          MAYOR_O_IGUAL(f.odontologoCents, 0),
          MAYOR_O_IGUAL(f.clinicaCents, 0),
          MAYOR_O_IGUAL(f.tecnicoCents, 0),
          IGUAL(suma(f.odontologoCents, f.clinicaCents, f.tecnicoCents), f.priceCents)
        )
      )
    ),
    chequeo("atencion_servicios_duena_sin_reparto_check", (f) => NO(Y(SI(f.byOwner), MAYOR(f.odontologoCents ?? 0, 0)))),
    chequeo("atencion_servicios_pago_al_laboratorio_check", (f) => esNulo(f.pagoAlLaboratorioId) || noNulo(f.tecnicoCents)),
    chequeo("atencion_servicios_abono_liquidado_check", (f) =>
      O(esNulo(f.protesisId), esNulo(f.liquidacionId), Y(noNulo(f.odontologoCents), NO(SI(f.byOwner))))
    ),
  ],
  producto: [
    chequeo("productos_priceCents_check", (f) => NULO_O_ENTRE(f.priceCents, 0, TOPE)),
    chequeo("productos_commissionPercent_check", (f) => NULO_O_ENTRE(f.commissionPercent, 0, 100)),
  ],
  // O de la dueña o de un miembro, nunca los dos ni ninguno; la de la dueña no entra a una liquidación.
  propinaDeAtencion: [
    chequeo("atencion_propinas_amountCents_check", (f) => Y(MAYOR(f.amountCents, 0), MAYOR_O_IGUAL(TOPE, f.amountCents))),
    chequeo("atencion_propinas_profesional_check", (f) =>
      O(Y(SI(f.byOwner), esNulo(f.memberId)), Y(NO(SI(f.byOwner)), noNulo(f.memberId)))
    ),
    chequeo("atencion_propinas_duena_sin_liquidacion_check", (f) => NO(Y(SI(f.byOwner), noNulo(f.liquidacionId)))),
  ],
  liquidacion: [
    chequeo("liquidaciones_periodo_check", (f) => EN(f.periodo, ["semanal", "quincenal", "mensual"])),
    chequeo("liquidaciones_rango_check", (f) => MAYOR_O_IGUAL(f.hasta, f.desde)),
    chequeo("liquidaciones_estado_check", (f) => EN(f.estado, ["cerrada", "pagada", "anulada"])),
    chequeo("liquidaciones_montos_check", (f) =>
      Y(
        ENTRE(f.comisionServiciosCents, 0, TOPE),
        ENTRE(f.comisionProductosCents, 0, TOPE),
        ENTRE(f.propinasCents, 0, TOPE),
        ENTRE(f.adelantosCents, 0, TOPE),
        ENTRE(f.ajustesCents, -TOPE, TOPE),
        ENTRE(f.brutoCents, 0, TOPE),
        ENTRE(f.totalCents, 0, TOPE)
      )
    ),
    chequeo("liquidaciones_comision_protesis_check", (f) => ENTRE(f.comisionProtesisCents, 0, TOPE)),
    // La versión de `20261108130000_etapa_7b_abonos_de_protesis`, con la comisión de las prótesis.
    chequeo("liquidaciones_bruto_check", (f) =>
      IGUAL(f.brutoCents, suma(f.comisionServiciosCents, f.comisionProductosCents, f.comisionProtesisCents, f.propinasCents))
    ),
    chequeo("liquidaciones_total_check", (f) =>
      IGUAL(f.totalCents, suma(f.brutoCents, nulo(f.adelantosCents) ? null : -(f.adelantosCents as number), f.ajustesCents))
    ),
    // El estado y su fecha van juntos.
    chequeo("liquidaciones_pagada_check", (f) => MISMO(IGUAL(f.estado, "pagada"), noNulo(f.pagadaAt))),
    chequeo("liquidaciones_anulada_check", (f) => MISMO(IGUAL(f.estado, "anulada"), noNulo(f.anuladaAt))),
  ],
  movimientoDeLiquidacion: [
    chequeo("movimientos_de_liquidacion_monto_check", (f) =>
      O(
        Y(EN(f.tipo, ["adelanto", "vale"]), MAYOR(f.montoCents, 0), MAYOR_O_IGUAL(TOPE, f.montoCents)),
        Y(IGUAL(f.tipo, "ajuste"), DISTINTO(f.montoCents, 0), ENTRE(f.montoCents, -TOPE, TOPE))
      )
    ),
    chequeo("movimientos_de_liquidacion_anulado_check", (f) => !(noNulo(f.anuladoAt) && noNulo(f.liquidacionId))),
  ],
  cierreDeCaja: [
    chequeo("cierres_de_caja_rango_check", (f) => MAYOR(f.hasta, f.desde)),
    chequeo("cierres_de_caja_montos_check", (f) =>
      Y(
        ENTRE(f.fondoInicialCents, 0, TOPE),
        ENTRE(f.efectivoCobradoCents, 0, TOPE),
        ENTRE(f.propinasEfectivoCents, 0, TOPE),
        ENTRE(f.efectivoContadoCents, 0, TOPE)
      )
    ),
    chequeo("cierres_de_caja_esperado_check", (f) =>
      IGUAL(f.efectivoEsperadoCents, suma(f.fondoInicialCents, f.efectivoCobradoCents, f.propinasEfectivoCents))
    ),
    chequeo("cierres_de_caja_diferencia_check", (f) =>
      IGUAL(f.diferenciaCents, suma(f.efectivoContadoCents, nulo(f.efectivoEsperadoCents) ? null : -(f.efectivoEsperadoCents as number)))
    ),
  ],

  // ─── 20261029120000_etapa_3_avisos_por_correo ─────────────────────────────
  inscripcionEnEspera: [
    chequeo("lista_de_espera_fecha_check", (f) => CALZA(f.fecha, FECHA)),
    chequeo("lista_de_espera_estado_check", (f) => EN(f.estado, ["activa", "reservo", "expirada", "salio"])),
    chequeo("lista_de_espera_avisos_check", (f) => MAYOR_O_IGUAL(f.avisos, 0)),
  ],
  envioAClientes: [
    chequeo("envios_a_clientes_tipo_check", (f) => EN(f.tipo, ["lista-de-espera", "te-toca", "resena", "contacto-manual"])),
    chequeo("envios_a_clientes_canal_check", (f) => EN(f.canal, ["correo", "whatsapp", "manual"])),
    chequeo("envios_a_clientes_categoria_check", (f) => EN(f.categoria, ["servicio", "promocional"])),
  ],

  // ─── 20261031120000_etapa_5_reservas_a_medida ─────────────────────────────
  appointmentService: [
    chequeo("cita_servicios_orden_check", (f) => ENTRE(f.orden, 1, 4)),
    chequeo("cita_servicios_duration_check", (f) => Y(MAYOR(f.duration, 0), MAYOR_O_IGUAL(1440, f.duration))),
    chequeo("cita_servicios_price_check", (f) => O(esNulo(f.price), MAYOR_O_IGUAL(f.price, 0))),
    chequeo("cita_servicios_serviceName_check", (f) => NO_VACIO(f.serviceName)),
  ],
  franjaDeHoraValle: [
    chequeo("franjas_de_hora_valle_dayOfWeek_check", (f) => ENTRE(f.dayOfWeek, 0, 6)),
    chequeo("franjas_de_hora_valle_desde_check", (f) => CALZA(f.desde, HORA)),
    chequeo("franjas_de_hora_valle_hasta_check", (f) => CALZA(f.hasta, HORA)),
    chequeo("franjas_de_hora_valle_orden_check", (f) => MENOR(f.desde, f.hasta)),
    chequeo("franjas_de_hora_valle_porcentaje_check", (f) => ENTRE(f.porcentaje, 5, 90)),
  ],

  // ─── 20261106120000_etapa_6_odontologia ───────────────────────────────────
  sillon: [
    chequeo("sillones_nombre_check", (f) => NOMBRE_LIMPIO(f.nombre, 1, Infinity)),
    chequeo("sillones_orden_check", (f) => ENTRE(f.orden, 0, 999)),
  ],
  fichaClinica: [
    chequeo("fichas_clinicas_prevision_check", (f) => O(esNulo(f.prevision), EN(f.prevision, ["fonasa", "isapre", "particular", "otra"]))),
    chequeo("fichas_clinicas_fechaNacimiento_check", (f) =>
      O(esNulo(f.fechaNacimiento), MAYOR_O_IGUAL(f.fechaNacimiento, new Date("1900-01-01T00:00:00.000Z")))
    ),
    // El odontograma y quién lo actualizó van juntos.
    chequeo("fichas_clinicas_odontograma_check", (f) => esNulo(f.odontogramaActualizadoEn) === esNulo(f.odontogramaActualizadoPor)),
    chequeo("fichas_clinicas_actualizadaPor_check", (f) => NO_VACIO(f.actualizadaPor)),
  ],
  marcaDental: [
    chequeo("odontograma_marcas_pieza_check", (f) => piezaFdi(f.pieza)),
    chequeo("odontograma_marcas_tipo_check", (f) =>
      EN(f.tipo, ["caries", "obturacion", "sellante", "corona", "endodoncia", "ausente", "extraccion"])
    ),
    chequeo("odontograma_marcas_cara_check", (f) => O(esNulo(f.cara), EN(f.cara, CARAS))),
    // Caries, obturación y sellante van en una cara; lo demás es de la pieza entera.
    chequeo("odontograma_marcas_tipo_y_cara_check", (f) => MISMO(EN(f.tipo, ["caries", "obturacion", "sellante"]), noNulo(f.cara))),
    chequeo("odontograma_marcas_cara_de_la_pieza_check", (f) =>
      Y(
        O(f.cara !== "P", EN(cuadrante(f.pieza), [1, 2, 5, 6])),
        O(f.cara !== "L", EN(cuadrante(f.pieza), [3, 4, 7, 8])),
        O(f.cara !== "I", ENTRE(posicion(f.pieza), 1, 3)),
        O(f.cara !== "O", ENTRE(posicion(f.pieza), 4, 8))
      )
    ),
  ],
  evolucion: [
    chequeo("evoluciones_texto_check", (f) => NO_VACIO(f.texto)),
    chequeo("evoluciones_autorNombre_check", (f) => NO_VACIO(f.autorNombre)),
  ],
  planDeTratamiento: [
    chequeo("planes_de_tratamiento_version_check", (f) => MAYOR_O_IGUAL(f.version, 1)),
    chequeo("planes_de_tratamiento_creadoPorNombre_check", (f) => NO_VACIO(f.creadoPorNombre)),
  ],
  etapaDelPlan: [
    chequeo("etapas_del_plan_estado_check", (f) => EN(f.estado, ["por-aprobar", "aprobada"])),
    chequeo("etapas_del_plan_orden_check", (f) => MAYOR_O_IGUAL(f.orden, 1)),
    chequeo("etapas_del_plan_nombre_check", (f) => NO_VACIO(f.nombre)),
    // No hay "aprobada" sin cuándo ni quién, ni al revés.
    chequeo("etapas_del_plan_aprobada_check", (f) =>
      Y(MISMO(IGUAL(f.estado, "aprobada"), noNulo(f.aprobadaEn)), esNulo(f.aprobadaEn) === esNulo(f.aprobadaPorNombre))
    ),
  ],
  prestacionDelPlan: [
    chequeo("prestaciones_del_plan_estado_check", (f) => EN(f.estado, ["por-agendar", "agendada", "realizada"])),
    chequeo("prestaciones_del_plan_orden_check", (f) => MAYOR_O_IGUAL(f.orden, 1)),
    chequeo("prestaciones_del_plan_nombre_check", (f) => NO_VACIO(f.nombre)),
    chequeo("prestaciones_del_plan_valorCents_check", (f) => ENTRE(f.valorCents, 0, TOPE)),
    chequeo("prestaciones_del_plan_pieza_check", (f) => O(esNulo(f.pieza), piezaFdi(f.pieza))),
    chequeo("prestaciones_del_plan_caras_check", (f) =>
      Y(noNulo(f.caras), MAYOR_O_IGUAL(5, CARDINALIDAD(f.caras)), DENTRO_DE(f.caras, CARAS))
    ),
    chequeo("prestaciones_del_plan_caras_con_pieza_check", (f) => O(noNulo(f.pieza), IGUAL(CARDINALIDAD(f.caras), 0))),
    chequeo("prestaciones_del_plan_caras_de_la_pieza_check", (f) =>
      Y(
        O(NO(TIENE(f.caras, "P")), EN(cuadrante(f.pieza), [1, 2, 5, 6])),
        O(NO(TIENE(f.caras, "L")), EN(cuadrante(f.pieza), [3, 4, 7, 8])),
        O(NO(TIENE(f.caras, "I")), ENTRE(posicion(f.pieza), 1, 3)),
        O(NO(TIENE(f.caras, "O")), ENTRE(posicion(f.pieza), 4, 8))
      )
    ),
    // "por-agendar" no tiene cita y "agendada" sí; "realizada" puede tenerla o no.
    chequeo("prestaciones_del_plan_cita_check", (f) =>
      Y(O(DISTINTO(f.estado, "por-agendar"), esNulo(f.appointmentId)), O(DISTINTO(f.estado, "agendada"), noNulo(f.appointmentId)))
    ),
    chequeo("prestaciones_del_plan_realizada_check", (f) => MISMO(IGUAL(f.estado, "realizada"), noNulo(f.realizadaEn))),
  ],

  // ─── 20261108120000_etapa_7_protesis y sus reemplazos (7c, 7d) ────────────
  laboratorio: [
    chequeo("laboratorios_nombre_check", (f) => NOMBRE_LIMPIO(f.nombre, 1, 80)),
    chequeo("laboratorios_contacto_check", (f) => O(esNulo(f.contacto), NOMBRE_LIMPIO(f.contacto, 1, 200))),
  ],
  materialDeProtesis: [
    chequeo("materiales_de_protesis_nombre_check", (f) => NOMBRE_LIMPIO(f.nombre, 1, 80)),
    chequeo("materiales_de_protesis_unidad_check", (f) => EN(f.unidad, ["arcada", "pieza"])),
    chequeo("materiales_de_protesis_tipos_check", (f) =>
      Y(
        noNulo(f.tipos),
        MAYOR_O_IGUAL(CARDINALIDAD(f.tipos), 1),
        O(
          Y(IGUAL(f.unidad, "arcada"), DENTRO_DE(f.tipos, ["removible", "total"])),
          Y(IGUAL(f.unidad, "pieza"), DENTRO_DE(f.tipos, ["fija", "implante", "corona"]))
        )
      )
    ),
    chequeo("materiales_de_protesis_precioCents_check", (f) => ENTRE(f.precioCents, 0, TOPE)),
    chequeo("materiales_de_protesis_reparto_check", (f) => repartoCompleto(f.pbOdontologo, f.pbClinica, f.pbTecnico)),
    chequeo("materiales_de_protesis_orden_check", (f) => ENTRE(f.orden, 0, 999)),
  ],
  excepcionDeRepartoDeProtesis: [
    chequeo("excepciones_de_reparto_de_protesis_reparto_check", (f) => repartoCompleto(f.pbOdontologo, f.pbClinica, f.pbTecnico)),
  ],
  cambioDeRepartoDeProtesis: [
    chequeo("cambios_de_reparto_de_protesis_scope_check", (f) => EN(f.scope, ["material", "excepcion"])),
    chequeo("cambios_de_reparto_de_protesis_miembro_check", (f) =>
      Y(MISMO(IGUAL(f.scope, "excepcion"), noNulo(f.memberName)), O(esNulo(f.memberId), IGUAL(f.scope, "excepcion")))
    ),
    chequeo("cambios_de_reparto_de_protesis_anterior_check", (f) => {
      const { vacio, lleno } = repartoOpcional(f.anteriorPbOdontologo, f.anteriorPbClinica, f.anteriorPbTecnico)
      return O(vacio, lleno)
    }),
    chequeo("cambios_de_reparto_de_protesis_nuevo_check", (f) => {
      const { vacio, lleno } = repartoOpcional(f.nuevoPbOdontologo, f.nuevoPbClinica, f.nuevoPbTecnico)
      return O(Y(vacio, IGUAL(f.scope, "excepcion")), lleno)
    }),
    chequeo("cambios_de_reparto_de_protesis_algo_cambia_check", (f) => noNulo(f.anteriorPbOdontologo) || noNulo(f.nuevoPbOdontologo)),
    chequeo("cambios_de_reparto_de_protesis_nombres_check", (f) => Y(NO_VACIO(f.materialNombre), NO_VACIO(f.changedByName))),
  ],
  protesis: [
    chequeo("protesis_tipo_check", (f) => EN(f.tipo, ["removible", "total", "fija", "implante", "corona"])),
    chequeo("protesis_arcada_check", (f) => EN(f.arcada, ["superior", "inferior", "ambas"])),
    chequeo("protesis_piezas_check", (f) =>
      Y(
        noNulo(f.piezas),
        noNulo(f.pilares),
        ENTRE(CARDINALIDAD(f.piezas), 1, 32),
        MAYOR_O_IGUAL(32, CARDINALIDAD(f.pilares)),
        DENTRO_DE(UNIDAS(f.piezas, f.pilares), [...SUPERIOR, ...INFERIOR]),
        NO(SOLAPA(f.piezas, lista(f.pilares) ?? []))
      )
    ),
    chequeo("protesis_piezas_de_la_arcada_check", (f) =>
      Y(
        O(DISTINTO(f.arcada, "superior"), DENTRO_DE(UNIDAS(f.piezas, f.pilares), SUPERIOR)),
        O(DISTINTO(f.arcada, "inferior"), DENTRO_DE(UNIDAS(f.piezas, f.pilares), INFERIOR)),
        O(DISTINTO(f.arcada, "ambas"), Y(SOLAPA(f.piezas, SUPERIOR), SOLAPA(f.piezas, INFERIOR)))
      )
    ),
    // La versión de `20261109120000_etapa_7c_protesis_por_tipo`: la arcada entera menos los cordales.
    chequeo("protesis_total_check", (f) =>
      O(
        DISTINTO(f.tipo, "total"),
        Y(
          IGUAL(CARDINALIDAD(f.pilares), 0),
          NO(SOLAPA(f.piezas, CORDALES)),
          O(IGUAL(f.arcada, "inferior"), CONTIENE(f.piezas, [11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26, 27])),
          O(IGUAL(f.arcada, "superior"), CONTIENE(f.piezas, [31, 32, 33, 34, 35, 36, 37, 41, 42, 43, 44, 45, 46, 47]))
        )
      )
    ),
    chequeo("protesis_corona_check", (f) =>
      O(DISTINTO(f.tipo, "corona"), Y(IGUAL(CARDINALIDAD(f.piezas), 1), IGUAL(CARDINALIDAD(f.pilares), 0), DISTINTO(f.arcada, "ambas")))
    ),
    chequeo("protesis_zonas_check", (f) =>
      Y(
        noNulo(f.zonas),
        MAYOR_O_IGUAL(5, CARDINALIDAD(f.zonas)),
        DENTRO_DE(f.zonas, ["paladar", "lingual", "flanco", "rebasado", "reparacion"]),
        O(EN(f.tipo, ["removible", "total"]), IGUAL(CARDINALIDAD(f.zonas), 0)),
        O(NO(TIENE(f.zonas, "paladar")), DISTINTO(f.arcada, "inferior")),
        O(NO(TIENE(f.zonas, "lingual")), DISTINTO(f.arcada, "superior"))
      )
    ),
    chequeo("protesis_unidad_check", (f) =>
      O(
        Y(IGUAL(f.unidad, "arcada"), EN(f.tipo, ["removible", "total"])),
        Y(IGUAL(f.unidad, "pieza"), EN(f.tipo, ["fija", "implante", "corona"]))
      )
    ),
    chequeo("protesis_unidades_check", (f) =>
      Y(
        O(DISTINTO(f.unidad, "arcada"), IGUAL(f.unidades, nulo(f.arcada) ? null : f.arcada === "ambas" ? 2 : 1)),
        O(DISTINTO(f.unidad, "pieza"), IGUAL(f.unidades, suma(CARDINALIDAD(f.piezas), CARDINALIDAD(f.pilares))))
      )
    ),
    chequeo("protesis_valor_check", (f) =>
      Y(
        ENTRE(f.precioUnitarioCents, 0, TOPE),
        ENTRE(f.valorCents, 0, TOPE),
        IGUAL(f.valorCents, nulo(f.precioUnitarioCents) || nulo(f.unidades) ? null : (f.precioUnitarioCents as number) * (f.unidades as number))
      )
    ),
    chequeo("protesis_reparto_check", (f) =>
      Y(repartoCompleto(f.pbOdontologo, f.pbClinica, f.pbTecnico), EN(f.origenDelReparto, ["material", "excepcion"]))
    ),
    // La dueña no es miembro: si es la tratante, sin `memberId` y con la regla del material.
    chequeo("protesis_tratante_check", (f) =>
      Y(O(NO(SI(f.byOwner)), Y(esNulo(f.memberId), IGUAL(f.origenDelReparto, "material"))), NO_VACIO(f.tratanteNombre))
    ),
    // La versión de la 7c: los pasos de cada tipo.
    chequeo("protesis_estado_check", (f) =>
      Y(
        EN(f.estado, ["impresion", "rodete", "enfilado", "prueba", "entregada", "anulada"]),
        O(NO(EN(f.estado, ["rodete", "enfilado"])), EN(f.tipo, ["removible", "total"])),
        O(DISTINTO(f.estado, "prueba"), EN(f.tipo, ["fija", "implante", "corona"]))
      )
    ),
    // El estado y sus fechas van juntos.
    chequeo("protesis_entregada_check", (f) => MISMO(IGUAL(f.estado, "entregada"), noNulo(f.entregadaEn))),
    chequeo("protesis_anulada_check", (f) =>
      Y(MISMO(IGUAL(f.estado, "anulada"), noNulo(f.anuladaEn)), esNulo(f.anuladaEn) === esNulo(f.anuladaPorNombre))
    ),
    chequeo("protesis_laboratorio_check", (f) => esNulo(f.laboratorioId) === esNulo(f.laboratorioNombre)),
    chequeo("protesis_nombres_check", (f) => Y(NO_VACIO(f.materialNombre), NO_VACIO(f.creadoPorNombre))),
    chequeo("protesis_entregaEstimada_check", (f) =>
      O(esNulo(f.entregaEstimada), MAYOR_O_IGUAL(f.entregaEstimada, new Date("2000-01-01T00:00:00.000Z")))
    ),
    chequeo("protesis_sin_cordales_check", (f) =>
      O(EN(f.estado, ["entregada", "anulada"]), NO(SOLAPA(UNIDAS(f.piezas, f.pilares), CORDALES)))
    ),
    chequeo("protesis_tono_check", (f) =>
      O(
        esNulo(f.tono),
        EN(f.tono, ["0M1", "0M2", "0M3", "A1", "A2", "A3", "A3.5", "A4", "B1", "B2", "B3", "B4", "C1", "C2", "C3", "C4", "D2", "D3", "D4"])
      )
    ),
    // `20261109130000_etapa_7d_protesis_entrega_con_laboratorio`.
    chequeo("protesis_entrega_con_laboratorio_check", (f) =>
      O(DISTINTO(f.estado, "entregada"), noNulo(f.laboratorioId), IGUAL(f.pbTecnico, 0))
    ),
  ],
  eventoDeProtesis: [
    chequeo("eventos_de_protesis_estado_check", (f) => EN(f.estado, ["impresion", "rodete", "enfilado", "prueba", "entregada", "anulada"])),
    chequeo("eventos_de_protesis_autorNombre_check", (f) => NO_VACIO(f.autorNombre)),
  ],
  pagoAlLaboratorio: [
    chequeo("pagos_al_laboratorio_montoCents_check", (f) => Y(MAYOR(f.montoCents, 0), MAYOR_O_IGUAL(TOPE, f.montoCents))),
    chequeo("pagos_al_laboratorio_medio_check", (f) => EN(f.medio, MEDIOS_DE_PAGO)),
    chequeo("pagos_al_laboratorio_anulado_check", (f) => esNulo(f.anuladoEn) === esNulo(f.anuladoPorNombre)),
    chequeo("pagos_al_laboratorio_nombres_check", (f) => Y(NO_VACIO(f.laboratorioNombre), NO_VACIO(f.pagadoPorNombre))),
  ],

  // ─── 20261112120000_etapa_9_planes_y_sedes ────────────────────────────────
  // Los textos recortados y con su largo, el teléfono E.164 y el orden, en un
  // solo CHECK como en la migración.
  sede: [
    chequeo("sedes_texto_check", (f) =>
      Y(
        NOMBRE_LIMPIO(f.nombre, 1, 40),
        NOMBRE_LIMPIO(f.direccion, 1, 200),
        NOMBRE_LIMPIO(f.comuna, 1, 80),
        O(esNulo(f.telefono), CALZA(f.telefono, TELEFONO_E164)),
        ENTRE(f.orden, 0, 999)
      )
    ),
  ],
}

/** El primer CHECK que la fila no cumple (falso; desconocido pasa), o `undefined`. */
export function chequeoQueFalla(modelo: NombreDeModelo, fila: Registro): Chequeo | undefined {
  return (CHEQUEOS[modelo] ?? []).find((chequeo) => chequeo.cumple(fila) === false)
}
