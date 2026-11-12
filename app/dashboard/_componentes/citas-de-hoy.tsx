"use client"

import { useId } from "react"
import { CalendarDays } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { TarjetaCita } from "@/components/panel/tarjeta-cita"
import type { CitaDelDia } from "@/lib/horario-dia"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { frasesDelInicio } from "../_frases"
import { citaParaTarjeta } from "./linea-de-tiempo-dia"

interface PropsDeCitasDeHoy {
  /** Nulo mientras cargan las cifras del panel. */
  citas: CitaDelDia[] | null
  /** La zona del negocio (la manda `/api/dashboard/stats`): las horas se leen en ella. */
  zona?: string
  className?: string
}

/** La lista de citas de hoy, con el atajo a la agenda. */
export function CitasDeHoy({ citas, zona, className }: PropsDeCitasDeHoy) {
  const idDelTitulo = useId()
  // "Sin paciente" en una clínica dental; "Horas de hoy" en un salón.
  const { palabras } = vocabularioDe(useRubroDelPanel())
  const frases = frasesDelInicio(palabras).citasDeHoy

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6", className)}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo={frases.titulo}
        subtitulo={citas ? frases.resumen(citas.length) : "Cargando..."}
        icono={{ figura: CalendarDays, color: "azul" }}
        accion={
          <Boton href="/dashboard/agenda" variante="enlace" tamano="sm">
            Ver agenda
          </Boton>
        }
      />

      <div className="mt-5">
        {!citas ? (
          <ListaCargando texto={frases.cargando} />
        ) : citas.length > 0 ? (
          <ul className="space-y-2">
            {citas.map((cita) => (
              <li key={cita.id}>
                <TarjetaCita cita={citaParaTarjeta(cita, palabras.cliente.singular, zona)} compacta />
              </li>
            ))}
          </ul>
        ) : (
          <EstadoVacio>{frases.sinCitas}</EstadoVacio>
        )}
      </div>
    </section>
  )
}

/** Tres renglones con el alto de una cita, para que nada salte cuando llegan. */
function ListaCargando({ texto }: { texto: string }) {
  return (
    <div aria-busy="true" className="space-y-2">
      <span className="sr-only">{texto}</span>
      {[0, 1, 2].map((renglon) => (
        <div key={renglon} aria-hidden="true" className="flex h-[3.75rem] items-center gap-3 rounded-[20px] bg-superficie px-3">
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <Esqueleto className="w-2/5" />
            <Esqueleto className="h-2.5 w-3/5" />
          </span>
          <Esqueleto className="w-10" />
        </div>
      ))}
    </div>
  )
}
