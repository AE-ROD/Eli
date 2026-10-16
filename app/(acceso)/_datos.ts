/**
 * Lo que las páginas de acceso le piden al servidor: crear la cuenta, completar
 * el perfil del negocio, recuperar y restablecer la contraseña, y ver y aceptar
 * una invitación al equipo. Un solo archivo para todo el grupo: son pantallas
 * chicas, de una o dos llamadas cada una. Iniciar sesión no pasa por acá: eso
 * lo hace `signIn` de next-auth.
 *
 * Cada función devuelve un `Resultado` (`lib/peticiones.ts`) en vez de lanzar:
 * la pantalla está obligada a decidir qué mostrar cuando algo falla.
 */

import { pedir, pedirConCuerpo, conJson, type Resultado } from "@/lib/peticiones"
import type { RubroId } from "@/lib/rubros"

export interface DatosDeRegistro {
  nombre: string
  email: string
  contrasena: string
  nombreNegocio: string
  tipoNegocio: RubroId
}

/** Crea la cuenta y su negocio. No inicia sesión: eso lo hace la pantalla después. */
export async function crearCuenta(datos: DatosDeRegistro): Promise<Resultado> {
  return pedir("/api/auth/registro", "Error al crear la cuenta", conJson("POST", datos))
}

export interface DatosDelNegocio {
  nombreNegocio: string
  tipoNegocio: RubroId
  /** Cuántas personas trabajan en el negocio, contando a quien se registra. */
  teamSize: number
}

/** El último paso de quien entró con Google: todavía no tiene negocio. */
export async function completarPerfil(datos: DatosDelNegocio): Promise<Resultado> {
  return pedir("/api/auth/completar-perfil", "Error al guardar el negocio", conJson("POST", datos))
}

/**
 * Responde lo mismo exista o no una cuenta con ese correo: así no se puede
 * usar para averiguar quién está registrado.
 */
export async function pedirEnlaceDeRecuperacion(email: string): Promise<Resultado> {
  return pedir(
    "/api/auth/recuperar-contrasena",
    "No se pudo procesar la solicitud",
    conJson("POST", { email })
  )
}

export async function restablecerContrasena(token: string, contrasena: string): Promise<Resultado> {
  return pedir(
    "/api/auth/restablecer-contrasena",
    "No se pudo restablecer la contraseña",
    conJson("POST", { token, contrasena })
  )
}

/** Lo que se muestra de una invitación antes de aceptarla. */
export interface Invitacion {
  nombre: string
  email: string
  rol: string
  negocio: string
}

/** Falla si la invitación no existe, ya se aceptó o venció. */
export async function leerInvitacion(token: string): Promise<Resultado<Invitacion>> {
  return pedir<Invitacion>(`/api/equipo/invitacion/${token}`, "Invitación no válida")
}

/**
 * Como un `Resultado`, pero el error dice además si hace falta iniciar sesión:
 * pasa cuando el correo invitado ya tiene cuenta y quien acepta no entró con
 * ella. La pantalla usa ese dato para ofrecer ir a iniciar sesión.
 */
export type ResultadoDeAceptar =
  | { ok: true; datos: { cuentaNueva: boolean } }
  | { ok: false; error: string; requiereSesion: boolean }

/** Lo que puede traer el cuerpo de la respuesta, ok o no: sin validar, se lee con cuidado. */
interface RespuestaDeAceptar {
  requiereSesion?: unknown
  cuentaNueva?: unknown
}

/**
 * Crea la cuenta con la contraseña elegida y la suma al negocio. Si el correo
 * ya tenía cuenta, sólo suma la membresía (`cuentaNueva: false`).
 *
 * Usa `pedirConCuerpo` y no `pedir` porque necesita `requiereSesion`, que
 * viene en el cuerpo del error. Las reglas son las de todos los pedidos: un
 * 200 con una página HTML (un portal cautivo, un proxy) es un fallo, no una
 * cuenta creada que no existe.
 */
export async function aceptarInvitacion(token: string, contrasena: string): Promise<ResultadoDeAceptar> {
  const resultado = await pedirConCuerpo<RespuestaDeAceptar | undefined>(
    `/api/equipo/invitacion/${token}/aceptar`,
    "Error al crear la cuenta",
    conJson("POST", { contrasena })
  )

  if (!resultado.ok) {
    const cuerpo = resultado.cuerpo as RespuestaDeAceptar | null
    return { ok: false, error: resultado.error, requiereSesion: cuerpo?.requiereSesion === true }
  }

  // Un 204 no trae cuerpo: sin decir lo contrario, la cuenta es nueva.
  return { ok: true, datos: { cuentaNueva: resultado.datos?.cuentaNueva !== false } }
}
