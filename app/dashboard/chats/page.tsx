import { redirect } from "next/navigation"

/**
 * Chats está escondido hasta que exista un canal real (WhatsApp): hoy los
 * mensajes no le llegan al cliente y el cliente no puede responder. Quien
 * llegue por la URL vuelve al inicio, desde el servidor. La pantalla queda en
 * `_componentes/pagina-chats.tsx` y la API en `app/api/chats/`, sin cambios.
 */
export default function PaginaChats() {
  redirect("/dashboard")
}
