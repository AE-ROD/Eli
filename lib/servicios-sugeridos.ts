import type { RubroId } from "./rubros"

/**
 * Los servicios que Eli sugiere cargar de una vez, según el rubro del negocio:
 * los que hace casi todo local de ese oficio, con duración y precio de
 * referencia en pesos chilenos (2026). Son una lista para marcar y editar, no
 * una verdad: cada negocio ajusta el precio y la duración a la suya.
 *
 * Los nombres salen de lo que se ofrece en una peluquería, una barbería, un
 * salón de uñas y una clínica dental (docs/PRODUCTO.md, `lib/ejemplos-por-rubro.ts`).
 * Los seis de cada rubro con que nace un negocio (`lib/servicios-de-ejemplo.ts`)
 * van aquí con el mismo nombre, la misma categoría y los mismos números: quien
 * los tiene los ve como "ya existe", y ninguno aparece con otra grafía.
 *
 * Duración en minutos, entera y dentro de lo que acepta `duracion()`
 * (`lib/campos-del-panel.ts`); precio en pesos, como `Service.price`. Todos son
 * precios de lista: un servicio gratis no se sugiere.
 *
 * En una clínica dental, los servicios son los "motivos" de la reserva
 * (`lib/vocabulario.ts`), y uno es urgencia (`esUrgencia`). Una carga masiva
 * nunca marca urgencias (`ServicioParaCargar` no la lleva): quien agrega ese
 * sugerido lo marca después en el servicio.
 */
export interface ServicioSugerido {
  /** Identifica al sugerido en la pantalla (la casilla marcada). Estable: no cambia aunque se corrija el nombre. */
  clave: string
  name: string
  duration: number
  price: number
  category: string
  /** Sólo el motivo de urgencia de la clínica dental; los demás lo dejan fuera. */
  esUrgencia?: boolean
}

type Fila = readonly [clave: string, name: string, duration: number, price: number, category: string]

const aServicios = (filas: readonly Fila[]): readonly ServicioSugerido[] =>
  Object.freeze(filas.map(([clave, name, duration, price, category]) => Object.freeze({ clave, name, duration, price, category })))

const SALON = aServicios([
  // Corte
  ["corte-de-pelo", "Corte de pelo", 45, 15000, "Corte"],
  ["corte-de-puntas", "Corte de puntas", 30, 10000, "Corte"],
  ["corte-de-flequillo", "Corte de flequillo", 15, 5000, "Corte"],
  ["corte-infantil", "Corte infantil", 30, 9000, "Corte"],
  ["corte-y-brushing", "Corte y brushing", 75, 25000, "Corte"],
  ["lavado-y-secado", "Lavado y secado", 30, 8000, "Corte"],
  // Peinado
  ["brushing", "Brushing", 45, 12000, "Peinado"],
  ["ondas-o-rizos", "Ondas o rizos con tenaza", 45, 14000, "Peinado"],
  ["planchado", "Planchado", 45, 10000, "Peinado"],
  ["peinado-recogido", "Peinado recogido", 60, 22000, "Peinado"],
  ["peinado-de-fiesta", "Peinado de fiesta", 60, 25000, "Peinado"],
  ["peinado-de-novia", "Peinado de novia", 120, 60000, "Peinado"],
  // Color
  ["tintura-completa", "Tintura completa", 120, 35000, "Color"],
  ["retoque-de-raiz", "Retoque de raíz", 90, 25000, "Color"],
  ["mechas-o-balayage", "Mechas o balayage", 180, 60000, "Color"],
  ["cobertura-de-canas", "Cobertura de canas", 90, 28000, "Color"],
  ["matiz-o-tonalizacion", "Matiz o tonalización", 60, 20000, "Color"],
  ["bano-de-color", "Baño de color", 60, 22000, "Color"],
  ["decoloracion", "Decoloración", 150, 45000, "Color"],
  ["babylights", "Babylights", 210, 75000, "Color"],
  ["color-fantasia", "Color fantasía", 180, 70000, "Color"],
  // Tratamientos
  ["tratamiento-de-hidratacion", "Tratamiento de hidratación", 45, 18000, "Tratamientos"],
  ["botox-capilar", "Botox capilar", 90, 40000, "Tratamientos"],
  ["cauterizacion-capilar", "Cauterización capilar", 90, 35000, "Tratamientos"],
  ["alisado-de-keratina", "Alisado de keratina", 150, 60000, "Tratamientos"],
  ["alisado-progresivo", "Alisado progresivo", 180, 70000, "Tratamientos"],
  ["nanoplastia", "Nanoplastia", 180, 80000, "Tratamientos"],
  ["tratamiento-anticaida", "Tratamiento anticaída", 60, 30000, "Tratamientos"],
])

