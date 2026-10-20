/**
 * Registra un error inesperado sin volcarlo entero. Un error de Prisma trae
 * en el mensaje y en `meta` los argumentos de la consulta (emails, nombres,
 * hashes de token); al log sólo van el nombre (`PrismaClientKnownRequestError`,
 * `TypeError`...) y el código de Prisma (`P2002`...), que alcanzan para saber
 * qué falló sin guardar datos de nadie.
 */
export function registrarError(contexto: string, error: unknown): void {
  const name = error instanceof Error ? error.name : error === null ? "null" : typeof error
  const codigo = error instanceof Error ? (error as { code?: unknown }).code : undefined
  console.error(`Error ${contexto}:`, { name, code: typeof codigo === "string" ? codigo : undefined })
}
