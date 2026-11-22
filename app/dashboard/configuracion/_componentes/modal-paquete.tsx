"use client"

import { useId } from "react"
import { Hash } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { Selector } from "@/components/comunes/selector"
import { Aviso } from "@/components/panel/aviso"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { ETIQUETA } from "@/components/panel/estilos"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { formatearMonto } from "@/lib/dinero"
import { SESIONES_MAXIMAS, SESIONES_MINIMAS } from "@/lib/paquetes"
import { vocabularioDe } from "@/lib/vocabulario"
import { frasesDeLosPaquetes, opcionesDeVigencia, vistaPreviaDelPaquete, type DatosDePaquete } from "../_paquetes"

/** Lo que el modal necesita de un servicio para ofrecerlo y comparar el precio. */
export interface ServicioParaPaquete {
  id: string
  name: string
  /** En unidades; `null` si el servicio no tiene precio (no hay con qué comparar). */
  price: number | null
  /** Sólo sobre uno activo se arma un paquete nuevo. */
  active: boolean
}

interface PropsDeModalPaquete {
  form: DatosDePaquete
  /** Los servicios activos del negocio: sobre ellos se arma un paquete. */
  servicios: readonly ServicioParaPaquete[]
  /** Al editar: el nombre del servicio del paquete, que no se cambia. */
  servicioFijo: string | null
  /** El precio suelto del servicio elegido, para decir cuánto se ahorra. */
  precioSuelto: number | null
  guardando: boolean
  /** Por qué no se pudo guardar, si falló: dentro del modal, que tapa la sección. */
  aviso: string
  onCambiarCampo: (campo: keyof DatosDePaquete, valor: string) => void
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void
  onCerrar: () => void
}

/**
 * Crear o editar un paquete de sesiones: qué servicio, cuántas sesiones,
 * cuánto cuesta entero y hasta cuándo vale. Mientras se escribe dice en
 * cuánto queda cada sesión y cuánto menos que pagarla suelta.
 */
export function ModalPaquete({
  form,
  servicios,
  servicioFijo,
  precioSuelto,
  guardando,
  aviso,
  onCambiarCampo,
  onSubmit,
  onCerrar,
}: PropsDeModalPaquete) {
  const frases = frasesDeLosPaquetes(vocabularioDe(useRubroDelPanel()).palabras)
  const modoEdicion = servicioFijo !== null
  // El pie queda fuera del <form>: su botón de envío lo nombra con `form`.
  const idDelFormulario = useId()
  const idDeLaVistaPrevia = useId()
  const vistaPrevia = vistaPreviaDelPaquete(form, precioSuelto)

  return (
    <MarcoDeModal
      titulo={modoEdicion ? "Editar paquete" : "Crear paquete"}
      antetitulo={frases.titulo}
      bloqueado={guardando}
      alCerrar={onCerrar}
      pie={
        <div className="flex flex-col-reverse gap-3 sm:flex-row escritorio:pt-1">
          <BotonPrimario type="button" variante="secundario" anchoCompleto onClick={onCerrar} disabled={guardando}>
            Cancelar
          </BotonPrimario>
          <BotonPrimario type="submit" form={idDelFormulario} anchoCompleto cargando={guardando}>
            {modoEdicion ? "Guardar cambios" : "Crear paquete"}
          </BotonPrimario>
        </div>
      }
    >
      <form id={idDelFormulario} onSubmit={onSubmit} className="space-y-5" noValidate>
        {modoEdicion ? (
          <div>
            <p className={ETIQUETA}>{frases.servicio}</p>
            <p className="font-medium break-words text-navy">{servicioFijo}</p>
          </div>
        ) : (
          <Selector
            etiqueta={frases.servicio}
            value={form.servicioId}
            onChange={(e) => onCambiarCampo("servicioId", e.target.value)}
            opciones={servicios.map((servicio) => ({
              valor: servicio.id,
              texto: servicio.price == null ? servicio.name : `${servicio.name} · ${formatearMonto(servicio.price)}`,
            }))}
            required
          >
            <option value="" disabled>
              {frases.eligeServicio}
            </option>
          </Selector>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <CampoFormulario
            etiqueta="¿Cuántas sesiones?"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Ej.: 6"
            maxLength={2}
            value={form.sesiones}
            onChange={(e) => onCambiarCampo("sesiones", e.target.value)}
            icono={<Hash className="h-4 w-4" />}
            className="tabular-nums"
            aria-describedby={idDeLaVistaPrevia}
            required
          />
          <CampoFormulario
            etiqueta="Precio del paquete completo"
            // Texto y no número, como el precio de un servicio: lo lee `leerMonto`.
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="Ej.: 150000"
            value={form.precio}
            onChange={(e) => onCambiarCampo("precio", e.target.value)}
            icono={<span className="text-sm" aria-hidden="true">$</span>}
            className="tabular-nums"
            aria-describedby={idDeLaVistaPrevia}
            required
          />
        </div>

        {/* Siempre montado: así el lector de pantalla anuncia la cuenta cuando aparece o cambia. */}
        <p
          id={idDeLaVistaPrevia}
          aria-live="polite"
          className={
            vistaPrevia
              ? "rounded-[14px] bg-superficie px-3.5 py-3 text-sm font-medium text-navy tabular-nums squircle"
              : "text-xs text-texto-2"
          }
        >
          {vistaPrevia ??
            `Entre ${SESIONES_MINIMAS} y ${SESIONES_MAXIMAS} sesiones. El precio es el de todas las sesiones juntas: acá verás en cuánto queda cada una.`}
        </p>

        <Selector
          etiqueta="¿Hasta cuándo vale?"
          value={form.vigencia}
          onChange={(e) => onCambiarCampo("vigencia", e.target.value)}
          opciones={opcionesDeVigencia(form.vigencia)}
        />

        {modoEdicion && <p className="text-xs text-texto-2">{frases.alEditar}</p>}

        {aviso && <Aviso>{aviso}</Aviso>}
      </form>
    </MarcoDeModal>
  )
}