const BARBERIA = aServicios([
  // Corte
  ["corte-de-pelo", "Corte de pelo", 30, 10000, "Corte"],
  ["corte-degradado", "Corte degradado", 45, 12000, "Corte"],
  ["corte-con-tijera", "Corte con tijera", 45, 13000, "Corte"],
  ["corte-infantil", "Corte infantil", 30, 8000, "Corte"],
  ["corte-de-adulto-mayor", "Corte de adulto mayor", 30, 8000, "Corte"],
  ["corte-con-diseno", "Corte con diseño", 60, 15000, "Corte"],
  ["corte-a-una-medida", "Corte a una medida", 15, 6000, "Corte"],
  ["lavado-de-cabello", "Lavado de cabello", 15, 3000, "Corte"],
  // Barba
  ["perfilado-de-barba", "Perfilado de barba", 30, 7000, "Barba"],
  ["afeitado-clasico", "Afeitado clásico con toalla caliente", 45, 10000, "Barba"],
  ["afeitado-de-cabeza", "Afeitado de cabeza", 30, 9000, "Barba"],
  ["ritual-de-barba", "Ritual de barba con vapor", 45, 12000, "Barba"],
  ["hidratacion-de-barba", "Hidratación de barba", 30, 8000, "Barba"],
  ["recorte-de-bigote", "Recorte de bigote", 15, 4000, "Barba"],
  // Corte y barba
  ["corte-y-barba", "Corte y barba", 60, 15000, "Corte y barba"],
  ["degradado-y-barba", "Degradado y barba", 75, 18000, "Corte y barba"],
  ["corte-barba-y-cejas", "Corte, barba y cejas", 75, 18000, "Corte y barba"],
  ["corte-padre-e-hijo", "Corte padre e hijo", 75, 20000, "Corte y barba"],
  // Color
  ["cobertura-de-canas", "Cobertura de canas", 45, 12000, "Color"],
  ["tinte-de-barba", "Tinte de barba", 30, 9000, "Color"],
  ["claritos", "Claritos", 120, 35000, "Color"],
  ["decoloracion-y-platinado", "Decoloración y platinado", 150, 50000, "Color"],
  // Extras
  ["perfilado-de-cejas", "Perfilado de cejas", 15, 4000, "Extras"],
  ["depilacion-de-nariz-y-orejas", "Depilación de nariz y orejas", 15, 4000, "Extras"],
  ["masaje-capilar", "Masaje capilar", 15, 5000, "Extras"],
  ["limpieza-facial-express", "Limpieza facial express", 30, 10000, "Extras"],
  ["mascarilla-facial", "Mascarilla de limpieza facial", 30, 8000, "Extras"],
])

