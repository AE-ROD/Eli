import { ImageResponse } from "next/og"
import { headers } from "next/headers"
import { MEDIDAS_DE_LA_IMAGEN, leerFotosParaCompartir, SIN_FOTOS } from "@/lib/fotos-para-compartir"
import { iniciales } from "@/lib/pagina-del-negocio"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import { lineaDeLaImagen } from "./_frases"
import { leerPaginaDelNegocio } from "./_pagina/datos-de-la-pagina"

/**
 * La imagen que aparece al compartir el enlace de reservas de un negocio
 * (WhatsApp, Instagram, Facebook): su nombre, su comuna y, en el color que
 * eligió, la banda de arriba y el círculo con sus iniciales. Se genera con
 * `next/og`, que viene con Next: sin fuentes ni servicios de afuera, así que no
 * depende de la CSP de la página (`lib/csp.ts`), que no aplica a una imagen.
 *
 * Con LOGO, el círculo muestra el logo en vez de las iniciales; con PORTADA, la
 * banda de arriba es la portada en vez del color liso. El texto (nombre y
 * comuna) nunca va sobre la portada: queda debajo, en navy sobre crema, así que
 * su contraste no depende de la foto. Las fotos se leen directo del almacén y
 * entran como data URL (`lib/fotos-para-compartir.ts`); si algo falla, esa foto
 * se omite y la imagen queda como la de un negocio sin fotos.
 *
 * Es pública y lee la base: lleva el mismo límite por IP que las horas libres
 * (`lecturaPublica`), porque el proxy no limita las páginas públicas.
 */

// `alt` es una constante de Next y no puede leer el rubro del negocio: queda con
// la palabra que hoy usan todos los rubros ("hora"). La imagen sí la lee.
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
  // Sólo se va a buscar a la base y al almacén si la página dice que hay foto.
  const fotos = pagina.logo || pagina.portada ? await leerFotosParaCompartir(slug) : SIN_FOTOS
  // "Reserva tu hora en línea": la palabra de la reserva sale del rubro del negocio.
  const linea = lineaDeLaImagen(pagina.rubro)
  // Un nombre muy largo baja de tamaño en vez de salirse de la imagen.
  const tamañoDelNombre = pagina.nombre.length > 28 ? 64 : 84

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: CREMA }}>
        <div style={{ display: "flex", height: MEDIDAS_DE_LA_IMAGEN.banda, background: fondo }}>
          {fotos.portada && (
            <img src={fotos.portada} alt="" width={MEDIDAS_DE_LA_IMAGEN.ancho} height={MEDIDAS_DE_LA_IMAGEN.banda} />
          )}
        </div>
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
            {fotos.logo ? (
              <img src={fotos.logo} alt="" width={MEDIDAS_DE_LA_IMAGEN.logo} height={MEDIDAS_DE_LA_IMAGEN.logo} />
            ) : (
              iniciales(pagina.nombre)
            )}
          </div>
          <div
            style={{
              display: "block",
              marginTop: 28,
              fontSize: tamañoDelNombre,
              fontWeight: 600,
              color: NAVY,
              letterSpacing: -2,
              lineHeight: 1.05,
              // Una palabra sin cortes (un nombre pegado) se parte en vez de salirse de la
              // imagen, y a las tres líneas termina en "…" en vez de pasarse del borde de abajo.
              wordBreak: "break-word",
              lineClamp: 3,
            }}
          >
            {pagina.nombre.slice(0, 60)}
          </div>
          <div style={{ display: "block", marginTop: 16, fontSize: 36, color: TEXTO_2, wordBreak: "break-word", lineClamp: 2 }}>
            {pagina.comuna ? `${pagina.comuna.slice(0, 60)} · ${linea}` : linea}
          </div>
        </div>
      </div>
    ),
    size
  )
}
