import { ImageResponse } from "next/og"
import { COLORES_DE_LA_APP, ICONOS_DE_LA_APP, esNombreDeIcono } from "@/lib/pwa"

/**
 * Los íconos de Eli instalada (issue #81): `/iconos/icono-192.png`,
 * `/iconos/icono-512.png` y `/iconos/apple-icon.png` (180 px, el de iPhone).
 *
 * No son `app/icon.tsx` ni `app/apple-icon.tsx` a propósito: esos le ganan al
 * favicon que declara el layout raíz y cambiarían también el de la landing.
 * Acá se dibujan con `next/og` en el build (son estáticos) y sólo los piden
 * el manifest y el panel.
 *
 * El dibujo es el logo en blanco sobre un
 * cuadro navy que llena todo: el sistema le pone las esquinas, y el nombre
 * queda en el centro, dentro de la zona segura de un ícono "maskable".
 * Terminan en `.png`, así que el proxy no los toca: llegan sin sesión.
 */

export const dynamicParams = false

/**
 * El logo en trazos rectos: la E, la l, la i sin punto y el rombo inclinado
 * que hace de punto, medidos sobre `public/images/logo-eli.png`. Con
 * rectángulos y no con texto porque `next/og` sólo trae la Geist regular, y
 * el logo es grueso.
 */
const ANCHO_DEL_LOGO = 210
const ALTO_DEL_LOGO = 184
const TRAZOS_DEL_LOGO: { x: number; y: number; ancho: number; alto: number; giro?: number }[] = [
  { x: 0, y: 27, ancho: 31, alto: 157 }, // E: el palo
  { x: 0, y: 27, ancho: 86, alto: 29 }, // E: arriba
  { x: 0, y: 86, ancho: 74, alto: 28 }, // E: al medio
  { x: 0, y: 155, ancho: 89, alto: 29 }, // E: abajo
  { x: 111, y: 9, ancho: 30, alto: 175 }, // l
  { x: 166, y: 62, ancho: 30, alto: 122 }, // i
  { x: 172, y: 6, ancho: 32, alto: 32, giro: 38 }, // el rombo
]

export function generateStaticParams() {
  return Object.keys(ICONOS_DE_LA_APP).map((nombre) => ({ nombre }))
}

export async function GET(_peticion: Request, { params }: { params: Promise<{ nombre: string }> }) {
  const { nombre } = await params
  if (!esNombreDeIcono(nombre)) {
    return new Response("No encontrado", { status: 404 })
  }

  const lado = ICONOS_DE_LA_APP[nombre]
  // El logo mide 210 × 184 en sus propias unidades; ocupa el 43% del ancho.
  const k = (lado * 0.43) / ANCHO_DEL_LOGO

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: COLORES_DE_LA_APP.marca,
        }}
      >
        <div style={{ display: "flex", position: "relative", width: ANCHO_DEL_LOGO * k, height: ALTO_DEL_LOGO * k }}>
          {TRAZOS_DEL_LOGO.map(({ x, y, ancho, alto, giro }, indice) => (
            <div
              key={indice}
              style={{
                position: "absolute",
                left: x * k,
                top: y * k,
                width: ancho * k,
                height: alto * k,
                background: "#ffffff",
                ...(giro ? { transform: `rotate(${giro}deg)` } : {}),
              }}
            />
          ))}
        </div>
      </div>
    ),
    { width: lado, height: lado }
  )
}
