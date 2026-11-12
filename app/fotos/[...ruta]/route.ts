import { NextRequest, NextResponse } from "next/server"
import { almacenDeFotos, esClaveDeFoto } from "@/lib/almacenamiento-de-fotos"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import { registrarError } from "@/lib/registro-de-errores"

/**
 * GET /fotos/<ruta> — las fotos del negocio (logo, portada, integrantes) y la
 * foto de la cuenta de cada persona (la del avatar del panel). Es la única
 * puerta: el bucket de R2 no es público, y como la ruta es del mismo origen la
 * CSP (`img-src 'self'`) no se abre. Las del negocio son públicas como la
 * página que las muestra; la de una cuenta no está enlazada desde ninguna
 * página pública, y su nombre lleva un uuid que no se adivina.
 *
 * La ruta tiene que ser EXACTAMENTE una clave que generamos
 * (`negocios/<negocio>/<logo|portada|miembro-<id>>-<uuid>.webp` o
 * `usuarios/<cuenta>/cuenta-<uuid>.webp`, `esClaveDeFoto`); cualquier otra
 * cosa, con `..` o sin ellos, es 404 antes de tocar el almacén. Sin almacén (producción sin `R2_*`) también es 404: la
 * página muestra las iniciales en vez de la foto y nada se cae.
 *
 * La clave lleva un uuid y cambiar la foto cambia la URL, así que lo servido
 * nunca cambia: caché de un año, `immutable`. Siempre `image/webp` (es lo único
 * que se guarda), nunca el tipo que diga el almacén.
 *
 * `.webp` no pasa por `proxy.ts` (su matcher deja afuera las imágenes), así que
 * el límite de lecturas por IP se aplica acá.
 */

type Contexto = { params: Promise<{ ruta: string[] }> }

const SIN_CACHE = { "Cache-Control": "no-store" }

const noEncontrada = () => NextResponse.json({ error: "No encontrado" }, { status: 404, headers: SIN_CACHE })

export async function GET(request: NextRequest, { params }: Contexto) {
  const { ruta } = await params
  const clave = ruta.join("/")
  if (!esClaveDeFoto(clave)) return noEncontrada()

  const { permitido } = await verificarLimite("fotosPublicas", `ip:${obtenerIp(request)}`)
  if (!permitido) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes, espera un momento e intenta de nuevo" },
      { status: 429, headers: { ...SIN_CACHE, "Retry-After": "60" } }
    )
  }

  const almacen = almacenDeFotos()
  if (!almacen) return noEncontrada()

  let foto
  try {
    foto = await almacen.leer(clave)
  } catch (error) {
    registrarError("leyendo una foto", error)
    return NextResponse.json({ error: "No pudimos cargar la foto" }, { status: 502, headers: SIN_CACHE })
  }
  if (!foto) return noEncontrada()

  return new NextResponse(foto.bytes as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(foto.bytes.byteLength),
      "Content-Disposition": "inline",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // Es una imagen, no un documento: si alguien abre la URL a mano, no ejecuta nada.
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  })
}
