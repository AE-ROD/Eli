import { NextResponse } from "next/server"
import {
  almacenDeFotos,
  claveDeFotoPropia,
  claveNuevaDeFoto,
  rutaPublicaDeFoto,
  type AlmacenDeFotos,
} from "@/lib/almacenamiento-de-fotos"
import { leerBytesConTope, respuestaDeCuerpoDemasiadoGrande, TOPE_DE_UNA_FOTO } from "@/lib/cuerpo-del-pedido"
import { FotoInvalida, procesarFoto, TIPO_MIME_DE_SALIDA, type TipoDeFoto } from "@/lib/procesar-foto"
import { verificarLimite } from "@/lib/rate-limit"
import { registrarError } from "@/lib/registro-de-errores"

/**
 * Subir y quitar una foto (logo, portada, foto de un integrante): el recorrido
 * que comparten `PUT/DELETE /api/configuracion/fotos/[tipo]` y
 * `/api/equipo/miembros/[id]/foto`. SÓLO SERVIDOR.
 *
 * Cada endpoint ya resolvió lo suyo ANTES de llamar acá: la sesión, el permiso
 * (`lib/permisos.ts`) y que el negocio o el integrante sean de la sesión (404
 * si no). Acá va lo que es igual para todos: que haya almacén (503), el límite
 * de peticiones (429), el tipo de contenido y el tope de bytes (400, 413), la
 * validación y reducción de la imagen (400), y la escritura en este orden:
 *
 *   1. el objeto NUEVO, con una clave nueva (`negocios/<negocio>/...-<uuid>.webp`);
 *   2. la columna, que pasa a apuntar al objeto nuevo;
 *   3. recién entonces, el objeto anterior.
 *
 * Si la columna no se puede escribir, se borra el objeto nuevo (compensación)
 * y no se toca el anterior: la foto de antes sigue viéndose. Si lo que falla
 * es borrar el anterior, la respuesta es igual de buena: queda un objeto
 * huérfano que nadie ve (se registra el fallo).
 */

/** Dónde vive la URL de la foto y cómo se cambia. Lo arma cada endpoint con el `where` de la sesión. */
export interface DestinoDeFoto {
  tipo: TipoDeFoto
  /** El negocio de la sesión: la carpeta de la clave y el prefijo que se exige para borrar. */
  businessId: string
  /** Sólo para `miembro`: la membresía, que va en el nombre del archivo. */
  miembroId?: string
  /** Lo que hay hoy en la columna, o `null` si la fila ya no existe (el endpoint responde 404). */
  leerUrl(): Promise<{ url: string | null } | null>
  /** Escribe la columna. `false` si la fila ya no existe. */
  guardarUrl(url: string | null): Promise<boolean>
}

/** Quién cambia la foto, para el límite de peticiones: se cuenta por sesión, no por IP. */
export interface QuienCambia {
  usuarioId: string
}

const MENSAJES = {
  sinAlmacen: "Las fotos todavía no están disponibles. Inténtalo más tarde.",
  demasiadasVeces: "Cambiaste fotos muchas veces seguidas. Espera un rato e intenta de nuevo.",
  tipoDeContenido: "La foto tiene que ser JPG, PNG o WebP.",
  demasiadoGrande: "La foto pesa más de 5 MB. Sube una más liviana.",
  noSeLeyo: "No pudimos recibir la foto. Intenta de nuevo.",
  noSeGuardo: "No pudimos guardar la foto. Intenta de nuevo en un momento.",
  noEncontrado: "No encontrado",
} as const

const TIPOS_DE_CONTENIDO_ACEPTADOS = ["image/jpeg", "image/png", "image/webp"]

const error = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status })

/** `image/JPEG; charset=x` → `image/jpeg`. */
function tipoDeContenido(cabecera: string | null): string {
  return (cabecera ?? "").split(";")[0].trim().toLowerCase()
}

