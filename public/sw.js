/*
 * Service worker de Eli instalable (issue #81). Lo registra el panel
 * (`components/panel/app-instalable.tsx`), sólo en producción y con alcance
 * `/dashboard`: la landing, la reserva pública y la API quedan fuera.
 *
 * Hace UNA cosa: si al abrir una pantalla del panel no hay conexión, muestra
 * `/offline.html` ("Sin conexión") en vez del dinosaurio del navegador.
 *
 * A propósito NO guarda nada más. Ni respuestas de `/api` ni páginas del
 * panel: llevan datos de un negocio, y una caché en el teléfono los dejaría
 * ahí después de cerrar sesión, o se los mostraría a otra cuenta que entre en
 * el mismo dispositivo. Todo lo que no es abrir una pantalla del panel pasa
 * de largo y lo resuelve la red, como si no hubiera service worker.
 *
 * Para cambiar la página sin conexión, subir la versión: la caché vieja se
 * borra al activarse la nueva.
 */

const CACHE = "eli-sin-conexion-v1"
const PAGINA_SIN_CONEXION = "/offline.html"

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(PAGINA_SIN_CONEXION, { cache: "reload" })))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres.filter((nombre) => nombre.startsWith("eli-") && nombre !== CACHE).map((nombre) => caches.delete(nombre))
        )
      )
      .then(() => self.clients.claim())
  )
})

/** Sólo abrir una pantalla del panel, del mismo sitio. Nunca la API. */
function esPantallaDelPanel(peticion) {
  if (peticion.mode !== "navigate" || peticion.method !== "GET") return false
  const url = new URL(peticion.url)
  if (url.origin !== self.location.origin) return false
  if (url.pathname.startsWith("/api/")) return false
  return url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/")
}

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request
  if (!esPantallaDelPanel(peticion)) return

  // La red siempre primero, y lo que responde no se guarda.
  evento.respondWith(
    fetch(peticion).catch(() =>
      caches
        .match(PAGINA_SIN_CONEXION, { cacheName: CACHE })
        .then((respuesta) => respuesta || new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }))
    )
  )
})
