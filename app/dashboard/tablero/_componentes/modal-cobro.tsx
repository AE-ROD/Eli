"use client"

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import { CircleAlert, CircleCheck, CircleDashed, HandCoins, PackagePlus, Plus, Trash2, type LucideIcon } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { CAMPO, CAMPO_CON_ERROR, ERROR_DE_CAMPO, ETIQUETA } from "@/components/panel/estilos"
import { MAXIMO_DE_PAGOS, MAXIMO_DE_PROPINAS, aCentavos, deCentavos, type PagoPedido } from "@/lib/atenciones"
import {
  avisoAntesDeCobrar,
  errorDeMontoDePago,
  estadoDelCobro,
  filaDePagoSugerida,
  filaDePropinaSugerida,
  propinasDesdeFilas,
  totalDePropinasEnCentavos,
  type FilaDePago,
  type FilaDePropina,
  type PropinaPedida,
} from "@/lib/acciones-del-tablero"
import { formatearMonto } from "@/lib/dinero"
import { MAXIMO_DE_PAQUETES_POR_COBRO, nombreDelPaquete } from "@/lib/paquetes"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { Insignia } from "@/components/comunes/insignia"
import { esAbono, leerLineasSinPorcentaje, leerPaquetesParaCobrar, nombreDelAbono, type Atencion } from "../_datos"
import { frasesDelTablero } from "../_frases"
import { Aviso } from "@/components/panel/aviso"
import { BotonesDelPie } from "./botones-del-pie"
import {
  SIN_PAQUETES_PARA_COBRAR,
  paqueteLibrePara,
  resolverPaquetes,
  usosPorDefecto,
  type PaqueteOfrecido,
  type PaquetesParaCobrar,
  type PaquetesPedidos,
  type UsosElegidos,
  type VentaElegida,
} from "./paquetes-del-cobro"

/**
 * Cuánto se espera la revisión de comisiones antes de mostrar el cobro igual.
 * Si el servidor tarda más, el cobro no se frena por un aviso.
 */
const ESPERA_MAXIMA_DE_LA_REVISION_MS = 3000

let pagosAgregados = 0
let propinasAgregadas = 0

/** Toda la fila es el área táctil (44 px de alto), como las demás casillas del panel. */
const CASILLA_DE_PAQUETE = "flex min-h-11 cursor-pointer items-start gap-3 py-2.5 text-[13px] leading-snug font-medium text-navy"

/** `$150.000 · $25.000 por sesión`, y cuánto dura si la dueña le puso vigencia. */
function detalleDelPaquete(paquete: PaqueteOfrecido): string {
  const vigencia =
    paquete.vigenciaMeses === null ? "" : ` · vale por ${paquete.vigenciaMeses === 1 ? "1 mes" : `${paquete.vigenciaMeses} meses`}`
  return `${formatearMonto(paquete.precio)} · ${formatearMonto(paquete.valorPorSesion)} por sesión${vigencia}`
}

interface PropsDeModalCobro {
  /**
   * La atención como se la conoce. Si el servidor rechaza el cobro porque el
   * total cambió, la pantalla la reemplaza por la recién leída: el total y la
   * lista se actualizan y los pagos escritos se conservan.
   */
  atencion: Atencion
  mediosDePago: { id: string; nombre: string }[]
  /** El equipo y la dueña (`duenio`): la propina se ofrece a quienes de ellos atendieron. */
  profesionales: { id: string; nombre: string }[]
  /** Si se ofrece registrar propinas (`puedeRegistrarPropina`): no en una clínica dental. */
  conPropinas: boolean
  /** Si se venden y se usan paquetes de sesiones (`puedeVenderPaquetes`): no en una clínica dental. */
  conPaquetes: boolean
  /** Por qué no se pudo cobrar, si falló. */
  aviso: string
  guardando: boolean
  /** `pagos` son los medios normales: lo que cubre un paquete no va ahí, lo calcula el servidor. */
  onCobrar: (pagos: PagoPedido[], propinas: PropinaPedida[], paquetes: PaquetesPedidos) => void
  /** Se tocó un pago o un paquete: el aviso del intento anterior ya no es de lo que se ve. */
  onCambiarPagos: () => void
  onCerrar: () => void
}

/**
 * El total de la atención, en centavos. Dueño y encargado, que son quienes
 * cobran, siempre lo reciben; si no llegara, se suma de las líneas igual que
 * en el servidor.
 */
