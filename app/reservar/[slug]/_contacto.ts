import { enlaceDeWhatsapp } from "@/lib/pagina-del-negocio"
import { aE164Chile } from "@/lib/telefono"

/**
 * Cómo se le escribe o se llama al negocio desde la reserva pública: el chat de
 * WhatsApp (`wa.me`) y el número para llamar (`tel:`). Son los mismos datos que
 * ya publica la mini página (`Business.whatsapp`): el negocio no guarda otro
 * teléfono, así que "Llamar" marca ese mismo número. Sin número, `null` en los
 * dos y no se muestra nada.
 */
export interface ContactoDelNegocio {
  /** `https://wa.me/569…`, o `null`. */
  whatsapp: string | null
  /** E.164 (`+569…`), o `null`. */
  telefono: string | null
}

/** El contacto público a partir del WhatsApp guardado del negocio. Uno ilegible no se ofrece. */
export function contactoDelNegocio(whatsappGuardado: string | null | undefined): ContactoDelNegocio {
  return { whatsapp: enlaceDeWhatsapp(whatsappGuardado), telefono: aE164Chile(whatsappGuardado) }
}

/** Si hay algo que ofrecer. */
export function hayContacto(contacto: ContactoDelNegocio | null | undefined): contacto is ContactoDelNegocio {
  return !!contacto && (contacto.whatsapp !== null || contacto.telefono !== null)
}