const SPA_DE_UNAS = aServicios([
  // Manos
  ["manicure-tradicional", "Manicure tradicional", 45, 10000, "Manos"],
  ["manicure-express", "Manicure express", 30, 8000, "Manos"],
  ["manicure-francesa", "Manicure francesa", 75, 18000, "Manos"],
  ["esmaltado-permanente", "Esmaltado permanente", 60, 15000, "Manos"],
  ["manicure-con-esmaltado-permanente", "Manicure con esmaltado permanente", 90, 20000, "Manos"],
  ["esmaltado-tradicional", "Esmaltado tradicional", 30, 6000, "Manos"],
  ["unas-acrilicas", "Uñas acrílicas", 120, 30000, "Manos"],
  ["relleno-de-acrilicas", "Relleno de acrílicas", 90, 20000, "Manos"],
  ["unas-polygel", "Uñas polygel", 120, 32000, "Manos"],
  ["relleno-de-polygel", "Relleno de polygel", 90, 22000, "Manos"],
  ["unas-soft-gel", "Uñas soft gel", 120, 30000, "Manos"],
  ["relleno-de-soft-gel", "Relleno de soft gel", 90, 20000, "Manos"],
  ["base-rubber", "Base rubber", 60, 18000, "Manos"],
  // Pies
  ["pedicure-tradicional", "Pedicure tradicional", 60, 15000, "Pies"],
  ["pedicure-con-esmaltado-permanente", "Pedicure con esmaltado permanente", 90, 22000, "Pies"],
  ["pedicure-spa", "Pedicure spa", 75, 20000, "Pies"],
  ["pedicure-clinico", "Pedicure clínico", 75, 25000, "Pies"],
  ["esmaltado-permanente-de-pies", "Esmaltado permanente de pies", 45, 12000, "Pies"],
  ["tratamiento-de-unas-encarnadas", "Tratamiento de uñas encarnadas", 45, 15000, "Pies"],
  ["manicure-y-pedicure", "Manicure y pedicure tradicional", 105, 25000, "Pies"],
  // Extras
  ["retiro-de-esmaltado-permanente", "Retiro de esmaltado permanente", 15, 5000, "Extras"],
  ["retiro-de-acrilico-polygel-o-gel", "Retiro de acrílico, polygel o soft gel", 45, 10000, "Extras"],
  ["diseno-de-unas", "Diseño de uñas", 30, 6000, "Extras"],
  ["decoracion-con-piedras", "Decoración con piedras", 15, 3000, "Extras"],
  ["reparacion-de-una-una", "Reparación de una uña", 15, 3000, "Extras"],
  ["parafina", "Parafina para manos o pies", 30, 8000, "Extras"],
  ["masaje-de-manos-o-pies", "Masaje de manos o pies", 15, 5000, "Extras"],
])