function totalEnCentavosDe(atencion: Atencion): number {
  if (atencion.total !== undefined) return aCentavos(atencion.total)
  return atencion.lineas.reduce((suma, linea) => suma + aCentavos(linea.precio), 0)
}

/**
 * Cobrar una atención: el resumen de lo que se hizo y los pagos, que pueden
 * repartirse entre varios medios. Lo que falta o sobra se calcula en vivo y
 * en centavos, y "Cobrar" se habilita sólo cuando los pagos dan el total
 * exacto: con la misma regla que aplica el servidor (`errorDeCobro`).
 *
 * Con paquetes de sesiones (`lib/paquetes.ts`): un servicio para el que la
 * clienta tiene un paquete usa una sesión y deja de sumar, y se le puede
 * vender un paquete ahí mismo. Lo que hay que pagar es lo que queda
 * (`resolverPaquetes`); si no queda nada, se registra la sesión sin pagos.
 */
export function ModalCobro({
  atencion,
  mediosDePago,
  profesionales,
  conPropinas,
  conPaquetes,
  aviso,
  guardando,
  onCobrar,
  onCambiarPagos,
  onCerrar,
}: PropsDeModalCobro) {
  const idBase = useId()
  const idDelFormulario = `${idBase}-formulario`
  // La palabra del rubro y sus avisos: "Sala de espera" en una clínica dental, "prestación" en vez de "servicio".
  // Memorizadas: la lectura de comisiones de más abajo depende de ellas y no debe repetirse en cada dibujo.
  const rubro = useRubroDelPanel()
  const palabras = useMemo(() => vocabularioDe(rubro).palabras, [rubro])
  const deDonde = frasesDelTablero(palabras).titulo
  const botonAgregar = useRef<HTMLButtonElement>(null)
  const botonAgregarPropina = useRef<HTMLButtonElement>(null)
  const botonVenderPaquete = useRef<HTMLButtonElement>(null)
  /** Para la clave de cada paquete que se agrega al cobro: el mismo paquete se puede vender dos veces. */
  const paquetesAgregados = useRef(0)
  const totalCentavos = totalEnCentavosDe(atencion)
  // La propina va a quien atendió esta atención (el servidor rechaza a otro):
  // sólo se ofrece a quien tiene una línea en ella.
  const quienesAtendieron = new Set(atencion.lineas.map((linea) => linea.profesional.id))
  const paraPropina = profesionales.filter((profesional) => quienesAtendieron.has(profesional.id))

  // Las propinas (#66) arrancan vacías: son opcionales y van aparte del total.
  const [propinas, setPropinas] = useState<FilaDePropina[]>([])

  // Lo de todos los días a la vista: un solo medio con el total ya puesto.
  // Pagar con varios medios y la propina se despliegan con un botón; si ya
  // hay más de un pago (o ninguno, con total cero) o alguna propina, se ven
  // abiertos. Los montos se calculan igual en los dos casos.
  const [variosMediosAbierto, setVariosMediosAbierto] = useState(false)
  const [propinasAbiertas, setPropinasAbiertas] = useState(false)
  const conPropinasAbiertas = propinasAbiertas || propinas.length > 0

  // Antes de cobrar (#118): qué líneas quedarían sin % de comisión. Se pide
  // al abrir y cada vez que cambian las líneas; se guarda con la firma que lo
  // pidió, para no mostrar lo de unas líneas que ya no son. Si no se puede
  // saber, no se avisa: es un aviso, el cobro no depende de esto.
  //
  // La primera vez se espera la respuesta antes de mostrar los pagos y el
  // botón (QA#11): si el aviso llegaba con el modal ya abierto, empujaba el
  // botón "Cobrar" justo cuando se iba a apretar y el clic caía en otro lado.
  // Así el aviso ya está al aparecer el botón. Si no llega a tiempo, el
  // cobro se muestra igual.
  const firmaDeLineas = `${atencion.id}:${atencion.lineas.map((linea) => linea.id).join(",")}`
  const [sinPorcentaje, setSinPorcentaje] = useState<{ firma: string; ids: string[] } | null>(null)
  const [esperaVencida, setEsperaVencida] = useState(false)
  useEffect(() => {
    let vigente = true
    leerLineasSinPorcentaje(atencion.id, palabras).then((resultado) => {
      if (vigente) setSinPorcentaje({ firma: firmaDeLineas, ids: resultado.ok ? resultado.datos : [] })
    })
    return () => {
      vigente = false
    }
  }, [atencion.id, firmaDeLineas, palabras])
  useEffect(() => {
    const espera = setTimeout(() => setEsperaVencida(true), ESPERA_MAXIMA_DE_LA_REVISION_MS)
    return () => clearTimeout(espera)
  }, [])

  // Paquetes de sesiones: lo que se ofrece y lo que le queda a la clienta se
  // pide al abrir, y se espera igual que la revisión de arriba, porque cambia
  // el total. Si llega después de la espera, se ofrece pero no se marca nada
  // solo: el total no se mueve bajo el dedo. Si no se puede leer, se cobra
  // como siempre, sin paquetes.
  const [paquetesLeidos, setPaquetesLeidos] = useState<{ datos: PaquetesParaCobrar; aTiempo: boolean } | null>(
    conPaquetes ? null : { datos: SIN_PAQUETES_PARA_COBRAR, aTiempo: true }
  )
  useEffect(() => {
    if (!conPaquetes) return
    let vigente = true
    const desde = Date.now()
    leerPaquetesParaCobrar(atencion.id).then((resultado) => {
      if (!vigente) return
      setPaquetesLeidos({
        datos: resultado.ok ? resultado.datos : SIN_PAQUETES_PARA_COBRAR,
        aTiempo: Date.now() - desde < ESPERA_MAXIMA_DE_LA_REVISION_MS,
      })
    })
    return () => {
      vigente = false
    }
  }, [atencion.id, conPaquetes])
  const paquetes = paquetesLeidos?.datos ?? SIN_PAQUETES_PARA_COBRAR

  // Qué línea usa una sesión de qué paquete. Mientras nadie toque una casilla
  // (`null`) vale lo marcado por defecto: cada servicio con paquete usa una.
  const [usosElegidos, setUsosElegidos] = useState<UsosElegidos | null>(null)
  const usos = usosElegidos ?? (paquetesLeidos?.aTiempo ? usosPorDefecto(atencion.lineas, paquetes.deLaClienta) : {})
  // Los paquetes que se venden en este cobro, y la lista de los que se ofrecen, plegada.
  const [ventas, setVentas] = useState<VentaElegida[]>([])
  const [ofreciendoPaquetes, setOfreciendoPaquetes] = useState(false)
  const conPaquete = resolverPaquetes(atencion.lineas, totalCentavos, paquetes, usos, ventas)
  const hayPaquetesEnElCobro = conPaquete.cubiertas.size > 0 || conPaquete.ventas.length > 0
  // Lo que se paga con los medios normales: lo que no cubre un paquete, más los paquetes que se venden.
  const aPagarCentavos = conPaquete.aPagarCentavos
  // Todo lo de hoy lo cubre su paquete: se registra la sesión sin pedir medio de pago.
  const nadaQuePagar = aPagarCentavos === 0 && hayPaquetesEnElCobro

  // Los pagos arrancan con todo en el primer medio, que es el caso de todos
  // los días, y mientras nadie escriba un monto (`null`) siguen a lo que hay
  // que pagar, que cambia al marcar un paquete. Con cero no hay nada que
  // pagar: se cobra sin pagos.
  const [filasEscritas, setFilasEscritas] = useState<FilaDePago[] | null>(null)
  const [medioInicial, setMedioInicial] = useState<string | null>(null)
  const filasSolas: FilaDePago[] =
    aPagarCentavos > 0
      ? [{ ...filaDePagoSugerida(mediosDePago, [], aPagarCentavos, "pago-inicial"), ...(medioInicial !== null && { medio: medioInicial }) }]
      : []
  const filas = filasEscritas === null || nadaQuePagar ? filasSolas : filasEscritas
  const conVariosMedios = variosMediosAbierto || filas.length !== 1

  const revisando = (sinPorcentaje === null || paquetesLeidos === null) && !esperaVencida
  const idsSinPorcentaje = new Set(sinPorcentaje?.firma === firmaDeLineas ? sinPorcentaje.ids : [])
  const lineasSinPorcentaje = atencion.lineas.filter((linea) => idsSinPorcentaje.has(linea.id)).length
  const avisoDeComisiones = avisoAntesDeCobrar(lineasSinPorcentaje, palabras)

  const cobro = estadoDelCobro(aPagarCentavos, filas)
  const deLasPropinas = propinasDesdeFilas(propinas)
  const listo = cobro.error === null && deLasPropinas.ok
  const hayMontoInvalido = filas.some((fila) => errorDeMontoDePago(fila.monto) !== null)

  const cambiarFila = (clave: string, cambios: Partial<FilaDePago>) => {
    // Elegir el medio no fija el monto: sigue a lo que haya que pagar.
    if (filasEscritas === null && cambios.monto === undefined && cambios.medio !== undefined) setMedioInicial(cambios.medio)
    else setFilasEscritas(filas.map((fila) => (fila.clave === clave ? { ...fila, ...cambios } : fila)))
    onCambiarPagos()
  }

  // Al agregar, el foco va al monto nuevo, que es lo que se ajusta; al
  // quitar, al botón de agregar, porque el que se apretó desaparece.
  const agregar = () => {
    // Desde que se agrega un pago, se ven todos los controles (también con total cero).
    setVariosMediosAbierto(true)
    pagosAgregados += 1
    const clave = `pago-${pagosAgregados}`
    setFilasEscritas([...filas, filaDePagoSugerida(mediosDePago, filas, aPagarCentavos, clave)])
    onCambiarPagos()
    requestAnimationFrame(() => document.getElementById(`${idBase}-${clave}-monto`)?.focus())
  }

  const quitar = (clave: string) => {
    setFilasEscritas(filas.filter((fila) => fila.clave !== clave))
    onCambiarPagos()
    requestAnimationFrame(() => botonAgregar.current?.focus())
  }

  // Marcar o desmarcar "usar 1 sesión de su paquete" en una línea.
  const usarSesion = (lineaId: string, paqueteId: string | null) => {
    const resto = Object.fromEntries(Object.entries(usos).filter(([id]) => id !== lineaId))
    setUsosElegidos(paqueteId === null ? resto : { ...resto, [lineaId]: paqueteId })
    onCambiarPagos()
  }

  // Al elegir un paquete la lista se pliega y el foco vuelve al botón, que sigue ahí para vender otro.
  const venderPaquete = (paquete: PaqueteOfrecido) => {
    paquetesAgregados.current += 1
    const clave = `paquete-${paquetesAgregados.current}`
    setVentas((previas) => [...previas, { clave, paqueteId: paquete.id, usarHoy: true }])
    setOfreciendoPaquetes(false)
    onCambiarPagos()
    requestAnimationFrame(() => botonVenderPaquete.current?.focus())
  }

  const cambiarVenta = (clave: string, usarHoy: boolean) => {
    setVentas((previas) => previas.map((venta) => (venta.clave === clave ? { ...venta, usarHoy } : venta)))
    onCambiarPagos()
  }

  const quitarVenta = (clave: string) => {
    setVentas((previas) => previas.filter((venta) => venta.clave !== clave))
    onCambiarPagos()
    requestAnimationFrame(() => botonVenderPaquete.current?.focus())
  }

  const cambiarPropina = (clave: string, cambios: Partial<FilaDePropina>) => {
    setPropinas((previas) => previas.map((fila) => (fila.clave === clave ? { ...fila, ...cambios } : fila)))
    onCambiarPagos()
  }

  const agregarPropina = () => {
    propinasAgregadas += 1
    const clave = `propina-${propinasAgregadas}`
    setPropinas((previas) => [...previas, filaDePropinaSugerida(atencion.lineas, profesionales, mediosDePago, clave)])
    onCambiarPagos()
    requestAnimationFrame(() => document.getElementById(`${idBase}-${clave}-monto`)?.focus())
  }

  // Despliega las propinas con la primera ya agregada: el foco va a su monto.
  const abrirPropinas = () => {
    setPropinasAbiertas(true)
    agregarPropina()
  }

  const quitarPropina = (clave: string) => {
    setPropinas((previas) => previas.filter((fila) => fila.clave !== clave))
    onCambiarPagos()
    requestAnimationFrame(() => botonAgregarPropina.current?.focus())
  }

  const cobrar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    // Sin propinas en pantalla (`conPropinas` falso), tampoco se mandan.
    if (listo && deLasPropinas.ok) onCobrar(cobro.pagos, conPropinas ? deLasPropinas.propinas : [], conPaquete.pedido)
  }

  const nombreDeMedio = (id: string) => mediosDePago.find((medio) => medio.id === id)?.nombre ?? "medio"

  return (
    <MarcoDeModal
      antetitulo={deDonde}
      titulo={`Cobrar a ${atencion.cliente.nombre}`}
      descripcion={`${hayPaquetesEnElCobro ? "Total a pagar" : "Total"}: ${formatearMonto(deCentavos(aPagarCentavos))}`}
      ancho="lg"
      bloqueado={guardando}
      alCerrar={onCerrar}
      // Mientras se revisan las comisiones no hay botones (QA#11, arriba). Después, en el pie: en el celular,
      // fijos abajo de la hoja y con el total a la vista en "Cobrar".
      pie={
        revisando ? undefined : (
          <BotonesDelPie
            formulario={idDelFormulario}
            onCancelar={onCerrar}
            guardando={guardando}
            deshabilitado={!listo}
            mientrasGuarda={nadaQuePagar ? "Registrando la sesión" : "Cobrando"}
          >
            {nadaQuePagar ? "Registrar sesión" : `Cobrar ${formatearMonto(deCentavos(aPagarCentavos))}`}
          </BotonesDelPie>
        )
      }
    >
      {revisando ? (
        <div role="status" className="space-y-3">
          <span className="sr-only">Preparando el cobro…</span>
          {[0, 1, 2, 3].map((fila) => (
            <Esqueleto key={fila} />
          ))}
        </div>
      ) : (
        <form id={idDelFormulario} onSubmit={cobrar} noValidate className="space-y-4 escritorio:space-y-6">
          <section aria-labelledby={`${idBase}-resumen`} className="rounded-[24px] bg-superficie p-4 squircle sm:p-5">
            <h3 id={`${idBase}-resumen`} className="mb-3 text-sm font-semibold">
              Lo que se hizo
            </h3>
            <ul className="space-y-2">
              {atencion.lineas.map((linea) => {
                const cobertura = conPaquete.cubiertas.get(linea.id)
                // La casilla de su paquete: en la línea que ya usa una sesión, o en la que todavía podría usarla.
                const suPaquete =
                  cobertura?.origen === "comprado" ? cobertura.paquete : cobertura ? null : paqueteLibrePara(linea, usos, paquetes.deLaClienta)
                return (
                  <li key={linea.id} className="text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 break-words">
                        {/* Un abono de prótesis suma como cualquier línea y no lleva %: su reparto sale de la prótesis. */}
                        {esAbono(linea) ? nombreDelAbono(linea.servicio) : linea.servicio}{" "}
                        <span className="text-texto-2">· {linea.profesional.nombre}</span>
                        {idsSinPorcentaje.has(linea.id) && (
                          <>
                            <span className="sr-only"> (quedará sin porcentaje de comisión)</span>{" "}
                            <Insignia tono="naranja" className="h-5 px-2 align-middle">
                              Sin %
                            </Insignia>
                          </>
                        )}
                      </span>
                      {cobertura ? (
                        // No suma a lo que hay que pagar: ya está pagada con el paquete.
                        <span className="max-w-[9.5rem] shrink-0 text-right text-[13px] font-medium">Cubierta por el paquete</span>
                      ) : (
                        <span className="shrink-0 tabular-nums">{formatearMonto(linea.precio)}</span>
                      )}
                    </div>
                    {suPaquete && (
                      <label className={CASILLA_DE_PAQUETE}>
                        <input
                          type="checkbox"
                          checked={cobertura !== undefined}
                          disabled={guardando}
                          onChange={(evento) => usarSesion(linea.id, evento.target.checked ? suPaquete.id : null)}
                          className="anillo-foco mt-px size-5 shrink-0 accent-navy"
                        />
                        <span className="min-w-0">
                          Usar 1 sesión de su paquete{" "}
                          <span className="font-normal text-texto-2">
                            ({suPaquete.restantes === 1 ? "le queda 1" : `le quedan ${suPaquete.restantes}`})
                          </span>
                        </span>
                      </label>
                    )}
                  </li>
                )
              })}

              {/* Los paquetes que se venden en este cobro: un renglón más, que se puede quitar. */}
              {conPaquete.ventas.map((venta) => {
                const nombre = nombreDelPaquete(venta.paquete.sesiones, venta.paquete.servicio)
                return (
                  <li key={venta.clave} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 break-words">
                        {nombre}{" "}
                        <Insignia tono="lila" className="h-5 px-2 align-middle">
                          Paquete nuevo
                        </Insignia>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <span className="tabular-nums">{formatearMonto(venta.paquete.precio)}</span>
                        <Boton
                          variante="fantasma"
                          onClick={() => quitarVenta(venta.clave)}
                          disabled={guardando}
                          aria-label={`Quitar del cobro: ${nombre}`}
                          title="Quitar"
                          className="-mr-2 size-11 px-0 text-texto-2 hover:bg-error/8 hover:text-error"
                        >
                          <Trash2 aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
                        </Boton>
                      </span>
                    </div>
                    {venta.lineaDeHoy !== null && (
                      <label className={CASILLA_DE_PAQUETE}>
                        <input
                          type="checkbox"
                          checked={venta.usarHoy}
                          disabled={guardando}
                          onChange={(evento) => cambiarVenta(venta.clave, evento.target.checked)}
                          className="anillo-foco mt-px size-5 shrink-0 accent-navy"
                        />
                        <span className="min-w-0">
                          Usar la primera sesión hoy{" "}
                          <span className="font-normal text-texto-2">(el servicio de hoy queda cubierto)</span>
                        </span>
                      </label>
                    )}
                  </li>
                )
              })}
            </ul>
            <p className="mt-3 flex items-baseline justify-between gap-3 border-t border-borde pt-3 font-semibold" aria-live="polite">
              <span>{hayPaquetesEnElCobro ? "Total a pagar" : "Total"}</span>
              <span className="text-lg tabular-nums">{formatearMonto(deCentavos(aPagarCentavos))}</span>
            </p>

            {/*
              Vender un paquete de sesiones: se suma al cobro como un renglón más y la plata entra hoy.
              Queda a nombre de la clienta, así que la atención tiene que ser de alguien de la lista.
            */}
            {paquetes.ofrecidos.length > 0 &&
              (paquetes.tieneClienta ? (
                <div className="mt-3">
                  <Boton
                    ref={botonVenderPaquete}
                    variante="fantasma"
                    tamano="sm"
                    aria-expanded={ofreciendoPaquetes}
                    aria-controls={`${idBase}-paquetes`}
                    onClick={() => setOfreciendoPaquetes((abierto) => !abierto)}
                    disabled={guardando || conPaquete.ventas.length >= MAXIMO_DE_PAQUETES_POR_COBRO}
                    className="max-escritorio:h-11"
                  >
                    <PackagePlus aria-hidden="true" className="size-4" strokeWidth={2} />
                    Vender paquete
                  </Boton>
                  {ofreciendoPaquetes && (
                    <ul id={`${idBase}-paquetes`} aria-label="Paquetes para vender" className="mt-2 space-y-2">
                      {paquetes.ofrecidos.map((paquete) => (
                        <li key={paquete.id}>
                          <button
                            type="button"
                            onClick={() => venderPaquete(paquete)}
                            disabled={guardando}
                            className="anillo-foco block min-h-11 w-full cursor-pointer rounded-[16px] bg-tarjeta px-3.5 py-2.5 text-left shadow-sm transition-shadow duration-200 ease-suave hover:shadow-md"
                          >
                            <span className="block text-sm font-medium break-words">
                              {nombreDelPaquete(paquete.sesiones, paquete.servicio)}
                            </span>
                            <span className="block text-[13px] text-texto-2 tabular-nums">{detalleDelPaquete(paquete)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-[13px] leading-snug text-texto-2">
                  Para vender un paquete, la atención tiene que ser de una clienta de tu lista.
                </p>
              ))}
          </section>

          {avisoDeComisiones && (
            <Aviso tono="atencion" rol="status">
              {avisoDeComisiones}
            </Aviso>
          )}

          {/* Todo cubierto por su paquete: no se pide medio de pago, se registra la sesión. */}
          {nadaQuePagar && (
            <p className="text-sm text-texto-2">No hay nada que pagar hoy: lo cubre su paquete, que ya está pagado.</p>
          )}

          <fieldset className={cn("space-y-3", nadaQuePagar && "hidden")}>
            <legend className="mb-3 text-sm font-semibold">Cómo pagó</legend>

            {aPagarCentavos === 0 && filas.length === 0 && (
              <p className="text-sm text-texto-2">El total es {formatearMonto(0)}: se registra como cortesía, sin pagos.</p>
            )}

            {filas.map((fila, indice) => {
              const numero = indice + 1
              const error = errorDeMontoDePago(fila.monto)
              return (
                <div
                  key={fila.clave}
                  role="group"
                  aria-label={`Pago ${numero}`}
                  className={cn(
                    "grid items-start gap-2 sm:gap-3",
                    conVariosMedios ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" : "grid-cols-2"
                  )}
                >
                  <div>
                    <label htmlFor={`${idBase}-${fila.clave}-medio`} className={ETIQUETA}>
                      Medio
                    </label>
                    <select
                      id={`${idBase}-${fila.clave}-medio`}
                      value={fila.medio}
                      disabled={guardando}
                      onChange={(evento) => cambiarFila(fila.clave, { medio: evento.target.value })}
                      className={CAMPO}
                    >
                      {mediosDePago.map((medio) => (
                        <option key={medio.id} value={medio.id}>
                          {medio.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`${idBase}-${fila.clave}-monto`} className={ETIQUETA}>
                      Monto
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-texto-2" aria-hidden="true">
                        $
                      </span>
                      {/* Texto y no número, igual que el precio: así la coma decimal no se pierde. */}
                      <input
                        id={`${idBase}-${fila.clave}-monto`}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={fila.monto}
                        disabled={guardando}
                        required
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? `${idBase}-${fila.clave}-error` : undefined}
                        onChange={(evento) => cambiarFila(fila.clave, { monto: evento.target.value })}
                        className={cn(CAMPO, "pl-7 tabular-nums", error && CAMPO_CON_ERROR)}
                      />
                    </div>
                    {error && (
                      <p id={`${idBase}-${fila.clave}-error`} className={ERROR_DE_CAMPO}>
                        {error}
                      </p>
                    )}
                  </div>
                  {/* A la altura del campo: baja lo que mide la etiqueta y mide lo mismo que él, 44 px. Con un solo medio no se quita. */}
                  {conVariosMedios && (
                    <Boton
                      variante="fantasma"
                      onClick={() => quitar(fila.clave)}
                      disabled={guardando}
                      aria-label={`Quitar el pago ${numero}: ${nombreDeMedio(fila.medio)}`}
                      title="Quitar"
                      className="mt-6.5 size-11 px-0 text-texto-2 hover:bg-error/8 hover:text-error"
                    >
                      <Trash2 aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
                    </Boton>
                  )}
                </div>
              )
            })}

            {conVariosMedios ? (
              <Boton
                ref={botonAgregar}
                variante="secundario"
                tamano="sm"
                onClick={agregar}
                disabled={guardando || filas.length >= MAXIMO_DE_PAGOS || mediosDePago.length === 0}
              >
                <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
                Agregar medio de pago
              </Boton>
            ) : (
              <Boton
                variante="fantasma"
                tamano="sm"
                // Despliega los pagos con varios medios y agrega el segundo: el foco va a su monto.
                onClick={agregar}
                disabled={guardando || mediosDePago.length === 0}
              >
                <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
                Pagó con más de un medio
              </Boton>
            )}
          </fieldset>

          {/*
            Propinas (#66): aparte del total y de los pagos. Van 100 % a quien
            la recibe y se le pagan en la liquidación; no son ingreso del local.
            Una clínica dental no trabaja con propinas (`puedeRegistrarPropina`):
            ahí el bloque no existe, y el servidor tampoco las acepta.
          */}
          {conPropinas && !conPropinasAbiertas && (
            <div>
              <Boton
                variante="fantasma"
                tamano="sm"
                onClick={abrirPropinas}
                disabled={guardando || mediosDePago.length === 0}
              >
                <HandCoins aria-hidden="true" className="size-4" strokeWidth={2} />
                Dejó propina
              </Boton>
            </div>
          )}

          {conPropinas && conPropinasAbiertas && (
            <fieldset className="space-y-3">
              <legend className="mb-1 text-sm font-semibold">Propinas</legend>
              <p className="text-[13px] text-texto-2">Opcional. No suman al total: van completas a quien las recibe.</p>

              {propinas.map((fila, indice) => {
                const numero = indice + 1
                const error = errorDeMontoDePago(fila.monto)
                const id = (campo: string) => `${idBase}-${fila.clave}-${campo}`
                return (
                  <div
                    key={fila.clave}
                    role="group"
                    aria-label={`Propina ${numero}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-[20px] bg-superficie p-3 squircle sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:gap-3"
                  >
                    <div className="col-span-2 sm:col-span-1">
                      <label htmlFor={id("profesional")} className={ETIQUETA}>
                        Para
                      </label>
                      <select
                        id={id("profesional")}
                        value={fila.profesional}
                        disabled={guardando}
                        required
                        onChange={(evento) => cambiarPropina(fila.clave, { profesional: evento.target.value })}
                        className={CAMPO}
                      >
                        <option value="">Elegir</option>
                        {paraPropina.map((profesional) => (
                          <option key={profesional.id} value={profesional.id}>
                            {profesional.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={id("monto")} className={ETIQUETA}>
                        Monto
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-texto-2" aria-hidden="true">
                          $
                        </span>
                        <input
                          id={id("monto")}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={fila.monto}
                          disabled={guardando}
                          required
                          aria-invalid={error ? true : undefined}
                          aria-describedby={error ? id("error") : undefined}
                          onChange={(evento) => cambiarPropina(fila.clave, { monto: evento.target.value })}
                          className={cn(CAMPO, "pl-7 tabular-nums", error && CAMPO_CON_ERROR)}
                        />
                      </div>
                      {error && (
                        <p id={id("error")} className={ERROR_DE_CAMPO}>
                          {error}
                        </p>
                      )}
                    </div>
                    <div className="col-start-1 sm:col-start-auto">
                      <label htmlFor={id("medio")} className={ETIQUETA}>
                        Medio
                      </label>
                      <select
                        id={id("medio")}
                        value={fila.medio}
                        disabled={guardando}
                        onChange={(evento) => cambiarPropina(fila.clave, { medio: evento.target.value })}
                        className={CAMPO}
                      >
                        {mediosDePago.map((medio) => (
                          <option key={medio.id} value={medio.id}>
                            {medio.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Boton
                      variante="fantasma"
                      onClick={() => quitarPropina(fila.clave)}
                      disabled={guardando}
                      aria-label={`Quitar la propina ${numero}`}
                      title="Quitar"
                      className="col-start-2 row-start-2 mt-6.5 size-11 px-0 text-texto-2 hover:bg-error/8 hover:text-error sm:col-start-auto sm:row-start-auto"
                    >
                      <Trash2 aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
                    </Boton>
                  </div>
                )
              })}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Boton
                  ref={botonAgregarPropina}
                  variante="secundario"
                  tamano="sm"
                  onClick={agregarPropina}
                  disabled={guardando || propinas.length >= MAXIMO_DE_PROPINAS || mediosDePago.length === 0}
                >
                  <HandCoins aria-hidden="true" className="size-4" strokeWidth={2} />
                  Agregar propina
                </Boton>
                {propinas.length > 0 && (
                  <p className="text-sm" aria-live="polite">
                    <span className="text-texto-2">Propinas:</span>{" "}
                    <span className="font-semibold tabular-nums">{formatearMonto(deCentavos(totalDePropinasEnCentavos(propinas)))}</span>
                  </p>
                )}
              </div>
            </fieldset>
          )}

          {/*
            En vivo, para que se lea mientras se escribe: cuánto falta o sobra.
            Con ícono además del color, como los errores.
          */}
          <div aria-live="polite" className="text-sm font-medium">
            {cobro.diferenciaCentavos > 0 && (
              <EstadoDelCobro icono={CircleDashed}>
                Falta {formatearMonto(deCentavos(cobro.diferenciaCentavos))}
              </EstadoDelCobro>
            )}
            {cobro.diferenciaCentavos < 0 && (
              <EstadoDelCobro icono={CircleAlert} error>
                Sobra {formatearMonto(deCentavos(-cobro.diferenciaCentavos))}
              </EstadoDelCobro>
            )}
            {/* Nunca a la vez que un aviso del servidor: se leería que está todo bien y que no. */}
            {cobro.diferenciaCentavos === 0 && filas.length > 0 && !hayMontoInvalido && cobro.error === null && !aviso && (
              <EstadoDelCobro icono={CircleCheck}>Los pagos cuadran con el total.</EstadoDelCobro>
            )}
            {/* Lo que no es una diferencia (un monto en cero, por ejemplo) lo dice la regla del servidor. */}
            {cobro.diferenciaCentavos === 0 && cobro.error !== null && !hayMontoInvalido && (
              <EstadoDelCobro icono={CircleAlert} error>
                {cobro.error}
              </EstadoDelCobro>
            )}
            {/* Lo que les falta a las propinas, salvo un monto ilegible, que ya lo dice su campo. */}
            {!deLasPropinas.ok && !propinas.some((fila) => errorDeMontoDePago(fila.monto) !== null) && (
              <EstadoDelCobro icono={CircleAlert} error>
                {deLasPropinas.error}
              </EstadoDelCobro>
            )}
          </div>

          {aviso && (
            <Aviso tono="error" rol="alert">
              {aviso}
            </Aviso>
          )}
        </form>
      )}
    </MarcoDeModal>
  )
}

/** Una línea del estado del cobro: falta, sobra o cuadra. */
function EstadoDelCobro({ icono: Icono, error = false, children }: { icono: LucideIcon; error?: boolean; children: ReactNode }) {
  return (
    <p className={cn("flex items-start gap-2", error ? "text-error" : "text-navy")}>
      <Icono aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
      <span className="min-w-0">{children}</span>
    </p>
  )
}
