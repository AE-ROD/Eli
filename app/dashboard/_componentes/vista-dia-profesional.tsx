"use client"

import { useId, type ReactNode } from "react"
import Link from "next/link"
import { CalendarClock } from "lucide-react"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { TarjetaCita } from "@/components/panel/tarjeta-cita"
import { cn } from "@/lib/utils"
import { LineaDeTiempoDia, citaParaTarjeta } from "./linea-de-tiempo-dia"
import { formatearTiempoLibre, minutosLibresEnFranjas, type CitaDelDia } from "@/lib/horario-dia"
import type { EstadisticasDelPanel } from "../_datos"

/**
 * Lo mínimo de las cifras del panel que necesita la vista del profesional.
 * `horarioHoy` viene ausente si no tiene horario activo cargado para hoy.
 */
type EstadisticasDelProfesional = Pick<EstadisticasDelPanel, "citasHoy" | "citasHoyLista" | "horarioHoy">

interface PropsDeVistaDiaProfesional {
  /** Nulo mientras cargan. */
  estadisticas: EstadisticasDelProfesional | null
}

function tituloResumen(citasHoy: number): string {
  if (citasHoy === 0) return "Tu día está libre"
  return citasHoy === 1 ? "1 cita hoy" : `${citasHoy} citas hoy`
}

/** El enlace a configuración dentro de un aviso: subrayado, como un enlace en medio del texto. */
function EnlaceAConfiguracion() {
  return (
    <Link
      href="/dashboard/configuracion"
      className="rounded-sm font-medium text-navy underline decoration-[1.5px] underline-offset-4 anillo-foco"
    >
      Configuración
    </Link>
  )
}

/** Lista simple de citas, reutilizada por los dos estados que no pueden dibujar la línea de tiempo (sin horario / horario inválido). */
function ListaCitasDelDia({ citas }: { citas: CitaDelDia[] }) {
  const idDelTitulo = useId()
  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo={citas.length > 0 ? "Tus citas de hoy" : "Sin citas para hoy"}
        icono={{ figura: CalendarClock, color: "azul" }}
      />
      <div className="mt-5">
        {citas.length > 0 ? (
          <ul className="space-y-2">
            {citas.map((cita) => (
              <li key={cita.id}>
                <TarjetaCita cita={citaParaTarjeta(cita)} compacta />
              </li>
            ))}
          </ul>
        ) : (
          <EstadoVacio>Tampoco tienes citas agendadas para hoy.</EstadoVacio>
        )}
      </div>
    </section>
  )
}

/** Aviso reutilizado por los dos estados "no se puede calcular" (sin horario / horario inválido). */
function AvisoHorario({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Aviso tono="info" titulo={titulo}>
      {children}
    </Aviso>
  )
}

export function VistaDiaProfesional({ estadisticas }: PropsDeVistaDiaProfesional) {
  const idDelTitulo = useId()

  if (!estadisticas) {
    return (
      <div aria-busy="true" className={cn(TARJETA_DEL_PANEL, "p-8 text-center text-sm text-texto-2")}>
        Cargando tu día...
      </div>
    )
  }

  const { citasHoy, citasHoyLista, horarioHoy } = estadisticas

  // Sin horario activo para hoy: no hay contra qué medir el tiempo libre, así
  // que no se inventa ninguna cifra. Igual se muestran las citas que haya.
  if (!horarioHoy) {
    return (
      <div className="space-y-4">
        <AvisoHorario titulo="No tienes un horario cargado para hoy">
          Sin horario no se puede calcular tu tiempo libre. Se configura en <EnlaceAConfiguracion />.
        </AvisoHorario>
        <ListaCitasDelDia citas={citasHoyLista} />
      </div>
    )
  }

  const minutosLibres = minutosLibresEnFranjas(horarioHoy, citasHoyLista)

  // Una franja con la hora de fin antes (o igual) que la de inicio no se puede
  // medir: "0 minutos libres" sería una cifra inventada, así que el día se
  // lee igual que "no tienes horario cargado" — no se dibuja la línea de
  // tiempo sobre un dato que no se pudo validar.
  if (minutosLibres === null) {
    return (
      <div className="space-y-4">
        <AvisoHorario titulo="Tu horario de hoy no es válido">
          Una franja tiene la hora de fin antes o igual que la de inicio, así que no se puede calcular tu tiempo
          libre. Se corrige en <EnlaceAConfiguracion />.
        </AvisoHorario>
        <ListaCitasDelDia citas={citasHoyLista} />
      </div>
    )
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo={tituloResumen(citasHoy)}
        subtitulo={
          <span className="tabular-nums">
            {minutosLibres > 0 ? `${formatearTiempoLibre(minutosLibres)} sin reservar hoy` : "Tu agenda de hoy está completa"}
          </span>
        }
        icono={{ figura: CalendarClock, color: "azul" }}
      />

      <div className="mt-5">
        <LineaDeTiempoDia franjas={horarioHoy} citas={citasHoyLista} />
      </div>
    </section>
  )
}
