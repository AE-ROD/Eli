"use client"

import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { formatearMonto } from "@/lib/dinero"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { puedeVerIngresos, type EstadisticasDelPanel } from "../_datos"

/**
 * Las tres cifras del inicio en el celular, chicas y en fila, arriba de todo:
 * las horas de hoy, lo cobrado este mes (o, para quien no ve la facturación,
 * los clientes nuevos del mes) y el total de clientes. Son las mismas cifras de
 * las tarjetas grandes del computador (`EstadisticasDelNegocio`), que en el
 * celular no se dibujan. Mientras cargan, un guion: nunca un cero que no es
 * cierto.
 */
export function NumerosDelDia({ estadisticas, className }: { estadisticas: EstadisticasDelPanel | null; className?: string }) {
  const { cita, cliente } = vocabularioDe(useRubroDelPanel()).palabras
  const conIngresos = puedeVerIngresos(estadisticas)

  const numeros = [
    { valor: estadisticas?.citasHoy ?? "—", texto: `${cita.plural} hoy` },
    conIngresos
      ? { valor: formatearMonto(estadisticas?.ingresosMes ?? 0), texto: "cobrado este mes" }
      : { valor: estadisticas?.clientesNuevosMes ?? "—", texto: "nuevos este mes" },
    { valor: estadisticas?.totalClientes ?? "—", texto: `${cliente.plural} en total` },
  ]

  return (
    <dl aria-busy={!estadisticas || undefined} className={cn("grid grid-cols-3 gap-2", className)}>
      {numeros.map((numero) => (
        <div key={numero.texto} className="flex min-w-0 flex-col-reverse rounded-[16px] bg-tarjeta px-2.5 py-2.5 shadow-sm squircle">
          <dt className="text-xs leading-snug text-texto-2">{numero.texto}</dt>
          <dd className="text-lg leading-tight font-semibold wrap-anywhere tabular-nums">{numero.valor}</dd>
        </div>
      ))}
    </dl>
  )
}
