"use client"

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react"
import { History, Lock, RefreshCw, Wallet } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { CAMPO, CAMPO_CON_ERROR, ERROR_DE_CAMPO, TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { formatearMonto } from "@/lib/dinero"
import { cn } from "@/lib/utils"
import { Paginador } from "../../reportes/_componentes/paginador"
import { cerrarCaja, cuentaEnPantalla, leerCaja, type CierreDeCaja, type Desglose, type EstadoDeCaja } from "../_datos"

/** `20 de octubre, 14:30` en la zona del negocio. */
function momento(iso: string, zona: string): string {
  return new Date(iso).toLocaleString("es-CL", { timeZone: zona, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
}

/** `lunes 20 de octubre` en la zona del negocio. */
function dia(iso: string, zona: string): string {
  return new Date(iso).toLocaleDateString("es-CL", { timeZone: zona, weekday: "long", day: "numeric", month: "long" })
}

/** `14:30` en la zona del negocio. */
function hora(iso: string, zona: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", { timeZone: zona, hour: "2-digit", minute: "2-digit" })
}

/** `+$500` / `-$500` / `$0`: la diferencia con su signo, que es lo que se lee primero. */
function conSigno(monto: number): string {
  return monto > 0 ? `+${formatearMonto(monto)}` : formatearMonto(monto)
}

function Renglon({ termino, valor, fuerte = false }: { termino: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-texto-2">{termino}</dt>
      <dd className={cn("text-right tabular-nums", fuerte ? "font-semibold" : "font-medium")}>{valor}</dd>
    </div>
  )
}

function OtrosMedios({ desglose }: { desglose: Desglose }) {
  if (desglose.otrosMedios.length === 0 && desglose.propinasOtrosMedios.length === 0) return null
  return (
    <div className="mt-3 rounded-[16px] bg-superficie p-3 text-sm squircle">
      <p className="font-medium">Otros medios (no están en el cajón)</p>
      <dl className="mt-1">
        {desglose.otrosMedios.map((medio) => (
          <Renglon key={`p-${medio.medio}`} termino={medio.nombre} valor={formatearMonto(medio.monto)} />
        ))}
        {desglose.propinasOtrosMedios.map((medio) => (
          <Renglon key={`t-${medio.medio}`} termino={`Propinas por ${medio.nombre.toLowerCase()}`} valor={formatearMonto(medio.monto)} />
        ))}
      </dl>
    </div>
  )
}

/**
 * Caja (#71): lo que lleva la caja desde el último cierre, el formulario para
 * cerrarla con lo contado y los cierres anteriores. La ven dueña y encargado
 * (la página lo verifica en el servidor).
 */
export function PantallaDeCaja() {
  const [pagina, setPagina] = useState(1)
  const [estado, setEstado] = useState<EstadoDeCaja | null>(null)
  const [error, setError] = useState("")
  const [cargando, setCargando] = useState(true)
  const [version, setVersion] = useState(0)
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null)

  useEffect(() => {
    let vigente = true
    leerCaja(pagina).then((resultado) => {
      if (!vigente) return
      setCargando(false)
      if (resultado.ok) {
        setEstado(resultado.datos)
        setError("")
      } else setError(resultado.error)
    })
    return () => {
      vigente = false
    }
  }, [pagina, version])

  const recargar = useCallback(() => {
    setCargando(true)
    setVersion((previa) => previa + 1)
  }, [])

  if (!estado) {
    return error ? (
      <Aviso
        accion={
          <Boton variante="secundario" tamano="sm" onClick={recargar}>
            <RefreshCw aria-hidden="true" className="size-4" strokeWidth={2} />
            Reintentar
          </Boton>
        }
      >
        {error}
      </Aviso>
    ) : (
      <div role="status" className={cn(TARJETA_DEL_PANEL, "space-y-4 p-5 sm:p-6")}>
        <span className="sr-only">Cargando la caja…</span>
        <Esqueleto className="h-6 w-1/3" />
        <Esqueleto />
        <Esqueleto className="w-2/3" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && <Aviso>{error}</Aviso>}
      {mensaje && (
        <Aviso tono={mensaje.error ? "error" : "listo"} rol={mensaje.error ? "alert" : "status"}>
          {mensaje.texto}
        </Aviso>
      )}

      <CajaAbierta
        // Un período nuevo (otro cerró, o se acaba de cerrar) es un formulario nuevo.
        key={estado.abierta.desde}
        estado={estado}
        onCerrada={(cierre) => {
          setMensaje({
            texto:
              cierre.diferencia === 0
                ? `Caja cerrada: cuadró en ${formatearMonto(cierre.contado)}.`
                : `Caja cerrada con una diferencia de ${conSigno(cierre.diferencia)}.`,
            error: false,
          })
          setPagina(1)
          recargar()
        }}
        onCambio={(texto) => {
          setMensaje({ texto, error: true })
          recargar()
        }}
      />

      <CierresAnteriores estado={estado} cargando={cargando} onPagina={(otra) => {
        setCargando(true)
        setPagina(otra)
      }} />
    </div>
  )
}

interface PropsDeCajaAbierta {
  estado: EstadoDeCaja
  onCerrada: (cierre: CierreDeCaja) => void
  /** Otro cerró la caja entretanto: lo que se contó era de otro período. */
  onCambio: (mensaje: string) => void
}

function CajaAbierta({ estado, onCerrada, onCambio }: PropsDeCajaAbierta) {
  const { abierta, zona } = estado
  const idDelTitulo = useId()
  const idDelFondo = useId()
  const idDelContado = useId()
  const idDeLaNota = useId()
  const [fondo, setFondo] = useState("")
  const [contado, setContado] = useState("")
  const [nota, setNota] = useState("")
  const [errores, setErrores] = useState<{ fondo?: string; contado?: string; nota?: string }>({})
  const [aviso, setAviso] = useState("")
  const [guardando, setGuardando] = useState(false)
  /** Un ref y no sólo el estado: un doble toque llega antes de que se dibuje el botón ocupado. */
  const enviado = useRef(false)

  const cuenta = cuentaEnPantalla(abierta, fondo, contado)
  const hayDiferencia = cuenta.diferencia !== null && cuenta.diferencia !== 0

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault()
    if (enviado.current) return
    const nuevos: typeof errores = {}
    if (cuenta.fondo === null) nuevos.fondo = "Escribe el fondo inicial (0 si no había)."
    if (cuenta.contado === null) nuevos.contado = "Escribe el efectivo que contaste."
    if (hayDiferencia && !nota.trim()) nuevos.nota = "Hay diferencia: explica en una nota qué pasó."
    setErrores(nuevos)
    setAviso("")
    if (Object.keys(nuevos).length > 0 || cuenta.fondo === null || cuenta.contado === null) return

    enviado.current = true
    setGuardando(true)
    const resultado = await cerrarCaja({ desde: abierta.desde, fondoInicial: cuenta.fondo, contado: cuenta.contado, nota })
    enviado.current = false
    setGuardando(false)
    if (resultado.ok) return onCerrada(resultado.datos)
    if (resultado.codigo === 409) return onCambio(`${resultado.error.replace(/\.$/, "")}. Se recargó la caja.`)
    setAviso(resultado.error)
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Caja abierta"
        subtitulo={`Desde el ${momento(abierta.desde, zona)} hasta ahora.`}
        icono={{ figura: Wallet }}
      />

      {abierta.cobrosDesde && (
        <Aviso tono="atencion" className="mt-4" titulo="Este cierre junta varios días">
          La caja no se cerró después de los cobros del {dia(abierta.cobrosDesde, zona)}: este cierre los incluye junto
          con los de hoy. Cuenta el efectivo de todos esos días.
        </Aviso>
      )}

      <dl className="mt-4 divide-y divide-borde border-y border-borde text-sm">
        <Renglon termino="Efectivo cobrado" valor={formatearMonto(abierta.efectivoCobrado)} />
        <Renglon termino="Propinas en efectivo" valor={formatearMonto(abierta.propinasEfectivo)} />
      </dl>
      <OtrosMedios desglose={abierta.desglose} />

      {estado.puedeCerrar && (
        <form onSubmit={enviar} noValidate className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoDeMonto
              id={idDelFondo}
              etiqueta="Fondo inicial"
              ayuda="Lo que había en el cajón al abrir."
              valor={fondo}
              error={errores.fondo}
              onCambio={(valor) => {
                setFondo(valor)
                setErrores((previos) => ({ ...previos, fondo: undefined }))
              }}
            />
            <CampoDeMonto
              id={idDelContado}
              etiqueta="Efectivo contado"
              ayuda="Todo el efectivo del cajón, fondo incluido."
              valor={contado}
              error={errores.contado}
              onCambio={(valor) => {
                setContado(valor)
                setErrores((previos) => ({ ...previos, contado: undefined }))
              }}
            />
          </div>

          <dl className="divide-y divide-borde border-y border-borde text-sm" aria-live="polite">
            <Renglon termino="Esperado" valor={cuenta.esperado === null ? "—" : formatearMonto(cuenta.esperado)} />
            <Renglon
              termino="Diferencia"
              valor={cuenta.diferencia === null ? "—" : conSigno(cuenta.diferencia)}
              fuerte
            />
          </dl>

          <div>
            <label htmlFor={idDeLaNota} className={CLASES_DE_ETIQUETA}>
              Nota{hayDiferencia ? "" : " (opcional)"}
            </label>
            <textarea
              id={idDeLaNota}
              value={nota}
              maxLength={500}
              rows={2}
              onChange={(evento) => {
                setNota(evento.target.value)
                setErrores((previos) => ({ ...previos, nota: undefined }))
              }}
              aria-invalid={errores.nota ? true : undefined}
              aria-describedby={errores.nota ? `${idDeLaNota}-error` : undefined}
              className={cn(CAMPO, "mt-2 resize-y", errores.nota && CAMPO_CON_ERROR)}
            />
            {errores.nota && (
              <p id={`${idDeLaNota}-error`} className={ERROR_DE_CAMPO}>
                {errores.nota}
              </p>
            )}
          </div>

          {aviso && <Aviso>{aviso}</Aviso>}

          <Boton type="submit" cargando={guardando} icono={<Lock aria-hidden="true" />} className="w-full sm:w-auto">
            Cerrar caja
          </Boton>
          <p className="text-sm text-texto-2">Un cierre no se edita: revisa los montos antes de cerrar.</p>
        </form>
      )}
    </section>
  )
}

function CampoDeMonto(props: {
  id: string
  etiqueta: string
  ayuda: string
  valor: string
  error?: string
  onCambio: (valor: string) => void
}) {
  const { id, etiqueta, ayuda, valor, error, onCambio } = props
  return (
    <div>
      <label htmlFor={id} className={CLASES_DE_ETIQUETA}>
        {etiqueta}
      </label>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder="$0"
        value={valor}
        onChange={(evento) => onCambio(evento.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-ayuda${error ? ` ${id}-error` : ""}`}
        className={cn(CAMPO, "mt-2", error && CAMPO_CON_ERROR)}
      />
      <p id={`${id}-ayuda`} className="mt-1 text-xs text-texto-2">
        {ayuda}
      </p>
      {error && (
        <p id={`${id}-error`} className={ERROR_DE_CAMPO}>
          {error}
        </p>
      )}
    </div>
  )
}

function CierresAnteriores({
  estado,
  cargando,
  onPagina,
}: {
  estado: EstadoDeCaja
  cargando: boolean
  onPagina: (pagina: number) => void
}) {
  const idDelTitulo = useId()
  const { zona } = estado
  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "overflow-hidden")}>
      <div className="p-5 sm:p-6">
        <EncabezadoDeTarjeta id={idDelTitulo} titulo="Cierres anteriores" icono={{ figura: History }} />
        {estado.cierres.length === 0 ? (
          <EstadoVacio className="mt-4">Todavía no se cerró la caja.</EstadoVacio>
        ) : (
          <ol aria-busy={cargando} className={cn("mt-4 space-y-3", cargando && "opacity-60")}>
            {estado.cierres.map((cierre) => (
              <li key={cierre.id} className="rounded-[20px] border border-borde p-4 text-sm squircle">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-medium">
                    {momento(cierre.desde, zona)} – {hora(cierre.hasta, zona)}
                  </p>
                  <p
                    className={cn(
                      "font-semibold tabular-nums",
                      cierre.diferencia === 0 ? "text-navy" : "text-error"
                    )}
                  >
                    {cierre.diferencia === 0 ? "Cuadró" : `Diferencia ${conSigno(cierre.diferencia)}`}
                  </p>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 sm:grid-cols-4">
                  <Renglon termino="Fondo" valor={formatearMonto(cierre.fondoInicial)} />
                  <Renglon termino="Efectivo" valor={formatearMonto(cierre.efectivoCobrado)} />
                  <Renglon termino="Esperado" valor={formatearMonto(cierre.esperado)} />
                  <Renglon termino="Contado" valor={formatearMonto(cierre.contado)} />
                </dl>
                {cierre.nota && <p className="mt-1 break-words text-texto-2">Nota: {cierre.nota}</p>}
                <p className="mt-1 text-texto-2">Cerró {cierre.cerradoPor}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
      <Paginador
        nombre="Páginas de cierres de caja"
        pagina={estado.pagina}
        paginas={estado.paginas}
        actualizando={cargando}
        onPagina={onPagina}
      />
    </section>
  )
}
