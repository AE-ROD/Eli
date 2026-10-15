import type { ReactNode } from "react"
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type TonoDeAviso = "error" | "info" | "atencion" | "listo"

/**
 * Cada tono con su fondo y su ícono. El texto es navy sobre los pasteles y
 * rojo sobre el rojo suave: todos pasan 4,5:1.
 */
const TONOS: Record<TonoDeAviso, { caja: string; icono: LucideIcon }> = {
  error: { caja: "bg-error/6 text-error", icono: CircleAlert },
  info: { caja: "bg-superficie text-navy", icono: Info },
  atencion: { caja: "bg-naranja-suave text-navy", icono: TriangleAlert },
  listo: { caja: "bg-lima-suave text-navy", icono: CircleCheck },
}

interface PropsDeAviso {
  /**
   * - `error` (por defecto): algo no se pudo hacer.
   * - `info`: una indicación que está en la página desde que se dibuja ("no
   *   tienes un horario cargado").
   * - `atencion`: algo que conviene saber porque lo que se ve está incompleto
   *   (el tablero o el reporte no muestran todo).
   * - `listo`: algo que salió bien y cambió lo que se ve (un cobro anulado).
   */
  tono?: TonoDeAviso
  /**
   * Cómo lo anuncia el lector de pantalla: `alert` lo lee apenas aparece e
   * interrumpe; `status` espera a que termine lo que estaba leyendo. Por
   * defecto, `alert` en un error y nada en los demás tonos, que no se
   * anuncian salvo que se pida `status`.
   */
  rol?: "alert" | "status"
  /** Una primera línea en negrita, con el resto debajo. Sin título, el mensaje entero va en negrita. */
  titulo?: ReactNode
  /** Lo que se puede hacer al respecto (reintentar): a la derecha, o debajo si no entra. */
  accion?: ReactNode
  className?: string
  children: ReactNode
}

/**
 * El aviso del panel, fuera de un campo: la respuesta del servidor cuando
 * algo falla, una indicación, o lo que cambió después de una acción. Es el
 * mismo de todas las pantallas del panel. Lleva ícono además del color: el
 * color solo no le dice nada a quien no lo distingue. El error de un campo va
 * debajo del campo (`ErrorDeCampo`).
 *
 * Sólo se dibuja cuando hay algo que decir: quien lo usa decide cuándo
 * aparece, y con `alert` o `status` el lector lo anuncia al aparecer.
 */
export function Aviso({ tono = "error", rol, titulo, accion, className, children }: PropsDeAviso) {
  const { caja, icono: Icono } = TONOS[tono]

  return (
    <div
      role={rol ?? (tono === "error" ? "alert" : undefined)}
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-campo px-4 py-3 text-sm squircle",
        caja,
        className
      )}
    >
      {/* `basis-60`: con una acción al lado, el texto se queda con 240px antes de mandarla abajo. */}
      <div className="flex min-w-0 flex-1 basis-60 items-start gap-2.5">
        <Icono aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
        {titulo ? (
          <div className="min-w-0 break-words">
            <p className="font-medium">{titulo}</p>
            <div className={cn("mt-1", tono === "info" ? "text-texto-2" : "text-navy")}>{children}</div>
          </div>
        ) : (
          <p className="min-w-0 font-medium break-words">{children}</p>
        )}
      </div>
      {accion}
    </div>
  )
}
