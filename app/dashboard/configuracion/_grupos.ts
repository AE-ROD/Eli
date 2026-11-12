/**
 * Cómo se agrupan las secciones de Configuración, sin pantalla: qué sección va
 * en qué grupo, cómo se llama y se resume cada grupo, qué grupo abre un ancla
 * de la URL (`/dashboard/configuracion#servicios`) y cuál se abre al entrar.
 *
 * Qué secciones ve cada rol y cada rubro lo decide `page.tsx` con
 * `lib/permisos.ts`; acá sólo se recibe lo que ya es visible. Un grupo sin
 * ninguna sección visible no existe: no se muestra ni cuenta como "el primero".
 */

import type { Vocabulario } from "@/lib/vocabulario"

/**
 * Las doce secciones, por su ancla: el `id` del elemento al que llevan los
 * enlaces de otras pantallas (`#horario`, `#servicios`, `#sillones`…).
 */
export type AnclaDeConfiguracion =
  | "horario"
  | "mi-foto"
  | "pagina"
  | "servicios"
  | "sillones"
  | "laboratorios"
  | "productos"
  | "plazo-de-cambios"
  | "por-confirmar"
  | "hora-valle"
  | "mensajes"
  | "fila-virtual"

export type IdDeGrupo = "horario-y-equipo" | "tu-negocio" | "catalogo-y-clinica" | "reservas-y-clientes" | "mensajes"

/** Cómo se nombra cada sección en la línea que resume su grupo. */
export const NOMBRE_DE_SECCION: Readonly<Record<AnclaDeConfiguracion, string>> = {
  horario: "Horario",
  "mi-foto": "Mi foto",
  pagina: "Página pública",
  servicios: "Servicios",
  sillones: "Sillones",
  laboratorios: "Laboratorios",
  productos: "Productos",
  "plazo-de-cambios": "Cancelar o reagendar",
  "por-confirmar": "Reservas por confirmar",
  "hora-valle": "Precios de hora valle",
  mensajes: "Mensajes a clientes",
  "fila-virtual": "Fila virtual",
}

/**
 * Los grupos, en el orden en que se muestran, y las secciones de cada uno,
 * también en su orden. Toda sección está en exactamente un grupo.
 */
export const GRUPOS: readonly { id: IdDeGrupo; secciones: readonly AnclaDeConfiguracion[] }[] = [
  { id: "horario-y-equipo", secciones: ["horario", "mi-foto"] },
  { id: "tu-negocio", secciones: ["pagina", "productos"] },
  { id: "catalogo-y-clinica", secciones: ["servicios", "sillones", "laboratorios"] },
  { id: "reservas-y-clientes", secciones: ["plazo-de-cambios", "por-confirmar", "hora-valle", "fila-virtual"] },
  { id: "mensajes", secciones: ["mensajes"] },
]

/** Sólo existen en una clínica dental: sin ellas, el grupo no habla de "clínica". */
const SECCIONES_DE_CLINICA: readonly AnclaDeConfiguracion[] = ["sillones", "laboratorios"]

/**
 * El título de un grupo. "Reservas y clientes" dice "pacientes" en una
 * clínica dental (`vocabularioDe`), y "Catálogo y clínica" se queda en
 * "Catálogo" cuando no hay nada de clínica que mostrar (un salón no tiene
 * sillones ni laboratorios).
 */
function tituloDelGrupo(id: IdDeGrupo, visibles: readonly AnclaDeConfiguracion[], vocabulario: Pick<Vocabulario, "clientes">): string {
  switch (id) {
    case "horario-y-equipo":
      return "Horario y equipo"
    case "tu-negocio":
      return "Tu negocio"
    case "catalogo-y-clinica":
      return visibles.some((ancla) => SECCIONES_DE_CLINICA.includes(ancla)) ? "Catálogo y clínica" : "Catálogo"
    case "reservas-y-clientes":
      return `Reservas y ${vocabulario.clientes}`
    case "mensajes":
      return "Mensajes"
  }
}

/** Un grupo con al menos una sección visible, listo para mostrarse. */
export interface GrupoDeConfiguracion<T extends { id: AnclaDeConfiguracion }> {
  id: IdDeGrupo
  titulo: string
  /** Las secciones que contiene, separadas por "·": "Página pública · Productos". */
  resumen: string
  /** Sólo las visibles, en el orden del grupo (no en el de entrada). */
  secciones: T[]
}

/**
 * Reparte las secciones visibles en sus grupos. Un grupo sin ninguna se
 * omite. Las secciones de cada grupo salen en el orden de `GRUPOS`, sin
 * importar en qué orden lleguen.
 */
export function agruparSecciones<T extends { id: AnclaDeConfiguracion }>(
  visibles: readonly T[],
  vocabulario: Pick<Vocabulario, "clientes">
): GrupoDeConfiguracion<T>[] {
  const grupos: GrupoDeConfiguracion<T>[] = []
  for (const grupo of GRUPOS) {
    const secciones = grupo.secciones.flatMap((ancla) => visibles.filter((seccion) => seccion.id === ancla))
    if (secciones.length === 0) continue
    const anclas = secciones.map((seccion) => seccion.id)
    grupos.push({
      id: grupo.id,
      titulo: tituloDelGrupo(grupo.id, anclas, vocabulario),
      resumen: anclas.map((ancla) => NOMBRE_DE_SECCION[ancla]).join(" · "),
      secciones,
    })
  }
  return grupos
}

/**
 * El ancla de un `location.hash`: sin el `#` y decodificada. `null` si no hay
 * ninguna (`""`, `"#"`).
 */
export function anclaDelHash(hash: string): string | null {
  const sinAlmohadilla = hash.startsWith("#") ? hash.slice(1) : hash
  if (sinAlmohadilla === "") return null
  try {
    return decodeURIComponent(sinAlmohadilla)
  } catch {
    // Un `%` suelto no se puede decodificar: no será el ancla de ninguna sección.
    return sinAlmohadilla
  }
}

/**
 * El grupo que contiene la sección a la que apunta el hash, o `null` si el
 * hash no apunta a ninguna sección visible: vacío, desconocido, o de una
 * sección que este rol o rubro no ve (`#sillones` en un salón).
 */
export function grupoDeAncla(
  hash: string,
  grupos: readonly { id: IdDeGrupo; secciones: readonly { id: string }[] }[]
): IdDeGrupo | null {
  const ancla = anclaDelHash(hash)
  if (ancla === null) return null
  return grupos.find((grupo) => grupo.secciones.some((seccion) => seccion.id === ancla))?.id ?? null
}

/**
 * Los grupos abiertos al entrar, antes de mirar la URL: sólo el primero con
 * algo que mostrar. El del ancla se suma después, al leer el hash.
 */
export function gruposAbiertosAlEntrar(grupos: readonly { id: IdDeGrupo }[]): IdDeGrupo[] {
  return grupos.length > 0 ? [grupos[0].id] : []
}
