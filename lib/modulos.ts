/**
 * Los módulos del panel tal como los presenta la interfaz: el menú de la
 * landing, el recorrido y los íconos leen de acá, así que el nombre, la frase
 * y el color de cada módulo se cambian en un solo lugar.
 *
 * Cada módulo tiene su pastel (`color`): fuerte para el ícono activo, suave
 * para fondos y para el halo del foco en las pantallas de ese módulo. Los
 * colores no se repiten: son lo que distingue a un módulo de otro de un
 * vistazo. Las clases de cada color viven en `app/globals.css`.
 *
 * Las frases describen sólo lo que el producto hace hoy (`docs/PRODUCTO.md`):
 * nada de elegir profesional al reservar ni de comisiones calculadas solas.
 */

export type ModuloId = "agenda" | "tablero" | "clientes" | "reportes" | "equipo"

export type ColorDeModulo = "azul" | "naranja" | "lila" | "lima" | "turquesa"

export interface Modulo {
  id: ModuloId
  nombre: string
  descripcion: string
  /** La pantalla del panel donde vive el módulo. */
  ruta: string
  color: ColorDeModulo
}

/** En el orden en que se muestran: el del día de trabajo, de la cita al equipo. */
export const MODULOS: readonly Modulo[] = [
  {
    id: "agenda",
    nombre: "Agenda",
    descripcion: "Citas por profesional, día y hora.",
    ruta: "/dashboard/agenda",
    color: "azul",
  },
  {
    id: "tablero",
    nombre: "Tablero",
    descripcion: "El día en columnas, de la llegada al cobro.",
    ruta: "/dashboard/tablero",
    color: "naranja",
  },
  {
    id: "clientes",
    nombre: "Clientes",
    descripcion: "Datos, notas e historial de cada visita.",
    ruta: "/dashboard/clientes",
    color: "lila",
  },
  {
    id: "reportes",
    nombre: "Reportes",
    descripcion: "Lo cobrado por día, turno, profesional o medio de pago.",
    ruta: "/dashboard/reportes",
    color: "lima",
  },
  {
    id: "equipo",
    nombre: "Equipo",
    descripcion: "Dueño, encargado y profesionales, con su rol.",
    ruta: "/dashboard/equipo",
    color: "turquesa",
  },
]

/**
 * El módulo de un id. Busca con `find` y no en un objeto indexado: un id como
 * `constructor`, colado con un cast, devolvería una función del prototipo en
 * vez de fallar. Con el tipo `ModuloId` no puede faltar ninguno; si falta, es
 * un error de programación y se avisa en vez de seguir con un hueco.
 */
export function moduloPorId(id: ModuloId): Modulo {
  const modulo = MODULOS.find((candidato) => candidato.id === id)
  if (!modulo) throw new Error(`No hay un módulo con el id "${id}"`)
  return modulo
}
