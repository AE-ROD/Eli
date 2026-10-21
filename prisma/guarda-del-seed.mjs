/**
 * Guarda del seed: decide si `prisma/seed.ts` puede escribir en la base de
 * `DATABASE_URL`. Vive aparte (y en .mjs) para poder testearla sin abrir una
 * conexión: `node prisma/seed.ts` corre con el type stripping de Node, que
 * exige la extensión en los imports relativos, y TypeScript sólo acepta un
 * import con extensión .ts si se cambia el tsconfig.
 *
 * La única base configurada hoy es producción. `SEED_CONFIRMO=si` solo no
 * alcanza: es fácil exportarlo con el `.env` equivocado cargado. Por eso,
 * además, el host tiene que ser local o estar en una lista explícita.
 */

const HOSTS_LOCALES = ["localhost", "127.0.0.1"]

/**
 * @param {string | undefined} lista
 * @returns {string[]}
 */
function hostsDeLaLista(lista) {
  return (lista ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Lanza un Error con un mensaje claro si el seed no debe correr. No devuelve
 * nada si puede. El mensaje nombra el host, nunca la URL entera: la URL lleva
 * la contraseña de la base.
 *
 * @param {Record<string, string | undefined>} env normalmente `process.env`
 */
export function verificarQueElSeedPuedeCorrer(env) {
  if (env.SEED_CONFIRMO !== "si") {
    throw new Error("Seed cancelado. Corré con SEED_CONFIRMO=si si la base es de desarrollo.")
  }

  let host
  try {
    host = new URL(env.DATABASE_URL ?? "").hostname.toLowerCase()
  } catch {
    host = ""
  }
  if (!host) {
    throw new Error("Seed cancelado. DATABASE_URL falta o no es una URL válida.")
  }

  const permitidos = [...HOSTS_LOCALES, ...hostsDeLaLista(env.SEED_HOSTS_PERMITIDOS)]
  if (!permitidos.includes(host)) {
    throw new Error(
      `Seed cancelado. DATABASE_URL apunta a "${host}", que no es localhost ni 127.0.0.1. ` +
        "Si es una base de desarrollo, agregá ese host a SEED_HOSTS_PERMITIDOS " +
        "(lista separada por comas). Nunca agregues el host de producción.",
    )
  }
}
