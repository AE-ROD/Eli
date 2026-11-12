/**
 * Cómo se manda una foto al servidor, y cómo se la quita. Lo comparten las
 * tres vistas que suben fotos (el logo y la portada del negocio, en
 * Configuración; la foto de cada integrante, en Equipo y en "Mi foto"): cada
 * `_datos.ts` pone la ruta y este archivo pone el resto, así el contrato
 * (cuerpo crudo, `Content-Type` de la imagen, `{ url }` en la respuesta) está
 * en un solo lugar.
 *
 * Nunca lanza: devuelve `{ ok }` como el resto de `_datos.ts`
 * (`lib/peticiones.ts`). Sólo usa `fetch` del navegador.
 */

import { pedirConCodigo } from "@/lib/peticiones"

/** La URL con que quedó la foto, o `null` si se quitó. */
export type ResultadoDeFoto = { ok: true; url: string | null } | { ok: false; error: string }

type Accion = "subir" | "quitar"

/**
 * El mensaje de un fallo. El que mandó el servidor gana (viene en español y
 * dice el motivo exacto: "La imagen está dañada", "Sólo JPG, PNG o WebP"),
 * salvo el 500, cuyo mensaje es genérico y no se muestra. Sin
 * él, uno por código que la persona pueda entender: un 429 o un 503 suelen
 * llegar de un proxy, sin el cuerpo de la API.
 */
export function mensajeDeErrorDeFoto(codigo: number | null, delServidor: string, accion: Accion): string {
  const mensaje = delServidor.trim()
  // Un 500 trae «Error interno»: no le dice nada a quien sube la foto.
  if (mensaje && codigo !== 500) return mensaje
  switch (codigo) {
    case 400:
      return "No se pudo leer esa imagen. Prueba con otra foto en JPG, PNG o WebP."
    case 401:
      return "Tu sesión terminó o no tienes permiso para cambiar esta foto. Vuelve a entrar e inténtalo de nuevo."
    case 404:
      return "No se encontró lo que querías cambiar. Recarga la página e inténtalo de nuevo."
    case 413:
      return "La foto pesa demasiado. Prueba con otra más liviana."
    case 429:
      return "Hiciste varios cambios seguidos. Espera un momento e inténtalo de nuevo."
    case 503:
      return "Por ahora no se pueden guardar fotos. Inténtalo más tarde."
    default:
      return accion === "subir" ? "No se pudo guardar la foto." : "No se pudo quitar la foto."
  }
}

/**
 * Sin mensaje por defecto: así se distingue lo que dijo el servidor de lo que
 * no (`pedirConCodigo` devuelve el texto por defecto cuando no hay otro).
 */
const SIN_MENSAJE = ""

async function pedirFoto(ruta: string, accion: Accion, opciones: RequestInit): Promise<ResultadoDeFoto> {
  const resultado = await pedirConCodigo<{ url?: unknown }>(ruta, SIN_MENSAJE, opciones)
  if (!resultado.ok) return { ok: false, error: mensajeDeErrorDeFoto(resultado.codigo, resultado.error, accion) }
  const url = resultado.datos?.url
  if (typeof url === "string" && url !== "") return { ok: true, url }
  // Quitar responde `{ url: null }` (o un 204 sin cuerpo); subir sin una URL no es un éxito que se pueda mostrar.
  if (accion === "quitar" && (url === null || url === undefined)) return { ok: true, url: null }
  return { ok: false, error: mensajeDeErrorDeFoto(null, "", accion) }
}

/**
 * Sube la foto: el cuerpo son los bytes de la imagen, no un formulario, y la
 * cabecera dice qué formato es (`image/webp` si la ajustó el navegador).
 */
export function enviarFoto(ruta: string, foto: Blob): Promise<ResultadoDeFoto> {
  return pedirFoto(ruta, "subir", { method: "PUT", headers: { "Content-Type": foto.type }, body: foto })
}

/** Quita la foto: el negocio o la persona vuelve a mostrarse con sus iniciales. */
export function pedirQuitarFoto(ruta: string): Promise<ResultadoDeFoto> {
  return pedirFoto(ruta, "quitar", { method: "DELETE" })
}