/** Antes de cualquier trabajo: que haya dónde guardar (503) y que la sesión no haya pasado su cupo (429). */
async function puertas(quien: QuienCambia): Promise<{ almacen: AlmacenDeFotos } | { respuesta: NextResponse }> {
  const almacen = almacenDeFotos()
  if (!almacen) return { respuesta: error(MENSAJES.sinAlmacen, 503) }

  const { permitido } = await verificarLimite("fotos", `usuario:${quien.usuarioId}`)
  if (!permitido) return { respuesta: error(MENSAJES.demasiadasVeces, 429) }

  return { almacen }
}

/** Borra el objeto de una columna si es de este negocio. Nunca lanza: un huérfano no rompe nada. */
async function borrarSiEsDelNegocio(almacen: AlmacenDeFotos, url: string | null, businessId: string): Promise<void> {
  const clave = claveDeFotoPropia(url, businessId)
  if (!clave) return
  try {
    await almacen.borrar(clave)
  } catch (fallo) {
    registrarError("borrando una foto", fallo)
  }
}

export async function subirFoto(request: Request, quien: QuienCambia, destino: DestinoDeFoto): Promise<NextResponse> {
  const abierto = await puertas(quien)
  if ("respuesta" in abierto) return abierto.respuesta
  const { almacen } = abierto

  if (!TIPOS_DE_CONTENIDO_ACEPTADOS.includes(tipoDeContenido(request.headers.get("content-type")))) {
    return error(MENSAJES.tipoDeContenido, 400)
  }

  let recibido
  try {
    recibido = await leerBytesConTope(request, TOPE_DE_UNA_FOTO)
  } catch {
    return error(MENSAJES.noSeLeyo, 400)
  }
  if (recibido.excedido) return respuestaDeCuerpoDemasiadoGrande(MENSAJES.demasiadoGrande)

  // El tipo real lo decide el contenido, no la cabecera que se declaró arriba.
  let foto
  try {
    foto = await procesarFoto(recibido.bytes, destino.tipo)
  } catch (fallo) {
    if (fallo instanceof FotoInvalida) return error(fallo.message, 400)
    registrarError("procesando una foto", fallo)
    return error("Error interno", 500)
  }

  const clave = claveNuevaDeFoto({ businessId: destino.businessId, tipo: destino.tipo, miembroId: destino.miembroId })
  try {
    await almacen.guardar(clave, foto.bytes, TIPO_MIME_DE_SALIDA)
  } catch (fallo) {
    registrarError("guardando una foto", fallo)
    return error(MENSAJES.noSeGuardo, 502)
  }

  // Desde acá hay un objeto nuevo: si algo falla, se borra.
  const deshacer = async () => {
    try {
      await almacen.borrar(clave)
    } catch (fallo) {
      registrarError("deshaciendo una foto", fallo)
    }
  }

  const url = rutaPublicaDeFoto(clave)
  let anterior: string | null
  try {
    const actual = await destino.leerUrl()
    if (!actual) {
      await deshacer()
      return error(MENSAJES.noEncontrado, 404)
    }
    anterior = actual.url
    if (!(await destino.guardarUrl(url))) {
      await deshacer()
      return error(MENSAJES.noEncontrado, 404)
    }
  } catch (fallo) {
    registrarError("guardando la dirección de una foto", fallo)
    await deshacer()
    return error("Error interno", 500)
  }

  // Ya apunta a la nueva: el objeto anterior (si era de este negocio) sobra.
  await borrarSiEsDelNegocio(almacen, anterior, destino.businessId)

  return NextResponse.json({ url })
}

export async function quitarFoto(quien: QuienCambia, destino: DestinoDeFoto): Promise<NextResponse> {
  const abierto = await puertas(quien)
  if ("respuesta" in abierto) return abierto.respuesta
  const { almacen } = abierto

  let anterior: string | null
  try {
    const actual = await destino.leerUrl()
    if (!actual) return error(MENSAJES.noEncontrado, 404)
    anterior = actual.url
    if (!(await destino.guardarUrl(null))) return error(MENSAJES.noEncontrado, 404)
  } catch (fallo) {
    registrarError("quitando una foto", fallo)
    return error("Error interno", 500)
  }

  await borrarSiEsDelNegocio(almacen, anterior, destino.businessId)

  return NextResponse.json({ url: null })
}
