import { MessageCircle } from "lucide-react"
import { Insignia } from "@/components/comunes/insignia"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"
import type { CanalDeLaSecretaria } from "../_lecturas"

/**
 * Si el WhatsApp del negocio está conectado a Eli. Sólo la dueña. Sin datos
 * técnicos: la dueña no copia identificadores ni tokens de Meta. Conectarlo
 * ella misma con un botón (Embedded Signup de Meta) es la etapa siguiente;
 * mientras, la tarjeta dice el estado y que viene pronto.
 */
export function SeccionWhatsapp({ inicial }: { inicial: CanalDeLaSecretaria | null }) {
  const estado = !inicial ? "sin-conectar" : inicial.activo ? "conectado" : "en-pausa"

  return (
    <section aria-labelledby="secretaria-whatsapp" className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id="secretaria-whatsapp"
        titulo="Tu WhatsApp"
        subtitulo="El número donde Eli atiende a tus clientas."
        icono={{ figura: MessageCircle }}
      />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Insignia tono={estado === "conectado" ? "lima" : "gris"}>
          {estado === "conectado" ? "Conectado" : estado === "en-pausa" ? "En pausa" : "Sin conectar"}
        </Insignia>
        <p className="text-sm text-texto-2">
          {estado === "conectado"
            ? "Eli responde los mensajes que llegan a tu WhatsApp."
            : estado === "en-pausa"
              ? "Tu número está conectado, pero Eli no responde los mensajes que llegan."
              : "Muy pronto vas a poder conectar tu WhatsApp tú misma, con un botón y en un par de minutos. Mientras tanto, prueba a Eli en el simulador."}
        </p>
      </div>
    </section>
  )
}
