"use client"

import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { AnimatePresence } from "framer-motion"
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { Insignia } from "@/components/comunes/insignia"
import { Interruptor } from "@/components/comunes/interruptor"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { CAMPO, ETIQUETA, TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import { aCentavos, deCentavos, esPrecioValido } from "@/lib/atenciones"
import { formatearMonto, leerMonto } from "@/lib/dinero"
import { LARGO_MAXIMO_DEL_NOMBRE } from "@/lib/edicion-de-protesis"
import {
  UNIDADES,
  nombreDeTipo,
  textoDePorcentaje,
  tiposDeLaUnidad,
  type RepartoEnPuntosBase,
  type TipoDeProtesis,
  type Unidad,
} from "@/lib/protesis"
import { cn } from "@/lib/utils"
import {
  borrarExcepcionDeProtesis,
  crearExcepcionDeProtesis,
  crearMaterialDeProtesis,
  editarExcepcionDeProtesis,
  editarMaterialDeProtesis,
  leerComisiones,
  leerExcepcionesDeProtesis,
  leerLaboratoriosDeLaClinica,
  leerMaterialesDeProtesis,
  leerReparto,
  repartoParaEscribir,
  type ExcepcionDeProtesis,
  type MaterialDeProtesis,
  type MaterialEscrito,
  type RepartoEscrito,
} from "../_datos"

/** El color de cada parte: el pastel fuerte de un módulo, con texto navy. Nunca la única pista: cada una va con su nombre. */
const PARTES = [
  { clave: "pbOdontologo", escrita: "odontologo", nombre: "Tratante", color: "bg-lila" },
  { clave: "pbClinica", escrita: "clinica", nombre: "Clínica", color: "bg-azul" },
  { clave: "pbTecnico", escrita: "tecnico", nombre: "Laboratorio", color: "bg-naranja" },
] as const

const pesos = (centavos: number) => formatearMonto(deCentavos(centavos))

type Laboratorio = { id: string; nombre: string; activo: boolean }
type Odontologo = { id: string; nombre: string }

interface Datos {
  materiales: MaterialDeProtesis[]
  excepciones: ExcepcionDeProtesis[]
  laboratorios: Laboratorio[]
  odontologos: Odontologo[]
}

async function leerTodo(): Promise<{ ok: true; datos: Datos } | { ok: false; error: string }> {
  const [materiales, excepciones, laboratorios, comisiones] = await Promise.all([
    leerMaterialesDeProtesis(),
    leerExcepcionesDeProtesis(),
    leerLaboratoriosDeLaClinica(),
    leerComisiones(),
  ])
  if (!materiales.ok) return materiales
  if (!excepciones.ok) return excepciones
  if (!laboratorios.ok) return laboratorios
  if (!comisiones.ok) return comisiones
  return {
    ok: true,
    datos: {
      materiales: materiales.datos,
      excepciones: excepciones.datos,
      laboratorios: laboratorios.datos,
      // Las excepciones son de quienes atienden: los odontólogos del equipo.
      odontologos: comisiones.datos.miembros.filter((miembro) => miembro.rol === "worker").map(({ id, nombre }) => ({ id, nombre })),
    },
  }
}

/**
 * Comisiones › Reparto de prótesis (`ConfigReparto.dc.html`), sólo la dueña
 * de una clínica dental: la regla de cada material (precio, unidad, tipos,
 * reparto en tres partes que suma 100 %, laboratorio por defecto, activo) y
 * las excepciones por odontólogo, que mandan sobre la regla del material.
 *
 * Cómo se calcula es fijo (decisión del dueño): sobre lo que paga el
 * paciente, y se liquida al entregar. Se dice como texto, sin opciones.
 * Cada prótesis congela su regla al crearse: un cambio acá vale para las
 * nuevas.
 */
export function RepartoDeProtesisConfig() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState("")
  const [anuncio, setAnuncio] = useState("")
  const [modalMaterial, setModalMaterial] = useState<{ material: MaterialDeProtesis | null } | null>(null)
  const [modalExcepcion, setModalExcepcion] = useState<{ excepcion: ExcepcionDeProtesis | null } | null>(null)
  const [quitando, setQuitando] = useState<ExcepcionDeProtesis | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  /** Un ref y no sólo el estado: un doble clic llega antes de que se dibuje el botón ocupado. */
  const quitarEnviado = useRef(false)
  const [avisoDeQuitar, setAvisoDeQuitar] = useState("")
  const idMateriales = useId()
  const idExcepciones = useId()
  const idComo = useId()

  useEffect(() => {
    let vigente = true
    leerTodo().then((resultado) => {
      if (!vigente) return
      if (resultado.ok) setDatos(resultado.datos)
      else setError(resultado.error)
    })
    return () => {
      vigente = false
    }
  }, [])

  const recargar = async () => {
    setError("")
    const resultado = await leerTodo()
    if (resultado.ok) setDatos(resultado.datos)
    else setError(resultado.error)
  }

  if (!datos) {
    return error ? (
      <Aviso
        accion={
          <Boton variante="secundario" tamano="sm" onClick={() => void recargar()}>
            <RefreshCw aria-hidden="true" className="size-4" strokeWidth={2} />
            Reintentar
          </Boton>
        }
      >
        {error}
      </Aviso>
    ) : (
      <div role="status" className="space-y-4">
        <span className="sr-only">Cargando el reparto de prótesis…</span>
        {[0, 1].map((tarjeta) => (
          <div key={tarjeta} aria-hidden="true" className={cn(TARJETA_DEL_PANEL, "space-y-4 p-5 sm:p-6")}>
            <Esqueleto className="h-6 w-1/3" />
            <Esqueleto className="w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  const alGuardarMaterial = (guardado: MaterialDeProtesis, eraNuevo: boolean) => {
    setDatos((previos) =>
      previos && {
        ...previos,
        materiales: eraNuevo ? [...previos.materiales, guardado] : previos.materiales.map((otro) => (otro.id === guardado.id ? guardado : otro)),
        // El nombre del material se copia en las excepciones: que se vea el nuevo.
        excepciones: previos.excepciones.map((otra) => (otra.materialId === guardado.id ? { ...otra, materialNombre: guardado.nombre } : otra)),
      }
    )
    setAnuncio(eraNuevo ? `Se agregó ${guardado.nombre}.` : `Se guardó ${guardado.nombre}.`)
    setModalMaterial(null)
  }

  const alGuardarExcepcion = (guardada: ExcepcionDeProtesis, eraNueva: boolean) => {
    setDatos(
      (previos) =>
        previos && {
          ...previos,
          excepciones: eraNueva ? [...previos.excepciones, guardada] : previos.excepciones.map((otra) => (otra.id === guardada.id ? guardada : otra)),
        }
    )
    setAnuncio(`Se guardó la regla de ${guardada.memberNombre} en ${guardada.materialNombre}.`)
    setModalExcepcion(null)
  }

  const quitar = async () => {
    if (!quitando || quitarEnviado.current) return
    quitarEnviado.current = true
    setTrabajando(true)
    setAvisoDeQuitar("")
    const resultado = await borrarExcepcionDeProtesis(quitando.id)
    quitarEnviado.current = false
    setTrabajando(false)
    if (!resultado.ok) return setAvisoDeQuitar(resultado.error)
    setDatos((previos) => previos && { ...previos, excepciones: previos.excepciones.filter((otra) => otra.id !== quitando.id) })
    setAnuncio(`Se quitó la regla de ${quitando.memberNombre} en ${quitando.materialNombre}.`)
    setQuitando(null)
  }

  return (
    <div className="space-y-6">
      {error && <Aviso>{error}</Aviso>}
      <p role="status" className="sr-only">
        {anuncio}
      </p>

      <section aria-labelledby={idComo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
        <EncabezadoDeTarjeta id={idComo} titulo="Cómo se calcula" />
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          <li className="rounded-[24px] bg-superficie p-4 squircle">
            <p className="antetitulo">Porcentajes sobre</p>
            <p className="mt-1.5 font-medium">El valor que paga el paciente</p>
            <p className="mt-1 text-sm text-texto-2">Cada parte es un % de lo cobrado. No se descuenta el costo de los materiales.</p>
          </li>
          <li className="rounded-[24px] bg-superficie p-4 squircle">
            <p className="antetitulo">Se liquida cuando</p>
            <p className="mt-1.5 font-medium">La prótesis queda entregada</p>
            <p className="mt-1 text-sm text-texto-2">Lo cobrado antes de la entrega se libera al entregarla.</p>
          </li>
        </ul>
        <p className="mt-4 text-sm text-texto-2">
          Las prótesis se reparten en tres partes: la tratante, la clínica y el laboratorio. El resto de las prestaciones
          sigue con el % de comisión de cada profesional. Cada prótesis guarda su regla al crearse: lo que cambies aquí
          aplica a las prótesis nuevas; las creadas antes mantienen su regla.
        </p>
      </section>

      <section aria-labelledby={idMateriales} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
        <EncabezadoDeTarjeta
          id={idMateriales}
          titulo="Reglas por material"
          subtitulo="El precio, cómo se cobra, para qué tipos sirve y cuánto recibe cada parte."
          accion={
            <Boton type="button" tamano="sm" icono={<Plus aria-hidden="true" />} onClick={() => setModalMaterial({ material: null })}>
              Agregar material
            </Boton>
          }
        />
        <Leyenda className="mt-4" />
        {datos.materiales.length === 0 ? (
          <EstadoVacio className="mt-4" titulo="Sin materiales">
            Agrega los materiales con que trabaja la clínica para poder crear prótesis.
          </EstadoVacio>
        ) : (
          <ul className="mt-3 space-y-2">
            {datos.materiales.map((material) => (
              <li key={material.id} className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[20px] bg-superficie px-4 py-3.5 squircle">
                <div className="min-w-0 flex-[1_1_200px]">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold break-words">{material.nombre}</span>
                    {!material.activo && <Insignia className="bg-tarjeta">Desactivado</Insignia>}
                  </p>
                  <p className="mt-0.5 text-[13px] text-texto-2">
                    {pesos(material.precioCents)} por {material.unidad} · {material.tipos.map(nombreDeTipo).join(", ")}
                  </p>
                  <p className="mt-0.5 text-[13px] text-texto-2">
                    Laboratorio por defecto: {material.laboratorioPorDefecto?.nombre ?? "ninguno"}
                  </p>
                </div>
                <BarraDeReparto reparto={material} className="min-w-0 flex-[1_1_220px]" />
                <Boton
                  type="button"
                  variante="secundario"
                  tamano="sm"
                  icono={<Pencil aria-hidden="true" />}
                  aria-label={`Editar la regla de ${material.nombre}`}
                  onClick={() => setModalMaterial({ material })}
                >
                  Editar
                </Boton>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={idExcepciones} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
        <EncabezadoDeTarjeta
          id={idExcepciones}
          titulo="Excepciones por profesional"
          subtitulo="Para quien tenga un acuerdo distinto en un material. La excepción manda sobre la regla del material."
          accion={
            <Boton
              type="button"
              variante="secundario"
              tamano="sm"
              icono={<Plus aria-hidden="true" />}
              disabled={datos.odontologos.length === 0 || datos.materiales.length === 0}
              onClick={() => setModalExcepcion({ excepcion: null })}
            >
              Agregar excepción
            </Boton>
          }
        />
        {datos.excepciones.length === 0 ? (
          <EstadoVacio className="mt-4" titulo="Sin excepciones">
            {datos.odontologos.length === 0
              ? "Cuando tengas odontólogos en el equipo, aquí les puedes dar un reparto propio por material."
              : "Todos siguen la regla de cada material."}
          </EstadoVacio>
        ) : (
          <ul className="mt-4 space-y-2">
            {datos.excepciones.map((excepcion) => (
              <li key={excepcion.id} className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[20px] bg-superficie px-4 py-3 squircle">
                <div className="min-w-0 flex-[1_1_180px]">
                  <p className="font-semibold break-words">{excepcion.memberNombre}</p>
                  <p className="text-[13px] text-texto-2">{excepcion.materialNombre}</p>
                </div>
                <PildorasDeReparto reparto={excepcion} />
                <div className="ml-auto flex gap-2">
                  <Boton
                    type="button"
                    variante="secundario"
                    tamano="sm"
                    aria-label={`Editar la regla de ${excepcion.memberNombre} en ${excepcion.materialNombre}`}
                    onClick={() => setModalExcepcion({ excepcion })}
                  >
                    Editar
                  </Boton>
                  <Boton
                    type="button"
                    variante="fantasma"
                    tamano="sm"
                    className="text-error hover:bg-error/8"
                    icono={<Trash2 aria-hidden="true" />}
                    aria-label={`Quitar la regla de ${excepcion.memberNombre} en ${excepcion.materialNombre}`}
                    onClick={() => {
                      setAvisoDeQuitar("")
                      setQuitando(excepcion)
                    }}
                  >
                    Quitar
                  </Boton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AnimatePresence>
        {modalMaterial && (
          <ModalMaterial
            material={modalMaterial.material}
            laboratorios={datos.laboratorios}
            alGuardar={alGuardarMaterial}
            alCerrar={() => setModalMaterial(null)}
          />
        )}
        {modalExcepcion && (
          <ModalExcepcion
            excepcion={modalExcepcion.excepcion}
            materiales={datos.materiales}
            odontologos={datos.odontologos}
            alGuardar={alGuardarExcepcion}
            alCerrar={() => setModalExcepcion(null)}
          />
        )}
        {quitando && (
          <ModalConfirmar
            titulo="Quitar la excepción"
            descripcion={`${quitando.memberNombre} vuelve a la regla de ${quitando.materialNombre} en sus prótesis nuevas. Las que ya tiene mantienen su regla.`}
            textoConfirmar="Quitar"
            textoCancelar="Cancelar"
            peligro
            trabajando={trabajando}
            aviso={avisoDeQuitar}
            onConfirmar={() => void quitar()}
            onCerrar={() => setQuitando(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function Leyenda({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-texto-2", className)}>
      {PARTES.map((parte) => (
        <span key={parte.clave} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("size-2.5 rounded-[4px]", parte.color)} />
          {parte.nombre}
        </span>
      ))}
    </div>
  )
}

/** La barra de las tres partes, con su nombre accesible en palabras. */
function BarraDeReparto({ reparto, className }: { reparto: RepartoEnPuntosBase; className?: string }) {
  return (
    <div
      role="img"
      aria-label={`Reparto: ${PARTES.map((parte) => `${parte.nombre.toLowerCase()} ${textoDePorcentaje(reparto[parte.clave])}`).join(", ")}`}
      className={cn("flex h-8 gap-[2px]", className)}
    >
      {PARTES.filter((parte) => reparto[parte.clave] > 0).map((parte) => (
        <div
          key={parte.clave}
          className={cn("flex min-w-0 items-center justify-center overflow-hidden rounded-[8px] text-xs font-semibold text-navy tabular-nums", parte.color)}
          style={{ flexBasis: `${reparto[parte.clave] / 100}%`, flexGrow: 0, flexShrink: 1 }}
        >
          {reparto[parte.clave] >= 1200 && textoDePorcentaje(reparto[parte.clave])}
        </div>
      ))}
    </div>
  )
}

/** Las tres partes de una excepción, en píldoras con su nombre para el lector de pantalla. */
function PildorasDeReparto({ reparto }: { reparto: RepartoEnPuntosBase }) {
  return (
    <ul className="flex flex-wrap gap-1.5 text-[13px] font-semibold tabular-nums">
      {PARTES.map((parte) => (
        <li key={parte.clave} className={cn("rounded-full px-2.5 py-0.5 text-navy", parte.color)}>
          <span className="sr-only">{parte.nombre}: </span>
          {textoDePorcentaje(reparto[parte.clave])}
        </li>
      ))}
    </ul>
  )
}

/** Los tres campos del reparto, con la suma en vivo y la barra. */
function CamposDeReparto({
  escrito,
  alCambiar,
  intentado,
}: {
  escrito: RepartoEscrito
  alCambiar: (escrito: RepartoEscrito) => void
  intentado: boolean
}) {
  const id = useId()
  const leido = leerReparto(escrito)
  const suma = leido.sumaPb
  return (
    <fieldset>
      <legend className={ETIQUETA}>Reparto</legend>
      <div className="grid grid-cols-3 gap-2">
        {PARTES.map((parte) => (
          <div key={parte.clave}>
            <label htmlFor={`${id}-${parte.escrita}`} className="mb-1 flex items-center gap-1.5 text-[13px] font-medium">
              <span aria-hidden="true" className={cn("size-2.5 rounded-[4px]", parte.color)} />
              {parte.nombre}
            </label>
            <div className="relative">
              <input
                id={`${id}-${parte.escrita}`}
                inputMode="decimal"
                value={escrito[parte.escrita]}
                onChange={(evento) => alCambiar({ ...escrito, [parte.escrita]: evento.target.value })}
                aria-describedby={`${id}-suma`}
                className={cn(CAMPO, "pr-7 text-right tabular-nums")}
              />
              <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-texto-2">
                %
              </span>
            </div>
          </div>
        ))}
      </div>
      {leido.ok && <BarraDeReparto reparto={leido.reparto} className="mt-3" />}
      <p
        id={`${id}-suma`}
        className={cn(
          "mt-2 rounded-[14px] px-3 py-2 text-[13px] font-medium",
          leido.ok ? "bg-lima-suave" : intentado || (suma !== null && suma !== 10_000) ? "bg-naranja-suave" : "bg-superficie"
        )}
      >
        {leido.ok ? "Suma 100 %." : leido.error}
      </p>
    </fieldset>
  )
}

interface PropsDeModalMaterial {
  material: MaterialDeProtesis | null
  laboratorios: Laboratorio[]
  alGuardar: (material: MaterialDeProtesis, eraNuevo: boolean) => void
  alCerrar: () => void
}

/** Agregar un material o cambiar su regla. Si el servidor lo rechaza (un nombre repetido), sigue abierto con el motivo. */
function ModalMaterial({ material, laboratorios, alGuardar, alCerrar }: PropsDeModalMaterial) {
  const [nombre, setNombre] = useState(material?.nombre ?? "")
  const [unidad, setUnidad] = useState<Unidad>(material?.unidad ?? "arcada")
  const [tipos, setTipos] = useState<TipoDeProtesis[]>(material?.tipos ?? tiposDeLaUnidad("arcada"))
  const [precio, setPrecio] = useState(material ? deCentavos(material.precioCents).toLocaleString("es-CL", { maximumFractionDigits: 2 }) : "")
  const [reparto, setReparto] = useState<RepartoEscrito>(
    material ? repartoParaEscribir(material) : { odontologo: "", clinica: "", tecnico: "" }
  )
  const [laboratorioId, setLaboratorioId] = useState(material?.laboratorioPorDefecto?.id ?? "")
  const [activo, setActivo] = useState(material?.activo ?? true)
  const [intentado, setIntentado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  /** Un ref y no sólo el estado: un doble clic llega antes de que se dibuje el botón ocupado. */
  const enviado = useRef(false)
  const [error, setError] = useState("")
  const id = useId()

  const monto = leerMonto(precio)
  const errorDePrecio = precio.trim() === "" ? "Escribe el precio" : monto === null || !esPrecioValido(monto) ? "Escribe el precio en pesos, por ejemplo 180.000" : ""
  const leido = leerReparto(reparto)
  const errorDeTipos = tipos.length === 0 ? "Elige al menos un tipo de prótesis." : ""
  // Los activos y, si el que tiene ya no lo está, también ése.
  const opcionesDeLaboratorio = laboratorios.filter((lab) => lab.activo || lab.id === material?.laboratorioPorDefecto?.id)

  const cambiarUnidad = (otra: Unidad) => {
    if (otra === unidad) return
    setUnidad(otra)
    setTipos(tiposDeLaUnidad(otra))
  }

  const guardar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    setIntentado(true)
    if (!nombre.trim() || errorDePrecio || errorDeTipos || !leido.ok || monto === null) return
    const datos: MaterialEscrito = {
      nombre: nombre.trim(),
      unidad,
      tipos,
      precioCents: aCentavos(monto),
      ...leido.reparto,
      laboratorioPorDefectoId: laboratorioId || null,
      activo,
    }
    if (enviado.current) return
    enviado.current = true
    setError("")
    setGuardando(true)
    const resultado = material ? await editarMaterialDeProtesis(material.id, cambiosDe(material, datos)) : await crearMaterialDeProtesis(datos)
    enviado.current = false
    setGuardando(false)
    if (!resultado.ok) return setError(resultado.error)
    alGuardar(resultado.datos, !material)
  }

  return (
    <MarcoDeModal
      titulo={material ? `Regla de ${material.nombre}` : "Agregar material"}
      descripcion="Aplica a las prótesis nuevas; las creadas antes mantienen su regla."
      bloqueado={guardando}
      ancho="lg"
      alCerrar={alCerrar}
    >
      <form onSubmit={guardar} noValidate className="space-y-5">
        <CampoFormulario
          etiqueta="Nombre"
          placeholder="Ej.: Acrílico termocurado"
          value={nombre}
          maxLength={LARGO_MAXIMO_DEL_NOMBRE}
          onChange={(evento) => setNombre(evento.target.value)}
          error={intentado && !nombre.trim() ? "Escribe el nombre del material" : undefined}
          autoFocus
          required
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset>
            <legend className={ETIQUETA}>Se cobra</legend>
            <div role="group" className="flex gap-1 rounded-[16px] bg-superficie p-1 squircle">
              {UNIDADES.map((opcion) => (
                <button
                  key={opcion.id}
                  type="button"
                  aria-pressed={unidad === opcion.id}
                  onClick={() => cambiarUnidad(opcion.id)}
                  className={cn(
                    "relative h-10 flex-1 rounded-[12px] px-3 text-sm font-medium text-navy squircle anillo-foco after:absolute after:inset-x-0 after:-inset-y-0.5",
                    unidad === opcion.id ? "bg-tarjeta font-semibold shadow-sm" : "hover:bg-borde"
                  )}
                >
                  Por {opcion.nombre}
                </button>
              ))}
            </div>
          </fieldset>
          <CampoFormulario
            etiqueta={`Precio por ${unidad}`}
            inputMode="numeric"
            placeholder="180.000"
            value={precio}
            onChange={(evento) => setPrecio(evento.target.value)}
            error={intentado && errorDePrecio ? errorDePrecio : undefined}
          />
        </div>

        <fieldset>
          <legend className={ETIQUETA}>Sirve para</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {tiposDeLaUnidad(unidad).map((tipo) => (
              <label key={tipo} className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={tipos.includes(tipo)}
                  onChange={(evento) => setTipos(evento.target.checked ? [...tipos, tipo] : tipos.filter((otro) => otro !== tipo))}
                  className="size-[18px] cursor-pointer accent-navy anillo-foco"
                />
                {nombreDeTipo(tipo)}
              </label>
            ))}
          </div>
          {intentado && errorDeTipos && <p className="mt-1 text-xs font-medium text-error">{errorDeTipos}</p>}
        </fieldset>

        <CamposDeReparto escrito={reparto} alCambiar={setReparto} intentado={intentado} />

        <div>
          <label htmlFor={`${id}-laboratorio`} className={ETIQUETA}>
            Laboratorio por defecto
          </label>
          <select
            id={`${id}-laboratorio`}
            value={laboratorioId}
            onChange={(evento) => setLaboratorioId(evento.target.value)}
            className={cn(CAMPO, "cursor-pointer text-base")}
          >
            <option value="">Ninguno</option>
            {opcionesDeLaboratorio.map((lab) => (
              <option key={lab.id} value={lab.id}>
                {lab.nombre}
                {!lab.activo ? " (desactivado)" : ""}
              </option>
            ))}
          </select>
          {laboratorios.length === 0 && <p className="mt-1.5 text-[13px] text-texto-2">Los laboratorios se agregan en Configuración.</p>}
        </div>

        <Interruptor
          etiqueta="Activo"
          descripcion="Un material desactivado no se ofrece en las prótesis nuevas."
          activo={activo}
          alCambiar={setActivo}
        />

        {error && <Aviso>{error}</Aviso>}
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row">
          <Boton type="button" variante="secundario" className="w-full" disabled={guardando} onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" className="w-full" cargando={guardando}>
            {material ? "Guardar regla" : "Agregar material"}
          </Boton>
        </div>
      </form>
    </MarcoDeModal>
  )
}

/** Lo que cambia de un material: sólo eso se manda (el reparto, las tres partes juntas). */
function cambiosDe(material: MaterialDeProtesis, datos: MaterialEscrito): Partial<MaterialEscrito> {
  const cambios: Partial<MaterialEscrito> = {}
  if (datos.nombre !== material.nombre) cambios.nombre = datos.nombre
  if (datos.unidad !== material.unidad) cambios.unidad = datos.unidad
  if (datos.tipos.length !== material.tipos.length || datos.tipos.some((tipo) => !material.tipos.includes(tipo))) cambios.tipos = datos.tipos
  if (datos.precioCents !== material.precioCents) cambios.precioCents = datos.precioCents
  if (
    datos.pbOdontologo !== material.pbOdontologo ||
    datos.pbClinica !== material.pbClinica ||
    datos.pbTecnico !== material.pbTecnico
  ) {
    cambios.pbOdontologo = datos.pbOdontologo
    cambios.pbClinica = datos.pbClinica
    cambios.pbTecnico = datos.pbTecnico
  }
  if (datos.laboratorioPorDefectoId !== (material.laboratorioPorDefecto?.id ?? null)) cambios.laboratorioPorDefectoId = datos.laboratorioPorDefectoId
  if (datos.activo !== material.activo) cambios.activo = datos.activo
  // Sin cambios, se manda el nombre: el servidor responde con el material como está.
  return Object.keys(cambios).length > 0 ? cambios : { nombre: datos.nombre }
}

interface PropsDeModalExcepcion {
  excepcion: ExcepcionDeProtesis | null
  materiales: MaterialDeProtesis[]
  odontologos: Odontologo[]
  alGuardar: (excepcion: ExcepcionDeProtesis, eraNueva: boolean) => void
  alCerrar: () => void
}

/** Agregar la regla de un odontólogo en un material, o cambiarla. Al elegir el material, parte de su regla. */
function ModalExcepcion({ excepcion, materiales, odontologos, alGuardar, alCerrar }: PropsDeModalExcepcion) {
  const [memberId, setMemberId] = useState(excepcion?.memberId ?? odontologos[0]?.id ?? "")
  const [materialId, setMaterialId] = useState(excepcion?.materialId ?? materiales[0]?.id ?? "")
  const delMaterial = materiales.find((material) => material.id === materialId)
  const [reparto, setReparto] = useState<RepartoEscrito>(() =>
    excepcion ? repartoParaEscribir(excepcion) : delMaterial ? repartoParaEscribir(delMaterial) : { odontologo: "", clinica: "", tecnico: "" }
  )
  const [intentado, setIntentado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  /** Un ref y no sólo el estado: un doble clic llega antes de que se dibuje el botón ocupado. */
  const enviado = useRef(false)
  const [error, setError] = useState("")
  const id = useId()

  const guardar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    setIntentado(true)
    const leido = leerReparto(reparto)
    if (!leido.ok || (!excepcion && (!memberId || !materialId))) return
    if (enviado.current) return
    enviado.current = true
    setError("")
    setGuardando(true)
    const resultado = excepcion
      ? await editarExcepcionDeProtesis(excepcion.id, leido.reparto)
      : await crearExcepcionDeProtesis({ memberId, materialId, ...leido.reparto })
    enviado.current = false
    setGuardando(false)
    if (!resultado.ok) return setError(resultado.error)
    alGuardar(resultado.datos, !excepcion)
  }

  return (
    <MarcoDeModal
      titulo={excepcion ? `Regla de ${excepcion.memberNombre}` : "Agregar excepción"}
      descripcion={
        excepcion
          ? `En ${excepcion.materialNombre}. Aplica a sus prótesis nuevas; las creadas antes mantienen su regla.`
          : "Manda sobre la regla del material para ese odontólogo, en sus prótesis nuevas."
      }
      bloqueado={guardando}
      ancho="lg"
      alCerrar={alCerrar}
    >
      <form onSubmit={guardar} noValidate className="space-y-5">
        {!excepcion && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-odontologo`} className={ETIQUETA}>
                Odontólogo
              </label>
              <select
                id={`${id}-odontologo`}
                value={memberId}
                onChange={(evento) => setMemberId(evento.target.value)}
                className={cn(CAMPO, "cursor-pointer text-base")}
              >
                {odontologos.map((odontologo) => (
                  <option key={odontologo.id} value={odontologo.id}>
                    {odontologo.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-material`} className={ETIQUETA}>
                Material
              </label>
              <select
                id={`${id}-material`}
                value={materialId}
                onChange={(evento) => {
                  setMaterialId(evento.target.value)
                  const otro = materiales.find((material) => material.id === evento.target.value)
                  if (otro) setReparto(repartoParaEscribir(otro))
                }}
                className={cn(CAMPO, "cursor-pointer text-base")}
              >
                {materiales.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.nombre}
                    {!material.activo ? " (desactivado)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {delMaterial && (
          <p className="text-[13px] text-texto-2">
            Regla de {delMaterial.nombre}:{" "}
            {PARTES.map((parte) => `${parte.nombre.toLowerCase()} ${textoDePorcentaje(delMaterial[parte.clave])}`).join(", ")}.
          </p>
        )}

        <CamposDeReparto escrito={reparto} alCambiar={setReparto} intentado={intentado} />

        {error && <Aviso>{error}</Aviso>}
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row">
          <Boton type="button" variante="secundario" className="w-full" disabled={guardando} onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" className="w-full" cargando={guardando}>
            {excepcion ? "Guardar regla" : "Agregar excepción"}
          </Boton>
        </div>
      </form>
    </MarcoDeModal>
  )
}
