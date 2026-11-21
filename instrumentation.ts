/**
 * Al arrancar el servidor de Next (`next start` en el VPS, `next dev` en
 * local): retoma las conexiones de WhatsApp de la Secretaria de los negocios
 * que ya vincularon su número (lib/secretaria/whatsapp/gestor.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { iniciarConexiones } = await import("@/lib/secretaria/whatsapp/gestor")
  await iniciarConexiones().catch((error: unknown) => {
    console.error("Error retomando las conexiones de WhatsApp:", { name: error instanceof Error ? error.name : typeof error })
  })
}