const ODONTOLOGIA: readonly ServicioSugerido[] = Object.freeze([
  ...aServicios([
    // Diagnóstico
    ["evaluacion-primera-consulta", "Evaluación / primera consulta", 30, 20000, "Diagnóstico"],
    ["control", "Control", 15, 10000, "Diagnóstico"],
    ["radiografia-retroalveolar", "Radiografía retroalveolar", 15, 8000, "Diagnóstico"],
    ["radiografia-panoramica", "Radiografía panorámica", 15, 25000, "Diagnóstico"],
    // Prevención
    ["limpieza-y-destartraje", "Limpieza y destartraje", 45, 35000, "Prevención"],
    ["aplicacion-de-fluor", "Aplicación de flúor", 15, 15000, "Prevención"],
    ["sellantes", "Sellantes de fosas y fisuras", 30, 18000, "Prevención"],
    ["limpieza-infantil", "Limpieza infantil", 30, 25000, "Prevención"],
    // Restauraciones
    ["restauracion-con-resina", "Restauración con resina", 45, 45000, "Restauraciones"],
    ["restauracion-estetica", "Restauración estética de pieza anterior", 60, 65000, "Restauraciones"],
    ["reconstruccion-con-poste", "Reconstrucción de pieza con poste", 60, 90000, "Restauraciones"],
    ["reparacion-de-fractura", "Reparación de fractura dental", 45, 50000, "Restauraciones"],
    // Endodoncia
    ["endodoncia", "Endodoncia", 90, 150000, "Endodoncia"],
    ["endodoncia-de-molar", "Endodoncia de molar", 120, 220000, "Endodoncia"],
    ["retratamiento-de-endodoncia", "Retratamiento de endodoncia", 120, 240000, "Endodoncia"],
    // Cirugía
    ["exodoncia-simple", "Exodoncia simple", 45, 40000, "Cirugía"],
    ["exodoncia-quirurgica", "Exodoncia quirúrgica", 60, 80000, "Cirugía"],
    ["exodoncia-de-muela-del-juicio", "Exodoncia de muela del juicio", 60, 100000, "Cirugía"],
    // Estética
    ["blanqueamiento-dental", "Blanqueamiento dental", 60, 120000, "Estética"],
    ["carilla-de-resina", "Carilla de resina", 60, 90000, "Estética"],
    // Rehabilitación
    ["corona-de-porcelana", "Corona de porcelana", 60, 280000, "Rehabilitación"],
    ["protesis-removible-parcial", "Prótesis removible parcial", 45, 250000, "Rehabilitación"],
    ["reparacion-de-protesis", "Reparación de prótesis", 30, 40000, "Rehabilitación"],
    // Ortodoncia
    ["evaluacion-de-ortodoncia", "Evaluación de ortodoncia", 30, 25000, "Ortodoncia"],
    ["instalacion-de-brackets", "Instalación de brackets", 90, 450000, "Ortodoncia"],
    ["control-de-ortodoncia", "Control de ortodoncia", 30, 30000, "Ortodoncia"],
    // Periodoncia
    ["raspado-y-alisado-radicular", "Raspado y alisado radicular", 60, 70000, "Periodoncia"],
  ]),
  // Urgencias: la reserva pública sólo ofrece horas de hoy para ella.
  Object.freeze({ clave: "urgencia-dental", name: "Urgencia dental", duration: 30, price: 30000, category: "Urgencias", esUrgencia: true }),
])

/** Para cualquier otro rubro: nada que suene a un oficio. */
const NEUTROS = aServicios([
  ["consulta", "Consulta", 30, 20000, "Consultas"],
  ["evaluacion-inicial", "Evaluación inicial", 45, 25000, "Consultas"],
  ["control-o-seguimiento", "Control o seguimiento", 30, 15000, "Consultas"],
  ["sesion", "Sesión", 60, 30000, "Sesiones"],
  ["sesion-de-30-minutos", "Sesión de 30 minutos", 30, 18000, "Sesiones"],
  ["sesion-doble", "Sesión doble", 120, 55000, "Sesiones"],
  ["atencion-a-domicilio", "Atención a domicilio", 60, 35000, "Extras"],
  ["asesoria-o-presupuesto", "Asesoría o presupuesto", 30, 15000, "Extras"],
])

const SUGERIDOS_POR_RUBRO: Record<RubroId, readonly ServicioSugerido[]> = {
  salon: SALON,
  barberia: BARBERIA,
  "spa-de-unas": SPA_DE_UNAS,
  odontologia: ODONTOLOGIA,
}

/**
 * Los servicios sugeridos del rubro. Recibe el rubro tal como llega de la
 * sesión: texto, `null`, `undefined` o un id que el catálogo ya no conoce (los
 * viejos `salud`, `fitness` y `otro`), y ésos reciben los neutros. Compara con
 * el id exacto (`Object.hasOwn`): `constructor` o `__proto__` no son un rubro.
 *
 * Es la misma lista congelada en cada llamada: quien la recibe no puede
 * cambiarla (copia lo que necesite).
 */
export function serviciosSugeridosDe(rubro: string | null | undefined): readonly ServicioSugerido[] {
  return typeof rubro === "string" && Object.hasOwn(SUGERIDOS_POR_RUBRO, rubro) ? SUGERIDOS_POR_RUBRO[rubro as RubroId] : NEUTROS
}
