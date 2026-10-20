/**
 * Content-Security-Policy de Eli, con nonce por petición.
 *
 * La arma el proxy (`proxy.ts`) en cada petición: Next lee el nonce de la
 * cabecera CSP de la *petición* y se lo pone a sus propios `<script>` al
 * renderizar. Por eso las páginas tienen que renderizarse por petición (el
 * layout raíz llama a `connection()`): una página estática se genera en el
 * build, sin nonce, y su JS quedaría bloqueado.
 *
 * Por qué cada directiva:
 * - `script-src 'nonce-…' 'strict-dynamic'`: sólo corre lo que Next marcó con
 *   el nonce de esta petición, y lo que esos scripts carguen a su vez. Así
 *   entra Vercel Analytics: su componente inserta `/_vercel/insights/script.js`
 *   con `document.createElement("script")` desde el bundle (que lleva nonce),
 *   y `'strict-dynamic'` lo habilita sin listar dominios. `'self'` queda para
 *   navegadores viejos sin CSP3 (los modernos lo ignoran ante `strict-dynamic`).
 * - `style-src 'unsafe-inline'`: React renderiza `style={…}` como atributos
 *   `style="…"` en el HTML del servidor (framer-motion pone ahí su estado
 *   inicial: opacidad, transform) y a un atributo no se le puede poner nonce.
 *   Sin esto la página llega sin esos estilos hasta que hidrata. Ojo: si se
 *   agrega un nonce a `style-src`, el navegador IGNORA `'unsafe-inline'` y se
 *   rompen esos atributos. El riesgo es menor que en scripts: CSS no ejecuta JS.
 * - `connect-src 'self'`: el panel sólo habla con su propia API; Analytics
 *   manda sus eventos a `/_vercel/insights/*`, mismo origen.
 * - `form-action 'self'`: los formularios se envían por `fetch`. El login con
 *   Google NO es un POST de formulario: `signIn("google")` de next-auth pide la
 *   URL por `fetch` y navega con `window.location.href`, que `form-action` no
 *   controla. No hace falta `accounts.google.com`.
 * - `frame-ancestors 'none'`: nadie embebe Eli en un iframe (clickjacking).
 *
 * En desarrollo se suman `'unsafe-eval'` (React reconstruye en el navegador
 * las pilas de error del servidor con `eval`) y `ws:` (el HMR de Next). Nunca
 * en producción.
 *
 * Cualquier script, estilo, fuente o servicio de TERCEROS nuevo tiene que
 * agregarse acá a propósito; si no, el navegador lo bloquea.
 */

export type OpcionesCsp = {
  desarrollo: boolean
}

export function construirCsp(nonce: string, { desarrollo }: OpcionesCsp): string {
  const directivas: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(desarrollo ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(desarrollo ? ["ws:"] : [])],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
  }

  return Object.entries(directivas)
    .map(([directiva, fuentes]) => `${directiva} ${fuentes.join(" ")}`)
    .join("; ")
}

/** Nonce impredecible y distinto en cada petición (128 bits, base64). */
export function generarNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString("base64")
}
