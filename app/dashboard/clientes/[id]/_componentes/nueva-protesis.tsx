"use client"

import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { AnimatePresence } from "framer-motion"
import { Antetitulo } from "@/components/comunes/antetitulo"
import { Boton } from "@/components/comunes/boton"
import { Aviso } from "@/components/panel/aviso"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import { CAMPO, ETIQUETA, TARJETA_DEL_PANEL, TITULO_DE_TARJETA } from "@/components/panel/estilos"
import { COLOR_DE_CORONA, COLOR_DEL_CONTORNO } from "@/components/panel/odontograma/colores"
import type { OpcionesDeProtesisRespuesta, ProtesisRespuesta } from "@/lib/edicion-de-protesis"
import type { MarcaDelOdontograma } from "@/lib/odontograma"
import {
  ARCADAS,
  TIPOS_DE_PROTESIS,
  ZONAS_DE_LA_BASE,
  errorDelDiseno,
  esCordal,
  llevaBase,
  nombreDeTipo,
  tonoDeLaGuia,
  zonasPermitidas,
} from "@/lib/protesis"
import { cn } from "@/lib/utils"
import { crearProtesis } from "../_datos"
import { pesos } from "../_formato"
import {
  HERRAMIENTAS_DE_PROTESIS,
  admiteAmbas,
  admitePilares,
  alternarZona,
  avisoDelCordal,
  borradorInicial,
  cambiarArcada,
  cambiarTipo,
  disenoDelBorrador,
  elegirMaterial,
  faltasDelOdontograma,
  materialesPara,
  pedidoDelBorrador,
  repartoDelBorrador,
  sePuedenTocarLasPiezas,
  tituloDeProtesis,
  tocarPieza,
  valorDelBorrador,
  type BorradorDeProtesis,
  type HerramientaDeProtesis,
} from "../_protesis"
import { ArcadaDeProtesis } from "./arcada-de-protesis"
import { ResumenDeProtesis } from "./resumen-de-protesis"
import { SelectorDeTono } from "./tono-de-protesis"
import { useCambiosSinGuardar } from "./cambios-sin-guardar"

/** Los botones de opción (arcada, herramienta, zona): 40px de alto, el ::after los lleva a 44 para el dedo. */
const BOTON_DE_OPCION =
  "relative inline-flex h-10 items-center gap-2 rounded-[14px] border-[1.5px] px-3 text-sm font-medium text-navy squircle anillo-foco transition-colors duration-150 ease-suave after:absolute after:inset-x-0 after:-inset-y-0.5 disabled:cursor-not-allowed disabled:text-texto-2"

/** Una sigla por tipo, en su cuadro, como en el diseño. Decorativa: el nombre va al lado. */
const SIGLA_DEL_TIPO: Record<string, string> = { removible: "RP", total: "T", fija: "F", implante: "I", corona: "C" }

interface PropsDeNuevaProtesis {
  pacienteId: string
  opciones: OpcionesDeProtesisRespuesta
  /** Las marcas del odontograma guardado: lo ausente o con extracción indicada se dibuja punteado. */
  odontograma: readonly MarcaDelOdontograma[]
  /** Quien mira es la dueña: elige la tratante y ve las tres partes del reparto. */
  esLaDuena: boolean
  nombreDeQuienMira: string
  alCrear: (protesis: ProtesisRespuesta) => void
  alCancelar: () => void
}

/**
 * "Nueva prótesis" (`Main.dc.html`): el diseño sobre la arcada (arcada, tipo,
 * piezas protésicas y pilares tocando la arcada, sin cordales; zonas de la
 * base), el tono de la guía VITA, el material del catálogo, la tratante (sólo
 * la dueña elige), el laboratorio y la entrega estimada, y el resumen antes
 * de crear (`ResumenDeProtesis`, el mismo de la tarjeta) con el valor al
 * paciente y el reparto para leer.
 *
 * El valor y el reparto son una vista previa hecha con las reglas de
 * `lib/protesis.ts`, las mismas del servidor; al crear, el servidor los
 * vuelve a calcular con el catálogo y los congela. Lo que no sirve (un
 * diseño incompleto) lo dice `errorDelDiseno` antes de mandar.
 */
