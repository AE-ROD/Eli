import { ImageResponse } from "next/og"
import { headers } from "next/headers"
import { iniciales } from "@/lib/pagina-del-negocio"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import { leerPaginaDelNegocio } from "./_pagina/datos-de-la-pagina"

/**
 * La imagen que aparece al compartir el enlace de reservas de un negocio
 * (WhatsApp, Instagram, Facebook): su nombre, su comuna y sus iniciales en el
 * color que eligió. Se genera con `next/og`, que viene con Next: sin fotos
 * (todavía no hay subida) ni fuentes ni servicios de afuera, así que no
 * depende de la CSP de la página (`lib/csp.ts`), que no aplica a una imagen.
 *
 * Es pública y lee la base: lleva el mismo límite por IP que las horas libres
 * (`lecturaPublica`), porque el proxy no limita las páginas públicas.
 */

export const alt = "Reserva tu hora en línea"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

/** Los tokens de `app/globals.css` que no dependen del color del negocio. */
const CREMA = "#fcfbf8"
const NAVY = "#071a31"
const TEXTO_2 = "#5f6d77"

export default async function ImagenParaCompartir({ params }: { params: Promise<{ slug: string }> }) {
  const { permitido } = await verificarLimite("lecturaPublica", obtenerIp({ headers: await headers() }))
  if (!permitido) return new Response("Demasiadas solicitudes, intenta más tarde", { status: 429 })

  const { slug } = await params
  const pagina = await leerPaginaDelNegocio(slug)
  if (!pagina) return new Response("Negocio no encontrado", { status: 404 })

  const { fondo, texto } = pagina.color
  // Un nombre muy largo baja de tamaño en vez de salirse de la imagen.
  const tamañoDelNombre = pagina.nombre.length > 28 ? 64 : 84

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: CREMA }}>
        <div style={{ display: "flex", height: 210, background: fondo }} />
        <div style={{ display: "flex", flexDirection: "column", padding: "0 80px", flexGrow: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 168,
              height: 168,
              marginTop: -84,
              borderRadius: 84,
              border: `10px solid ${CREMA}`,
              background: fondo,
              color: texto,
              fontSize: 64,
              fontWeight: 600,
            }}
          >
            {iniciales(pagina.nombre)}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: tamañoDelNombre,
              fontWeight: 600,
              color: NAVY,
              letterSpacing: -2,
              lineHeight: 1.05,
            }}
          >
            {pagina.nombre.slice(0, 60)}
          </div>
          <div style={{ display: "flex", marginTop: 16, fontSize: 36, color: TEXTO_2 }}>
            {pagina.comuna ? `${pagina.comuna.slice(0, 60)} · Reserva tu hora en línea` : "Reserva tu hora en línea"}
          </div>
        </div>
      </div>
    ),
    size
  )
}
