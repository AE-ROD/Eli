"use client"

import type { CSSProperties, ReactNode } from "react"
import {
  MaquetaAnuladas,
  MaquetaPeriodo,
  MaquetaPorProfesional,
  MaquetaTurno,
} from "@/components/landing/maquetas/maqueta-lo-cobrado"
import { EncabezadoDeLanding, SeccionDeLanding } from "@/components/landing/seccion-de-landing"
import { CLASES_DE_TONO, tonoEn } from "@/components/landing/tonos-de-la-landing"
import { TRAZOS_DE_REPORTES } from "@/components/landing/trazos-de-la-landing"
import { BotonDePausa } from "@/components/movimiento/boton-de-pausa"
import { TrazosOndulantes } from "@/components/movimiento/trazos-ondulantes"
import { useBloqueEnMovimiento } from "@/components/movimiento/usar-bloque-en-movimiento"
import { cn } from "@/lib/utils"

interface Reporte {
  id: string
  titulo: string
  texto: string
  maqueta: ReactNode
  /** La ancha pone el texto a la izquierda y la maqueta a la derecha; la angosta, el texto arriba. */
  ancha: boolean
}

/**
 * En dos filas, como el diseño: ancha y angosta arriba, angosta y ancha
 * abajo. Cada tarjeta, de su tinte (ciruela, frambuesa, pistacho y añil).
 * Dicen sólo lo que Reportes hace: el período, el turno como filtro, los
 * desgloses por profesional, servicio y medio de pago, y las anuladas.
 */
const REPORTES: readonly Reporte[] = [
  {
    id: "periodo",
    titulo: "Hoy, esta semana, este mes o las fechas que elijas",
    texto: "Cuánto entró en el período, en cuántas atenciones y el ticket promedio, con el historial de cada cobro.",
    maqueta: <MaquetaPeriodo />,
    ancha: true,
  },
  {
    id: "turno",
    titulo: "Filtra por turno: mañana, tarde o noche",
    texto: "Mañana es antes de las 12, tarde de 12 a 18 y noche desde las 18. Eliges uno y ves lo cobrado en esa parte del día.",
    maqueta: <MaquetaTurno />,
    ancha: false,
  },
  {
    id: "profesional",
    titulo: "Por profesional, servicio o medio de pago",
    texto:
      "Cuánto generó cada profesional y cada servicio, y cuánto entró por cada medio: efectivo, tarjetas, transferencia o billetera digital.",
    maqueta: <MaquetaPorProfesional />,
    ancha: false,
  },
  {
    id: "anuladas",
    titulo: "Las anuladas, con quién, cuándo y por qué",
    texto: "Lo cobrado no se reescribe. Si hubo un error se anula, y el registro queda a la vista.",
    maqueta: <MaquetaAnuladas />,
    ancha: true,
  },
]

/** Cada maqueta flota a su ritmo, como en el diseño. */
const FLOTAR = [
  { duracion: "7s", retraso: "0s" },
  { duracion: "7.4s", retraso: "-2s" },
  { duracion: "7.8s", retraso: "-4s" },
  { duracion: "7s", retraso: "-3s" },
] as const

/**
 * Los reportes: el titular y una grilla de cuatro tarjetas de color, cada
 * una con su maqueta. Desde lg van en dos filas (ancha y angosta, angosta y
 * ancha); en el teléfono, una debajo de otra con el texto arriba.
 *
 * Las barras crecen sin fin, las maquetas flotan y las líneas del titular se
 * ondulan: el botón de pausa lo congela todo, y fuera de la pantalla se
 * congela solo. Con movimiento reducido nada se mueve.
 */
export function SeccionReportes() {
  const { ref, pausado, setPausado, quieto } = useBloqueEnMovimiento<HTMLDivElement>()

  return (
    <SeccionDeLanding id="reportes" etiquetadaPor="reportes-titulo" tono="ciruela">
      <div ref={ref} className={cn("relative", quieto && "animaciones-en-pausa")}>
        <svg
          aria-hidden="true"
          viewBox="0 0 680 190"
          width="680"
          height="190"
          className="pointer-events-none absolute -top-[30px] left-[calc(100%-608px)] hidden overflow-visible min-[1360px]:block"
        >
          <TrazosOndulantes trazos={TRAZOS_DE_REPORTES} enPausa={quieto} />
        </svg>

        <EncabezadoDeLanding
          id="reportes-titulo"
          antetitulo="Reportes"
          className="relative max-w-[700px]"
          titulo={
            <>
              Sabes cuánto entró, cómo y <span className="resaltado">quién lo generó.</span>
            </>
          }
        />

        {/*
          Tres columnas para que las dos filas tengan los anchos del diseño
          (746 y 526, con 24 entre medio): la ancha ocupa dos, la angosta una,
          y la segunda fila va al revés.
        */}
        <ul className="mt-10 grid gap-5 md:mt-14 lg:grid-cols-[minmax(0,526fr)_minmax(0,196fr)_minmax(0,526fr)] lg:gap-6">
          {REPORTES.map((reporte, indice) => (
            <TarjetaDeReporte
              key={reporte.id}
              reporte={reporte}
              indice={indice}
              className={cn(reporte.ancha && "lg:col-span-2")}
            />
          ))}
        </ul>

        <div className="mt-6 flex justify-end motion-reduce:hidden">
          <BotonDePausa pausado={pausado} alCambiar={setPausado} etiqueta="Pausar la animación de los reportes" />
        </div>
      </div>
    </SeccionDeLanding>
  )
}

function TarjetaDeReporte({ reporte, indice, className }: { reporte: Reporte; indice: number; className?: string }) {
  const tono = CLASES_DE_TONO[tonoEn(indice)]
  const flotar = FLOTAR[indice]
  return (
    <li
      className={cn(
        "flex flex-col gap-6 overflow-hidden rounded-[34px] p-6 squircle md:p-10 lg:min-h-[410px] lg:p-7 xl:p-10",
        tono.suave,
        // Texto al lado de la maqueta sólo donde la tarjeta ancha tiene lugar:
        // sola en su fila (md) o en la grilla desde xl.
        reporte.ancha && "md:flex-row md:items-center md:gap-9 lg:flex-col lg:items-stretch lg:gap-6 xl:flex-row xl:items-center xl:gap-9",
        className
      )}
    >
      <div className={cn(reporte.ancha && "md:max-w-[290px] md:flex-1 lg:max-w-none lg:flex-none xl:max-w-[290px] xl:flex-1")}>
        <h3 className="text-[1.5625rem] font-semibold leading-[1.15] tracking-[-0.035em]">{reporte.titulo}</h3>
        {/* Sobre los tintes, el gris del texto secundario no llega a 4,5:1: navy al 75%. */}
        <p className="mt-2.5 text-[15px] leading-normal text-navy/75">{reporte.texto}</p>
      </div>
      <div
        className={cn(
          "w-full animate-flotar [--giro:0deg]",
          reporte.ancha
            ? "md:ml-auto md:max-w-[340px] lg:ml-0 lg:mt-auto lg:max-w-[446px] xl:ml-auto xl:mt-0 xl:max-w-[340px]"
            : "mt-auto max-w-[446px]"
        )}
        style={{ "--duracion": flotar.duracion, "--retraso": flotar.retraso } as CSSProperties}
      >
        {reporte.maqueta}
      </div>
    </li>
  )
}
