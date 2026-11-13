import type { NextRequest } from "next/server"
import sharp from "sharp"
import type { AlmacenDeFotos, FotoLeida } from "@/lib/almacenamiento-de-fotos"

/**
 * Ayudas de los tests de fotos: un almacén en memoria con la forma del real
 * (`lib/almacenamiento-de-fotos.ts`), un pedido con bytes crudos y unas
 * imágenes de verdad generadas con `sharp`.
 */

export interface AlmacenEnMemoria extends AlmacenDeFotos {
  /** Lo guardado: clave → objeto. Sirve para comprobar qué quedó y qué se borró. */
  objetos: Map<string, FotoLeida>
  /** Cada operación que llegó, en orden, para comprobar el orden (guardar antes de borrar). */
  operaciones: { operacion: "guardar" | "borrar" | "leer"; clave: string }[]
  /** Si una operación debe fallar, como si R2 estuviera caído. */
  fallar: { guardar: boolean; borrar: boolean; leer: boolean }
}

export function crearAlmacenEnMemoria(inicial: Record<string, FotoLeida> = {}): AlmacenEnMemoria {
  const almacen: AlmacenEnMemoria = {
    objetos: new Map(Object.entries(inicial)),
    operaciones: [],
    fallar: { guardar: false, borrar: false, leer: false },
    async guardar(clave, bytes, tipoMime) {
      almacen.operaciones.push({ operacion: "guardar", clave })
      if (almacen.fallar.guardar) throw new Error("almacén caído")
      almacen.objetos.set(clave, { bytes: new Uint8Array(bytes), tipoMime })
    },
    async borrar(clave) {
      almacen.operaciones.push({ operacion: "borrar", clave })
      if (almacen.fallar.borrar) throw new Error("almacén caído")
      almacen.objetos.delete(clave)
    },
    async leer(clave) {
      almacen.operaciones.push({ operacion: "leer", clave })
      if (almacen.fallar.leer) throw new Error("almacén caído")
      return almacen.objetos.get(clave) ?? null
    },
  }
  return almacen
}

/** Una foto de prueba que `procesarFoto` acepta. */
export const jpegDePrueba = (ancho = 800, alto = 600): Promise<Buffer> =>
  sharp({ create: { width: ancho, height: alto, channels: 3, background: { r: 200, g: 60, b: 90 } } }).jpeg().toBuffer()

export const pngDePrueba = (ancho = 400, alto = 400): Promise<Buffer> =>
  sharp({ create: { width: ancho, height: alto, channels: 4, background: { r: 30, g: 120, b: 200, alpha: 0.6 } } }).png().toBuffer()

export const webpDePrueba = (ancho = 400, alto = 400): Promise<Buffer> =>
  sharp({ create: { width: ancho, height: alto, channels: 3, background: { r: 10, g: 200, b: 100 } } }).webp().toBuffer()

/**
 * Un pedido de subida: el cuerpo son bytes crudos de la imagen (no multipart)
 * y el tipo viaja en `Content-Type`, como lo manda el panel.
 */
export function pedidoDeFoto(
  url: string,
  bytes?: Uint8Array,
  opciones: { tipo?: string | null; cabeceras?: Record<string, string>; metodo?: string } = {}
): NextRequest {
  const cabeceras = new Headers(opciones.cabeceras)
  const tipo = opciones.tipo === undefined ? "image/jpeg" : opciones.tipo
  if (tipo !== null) cabeceras.set("content-type", tipo)
  const body = bytes === undefined ? null : new Response(bytes as BodyInit).body
  return { url, method: opciones.metodo ?? "PUT", headers: cabeceras, body } as unknown as NextRequest
}
