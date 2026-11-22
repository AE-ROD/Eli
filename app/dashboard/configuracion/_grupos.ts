/**
 * Cómo se agrupan las secciones de Configuración, sin pantalla: qué sección va
 * en qué grupo, cómo se llama y se resume cada grupo, qué grupo abre un ancla
 * de la URL (`/dashboard/configuracion#servicios`) y cuál se abre al entrar.
 *
 * Qué secciones ve cada rol y cada rubro lo decide `page.tsx` con
 * `lib/permisos.ts`; acá sólo se recibe lo que ya es visible. Un grupo sin
 * ninguna sección visible no existe: no se muestra ni cuenta como "el primero".
 */

import type { PalabrasDelRubro } from "@/lib/vocabulario"
import { frasesDeConfiguracion } from "./_frases"

/**
 * Las dieciséis secciones, por su ancla: el `id` del elemento al que llevan los
 * enlaces de otras pantallas (`#horario`, `#servicios`, `#sillones`…).
 *
 * `sedes` (plan Independiente, sólo la dueña) y `plan` (sólo la dueña) las
 * arma `page.tsx` con `puedeGestionarSedes` y `puedeCambiarDePlan`. Con alguna
 * sede activa, «Sedes y horarios» reemplaza a «Horario» (`page.tsx` no arma las
 * dos a la vez: el servidor rechaza el horario general mientras haya sedes activas).
 * `paquetes` (los paquetes de sesiones) va debajo de los servicios, para quien
 * los gestiona (`puedeGestionarPaquetes`): no existe en la clínica dental.
 */
export type AnclaDeConfiguracion =
  | "horario"
  | "sedes"
  | "zona-horaria"
  | "mi-foto"
  | "pagina"
  | "plan"
  | "servicios"
  | "paquetes"
  | "sillones"
  | "laboratorios"
  | "productos"
  | "plazo-de-cambios"
  | "por-confirmar"
  | "hora-valle"
  | "mensajes"
  | "fila-virtual"

export type IdDeGrupo = "horario-y-equipo" | "tu-negocio" | "catalogo-y-clinica" | "mensajes" | "mas-adelante"

/**
 * Cómo se nombra cada sección en la línea que resume su grupo, con las palabras
 * de un rubro sin palabras propias. "Servicios" y "Mensajes a clientes" cambian
 * con el rubro: `nombreDeLaSeccion`.
 */
export const NOMBRE_DE_SECCION: Readonly<Record<AnclaDeConfiguracion, string>> = {
  horario: "Horario",
  sedes: "Sedes y horarios",
  "zona-horaria": "Zona horaria",
  "mi-foto": "Mi foto",
  pagina: "Página pública",
  plan: "Plan",
  servicios: "Servicios",
  paquetes: "Paquetes de sesiones",
  sillones: "Sillones",
  laboratorios: "Laboratorios",
  productos: "Productos",
  "plazo-de-cambios": "Cancelar o reagendar",
  "por-confirmar": "Reservas por confirmar",
  "hora-valle": "Descuento en horas tranquilas",
  mensajes: "Mensajes a clientes",
  "fila-virtual": "Fila virtual",
}

/**
 * El nombre de una sección con las palabras del rubro: "Servicios" o, en una
 * clínica dental, "Prestaciones"; "Mensajes a clientes" o "Mensajes a
 * pacientes". Las demás se llaman igual en todos los rubros.
 */
export function nombreDeLaSeccion(ancla: AnclaDeConfiguracion, palabras: PalabrasDelRubro): string {
  const frases = frasesDeConfiguracion(palabras)
  if (ancla === "servicios") return frases.servicios.titulo
  if (ancla === "mensajes") return frases.mensajes.titulo
  return NOMBRE_DE_SECCION[ancla]
}

/**
 * Los grupos, en el orden en que se muestran, y las secciones de cada uno,
 * también en su orden. Toda sección está en exactamente un grupo.
 *
 * Lo que hace falta para empezar a recibir reservas va arriba; lo que se
 * puede dejar para cuando el negocio ya anda (descuentos, faltas, fila,
 * zona horaria, plazo para cancelar) va al final, en «Más adelante», que
 * empieza plegado.
 */
export const GRUPOS: readonly { id: IdDeGrupo; secciones: readonly AnclaDeConfiguracion[] }[] = [
  { id: "horario-y-equipo", secciones: ["horario", "sedes", "mi-foto"] },
  { id: "tu-negocio", secciones: ["pagina", "productos", "plan"] },
  { id: "catalogo-y-clinica", secciones: ["servicios", "paquetes", "sillones", "laboratorios"] },
  { id: "mensajes", secciones: ["mensajes"] },
  { id: "mas-adelante", secciones: ["hora-valle", "por-confirmar", "fila-virtual", "zona-horaria", "plazo-de-cambios"] },
]

/**
 * Lo esencial para que se pueda reservar: el horario (o las sedes), los
 * servicios y la página pública. El grupo que tenga alguna se marca
 * «Recomendado».
 */
export const SECCIONES_RECOMENDADAS: readonly AnclaDeConfiguracion[] = ["horario", "sedes", "servicios", "pagina"]

/** Sólo existen en una clínica dental: sin ellas, el grupo no habla de "clínica". */
const SECCIONES_DE_CLINICA: readonly AnclaDeConfiguracion[] = ["sillones", "laboratorios"]

/**
 * El título de un grupo. "Tu negocio" dice "Tu salón" o "Tu clínica" según el
 * rubro (`vocabularioDe`), y "Catálogo y clínica" se queda en "Catálogo"
 * cuando no hay nada de clínica que mostrar (un salón no tiene sillones ni
 * laboratorios).
 */
function tituloDelGrupo(id: IdDeGrupo, visibles: readonly AnclaDeConfiguracion[], palabras: PalabrasDelRubro): string {
  switch (id) {
    case "horario-y-equipo":
      return "Horario y equipo"
    case "tu-negocio":
      return `Tu ${palabras.negocio.singular}`
    case "catalogo-y-clinica":
      return visibles.some((ancla) => SECCIONES_DE_CLINICA.includes(ancla)) ? "Catálogo y clínica" : "Catálogo"
    case "mensajes":
      return "Mensajes"
    case "mas-adelante":
      return "Más adelante (opcional)"
  }
}

/** Un grupo con al menos una sección visible, listo para mostrarse. */
export interface GrupoDeConfiguracion<T extends { id: AnclaDeConfiguracion }> {
  id: IdDeGrupo
  titulo: string
  /** Las secciones que contiene, separadas por "·": "Página pública · Productos". */
  resumen: string
  /** Si tiene algo de lo esencial para empezar (`SECCIONES_RECOMENDADAS`): se marca «Recomendado». */
  recomendado: boolean
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
  palabras: PalabrasDelRubro
): GrupoDeConfiguracion<T>[] {
  const grupos: GrupoDeConfiguracion<T>[] = []
  for (const grupo of GRUPOS) {
    const secciones = grupo.secciones.flatMap((ancla) => visibles.filter((seccion) => seccion.id === ancla))
    if (secciones.length === 0) continue
    const anclas = secciones.map((seccion) => seccion.id)
    grupos.push({
      id: grupo.id,
      titulo: tituloDelGrupo(grupo.id, anclas, palabras),
      resumen: anclas.map((ancla) => nombreDeLaSeccion(ancla, palabras)).join(" · "),
      recomendado: anclas.some((ancla) => SECCIONES_RECOMENDADAS.includes(ancla)),
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
