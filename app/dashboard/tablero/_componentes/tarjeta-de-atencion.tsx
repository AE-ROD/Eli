"use client"

import { useId } from "react"
import { ArrowLeft, Ban, Check, Pencil, Undo2 } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { Insignia } from "@/components/comunes/insignia"
import { aCentavos, deCentavos, nombreDeEstado, type EstadoActivo } from "@/lib/atenciones"
import {
  accionPrincipal,
  accionesSecundarias,
  faltaAsignar,
  ofreceDeshacerLlegada,
  quedoSinPorcentaje,
} from "@/lib/acciones-del-tablero"
import { formatearMonto } from "@/lib/dinero"
import { formatearHora, tiempoDesde } from "@/lib/fechas"
import type { Actor } from "@/lib/permisos"
import { cn } from "@/lib/utils"
import type { Atencion, PagoRegistrado } from "../_datos"
import { CLASES_DE_TARJETA, Herramienta, LineaDeServicio, MomentoDeTarjeta, NombreDeTarjeta } from "./partes-de-tarjeta"
import type { PropsDeArrastre } from "./tarjeta-de-reserva"

/**
 * Desde cuándo está en la columna, dicho como se lee en el local: "Llegó
 * hace 5 min", "Empezó hace 40 min". Lo cobrado, con la hora del cobro.
 */
function momentoDe(atencion: Atencion, ahora: number): { texto: string; iso: string } {
  if (atencion.estado === "finalizada" && atencion.cobradaEn) {
    return { texto: `Cobrada a las ${formatearHora(atencion.cobradaEn)}`, iso: atencion.cobradaEn }
  }
  if (atencion.estado === "por-cobrar") {
    const iso = atencion.terminoEn ?? atencion.empezoEn ?? atencion.llegoEn
    return { texto: `Terminó ${tiempoDesde(iso, ahora)}`, iso }
  }
  if (atencion.estado === "en-atencion") {
    const iso = atencion.empezoEn ?? atencion.llegoEn
    return { texto: `Empezó ${tiempoDesde(iso, ahora)}`, iso }
  }
  return { texto: `Llegó ${tiempoDesde(atencion.llegoEn, ahora)}`, iso: atencion.llegoEn }
}

/**
 * Cómo se pagó, en una línea: "Efectivo + Tarjeta de débito". Un medio usado
 * dos veces se nombra una sola. Sin pagos, el total era cero: una cortesía.
 */
function medioDelCobro(pagos: PagoRegistrado[]): string {
  if (pagos.length === 0) return "Sin pago (cortesía)"
  return [...new Set(pagos.map((pago) => pago.nombreMedio))].join(" + ")
}

interface PropsDeTarjetaDeAtencion {
  atencion: Atencion
  /**
   * Cómo se nombra la atención en sus botones, para el lector de pantalla:
   * el cliente y la hora y, si otra del tablero se llama igual, un ordinal
   * (`nombresSinRepetir`). Lo calcula el tablero, que las ve todas.
   */
  quien: string
  actor: Actor | null
  /** El mismo instante para todo el tablero, en milisegundos. */
  ahora: number
  /** Hay un pedido en curso para esta atención: los botones esperan. */
  enCurso: boolean
  arrastre: PropsDeArrastre
  onDeshacerLlegada: () => void
  onMover: (hacia: EstadoActivo) => void
  onCobrar: () => void
  onEditar: () => void
  onAnular: () => void
}

/**
 * Una atención en el tablero: el cliente, desde cuándo está, qué se le hace y
 * quién, y el total si quien mira puede verlo. Los botones son sólo los que
 * quien mira puede usar (`lib/acciones-del-tablero.ts`): el de la acción del
 * día ("Empezar atención", "Pasar a cobro" y, en primario, "Cobrar") y debajo
 * los de ícono para lo demás.
 *
 * La tarjeta se puede enfocar desde el código (`data-atencion`): después de
 * moverla, el foco la sigue a su columna nueva.
 */
