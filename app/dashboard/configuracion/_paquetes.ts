/**
 * Los paquetes de sesiones en Configuración, sin pantalla: cómo se lee un
 * paquete en la lista ("6 sesiones de Depilación láser · $150.000 · $25.000
 * por sesión (17 % menos) · Vale 6 meses"), qué dice el formulario mientras se
 * escribe ("Cada sesión queda en $25.000 (17 % menos que suelta)") y cómo pasa
 * lo escrito a lo que espera el servidor. Las reglas del paquete están en
 * `lib/paquetes.ts`; quién los gestiona, en `lib/permisos.ts`.
 */

import type { PaqueteDelNegocio } from "@/app/api/configuracion/paquetes/_paquetes"
import { aCentavos, deCentavos, esMontoDePagoValido } from "@/lib/atenciones"
import { concordar, del, el, un } from "@/lib/concordancia"
import { formatearMonto, leerMonto, montoParaEscribir } from "@/lib/dinero"
import { SESIONES_MAXIMAS, SESIONES_MINIMAS, VIGENCIAS_EN_MESES, ahorroDelPaquete, valorPorSesion } from "@/lib/paquetes"
import { conMayuscula, type PalabrasDelRubro } from "@/lib/vocabulario"

/** Un paquete como lo devuelve el servidor: los montos en unidades (pesos). */
export type Paquete = PaqueteDelNegocio

/** Lo que se carga en el modal de paquete, como texto: así llega de los campos. */
export interface DatosDePaquete {
  servicioId: string
  sesiones: string
  precio: string
  /** Meses como texto; vacío es "no vence". */
  vigencia: string
}

export const PAQUETE_EN_BLANCO: DatosDePaquete = { servicioId: "", sesiones: "", precio: "", vigencia: "" }

/** El paquete guardado, como se escribe en el formulario para editarlo. */
export function datosDelPaquete(paquete: Paquete): DatosDePaquete {
  return {
    servicioId: paquete.servicioId,
    sesiones: String(paquete.sesiones),
    precio: montoParaEscribir(paquete.precio),
    vigencia: paquete.vigenciaMeses == null ? "" : String(paquete.vigenciaMeses),
  }
}

/** "6 sesiones de Depilación láser": el nombre del paquete en la lista. */
export function tituloDelPaquete(paquete: Pick<Paquete, "sesiones" | "servicio">): string {
  return `${paquete.sesiones} sesiones de ${paquete.servicio}`
}

/** "No vence", "Vale 1 mes", "Vale 6 meses". */
export function textoDeVigencia(meses: number | null): string {
  if (!meses) return "No vence"
  return meses === 1 ? "Vale 1 mes" : `Vale ${meses} meses`
}

/** "$150.000 · $25.000 por sesión (17 % menos) · Vale 6 meses": lo que va debajo del nombre. */
export function detalleDelPaquete(paquete: Pick<Paquete, "precio" | "valorPorSesion" | "ahorro" | "vigenciaMeses">): string {
  const porSesion = `${formatearMonto(paquete.valorPorSesion)} por sesión`
  return [
    formatearMonto(paquete.precio),
    paquete.ahorro == null ? porSesion : `${porSesion} (${paquete.ahorro} % menos)`,
    textoDeVigencia(paquete.vigenciaMeses),
  ].join(" · ")
}

/**
 * Las vigencias que ofrece el formulario: "No vence", 3, 6 y 12 meses. Si el
 * paquete que se edita tiene otra (el servidor acepta de 1 a 36), se suma
 * para que el selector no la cambie sin que nadie lo pida.
 */
export function opcionesDeVigencia(actual: string): { valor: string; texto: string }[] {
  const meses: (number | null)[] = [...VIGENCIAS_EN_MESES]
  const actualEnMeses = Number(actual)
  if (actual !== "" && Number.isInteger(actualEnMeses) && actualEnMeses > 0 && !meses.includes(actualEnMeses)) {
    meses.push(actualEnMeses)
  }
  return meses
    .sort((a, b) => (a ?? 0) - (b ?? 0))
    .map((cuantos) => ({
      valor: cuantos == null ? "" : String(cuantos),
      texto: cuantos == null ? "No vence" : cuantos === 1 ? "1 mes" : `${cuantos} meses`,
    }))
}

/** Las sesiones escritas, si son un entero de los que acepta un paquete; si no, `null`. */
export function leerSesiones(texto: string): number | null {
  const limpio = texto.trim()
  if (!/^\d{1,3}$/.test(limpio)) return null
  const sesiones = Number(limpio)
  return sesiones >= SESIONES_MINIMAS && sesiones <= SESIONES_MAXIMAS ? sesiones : null
}

