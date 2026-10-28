import { manifestDeLaApp } from "@/lib/pwa"

/**
 * El manifest de Eli instalable (issue #81), en `/manifest.webmanifest`.
 *
 * Es un route handler y no `app/manifest.ts` a propósito: con la convención de
 * archivo, Next enlaza el manifest en TODAS las páginas, y la landing, la
 * reserva pública y el login no deben ofrecer instalar Eli. Así sólo lo enlaza
 * el panel (`metadata.manifest` en `app/dashboard/layout.tsx`).
 *
 * El contenido está en `manifestDeLaApp` (`lib/pwa.ts`).
 *
 * Se genera en el build (estático). El proxy no lo intercepta (está excluido
 * por extensión en su `matcher`): el navegador lo pide sin cookies.
 */
export const dynamic = "force-static"

export function GET() {
  return new Response(JSON.stringify(manifestDeLaApp()), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8" },
  })
}
