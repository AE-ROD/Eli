import { CheckCircle2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { ShiftCloseStatus } from "./tipos"

const ESTILOS_ESTADO: Record<ShiftCloseStatus, string> = {
  BORRADOR: "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100",
  CERRADO: "bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100",
  REVISADO: "bg-green-100 text-green-800 border-green-200 hover:bg-green-100",
}

const ETIQUETAS_ESTADO: Record<ShiftCloseStatus, string> = {
  BORRADOR: "Borrador",
  CERRADO: "Cerrado",
  REVISADO: "Revisado",
}

export function BadgeEstadoCierre({ estado }: { estado: ShiftCloseStatus }) {
  return (
    <Badge variant="outline" className={ESTILOS_ESTADO[estado]}>
      {estado === "REVISADO" && <CheckCircle2 className="h-3 w-3" />}
      {ETIQUETAS_ESTADO[estado]}
    </Badge>
  )
}
