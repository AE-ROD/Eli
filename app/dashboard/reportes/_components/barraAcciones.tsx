"use client"

import { Download, Printer, CalendarClock, Save } from "lucide-react"
import { BotonPrimario } from "@/components/app/formularios/boton-primario"

interface Props {
  onExportarCsv: () => void
  onProgramar?: () => void
  onGuardar: () => void
  guardando?: boolean
  deshabilitarExport?: boolean
}

export function BarraAcciones({ onExportarCsv, onProgramar, onGuardar, guardando, deshabilitarExport }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-no-print>
      <BotonPrimario
        variante="secundario"
        tamaño="sm"
        icono={<Download className="h-4 w-4" />}
        onClick={onExportarCsv}
        disabled={deshabilitarExport}
      >
        Exportar CSV
      </BotonPrimario>
      <BotonPrimario
        variante="secundario"
        tamaño="sm"
        icono={<Printer className="h-4 w-4" />}
        onClick={() => window.print()}
      >
        Exportar PDF
      </BotonPrimario>
      {onProgramar && (
        <BotonPrimario
          variante="secundario"
          tamaño="sm"
          icono={<CalendarClock className="h-4 w-4" />}
          onClick={onProgramar}
        >
          Programar
        </BotonPrimario>
      )}
      <BotonPrimario
        variante="primario"
        tamaño="sm"
        icono={<Save className="h-4 w-4" />}
        onClick={onGuardar}
        cargando={guardando}
      >
        Guardar
      </BotonPrimario>
    </div>
  )
}
