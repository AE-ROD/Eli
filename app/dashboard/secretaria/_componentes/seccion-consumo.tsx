import { Bell, Gauge } from "lucide-react"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"
import type { AvisoDeLaSecretaria, ConsumoDelMes } from "../_lecturas"
import { fechaCorta, gastoEnUsd, porcentajeParaLaBarra, presupuestoEnUsd } from "../_formato"

interface PropsDeSeccionConsumo {
  activa: boolean
  consumo: ConsumoDelMes
  presupuestoCentavos: number
  avisos: AvisoDeLaSecretaria[]
  zona: string
}

/**
 * Cómo va el mes: si está encendida, cuánto gastó contra el presupuesto y
 * cuántos mensajes mandó; debajo, los últimos avisos (derivaciones y alertas
 * de presupuesto). Sólo lectura.
 */
export function SeccionConsumo({ activa, consumo, presupuestoCentavos, avisos, zona }: PropsDeSeccionConsumo) {
  const porcentaje = porcentajeParaLaBarra(consumo.porcentaje)
  const agotado = consumo.porcentaje >= 100

  return (
    <section aria-labelledby="secretaria-consumo" className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id="secretaria-consumo"
        titulo="Este mes"
        subtitulo={
          activa
            ? agotado
              ? "Se acabó el presupuesto del mes: Eli está en pausa hasta el próximo."
              : "Eli está encendida y respondiendo tu WhatsApp."
            : "Eli está apagada: tus clientas no reciben respuesta automática."
        }
        icono={{ figura: Gauge }}
      />

      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium text-navy">
            {gastoEnUsd(consumo.costoMicrodolares)} de {presupuestoEnUsd(presupuestoCentavos)}
          </span>
          <span className="text-texto-2">{porcentaje} %</span>
        </div>
        <div
          role="progressbar"
          aria-label="Presupuesto del mes usado"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={porcentaje}
          className="mt-2 h-2.5 overflow-hidden rounded-full bg-superficie"
        >
          <div
            className={cn("h-full rounded-full", agotado ? "bg-error" : porcentaje >= 80 ? "bg-naranja" : "bg-navy")}
            style={{ width: `${porcentaje}%` }}
          />
        </div>
        <p className="mt-3 text-sm text-texto-2">
          {consumo.mensajesEnviados === 1
            ? "1 mensaje enviado por WhatsApp"
            : `${consumo.mensajesEnviados} mensajes enviados por WhatsApp`}
        </p>
      </div>

      {avisos.length > 0 && (
        <div className="mt-5 border-t border-borde pt-4">
          <h3 className="flex items-center gap-2 text-sm font-medium text-navy">
            <Bell aria-hidden="true" className="size-4" strokeWidth={1.75} />
            Últimos avisos
          </h3>
          <ul className="mt-3 space-y-3">
            {avisos.map((aviso) => (
              <li key={aviso.id} className="text-sm">
                <p className="font-medium text-navy">{aviso.titulo}</p>
                <p className="mt-0.5 text-pretty text-texto-2">{aviso.cuerpo}</p>
                <p className="mt-0.5 text-xs text-texto-2">{fechaCorta(aviso.createdAt, zona)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