export function NuevaProtesis({ pacienteId, opciones, odontograma, esLaDuena, nombreDeQuienMira, alCrear, alCancelar }: PropsDeNuevaProtesis) {
  // Cómo empezó el borrador: si se tocó algo, cancelar o salir de la ficha pregunta antes.
  const [inicial] = useState<BorradorDeProtesis>(() => borradorInicial(opciones))
  const [borrador, setBorrador] = useState<BorradorDeProtesis>(inicial)
  const [preguntandoSiCancelar, setPreguntandoSiCancelar] = useState(false)
  const [herramienta, setHerramienta] = useState<HerramientaDeProtesis>("protesica")
  const [anuncio, setAnuncio] = useState("")
  /** Si lo último anunciado es que se tocó un cordal: ese aviso además se ve. */
  const [anuncioDelCordal, setAnuncioDelCordal] = useState(false)
  const [intentado, setIntentado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState("")
  const enviado = useRef(false)
  const titulo = useRef<HTMLHeadingElement>(null)
  const id = useId()

  // Al abrirse, el foco va al título: se lee qué es y se sigue con Tab.
  useEffect(() => titulo.current?.focus(), [])

  const hayCambios = JSON.stringify(borrador) !== JSON.stringify(inicial)
  useCambiosSinGuardar("nueva-protesis", "la prótesis nueva", hayCambios && !guardando)

  const cancelar = () => {
    if (hayCambios) setPreguntandoSiCancelar(true)
    else alCancelar()
  }

  const faltas = faltasDelOdontograma(odontograma)
  const diseno = disenoDelBorrador(borrador)
  const errorDeDiseno = errorDelDiseno(diseno)
  const compatibles = materialesPara(borrador.tipo, opciones.materiales)
  const material = compatibles.find((otro) => otro.id === borrador.materialId) ?? null
  const valor = valorDelBorrador(borrador, material)
  const reparto = material && valor?.ok ? repartoDelBorrador(valor.valorCents, material, borrador.tratante, opciones.excepciones) : null
  const permitidas = zonasPermitidas(borrador.tipo, borrador.arcada)
  const tratante = opciones.tratantes.find((otro) => otro.id === borrador.tratante)
  const laboratorio = opciones.laboratorios.find((lab) => lab.id === borrador.laboratorioId) ?? null
  const tipoEnMinuscula = nombreDeTipo(borrador.tipo).toLocaleLowerCase("es-CL")
  const errorParaMostrar = errorDeDiseno ?? (!material ? `Elige un material para ${tipoEnMinuscula}.` : valor && !valor.ok ? valor.error : null)

  const tocar = (pieza: number) => {
    if (esCordal(pieza)) {
      setAnuncioDelCordal(true)
      return setAnuncio(avisoDelCordal(pieza))
    }
    const siguiente = tocarPieza(borrador, pieza, herramienta)
    if (siguiente === borrador) return
    setAnuncioDelCordal(false)
    setBorrador(siguiente)
    const marca = siguiente.marcas[pieza]
    setAnuncio(`Pieza ${pieza}: ${marca === "protesica" ? "pieza protésica" : marca === "pilar" ? "pilar o gancho" : "sin marcar"}.`)
  }

  const crear = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (enviado.current) return
    setIntentado(true)
    if (errorParaMostrar) return
    enviado.current = true
    setAviso("")
    setGuardando(true)
    const resultado = await crearProtesis(pacienteId, pedidoDelBorrador(borrador, esLaDuena))
    if (!resultado.ok) {
      enviado.current = false
      setGuardando(false)
      return setAviso(resultado.error)
    }
    alCrear(resultado.datos)
  }

  const piezas = diseno.piezas
  const pilares = diseno.pilares
  const nombreDeLaTratante = esLaDuena
    ? borrador.tratante === "duenio"
      ? `${tratante?.nombre ?? nombreDeQuienMira} (tú)`
      : (tratante?.nombre ?? "—")
    : `${tratante?.nombre ?? nombreDeQuienMira} (tú)`

  return (
    <form onSubmit={crear} noValidate aria-label="Nueva prótesis" className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-6">
        <section aria-labelledby={`${id}-titulo`} className={cn(TARJETA_DEL_PANEL, "p-4 sm:p-6")}>
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <Antetitulo>Nueva prótesis</Antetitulo>
              <h2 id={`${id}-titulo`} ref={titulo} tabIndex={-1} className={cn(TITULO_DE_TARJETA, "mt-1.5 focus:outline-none")}>
                Diseño sobre la arcada
              </h2>
              <p className="mt-1 text-sm text-texto-2">Elige el tipo, toca las piezas y marca qué parte de la base se trabaja.</p>
            </div>
            <div role="group" aria-label="Arcada" className="flex gap-1 rounded-[16px] bg-superficie p-1 squircle">
              {ARCADAS.map((arcada) => {
                const noVa = arcada.id === "ambas" && !admiteAmbas(borrador.tipo)
                return (
                  <button
                    key={arcada.id}
                    type="button"
                    aria-pressed={borrador.arcada === arcada.id}
                    disabled={noVa}
                    title={noVa ? "Una corona unitaria va en una sola arcada" : undefined}
                    onClick={() => setBorrador(cambiarArcada(borrador, arcada.id))}
                    className={cn(BOTON_DE_OPCION, "border-transparent", borrador.arcada === arcada.id ? "bg-tarjeta shadow-sm" : "enabled:hover:bg-borde")}
                  >
                    {arcada.nombre}
                  </button>
                )
              })}
            </div>
          </div>

          <div role="group" aria-label="Tipo de prótesis" className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
            {TIPOS_DE_PROTESIS.map((tipo) => {
              const elegido = borrador.tipo === tipo.id
              return (
                <button
                  key={tipo.id}
                  type="button"
                  aria-pressed={elegido}
                  onClick={() => {
                    setBorrador(cambiarTipo(borrador, tipo.id, opciones.materiales, opciones.laboratorios))
                    if (herramienta === "pilar" && !admitePilares(tipo.id)) setHerramienta("protesica")
                  }}
                  className={cn(
                    "flex flex-col items-start gap-2 rounded-[20px] border-[1.5px] p-3 text-left text-navy squircle anillo-foco transition-colors duration-150 ease-suave",
                    elegido ? "border-navy bg-lila-suave" : "border-borde bg-tarjeta hover:bg-superficie"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn("grid size-8 place-items-center rounded-[10px] text-[13px] font-bold", elegido ? "bg-tarjeta" : "bg-superficie")}
                  >
                    {SIGLA_DEL_TIPO[tipo.id]}
                  </span>
                  <span>
                    <span className={cn("block text-sm", elegido ? "font-bold" : "font-semibold")}>{tipo.nombre}</span>
                    <span className="mt-0.5 block text-xs text-texto-2">{tipo.detalle}</span>
                  </span>
                </button>
              )
            })}
          </div>

          {sePuedenTocarLasPiezas(borrador.tipo) ? (
            <div role="group" aria-labelledby={`${id}-herramienta`} className="mt-5 flex flex-wrap items-center gap-2">
              <span id={`${id}-herramienta`} className="mr-1 antetitulo">
                Herramienta
              </span>
              {HERRAMIENTAS_DE_PROTESIS.map((opcion) => {
                const noVa = opcion.id === "pilar" && !admitePilares(borrador.tipo)
                return (
                  <button
                    key={opcion.id}
                    type="button"
                    aria-pressed={herramienta === opcion.id}
                    disabled={noVa}
                    title={noVa ? "Una corona unitaria no lleva pilares" : undefined}
                    onClick={() => setHerramienta(opcion.id)}
                    className={cn(
                      BOTON_DE_OPCION,
                      herramienta === opcion.id ? "border-navy bg-azul-suave" : "border-borde bg-tarjeta enabled:hover:bg-superficie"
                    )}
                  >
                    <MuestraDePieza marca={opcion.id} />
                    {opcion.nombre}
                  </button>
                )
              })}
              <span className="ml-auto text-[13px] text-texto-2 tabular-nums">
                {piezas.length} {piezas.length === 1 ? "pieza" : "piezas"} · {pilares.length} {pilares.length === 1 ? "pilar" : "pilares"}
              </span>
            </div>
          ) : (
            <p className="mt-5 text-sm text-texto-2">
              Una prótesis total reemplaza todas las piezas de la arcada menos los cordales ({piezas.length}): no hace falta
              tocarlas.
            </p>
          )}

          <p id={`${id}-ayuda`} className="sr-only">
            Con las flechas pasas de una pieza a otra; con Enter o Espacio la marcas con la herramienta elegida.
          </p>
          <div className="mt-4">
            <ArcadaDeProtesis
              arcada={borrador.arcada}
              marcas={
                borrador.tipo === "total" ? Object.fromEntries(piezas.map((pieza) => [pieza, "protesica" as const])) : borrador.marcas
              }
              faltas={faltas}
              conPaladar={diseno.zonas.includes("paladar")}
              conBarraLingual={diseno.zonas.includes("lingual")}
              editable={sePuedenTocarLasPiezas(borrador.tipo)}
              idDeLaAyuda={`${id}-ayuda`}
              alTocar={tocar}
            />
          </div>
          <p role="status" className={anuncioDelCordal ? "mt-2 text-[13px] text-texto-2" : "sr-only"}>
            {anuncio}
          </p>

          <div role="group" aria-labelledby={`${id}-zonas`} className="mt-4 flex flex-wrap items-center gap-2">
            <span id={`${id}-zonas`} className="mr-1 antetitulo">
              Zonas de la base
            </span>
            {llevaBase(borrador.tipo) ? (
              ZONAS_DE_LA_BASE.filter((zona) => permitidas.includes(zona.id)).map((zona) => {
                const marcada = diseno.zonas.includes(zona.id)
                return (
                  <button
                    key={zona.id}
                    type="button"
                    aria-pressed={marcada}
                    onClick={() => setBorrador(alternarZona(borrador, zona.id))}
                    className={cn(
                      "relative h-9 rounded-full border-[1.5px] px-3.5 text-[13px] text-navy anillo-foco transition-colors duration-150 ease-suave after:absolute after:inset-x-0 after:-inset-y-1",
                      marcada ? "border-navy bg-lila-suave font-semibold" : "border-borde bg-tarjeta font-medium hover:bg-superficie"
                    )}
                  >
                    <span aria-hidden="true">{marcada ? "✓ " : "+ "}</span>
                    {zona.nombre}
                  </button>
                )
              })
            ) : (
              <span className="text-[13px] text-texto-2">No aplica: las fijas, coronas e implantes no llevan base.</span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-borde pt-3.5 text-[13px] text-texto-2">
            <span className="inline-flex items-center gap-2">
              <MuestraDePieza marca="protesica" />
              Pieza protésica
            </span>
            {admitePilares(borrador.tipo) && (
              <span className="inline-flex items-center gap-2">
                <MuestraDePieza marca="pilar" />
                Pilar o gancho
              </span>
            )}
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="size-3.5 rounded-[5px] border-[1.5px] border-dashed border-texto-2 bg-superficie" />
              Ausente o con extracción indicada en el odontograma
            </span>
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-3.5 rounded-[5px] border-[1.5px] bg-superficie"
                style={{
                  borderColor: COLOR_DEL_CONTORNO,
                  backgroundImage: "repeating-linear-gradient(45deg, transparent 0 3px, rgb(95 109 119 / 0.35) 3px 4.5px)",
                }}
              />
              Cordal: no entra en una prótesis
            </span>
          </div>
        </section>

        <section aria-labelledby={`${id}-tono`} className={cn(TARJETA_DEL_PANEL, "p-4 sm:p-6")}>
          <h3 id={`${id}-tono`} className={TITULO_DE_TARJETA}>
            Tono
          </h3>
          <p className="mt-1 text-sm text-texto-2">Guía VITA classical, en su orden. Se puede cambiar hasta entregarla.</p>
          <SelectorDeTono
            valor={borrador.tono}
            alCambiar={(tono) => setBorrador({ ...borrador, tono })}
            idDelNombre={`${id}-tono`}
            className="mt-4"
          />
        </section>
      </div>

      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-6">
        <section aria-labelledby={`${id}-material`} className={cn(TARJETA_DEL_PANEL, "p-5")}>
          <h3 id={`${id}-material`} className={TITULO_DE_TARJETA}>
            Material
          </h3>
          <p className="mt-1 text-[13px] text-texto-2">Los que sirven para {tipoEnMinuscula}</p>
          {compatibles.length === 0 ? (
            <Aviso tono="atencion" className="mt-3">
              {esLaDuena
                ? "No hay materiales activos para este tipo. Agrégalos o actívalos en Comisiones, en Reparto de prótesis."
                : "No hay materiales activos para este tipo. Pídele a la dueña que los active en Comisiones."}
            </Aviso>
          ) : (
            <div role="group" aria-label="Material" className="mt-3 flex flex-col gap-1.5">
              {compatibles.map((otro) => {
                const elegido = otro.id === borrador.materialId
                return (
                  <button
                    key={otro.id}
                    type="button"
                    aria-pressed={elegido}
                    onClick={() => setBorrador(elegirMaterial(borrador, otro, opciones.laboratorios))}
                    className={cn(
                      "flex min-h-14 w-full items-center gap-3 rounded-[18px] border-[1.5px] px-3 py-2 text-left text-navy squircle anillo-foco transition-colors duration-150 ease-suave",
                      elegido ? "border-navy bg-azul-suave" : "border-borde bg-tarjeta hover:bg-superficie"
                    )}
                  >
                    <span className={cn("min-w-0 flex-1 text-sm break-words", elegido ? "font-bold" : "font-semibold")}>{otro.nombre}</span>
                    <span className="text-[13px] font-medium whitespace-nowrap tabular-nums">
                      {pesos(otro.precioCents)} / {otro.unidad}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <section aria-labelledby={`${id}-quien`} className={cn(TARJETA_DEL_PANEL, "p-5")}>
          <h3 id={`${id}-quien`} className={TITULO_DE_TARJETA}>
            Quién y cuándo
          </h3>
          {esLaDuena ? (
            <div className="mt-3">
              <label htmlFor={`${id}-tratante`} className={ETIQUETA}>
                Odontólogo/a a cargo
              </label>
              <select
                id={`${id}-tratante`}
                value={borrador.tratante}
                onChange={(evento) => setBorrador({ ...borrador, tratante: evento.target.value })}
                className={cn(CAMPO, "cursor-pointer text-base")}
              >
                {opciones.tratantes.map((otro) => (
                  <option key={otro.id} value={otro.id}>
                    {otro.id === "duenio" ? `${otro.nombre} (tú)` : otro.nombre}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="mt-3 text-sm">
              <span className="text-texto-2">Odontólogo/a a cargo: </span>
              <span className="font-medium">{nombreDeLaTratante}</span>
            </p>
          )}
          <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,150px),1fr))] gap-2.5">
            <div>
              <label htmlFor={`${id}-laboratorio`} className={ETIQUETA}>
                Técnico / laboratorio
              </label>
              <select
                id={`${id}-laboratorio`}
                value={borrador.laboratorioId ?? ""}
                onChange={(evento) => setBorrador({ ...borrador, laboratorioId: evento.target.value || null })}
                className={cn(CAMPO, "cursor-pointer text-base")}
              >
                <option value="">Sin laboratorio asignado</option>
                {opciones.laboratorios.map((lab) => (
                  <option key={lab.id} value={lab.id}>
                    {lab.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-entrega`} className={ETIQUETA}>
                Entrega estimada
              </label>
              <input
                id={`${id}-entrega`}
                type="date"
                min="2000-01-01"
                value={borrador.entregaEstimada}
                onChange={(evento) => setBorrador({ ...borrador, entregaEstimada: evento.target.value })}
                className={cn(CAMPO, "text-base")}
              />
            </div>
          </div>
          {opciones.laboratorios.length === 0 && (
            <p className="mt-2 text-[13px] text-texto-2">
              {esLaDuena ? "Agrega los laboratorios en Configuración." : "La dueña agrega los laboratorios en Configuración."}
            </p>
          )}
        </section>

        <section aria-labelledby={`${id}-resumen`} className={cn(TARJETA_DEL_PANEL, "p-5")}>
          <Antetitulo>Resumen</Antetitulo>
          <ResumenDeProtesis
            titulo={tituloDeProtesis(borrador.tipo, borrador.arcada)}
            idDelTitulo={`${id}-resumen`}
            subtitulo="Así queda al crearla."
            tipo={borrador.tipo}
            tratante={nombreDeLaTratante}
            laboratorio={laboratorio ? { nombre: laboratorio.nombre, contacto: null } : null}
            accionSinLaboratorio={
              opciones.laboratorios.length > 0 && (
                <Boton
                  type="button"
                  variante="secundario"
                  tamano="sm"
                  onClick={() => document.getElementById(`${id}-laboratorio`)?.focus()}
                >
                  Elegir laboratorio
                </Boton>
              )
            }
            piezas={piezas}
            pilares={pilares}
            zonas={diseno.zonas}
            material={material ? { nombre: material.nombre, unidad: material.unidad, precioUnitarioCents: material.precioCents } : null}
            unidades={valor?.ok ? valor.unidades : null}
            tono={tonoDeLaGuia(borrador.tono)}
            entregaEstimada={borrador.entregaEstimada.trim() || null}
            dinero={valor?.ok ? { valorCents: valor.valorCents, pagadoCents: 0, saldoCents: valor.valorCents } : null}
            reparto={reparto}
            tratanteEsLaDuena={esLaDuena && borrador.tratante === "duenio"}
            vistaPrevia
          />

          {intentado && errorParaMostrar && (
            <Aviso tono="atencion" rol="status" className="mt-4">
              {errorParaMostrar}
            </Aviso>
          )}
          {aviso && <Aviso className="mt-4">{aviso}</Aviso>}

          <div className="mt-4 flex flex-col gap-2">
            <Boton type="submit" className="w-full" cargando={guardando}>
              Crear prótesis
            </Boton>
            <Boton type="button" variante="secundario" className="w-full" disabled={guardando} onClick={cancelar}>
              Cancelar
            </Boton>
          </div>
          <p className="mt-3 text-[13px] leading-snug text-texto-2">
            Queda en «Toma de impresión», con tu nombre y la fecha. El laboratorio, la entrega y el tono se pueden cambiar hasta
            entregarla.
          </p>
        </section>
      </div>
      <AnimatePresence>
        {preguntandoSiCancelar && (
          <ModalConfirmar
            titulo="¿Descartar esta prótesis?"
            descripcion="Todavía no se creó: si cancelas, se pierde lo que diseñaste."
            textoConfirmar="Descartar prótesis"
            textoCancelar="Seguir diseñando"
            peligro
            onConfirmar={() => {
              setPreguntandoSiCancelar(false)
              alCancelar()
            }}
            onCerrar={() => setPreguntandoSiCancelar(false)}
          />
        )}
      </AnimatePresence>
    </form>
  )
}

/** Cómo se ve cada marca en chico: para la barra de herramientas y la leyenda. Decorativa: va con su nombre. */
function MuestraDePieza({ marca }: { marca: HerramientaDeProtesis }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block size-3.5 shrink-0 rounded-[5px]",
        marca === "protesica" ? "border-[1.5px] border-navy bg-lila" : marca === "pilar" ? "border-[2.5px] bg-tarjeta" : "border-[1.5px] bg-tarjeta"
      )}
      style={{ borderColor: marca === "pilar" ? COLOR_DE_CORONA : marca === "borrar" ? COLOR_DEL_CONTORNO : undefined }}
    />
  )
}
