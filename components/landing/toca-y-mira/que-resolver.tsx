"use client"

import { useId, useState, type ReactNode } from "react"
import { ChartColumn, Check, CreditCard, Link2, Plus, Users, type LucideIcon } from "lucide-react"
import { MaquetaCobro } from "@/components/landing/maquetas/maqueta-cobro"
import { MaquetaQuienCobra } from "@/components/landing/maquetas/maqueta-dia-a-la-vista"
import { MaquetaPeriodo } from "@/components/landing/maquetas/maqueta-lo-cobrado"
import { TINTES_DE_PASO } from "@/components/landing/maquetas/maqueta-piezas"
import { MaquetaReserva } from "@/components/landing/maquetas/maqueta-reserva"
import { EncabezadoDeLanding, SeccionDeLanding } from "@/components/landing/seccion-de-landing"
import { cn } from "@/lib/utils"

interface Opcion {
  id: string
  titulo: string
  icono: LucideIcon
  /** La pantalla de la app, en tamaño de teléfono. `abierta` vuelve a animar las que se mueven. */
  maqueta: (abierta: boolean) => ReactNode
  /** Sacadas de las secciones que esta reemplaza en el teléfono (recorrido, un día, tablero y reportes). */
  lineas: readonly string[]
}

/**
 * Lo que más le duele a quien llega, en cuatro preguntas. Todo lo que dicen
 * existe en el producto y sale de los textos de la landing; la comisión es lo
 * único que la landing no decía (`docs/PRODUCTO.md`, sección 3).
 */
const OPCIONES: readonly Opcion[] = [
  {
    id: "reservas",
    titulo: "Que reserven solas",
    icono: Link2,
    maqueta: (abierta) => <MaquetaReserva activa={abierta} />,
    lineas: [
      "Tienes tu página de reservas: la clienta elige el servicio, el día y la hora, y deja sus datos.",
      "La cita entra a la agenda con su precio.",
      "Recordatorio el día antes, a quien dejó su correo.",
    ],
  },
  {
    id: "cobro",
    titulo: "Cobrar sin enredos",
    icono: CreditCard,
    maqueta: (abierta) => <MaquetaCobro activa={abierta} />,
    lineas: [
      "El pago se divide entre los medios que haga falta y la caja cuadra sola.",
      "Efectivo, débito, crédito, transferencia o billetera digital.",
      "Si hubo un error se anula: queda quién, cuándo y por qué.",
    ],
  },
  {
    id: "reportes",
    titulo: "Saber cuánto gané",
    icono: ChartColumn,
    maqueta: () => <MaquetaPeriodo />,
    lineas: [
      "Hoy, esta semana, este mes o las fechas que elijas.",
      "Cuánto generó cada profesional y cada servicio, y cuánto entró por cada medio de pago.",
      "Filtra por turno: mañana, tarde o noche.",
    ],
  },
  {
    id: "equipo",
    titulo: "Mi equipo y comisiones",
    icono: Users,
    maqueta: () => <MaquetaQuienCobra />,
    lineas: [
      "Cada servicio lleva su profesional y su precio, y cada profesional ve solo lo que le toca.",
      "Cobran el dueño y el encargado; el profesional atiende.",
      "La comisión de cada profesional se calcula al cobrar, con el porcentaje que tú fijas.",
    ],
  },
]

/**
 * "¿Qué quieres resolver primero?": sólo en el teléfono, en lugar de "Cómo
 * funciona", "Un día", "Tablero" y "Reportes". Cuatro botones grandes, uno
 * debajo del otro; cada uno abre debajo una pantalla de la app y tres líneas.
 * Se abre uno a la vez y el primero viene abierto, para que nunca se vea
 * vacío. Tocar el abierto lo cierra.
 *
 * Cada botón lleva `aria-expanded` y `aria-controls`; su panel es una región
 * nombrada por él y, cerrado, queda `inert` (no lo alcanza el teclado ni el
 * lector de pantalla). Con movimiento reducido se abre sin transición.
 */
export function QueResolver() {
  const base = useId()
  const [abierta, setAbierta] = useState<number | null>(0)

  return (
    <SeccionDeLanding
      id="que-resolver"
      etiquetadaPor="que-resolver-titulo"
      className="bg-linear-to-b from-[#F5EBDC] to-[#EDE1CC] md:hidden"
    >
      <EncabezadoDeLanding
        id="que-resolver-titulo"
        antetitulo="Para tu negocio"
        titulo={
          <>
            ¿Qué quieres resolver <span className="resaltado">primero?</span>
          </>
        }
        subtitulo="Toca una y mira cómo se ve en Eli."
      />

      <ul className="mt-7 flex flex-col gap-3">
        {OPCIONES.map((opcion, indice) => {
          const abiertaEsta = abierta === indice
          const tinte = TINTES_DE_PASO[indice]
          const Icono = opcion.icono
          const idDelBoton = `${base}-boton-${opcion.id}`
          const idDelPanel = `${base}-panel-${opcion.id}`
          return (
            <li
              key={opcion.id}
              className={cn(
                "overflow-hidden rounded-[22px] bg-tarjeta shadow-sm squircle transition-shadow duration-300",
                abiertaEsta && "ring-2 ring-ciruela"
              )}
            >
              <h3>
                <button
                  type="button"
                  id={idDelBoton}
                  aria-expanded={abiertaEsta}
                  aria-controls={idDelPanel}
                  onClick={() => setAbierta(abiertaEsta ? null : indice)}
                  className="flex min-h-[68px] w-full cursor-pointer items-center gap-3 rounded-[22px] py-2.5 pl-3 pr-3.5 text-left text-[17px] font-semibold tracking-[-0.02em] text-navy anillo-foco"
                >
                  <span
                    aria-hidden="true"
                    className={cn("grid size-11 shrink-0 place-items-center rounded-[14px]", tinte.suave, tinte.texto)}
                  >
                    <Icono className="size-[22px]" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">{opcion.titulo}</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-[30px] shrink-0 place-items-center rounded-full transition-[rotate,background-color,color] duration-300 ease-suave",
                      abiertaEsta ? "rotate-45 bg-ciruela text-white" : "bg-pistacho-suave text-ciruela"
                    )}
                  >
                    <Plus className="size-4" strokeWidth={2} />
                  </span>
                </button>
              </h3>
              <div
                id={idDelPanel}
                role="region"
                aria-labelledby={idDelBoton}
                inert={!abiertaEsta}
                className={cn(
                  "grid transition-[grid-template-rows,opacity] duration-500 ease-llegada",
                  abiertaEsta ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                )}
              >
                <div className="overflow-hidden">
                  <div className="px-3.5 pb-4 pt-0.5">
                    <div
                      className={cn(
                        "@container flex justify-center rounded-[18px] px-2.5 py-4 squircle",
                        tinte.suave
                      )}
                    >
                      {opcion.maqueta(abiertaEsta)}
                    </div>
                    <ul className="mt-3.5 flex flex-col gap-2">
                      {opcion.lineas.map((linea) => (
                        <li key={linea} className="flex items-start gap-2.5 text-[15px] leading-[1.4]">
                          <span
                            aria-hidden="true"
                            className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-pistacho-suave text-ciruela"
                          >
                            <Check className="size-3.5" strokeWidth={2} />
                          </span>
                          {linea}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </SeccionDeLanding>
  )
}
