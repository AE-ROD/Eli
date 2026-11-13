"use client"

import { useId } from "react"
import { ArrowLeft, Ban, Check, Pencil, Trash2, Undo2, Wallet } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { Insignia } from "@/components/comunes/insignia"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { aCentavos, deCentavos, esEstadoActivo, nombreDeEstado, type EstadoActivo } from "@/lib/atenciones"
import {
  accionPrincipal,
  accionesSecundarias,
  faltaAsignar,
  ofreceDeshacerLlegada,
  quedoSinPorcentaje,
} from "@/lib/acciones-del-tablero"
import { formatearMonto } from "@/lib/dinero"
import { formatearHora, tiempoDesde } from "@/lib/fechas"
import { puedeCobrarAbonosDeProtesis, type Actor } from "@/lib/permisos"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { esAbono, nombreDelAbono, type Atencion, type LineaDeServicio as Linea, type PagoRegistrado } from "../_datos"
import { frasesDelTablero } from "../_frases"
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
  /** Clínica dental: "Abonar a prótesis" (dueño y encargado, en una atención abierta con paciente). */
  onAbonar: () => void
  /** Quitar un abono antes de cobrar. */
  onQuitarAbono: (linea: Linea) => void
}

/**
 * El reparto de un abono cobrado, como lo ve quien mira: la dueña, las tres
 * partes; la odontóloga tratante, la suya. Al encargado no le llega.
 */
function textoDelReparto(reparto: NonNullable<NonNullable<Linea["abono"]>["reparto"]>): string {
  if (reparto.clinica === undefined || reparto.tecnico === undefined) return `Tu parte: ${formatearMonto(reparto.odontologo)}`
  return `Tratante ${formatearMonto(reparto.odontologo)} · Clínica ${formatearMonto(reparto.clinica)} · Laboratorio ${formatearMonto(reparto.tecnico)}`
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
  onAbonar,
  onQuitarAbono,
}: PropsDeTarjetaDeAtencion) {
  const idDelNombre = useId()
  // "Prestaciones" y "Sin prestaciones todavía." en una clínica dental.
  const frases = frasesDelTablero(vocabularioDe(useRubroDelPanel()).palabras).tarjeta
  const momento = momentoDe(atencion, ahora)
  const principal = accionPrincipal(actor, atencion.estado)
  const secundarias = accionesSecundarias(actor, atencion.estado)
  const volverA = secundarias.volverA
  const deshacer = ofreceDeshacerLlegada(actor, atencion)
  const cobrada = atencion.estado === "finalizada"
  const porCobrar = atencion.estado === "por-cobrar"
  // Abonar a una prótesis: en una atención abierta con paciente, quien cobra
  // (dueño y encargado) en una clínica dental. Si el paciente no tiene
  // prótesis, el modal lo dice: el tablero no lo sabe sin preguntar.
  const abonable = puedeCobrarAbonosDeProtesis(actor) && esEstadoActivo(atencion.estado) && atencion.cliente.id !== null
  const servicios = atencion.lineas.filter((linea) => !esAbono(linea))
  const abonos = atencion.lineas.filter(esAbono)
  const hayHerramientas = secundarias.editar || volverA !== null || deshacer || secundarias.anular || abonable

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

      {servicios.length > 0 ? (
        <ul className="flex flex-col gap-1" aria-label={frases.listaDeServicios}>
          {servicios.map((linea) => (
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
      ) : abonos.length === 0 ? (
        <p className="text-[13px] leading-snug text-texto-2">{frases.sinServicios}</p>
      ) : null}

      {/* Los abonos de prótesis, con su monto: no son un servicio y se quitan aparte, antes de cobrar. */}
      {abonos.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label="Abonos de prótesis">
          {abonos.map((linea) => (
            <li key={linea.id} className="rounded-[12px] bg-lila-suave px-2.5 py-1.5 text-[13px] leading-snug">
              <div className="flex items-start gap-1">
                <p className="min-w-0 flex-1 break-words">
                  {nombreDelAbono(linea.servicio)} <span className="text-navy/75">· {linea.profesional.nombre}</span>
                  <span className="block font-semibold tabular-nums">{formatearMonto(linea.precio)}</span>
                </p>
                {abonable && (
                  <Herramienta
                    icono={Trash2}
                    etiqueta={`Quitar el abono de ${formatearMonto(linea.precio)} (${nombreDelAbono(linea.servicio)}): ${quien}`}
                    globo="Quitar el abono"
                    peligro
                    ocupado={enCurso}
                    onClick={() => onQuitarAbono(linea)}
                  />
                )}
              </div>
              {linea.abono?.reparto && (
                <p className="mt-0.5 text-xs text-navy/75 tabular-nums [overflow-wrap:anywhere]">
                  {textoDelReparto(linea.abono.reparto)}
                </p>
              )}
            </li>
          ))}
        </ul>
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
              etiqueta={frases.editarDe(quien)}
              globo={frases.editarGlobo}
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
          {abonable && (
            <Herramienta
              icono={Wallet}
              etiqueta={`Abonar a prótesis: ${quien}`}
              globo="Abonar a prótesis"
              ocupado={enCurso}
              onClick={onAbonar}
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
