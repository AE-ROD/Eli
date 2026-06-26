"use client"

import { motion, AnimatePresence } from "framer-motion"
import { TarjetaPaciente, type Paciente } from "@/components/app/tarjetas/tarjeta-paciente"
import { BotonPrimario } from "@/components/app/formularios/boton-primario"
import { ChevronDown, User } from "lucide-react"

interface ListaPacientesProps {
  pacientes: Paciente[]
  cargando: boolean
  cargandoMas: boolean
  vista: "grid" | "lista"
  total: number
  pagina: number
  paginas: number
  panelAbierto?: boolean
  onSeleccionar: (p: Paciente) => void
  onCargarMas: () => void
}

function gridClass(panelAbierto?: boolean) {
  return panelAbierto
    ? "grid grid-cols-1 2xl:grid-cols-2 gap-4"
    : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
}

function SkeletonPacientes({ vista, panelAbierto }: { vista: "grid" | "lista"; panelAbierto?: boolean }) {
  return (
    <div className={vista === "grid" ? gridClass(panelAbierto) : "space-y-3"}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-card border border-border/50 rounded-xl p-4 animate-pulse">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-muted rounded w-2/3" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          </div>
          <div className="h-3 bg-muted rounded w-full" />
        </div>
      ))}
    </div>
  )
}

export function ListaPacientes({
  pacientes,
  cargando,
  cargandoMas,
  vista,
  total,
  pagina,
  paginas,
  panelAbierto,
  onSeleccionar,
  onCargarMas,
}: ListaPacientesProps) {
  if (cargando) return <SkeletonPacientes vista={vista} panelAbierto={panelAbierto} />

  if (pacientes.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <User className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-foreground mb-2">No se encontraron usuarios</h3>
        <p className="text-muted-foreground text-sm">
          Intenta cambiar los filtros o agrega un nuevo usuario
        </p>
      </div>
    )
  }

  return (
    <>
      <motion.div
        className={vista === "grid" ? gridClass(panelAbierto) : "space-y-3"}
        layout
      >
        <AnimatePresence mode="popLayout">
          {pacientes.map((paciente) => (
            <motion.div
              key={paciente.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
            >
              <TarjetaPaciente paciente={paciente} onClick={() => onSeleccionar(paciente)} />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {pagina < paginas && (
        <div className="mt-6 flex justify-center">
          <BotonPrimario
            variante="secundario"
            cargando={cargandoMas}
            icono={<ChevronDown className="h-4 w-4" />}
            iconoDerecha
            onClick={onCargarMas}
          >
            Cargar más ({total - pacientes.length} restantes)
          </BotonPrimario>
        </div>
      )}
    </>
  )
}