/**
 * Lo que el formulario dice mientras se escribe: "Cada sesión queda en
 * $25.000 (17 % menos que suelta)". Sin el paréntesis si no hay rebaja o el
 * servicio no tiene precio; `null` mientras falten las sesiones o el precio.
 * La cuenta es la misma del servidor (`valorPorSesion`, `ahorroDelPaquete`).
 */
export function vistaPreviaDelPaquete(datos: Pick<DatosDePaquete, "sesiones" | "precio">, precioSuelto: number | null): string | null {
  const sesiones = leerSesiones(datos.sesiones)
  const precio = datos.precio.trim() === "" ? null : leerMonto(datos.precio)
  if (sesiones === null || precio === null || !esMontoDePagoValido(precio)) return null

  const priceCents = aCentavos(precio)
  const porSesion = valorPorSesion(priceCents, sesiones)
  if (porSesion <= 0) return null
  const ahorro = ahorroDelPaquete(priceCents, sesiones, precioSuelto == null ? null : aCentavos(precioSuelto))
  const base = `Cada sesión queda en ${formatearMonto(deCentavos(porSesion))}`
  return ahorro == null ? base : `${base} (${ahorro} % menos que suelta)`
}

/** Lo que se le manda al servidor al crear o al editar. El servicio sólo va al crear: no se cambia. */
export interface CuerpoDePaquete {
  servicioId?: string
  sesiones: number
  precio: number
  vigenciaMeses: number | null
}

/**
 * Del formulario a lo que espera el servidor, con el motivo en palabras
 * simples si algo no sirve. El servidor lo vuelve a validar todo.
 */
export function cuerpoDePaquete(
  datos: DatosDePaquete,
  para: "crear" | "editar",
  palabras: PalabrasDelRubro
): { ok: true; datos: CuerpoDePaquete } | { ok: false; error: string } {
  if (para === "crear" && datos.servicioId === "") {
    return { ok: false, error: `Elige ${el(palabras.servicio)} del paquete.` }
  }
  const sesiones = leerSesiones(datos.sesiones)
  if (sesiones === null) {
    return { ok: false, error: `Escribe cuántas sesiones trae el paquete: entre ${SESIONES_MINIMAS} y ${SESIONES_MAXIMAS}.` }
  }
  const precio = leerMonto(datos.precio)
  if (precio === null) {
    return { ok: false, error: "No se entiende el precio. Escríbelo así: 150000 o 150.000." }
  }
  if (!esMontoDePagoValido(precio)) {
    return { ok: false, error: "El precio del paquete tiene que ser mayor que cero." }
  }
  if (valorPorSesion(aCentavos(precio), sesiones) <= 0) {
    return { ok: false, error: "El precio es muy bajo para esa cantidad de sesiones." }
  }
  const vigenciaMeses = datos.vigencia === "" ? null : Number(datos.vigencia)
  if (vigenciaMeses !== null && (!Number.isInteger(vigenciaMeses) || vigenciaMeses <= 0)) {
    return { ok: false, error: "Elige cuánto tiempo vale el paquete." }
  }
  return {
    ok: true,
    datos: { ...(para === "crear" && { servicioId: datos.servicioId }), sesiones, precio, vigenciaMeses },
  }
}

/** Las frases de la sección, con las palabras del rubro ("servicio", "tablero", "cliente"). */
export function frasesDeLosPaquetes(palabras: PalabrasDelRubro) {
  const { servicio, tablero, cliente } = palabras
  return {
    titulo: "Paquetes de sesiones",
    subtitulo: `Varias sesiones ${del(servicio)} que se pagan juntas, a mejor precio`,
    vacioTitulo: "Sin paquetes aún",
    /** Qué es un paquete y dónde se vende, en una frase. */
    vacio: `Un paquete son varias sesiones de ${un(servicio)} que tu ${cliente.singular} paga de una vez, por ejemplo "6 sesiones por $150.000". Lo creas acá y lo vendes al cobrar en ${el(tablero)}.`,
    /** Sin ningún servicio activo no hay con qué armar un paquete. */
    sinServicios: `Para crear un paquete primero necesitas al menos ${un(servicio)} ${concordar("activo", servicio)}. Agrégalo más arriba, en ${conMayuscula(servicio.plural)}.`,
    dondeSeVende: `Los paquetes se venden al cobrar en ${el(tablero)}. Uno pausado deja de ofrecerse.`,
    servicio: conMayuscula(servicio.singular),
    eligeServicio: `Elige ${el(servicio)}`,
    /** Al editar: los vendidos no cambian. */
    alEditar: "Los cambios valen para los paquetes que vendas desde ahora. Los que ya vendiste quedan como estaban.",
    eliminar: {
      descripcion: `Deja de ofrecerse al cobrar en ${el(tablero)}. Los paquetes que ya vendiste siguen valiendo: tus ${cliente.plural} no pierden sus sesiones. Si sólo quieres dejar de ofrecerlo por un tiempo, mejor páusalo.`,
    },
  }
}
