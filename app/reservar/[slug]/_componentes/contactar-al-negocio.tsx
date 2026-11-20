import { MessageCircle, Navigation, Phone } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { enlaceDeWhatsapp, enlacesDeMapa } from "@/lib/pagina-del-negocio"
import { aE164Chile } from "@/lib/telefono"
import { cn } from "@/lib/utils"

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

/** Los enlaces que salen de Eli abren aparte y no le pasan quién los abrió. */
const AFUERA = { target: "_blank", rel: "noopener noreferrer" } as const

/**
 * "Escribir por WhatsApp" y "Llamar": donde la pantalla dice "contacta al
 * negocio", los botones para hacerlo de un toque. Botones de 48px, con el
 * nombre del negocio para el lector de pantalla. Sin datos, no pinta nada.
 */
export function ContactarAlNegocio({
  contacto,
  nombreDelNegocio,
  className,
}: {
  contacto: ContactoDelNegocio | null | undefined
  nombreDelNegocio: string
  className?: string
}) {
  if (!hayContacto(contacto)) return null
  return (
    <div className={cn("flex flex-col gap-2.5 sm:flex-row sm:flex-wrap", className)}>
      {contacto.whatsapp && (
        <Boton
          href={contacto.whatsapp}
          variante="secundario"
          icono={<MessageCircle />}
          aria-label={`Escribir por WhatsApp a ${nombreDelNegocio} (se abre en otra pestaña)`}
          className="w-full sm:w-auto"
          {...AFUERA}
        >
          Escribir por WhatsApp
        </Boton>
      )}
      {contacto.telefono && (
        <Boton
          href={`tel:${contacto.telefono}`}
          variante="secundario"
          icono={<Phone />}
          aria-label={`Llamar a ${nombreDelNegocio}`}
          className="w-full sm:w-auto"
        >
          Llamar
        </Boton>
      )}
    </div>
  )
}

/**
 * La dirección y "Cómo llegar" con Google Maps, para cuando no hay sede (con
 * sede, la pantalla ya muestra la suya). Sin calle no hay nada que mostrar: la
 * comuna sola no lleva al local.
 */
export function DireccionYComoLlegar({
  direccion,
  comuna,
  mostrarDireccion = true,
  className,
}: {
  direccion: string | null | undefined
  comuna: string | null | undefined
  /** `false` si la dirección ya está a la vista (la sede, en el resumen): sólo el botón. */
  mostrarDireccion?: boolean
  className?: string
}) {
  const mapas = enlacesDeMapa(direccion, comuna)
  if (!mapas) return null
  const texto = [direccion?.trim(), comuna?.trim()].filter(Boolean).join(", ")
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {mostrarDireccion && (
        <p className="text-sm text-texto-2">
          Dirección: <span className="font-medium break-words text-navy">{texto}</span>
        </p>
      )}
      <Boton
        href={mapas.googleMaps}
        variante="secundario"
        icono={<Navigation />}
        aria-label={`Cómo llegar a ${texto} con Google Maps (se abre en otra pestaña)`}
        className="w-full sm:w-auto sm:self-start"
        {...AFUERA}
      >
        Cómo llegar
      </Boton>
    </div>
  )
}
