import { esRubroDental } from "@/lib/rubros"

/**
 * Las palabras de la interfaz que cambian con el rubro (docs/PRODUCTO.md,
 * sección 1, "Vocabulario"). Sólo la clínica dental habla distinto: dice
 * "pacientes", "sala de espera", "odontólogo" y "motivo". Cualquier otro
 * rubro, uno desconocido o ninguno (una sesión de antes del rubro) usa las
 * palabras de siempre, así que en un salón no aparece nunca "paciente".
 *
 * Todas van en minúscula, como van en medio de una frase; para un título o un
 * menú, `conMayuscula`. Cuidado con el artículo: "el tablero", pero "la sala
 * de espera".
 *
 * El rubro sale de la sesión (`session.user.rubro`) o del negocio
 * (`Business.type`). Qué se muestra o no lo decide `lib/permisos.ts`; esto
 * sólo cambia palabras.
 */
export interface Vocabulario {
  /** "clientes" / "pacientes": la sección y la lista. */
  clientes: string
  /** "cliente" / "paciente". */
  cliente: string
  /** "tablero" / "sala de espera": la sección de quienes ya llegaron. */
  tablero: string
  /** "profesional" / "odontólogo": quien atiende. */
  profesional: string
  /** "profesionales" / "odontólogos". */
  profesionales: string
  /** "servicio" / "motivo": lo que se elige en la reserva pública. */
  servicioDeLaReserva: string
}

const DE_SIEMPRE: Vocabulario = {
  clientes: "clientes",
  cliente: "cliente",
  tablero: "tablero",
  profesional: "profesional",
  profesionales: "profesionales",
  servicioDeLaReserva: "servicio",
}

const DE_LA_CLINICA_DENTAL: Vocabulario = {
  clientes: "pacientes",
  cliente: "paciente",
  tablero: "sala de espera",
  profesional: "odontólogo",
  profesionales: "odontólogos",
  servicioDeLaReserva: "motivo",
}

/**
 * Las palabras para el rubro. Compara con el id exacto (`esRubroDental`) y no
 * busca en un objeto indexado por rubro, como `nombreDeRubro`: un rubro como
 * `constructor` no puede traer otra cosa que las palabras de siempre. Copia
 * nueva en cada llamada: quien la recibe no cambia la de los demás.
 */
export function vocabularioDe(rubro: string | null | undefined): Vocabulario {
  return { ...(esRubroDental(rubro) ? DE_LA_CLINICA_DENTAL : DE_SIEMPRE) }
}

/** "sala de espera" → "Sala de espera": para títulos, menús y comienzos de frase. */
export function conMayuscula(texto: string): string {
  return texto.charAt(0).toLocaleUpperCase("es-CL") + texto.slice(1)
}
