import { descripcionDePlan, nombreDePlan, type PlanId } from "@/lib/planes"
import {
  DIAS_DE_PRUEBA,
  formatearPesos,
  PERSONAS_INCLUIDAS_EQUIPO,
  PRECIO_EQUIPO,
  PRECIO_INDEPENDIENTE,
  PRECIO_PERSONA_ADICIONAL,
} from "@/lib/precios"
import { MAX_SEDES } from "@/lib/sedes"
import type { PalabrasDelRubro } from "@/lib/vocabulario"

/** Lo que dice la tarjeta de un plan al elegirlo. Todo sale de `lib/`: nada de montos ni topes escritos a mano. */
export interface DetalleDePlan {
  nombre: string
  /** "Trabajas por tu cuenta" / "Tienes una clínica o un equipo". */
  descripcion: string
  /** Lo que cuesta al mes, con IVA incluido y sin adicionales: `$9.990`. */
  precio: string
  /** Tres líneas con lo que el plan permite y lo que no. */
  vinetas: readonly string[]
}

/** La prueba es la misma en los dos planes y empieza al crear el negocio (`lib/precios.ts`). */
export const NOTA_DE_LA_PRUEBA = `Prueba ${DIAS_DE_PRUEBA} días gratis, sin tarjeta, contados desde que creas tu negocio.`

/**
 * El nombre, el precio y las tres viñetas de cada plan, con las palabras del
 * rubro ya elegido (`vocabularioDe(rubro).palabras`): en una clínica el equipo
 * son "tus odontólogos" y la sede, "tu clínica"; sin rubro, las palabras
 * neutras ("tus profesionales", "tu negocio").
 *
 * Independiente atiende una sola persona, puede tener varias sedes y no
 * invita a nadie; Equipo incluye `PERSONAS_INCLUIDAS_EQUIPO` personas, invita y
 * tiene una sola sede, la del negocio (`lib/planes.ts`).
 */
export function detalleDePlan(plan: PlanId, palabras: PalabrasDelRubro): DetalleDePlan {
  const nombre = nombreDePlan(plan)
  const descripcion = descripcionDePlan(plan)

  if (plan === "independiente") {
    return {
      nombre,
      descripcion,
      precio: formatearPesos(PRECIO_INDEPENDIENTE),
      vinetas: [
        "Atiendes tú: eres la única persona que atiende",
        `Hasta ${MAX_SEDES} sedes, cada una con su horario por día`,
        "Sin equipo: no puedes invitar a nadie",
      ],
    }
  }

  return {
    nombre,
    descripcion,
    precio: formatearPesos(PRECIO_EQUIPO),
    vinetas: [
      `Incluye ${PERSONAS_INCLUIDAS_EQUIPO} personas que atienden, y +${formatearPesos(PRECIO_PERSONA_ADICIONAL)} al mes por cada una más`,
      `Invita a tus ${palabras.profesional.plural}`,
      `Una sola sede: la dirección de tu ${palabras.negocio.singular}`,
    ],
  }
}
