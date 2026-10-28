import type { MetadataRoute } from "next"
import { COLORES_DE_LA_APP, INICIO_DE_LA_APP } from "@/lib/pwa"

/**
 * El manifest de Eli instalable (issue #81), en `/manifest.webmanifest`. La
 * app instalada es el panel: arranca en `/dashboard`, a pantalla completa
 * (sin la barra del navegador). El alcance queda en `/` para que el inicio de
 * sesión, al que el panel manda si la sesión venció, siga dentro de la app.
 *
 * El proxy no lo intercepta (está excluido por extensión en su `matcher`): el
 * navegador lo pide sin cookies y tiene que llegar sin sesión.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: INICIO_DE_LA_APP,
    name: "Eli",
    short_name: "Eli",
    description: "Tu agenda, tus clientes y tu equipo, en el teléfono.",
    lang: "es",
    start_url: INICIO_DE_LA_APP,
    scope: "/",
    display: "standalone",
    background_color: COLORES_DE_LA_APP.fondo,
    theme_color: COLORES_DE_LA_APP.fondo,
    icons: [
      { src: "/iconos/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/iconos/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // El mismo dibujo: el nombre ocupa el centro, dentro de la zona segura
      // del 80% que Android respeta al recortarlo en círculo o gota.
      { src: "/iconos/icono-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
