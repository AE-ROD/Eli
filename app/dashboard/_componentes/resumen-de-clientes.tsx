"use client"

import { useId } from "react"
import { Users } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"
import type { EstadisticasDelPanel } from "../_datos"

interface PropsDeResumenDeClientes {
  /** Nulo mientras cargan. */
  estadisticas: EstadisticasDelPanel | null
}

/** Cuántos clientes tiene el negocio y cuántos se sumaron este mes. */
export function ResumenDeClientes({ estadisticas }: PropsDeResumenDeClientes) {
  const idDelTitulo = useId()

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "flex flex-col p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Clientes"
        subtitulo={estadisticas ? `${estadisticas.totalClientes} en total` : "Cargando..."}
        icono={{ figura: Users, color: "lila" }}
        accion={
          <Boton href="/dashboard/clientes" variante="enlace" tamano="sm">
            Ver todos
          </Boton>
        }
      />

      <div className="mt-5">
        {estadisticas && estadisticas.totalClientes === 0 ? (
          <EstadoVacio>Aún no tienes clientes registrados</EstadoVacio>
        ) : (
          <div className="rounded-[20px] bg-lila-suave px-4 py-3.5 squircle">
            <p className="font-medium tabular-nums">
              {estadisticas
                ? `${estadisticas.totalClientes} ${estadisticas.totalClientes === 1 ? "cliente" : "clientes"}`
                : "—"}
            </p>
            {/* Sobre el lila, el gris secundario no llega a 4,5:1: el texto chico va en navy al 75%. */}
            <p className="mt-0.5 text-[13px] text-navy/75">
              {estadisticas && estadisticas.clientesNuevosMes > 0
                ? `${estadisticas.clientesNuevosMes} desde el 1 de este mes`
                : "Se suman al reservar"}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