export function TarjetaDeAtencion({
  atencion,
  quien,
  actor,
  ahora,
  enCurso,
  arrastre,
  onDeshacerLlegada,
  onMover,
  onCobrar,
  onEditar,
  onAnular,
}: PropsDeTarjetaDeAtencion) {
  const idDelNombre = useId()
  const momento = momentoDe(atencion, ahora)
  const principal = accionPrincipal(actor, atencion.estado)
  const secundarias = accionesSecundarias(actor, atencion.estado)
  const volverA = secundarias.volverA
  const deshacer = ofreceDeshacerLlegada(actor, atencion)
  const cobrada = atencion.estado === "finalizada"
  const porCobrar = atencion.estado === "por-cobrar"
  const hayHerramientas = secundarias.editar || volverA !== null || deshacer || secundarias.anular

  return (
    <article
      aria-labelledby={idDelNombre}
      data-atencion={atencion.id}
      tabIndex={-1}
      {...arrastre}
      className={cn(CLASES_DE_TARJETA, arrastre.draggable && "cursor-grab active:cursor-grabbing")}
    >
      <MomentoDeTarjeta iso={momento.iso}>{momento.texto}</MomentoDeTarjeta>

      <NombreDeTarjeta id={idDelNombre}>
        {/* Quien se anotó en la fila virtual (#85) llega con su número: es el que ve en su celular y en la pantalla. */}
        {atencion.turno !== null && atencion.turno !== undefined && (
          <Insignia tono="azul" className="mr-1.5 h-5 px-2 align-middle tabular-nums">
            <span className="sr-only">Fila virtual, turno </span>
            <span aria-hidden="true">Turno </span>
            {atencion.turno}
          </Insignia>
        )}
        {atencion.cliente.nombre}
      </NombreDeTarjeta>

      {atencion.lineas.length > 0 ? (
        <ul className="flex flex-col gap-1" aria-label="Servicios">
          {atencion.lineas.map((linea) => (
            <LineaDeServicio key={linea.id} servicio={linea.servicio} profesional={linea.profesional.nombre}>
              {faltaAsignar(linea) && (
                <>
                  <span className="sr-only"> (ya no está en el equipo)</span>{" "}
                  <Insignia tono="naranja" className="h-5 px-2 align-middle">
                    Falta asignar
                  </Insignia>
                </>
              )}
              {/* Cobrada sin % de comisión (#65): queda pendiente hasta que la dueña lo fije. */}
              {quedoSinPorcentaje(atencion, linea) && (
                <>
                  <span className="sr-only"> (sin porcentaje de comisión)</span>{" "}
                  <Insignia tono="naranja" className="h-5 px-2 align-middle">
                    Sin %
                  </Insignia>
                </>
              )}
            </LineaDeServicio>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] leading-snug text-texto-2">Sin servicios todavía.</p>
      )}

      {atencion.notas && (
        <p className="line-clamp-2 text-[13px] leading-snug break-words text-texto-2 italic">{atencion.notas}</p>
      )}

      {/* El total, sólo si llega: al profesional el servidor no se lo manda. */}
      {atencion.total !== undefined &&
        (porCobrar ? (
          <div className="border-t border-borde pt-2.5">
            <p className="text-xs leading-snug text-texto-2">Total a cobrar</p>
            <p className="mt-1 text-[28px] leading-[1.05] font-medium tracking-[-1px] tabular-nums [overflow-wrap:anywhere]">
              {formatearMonto(atencion.total)}
            </p>
          </div>
        ) : (
          <p className="flex items-baseline justify-between gap-2 border-t border-borde pt-2.5 text-[13px]">
            <span className="text-texto-2">Total</span>
            <span className="text-sm font-semibold tabular-nums [overflow-wrap:anywhere]">
              {formatearMonto(atencion.total)}
            </span>
          </p>
        ))}

      {/* Cómo se pagó: también sólo para quien ve los pagos. */}
      {cobrada && atencion.pagos !== undefined && (
        <p className="flex items-start gap-1.5 rounded-[12px] bg-superficie px-2.5 py-1.5 text-[13px] leading-snug font-medium">
          <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
          <span className="min-w-0 break-words">
            {atencion.pagos.length > 0 && <span className="sr-only">Pagado con </span>}
            {medioDelCobro(atencion.pagos)}
          </span>
        </p>
      )}

      {/* Las propinas (#66), aparte del total: sólo para quien ve los pagos. */}
      {cobrada && atencion.propinas !== undefined && atencion.propinas.length > 0 && (
        <p className="flex items-baseline justify-between gap-2 text-[13px]">
          <span className="text-texto-2">Propinas (aparte)</span>
          <span className="font-medium tabular-nums [overflow-wrap:anywhere]">
            {formatearMonto(deCentavos(atencion.propinas.reduce((suma, propina) => suma + aCentavos(propina.monto), 0)))}
          </span>
        </p>
      )}

      {principal && (
        <Boton
          variante={principal.tipo === "cobrar" ? "primario" : "secundario"}
          tamano="sm"
          onClick={principal.tipo === "cobrar" ? onCobrar : () => onMover(principal.hacia)}
          cargando={enCurso}
          aria-label={enCurso ? `Guardando: ${quien}` : `${principal.texto}: ${quien}`}
          className="w-full"
        >
          {principal.texto}
        </Boton>
      )}

      {porCobrar && !principal && (
        <p className="text-[13px] leading-snug text-texto-2">Lista para cobrar: la cobra el dueño o el encargado.</p>
      )}

      {hayHerramientas && (
        <div className="-mx-1 -mb-1 flex flex-wrap gap-1">
          {secundarias.editar && (
            <Herramienta
              icono={Pencil}
              etiqueta={`Editar servicios de ${quien}`}
              globo="Editar servicios"
              ocupado={enCurso}
              onClick={onEditar}
            />
          )}
          {volverA && (
            <Herramienta
              icono={ArrowLeft}
              etiqueta={`Volver a ${nombreDeEstado(volverA)}: ${quien}`}
              globo={`Volver a ${nombreDeEstado(volverA)}`}
              ocupado={enCurso}
              onClick={() => onMover(volverA)}
            />
          )}
          {/* La llegada se marcó por error: la reserva vuelve a "Reservas de hoy". */}
          {deshacer && (
            <Herramienta
              icono={Undo2}
              etiqueta={`Deshacer llegada: ${quien}`}
              globo="Deshacer la llegada"
              ocupado={enCurso}
              onClick={onDeshacerLlegada}
            />
          )}
          {secundarias.anular && (
            <Herramienta
              icono={Ban}
              etiqueta={cobrada ? `Anular el cobro de ${quien}` : `Anular la atención de ${quien}`}
              globo={cobrada ? "Anular el cobro" : "Anular la atención"}
              peligro
              ocupado={enCurso}
              onClick={onAnular}
            />
          )}
        </div>
      )}
    </article>
  )
}
