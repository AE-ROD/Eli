"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PERIODOS } from "./tipos"

interface TrabajadorOpcion {
  id: string
  nombre: string
}

interface FiltrosCierreTurnoProps {
  periodo: string
  onPeriodo: (valor: string) => void
  estado: string
  onEstado: (valor: string) => void
  trabajadorId: string
  onTrabajador: (valor: string) => void
  trabajadores: TrabajadorOpcion[]
  mostrarFiltroTrabajador: boolean
}

export function FiltrosCierreTurno({
  periodo,
  onPeriodo,
  estado,
  onEstado,
  trabajadorId,
  onTrabajador,
  trabajadores,
  mostrarFiltroTrabajador,
}: FiltrosCierreTurnoProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <Select value={periodo} onValueChange={onPeriodo}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Período" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Todos">Todos los períodos</SelectItem>
          {PERIODOS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={estado} onValueChange={onEstado}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Todos">Todos los estados</SelectItem>
          <SelectItem value="BORRADOR">Borrador</SelectItem>
          <SelectItem value="CERRADO">Cerrado</SelectItem>
          <SelectItem value="REVISADO">Revisado</SelectItem>
        </SelectContent>
      </Select>

      {mostrarFiltroTrabajador && (
        <Select value={trabajadorId} onValueChange={onTrabajador}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Trabajador" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Todos">Todos los trabajadores</SelectItem>
            {trabajadores.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
