"use client"

import { useState, useRef, useEffect, useId, useMemo } from "react"
import { Search, User, Scissors, Calendar, Check } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { ErrorDeCampo } from "@/components/comunes/error-de-campo"
import { Selector } from "@/components/comunes/selector"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { CAMPO, ETIQUETA } from "@/components/panel/estilos"
import { CampoHora } from "@/components/panel/campo-hora"
import { cn } from "@/lib/utils"
import { ejemplosDe, textoDeEjemplo } from "@/lib/ejemplos-por-rubro"
import { vocabularioDe } from "@/lib/vocabulario"
import {
  buscarClientes,
  idsDeServiciosElegidos,
  leerCatalogoDeLaCita,
  leerHorarioDeAtencion,
  leerProfesionales,
  opcionesDeSillon,
  precioDeLosServicios,
  serviciosParaElProfesional,
  type CatalogoDeLaCita,
  type ClienteSugerido,
  type DatosDeNuevaCita,
  type Profesional,
  type ServicioDelCatalogo,
  type SillonDeLaAgenda,
} from "../_datos"
import { frasesDeLaAgenda } from "../_frases"
import { franjasDeLaSedeEseDia, type SedeDeLaAgenda } from "../_sedes"
import { SelectorDeSede } from "./selector-de-sede"
import type { FranjaDelDia } from "@/lib/horario-de-atencion"
import { Aviso } from "@/components/panel/aviso"
import type { Advertencia } from "@/lib/mover-cita"
import { MAX_SERVICIOS_POR_RESERVA, resumenDeLaReserva } from "@/lib/servicios-de-la-reserva"
import { formatearTiempoLibre, horaAMinutos, minutosAHora } from "@/lib/horario-dia"
import { formatearMonto } from "@/lib/dinero"
import { SelectorServicio } from "@/app/reservar/[slug]/_componentes/selector-servicio"

/** La hora de fin de `inicio` ("HH:MM") más `minutos`, o `null` si pasa de medianoche. */
function horaDeFin(inicio: string, minutos: number): string | null {
  const fin = horaAMinutos(inicio) + minutos
  return Number.isFinite(fin) && fin < 24 * 60 ? minutosAHora(fin) : null
}

/** Con menos letras no se busca. */
const LETRAS_PARA_BUSCAR = 2

/**
 * El foco de una fila de la lista de clientes, hacia adentro: la lista se
 * desplaza y recorta lo que se sale de ella. El contorno queda dentro de la
 * fila y el halo es su fondo. Es el mismo buscador del tablero, al anotar a
 * alguien sin reserva.
 */
const ANILLO_HACIA_ADENTRO =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--anillo) focus-visible:bg-(--halo)"

interface PropsDeModalNuevaCita {
  form: DatosDeNuevaCita
  guardando: boolean
  /**
   * Por qué no se pudo guardar la cita, si falló. Se muestra dentro del modal y
   * no en la página: mientras el modal está abierto, la página queda tapada.
   */
  aviso: string
  /**
   * Clínica dental: el aviso es el 409 del sillón ocupado. Se titula así y no
   * se ofrece "guardar igual": se elige otro sillón u otra hora.
   */
  avisoDeSillonOcupado?: boolean
  /**
   * Clínica dental: los sillones, para elegir uno (opcional; se ofrecen sólo
   * los activos). `null` (o sin dato) fuera de una clínica: no hay selector.
   */
  sillones?: SillonDeLaAgenda[] | null
  /**
   * Etapa 9: las sedes activas, para elegir dónde se atiende. Sólo con varias
   * sedes (lo decide el servidor, `modoDeSedes`): `null` (o sin dato) en
   * cualquier otro caso, y el modal es el de siempre, sin selector.
   */
  sedes?: SedeDeLaAgenda[] | null
  /**
   * Lo que el servidor advirtió del primer envío (choque, bloqueo, fuera de
   * horario). Con advertencias, el botón pasa a "Guardar igual": como al
   * mover una cita. Cambiar un campo las descarta (lo hace la página).
   */
  advertencias: Advertencia[]
  onGuardarIgual: () => void
  /** Sólo owner y admin asignan profesional; el worker no ve el selector. */
  puedeAsignarProfesional: boolean
  onCambiarCampo: (campo: keyof DatosDeNuevaCita, valor: string) => void
  onSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void
  onCerrar: () => void
}

export function ModalNuevaCita({
  form,
  guardando,
  aviso,
  avisoDeSillonOcupado = false,
  sillones = null,
  sedes = null,
  advertencias,
  onGuardarIgual,
  puedeAsignarProfesional,
  onCambiarCampo,
  onSubmit,
  onCerrar,
}: PropsDeModalNuevaCita) {
  const hayAdvertencias = advertencias.length > 0
  // Cliente, servicio, profesional y cita, con las palabras del rubro: "Paciente", "Prestación" y "Odontólogo" en una clínica dental.
  const rubro = useRubroDelPanel()
  // Una sola vez por rubro: los efectos de abajo dependen de las palabras y no deben volver a correr en cada render.
  const palabras = useMemo(() => vocabularioDe(rubro).palabras, [rubro])
  const frases = frasesDeLaAgenda(palabras)
  // El buscador arranca diciendo el cliente del borrador, si hay uno elegido:
  // lo que se ve y lo que se guarda son lo mismo desde que se abre (A1).
  const [busquedaCliente, setBusquedaCliente] = useState(form.clienteNombre)
  const [sugerencias, setSugerencias] = useState<ClienteSugerido[]>([])
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false)
  const [profesionales, setProfesionales] = useState<Profesional[]>([])
  const [avisoDeBusqueda, setAvisoDeBusqueda] = useState("")
  const [avisoDeEquipo, setAvisoDeEquipo] = useState("")
  const [catalogo, setCatalogo] = useState<CatalogoDeLaCita | null>(null)
  const [avisoDeCatalogo, setAvisoDeCatalogo] = useState("")
  const esperaDeBusqueda = useRef<ReturnType<typeof setTimeout> | null>(null)
  const campoBusqueda = useRef<HTMLInputElement>(null)
  const idBase = useId()
  const idDelBuscador = `${idBase}-buscador`
  const idDelEstado = `${idBase}-estado`
  const idDelAvisoDeBusqueda = `${idBase}-aviso-busqueda`
  const idDeNotas = `${idBase}-notas`
  const idDelCatalogo = `${idBase}-catalogo`
  const idDeHoraInicio = `${idBase}-hora-inicio`
  const idDeHoraFin = `${idBase}-hora-fin`
  const idDelHorarioDeLaSede = `${idBase}-horario-de-la-sede`

  useEffect(() => {
    if (!puedeAsignarProfesional) return
    // Si el equipo no carga, el modal sigue sirviendo: la cita se guarda sin
    // profesional asignado. Pero se avisa, para que el selector no desaparezca
    // sin explicación.
    leerProfesionales().then((resultado) => {
      if (resultado.ok) setProfesionales(resultado.datos)
      else setAvisoDeEquipo(resultado.error)
    })
  }, [puedeAsignarProfesional])

  // Con varias sedes: el horario de la sede elegida, para decir debajo de la
  // hora cuándo atiende ese día. Si no carga, se dice; el servidor igual avisa
  // al guardar si la hora cae fuera de su horario.
  const [horarioDeLaSede, setHorarioDeLaSede] = useState<{ sedeId: string; franjas: FranjaDelDia[] | null } | null>(null)
  const sedeElegida = sedes ? (form.sedeId ?? "") : ""
  useEffect(() => {
    if (!sedeElegida) return
    let vigente = true
    leerHorarioDeAtencion(sedeElegida).then((resultado) => {
      if (vigente) setHorarioDeLaSede({ sedeId: sedeElegida, franjas: resultado.ok ? resultado.datos : null })
    })
    return () => {
      vigente = false
    }
  }, [sedeElegida])
  // Lo que llega tarde de otra sede no se muestra en ésta.
  const horarioDeLaSedeElegida = sedeElegida && horarioDeLaSede?.sedeId === sedeElegida ? horarioDeLaSede : null
  const avisoDelHorarioDeLaSede = !sedeElegida
    ? frases.sede.ayuda
    : horarioDeLaSedeElegida
      ? horarioDeLaSedeElegida.franjas
        ? frases.sede.horarioEseDia(franjasDeLaSedeEseDia(horarioDeLaSedeElegida.franjas, form.fecha))
        : frases.sede.horarioNoCargo
      : // Mientras llega el horario de la sede recién elegida, la ayuda de antes.
        frases.sede.ayuda

  // El catálogo (#159). Si no carga, queda el texto libre, con el aviso.
  useEffect(() => {
    leerCatalogoDeLaCita(palabras).then((resultado) => {
      if (resultado.ok) setCatalogo(resultado.datos)
      else setAvisoDeCatalogo(resultado.error)
    })
  }, [palabras])

  useEffect(() => {
    if (!busquedaCliente || busquedaCliente.length < LETRAS_PARA_BUSCAR) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- limpia las sugerencias viejas cuando se borra la búsqueda
      setSugerencias([])
      setAvisoDeBusqueda("")
      return
    }
    if (esperaDeBusqueda.current) clearTimeout(esperaDeBusqueda.current)
    esperaDeBusqueda.current = setTimeout(async () => {
      const resultado = await buscarClientes(busquedaCliente, palabras)
      if (!resultado.ok) {
        // Las sugerencias que había eran de otra búsqueda: no se dejan como si
        // fueran las de esta.
        setSugerencias([])
        setAvisoDeBusqueda(resultado.error)
        return
      }
      setAvisoDeBusqueda("")
      setSugerencias(resultado.datos)
      setMostrarSugerencias(true)
    }, 300)
    return () => { if (esperaDeBusqueda.current) clearTimeout(esperaDeBusqueda.current) }
  }, [busquedaCliente, palabras])

  function seleccionarCliente(cliente: ClienteSugerido, conTeclado: boolean) {
    onCambiarCampo("clienteId", cliente.id)
    onCambiarCampo("clienteNombre", cliente.nombre)
    setBusquedaCliente(cliente.nombre)
    setMostrarSugerencias(false)
    // Con teclado, la fila elegida sale de la pantalla con la lista y el foco
    // caería fuera del diálogo: vuelve al buscador, que ahora dice el nombre
    // elegido. Con el dedo no: en el teléfono, enfocar el campo volvería a
    // abrir el teclado.
    if (conTeclado) requestAnimationFrame(() => campoBusqueda.current?.focus())
  }

  // De quién es la cita, para ofrecer sólo lo que hace: el elegido, o el
  // profesional mismo (el servidor le manda sólo lo suyo).
  const profesionalDeLaCita = puedeAsignarProfesional
    ? form.memberId
    : (Object.keys(catalogo?.serviciosPorProfesional ?? {})[0] ?? "")
  const serviciosOfrecidos = catalogo ? serviciosParaElProfesional(catalogo, profesionalDeLaCita) : []
  const elegidos = idsDeServiciosElegidos(form.servicioIds)
    .map((id) => catalogo?.servicios.find((servicio) => servicio.id === id))
    .filter((servicio): servicio is ServicioDelCatalogo => servicio !== undefined)
  const resumen = elegidos.length > 0 ? resumenDeLaReserva(elegidos) : null
  // Con servicios, la hora de fin sale de la de inicio más la duración. Si eso
  // pasa de medianoche no hay hora que mostrar y se vuelve a pedir a mano.
  const finCalculado = resumen ? horaDeFin(form.horaInicio, resumen.duracion) : null

  /**
   * Elegir servicios llena la hora de fin y el precio con la duración y el
   * precio sumados, como la reserva pública; se pueden cambiar después. Sin
   * ninguno, vuelve el texto libre.
   */
  function elegirServicios(servicios: ServicioDelCatalogo[]) {
    onCambiarCampo("servicioIds", servicios.map((servicio) => servicio.id).join(","))
    if (servicios.length === 0) return
    const { duracion } = resumenDeLaReserva(servicios)
    const fin = horaDeFin(form.horaInicio, duracion)
    if (fin) onCambiarCampo("horaFin", fin)
    onCambiarCampo("precio", precioDeLosServicios(servicios))
  }

  function alternarServicio(servicio: ServicioDelCatalogo) {
    const estaba = elegidos.some((elegido) => elegido.id === servicio.id)
    elegirServicios(estaba ? elegidos.filter((elegido) => elegido.id !== servicio.id) : [...elegidos, servicio])
  }

  function cambiarProfesional(memberId: string) {
    onCambiarCampo("memberId", memberId)
    // Lo que el nuevo profesional no hace se quita: el servidor no lo aceptaría.
    if (catalogo && elegidos.length > 0) {
      const hace = serviciosParaElProfesional(catalogo, memberId)
      const quedan = elegidos.filter((elegido) => hace.some((servicio) => servicio.id === elegido.id))
      if (quedan.length !== elegidos.length) elegirServicios(quedan)
    }
  }

  // Ya se eligió de la lista y lo escrito sigue siendo ese nombre: la lista no
  // se vuelve a abrir con el mismo cliente cuando llega la búsqueda de su nombre.
  const clienteElegido = form.clienteId !== "" && busquedaCliente === form.clienteNombre
  const listaVisible = mostrarSugerencias && sugerencias.length > 0 && !clienteElegido

  // Lo que dice la línea de debajo del buscador. Se anuncia al cambiar.
  const estadoDeBusqueda = frases.cliente.estadoDelBuscador({
    letras: busquedaCliente.length,
    minimo: LETRAS_PARA_BUSCAR,
    elegido: clienteElegido,
    coincidencias: listaVisible ? sugerencias.length : null,
  })

  return (
    <MarcoDeModal titulo={frases.nuevaCita} bloqueado={guardando} alCerrar={onCerrar}>
      <form onSubmit={onSubmit} className="space-y-5">
        {/* Búsqueda de cliente */}
        <div>
          <label htmlFor={idDelBuscador} className={cn(ETIQUETA, "mb-2")}>
            {frases.cliente.etiqueta}
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-texto-2"
              aria-hidden="true"
              strokeWidth={1.75}
            />
            {/* Al abrir, el foco va al buscador: es lo primero que se hace. `MarcoDeModal` anota antes quién lo abrió. */}
            <input
              ref={campoBusqueda}
              id={idDelBuscador}
              autoFocus
              type="text"
              autoComplete="off"
              placeholder={frases.cliente.buscar}
              value={busquedaCliente}
              aria-describedby={avisoDeBusqueda ? `${idDelEstado} ${idDelAvisoDeBusqueda}` : idDelEstado}
              onChange={(e) => {
                setBusquedaCliente(e.target.value)
                // Escribir otra cosa que el nombre elegido deja la cita sin
                // cliente: si no, se guardaba para el anterior sin que se viera.
                if (form.clienteId && e.target.value !== form.clienteNombre) {
                  onCambiarCampo("clienteId", "")
                  onCambiarCampo("clienteNombre", "")
                }
              }}
              className={cn(CAMPO, "h-12 pl-11 text-base", clienteElegido && "pr-11")}
              required
            />
            {clienteElegido && (
              <Check
                className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-navy"
                aria-hidden="true"
                strokeWidth={2}
              />
            )}
          </div>

          <p id={idDelEstado} aria-live="polite" className="mt-1.5 text-xs text-texto-2">
            {estadoDeBusqueda}
          </p>

          {avisoDeBusqueda && (
            <div role="alert" className="mt-2">
              <ErrorDeCampo id={idDelAvisoDeBusqueda}>{avisoDeBusqueda}</ErrorDeCampo>
            </div>
          )}

          {listaVisible && (
            <ul
              aria-label={frases.cliente.queCoinciden}
              className="mt-2 max-h-56 divide-y divide-borde overflow-y-auto rounded-campo bg-tarjeta inset-ring-1 inset-ring-borde squircle"
            >
              {sugerencias.map((cliente) => (
                <li key={cliente.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 ease-suave hover:bg-superficie",
                      ANILLO_HACIA_ADENTRO
                    )}
                    // Un clic que llega del teclado (Enter o Espacio) no cuenta pulsaciones: `detail` es 0.
                    onClick={(evento) => seleccionarCliente(cliente, evento.detail === 0)}
                  >
                    <User className="size-4 shrink-0 text-texto-2" aria-hidden="true" strokeWidth={1.75} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium break-words text-navy">{cliente.nombre}</span>
                      {cliente.email && (
                        <span className="block text-xs wrap-anywhere text-texto-2">{cliente.email}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Servicios del catálogo (#159): llenan nombre, duración y precio, como la reserva pública. */}
        {serviciosOfrecidos.length > 0 && (
          <div role="group" aria-labelledby={idDelCatalogo}>
            <p id={idDelCatalogo} className={cn(ETIQUETA, "mb-2")}>
              {frases.servicio.delCatalogo}
            </p>
            <div className="max-h-72 overflow-y-auto p-0.5">
              <SelectorServicio
                servicios={serviciosOfrecidos}
                seleccionados={elegidos}
                onAlternar={alternarServicio}
                tope={MAX_SERVICIOS_POR_RESERVA}
              />
            </div>
            <p aria-live="polite" className="mt-1.5 text-xs text-texto-2">
              {resumen
                ? `${resumen.titulo} · ${formatearTiempoLibre(resumen.duracion)}${
                    resumen.precio !== null ? ` · ${formatearMonto(resumen.precio)}${resumen.precioIncompleto ? " + a consultar" : ""}` : ""
                  }`
                : frases.servicio.ayudaDelCatalogo(MAX_SERVICIOS_POR_RESERVA)}
            </p>
          </div>
        )}

        {avisoDeCatalogo && <Aviso>{avisoDeCatalogo}</Aviso>}

        {/* Texto libre, para una cita sin servicio del catálogo. */}
        {!resumen && (
          <CampoFormulario
            etiqueta={serviciosOfrecidos.length > 0 ? frases.servicio.otro : frases.servicio.etiqueta}
            placeholder={textoDeEjemplo(ejemplosDe(rubro).servicios)}
            value={form.servicio}
            onChange={(e) => onCambiarCampo("servicio", e.target.value)}
            icono={<Scissors className="size-4" aria-hidden="true" strokeWidth={1.75} />}
            required
          />
        )}

        {/* Con varias sedes, dónde se atiende: antes de la fecha y la hora, que dependen de ella. */}
        {sedes && (
          <SelectorDeSede
            etiqueta={frases.sede.etiqueta}
            elegir={frases.sede.elegir}
            sedes={sedes}
            value={form.sedeId ?? ""}
            onChange={(sedeId) => onCambiarCampo("sedeId", sedeId)}
            idDeLaAyuda={idDelHorarioDeLaSede}
          />
        )}

        <CampoFormulario
          etiqueta="Fecha"
          type="date"
          value={form.fecha}
          onChange={(e) => onCambiarCampo("fecha", e.target.value)}
          icono={<Calendar className="size-4" aria-hidden="true" strokeWidth={1.75} />}
          required
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <label htmlFor={idDeHoraInicio} className={ETIQUETA}>
              Hora inicio
            </label>
            <CampoHora
              id={idDeHoraInicio}
              etiqueta="Hora inicio"
              value={form.horaInicio}
              onChange={(valor) => {
                onCambiarCampo("horaInicio", valor)
                // Con servicios elegidos, la hora de fin los sigue; el precio no se toca.
                const fin = resumen ? horaDeFin(valor, resumen.duracion) : null
                if (fin) onCambiarCampo("horaFin", fin)
              }}
            />
          </div>
          {finCalculado ? (
            // Con servicios elegidos la duración ya está dicha: la hora de fin
            // se calcula sola y no se le pide al usuario.
            <div className="min-w-0">
              <p className={ETIQUETA}>Termina</p>
              <p className="flex min-h-12 items-center px-1 text-base tabular-nums text-texto" aria-live="polite">
                {finCalculado}
              </p>
            </div>
          ) : (
            <div className="min-w-0">
              <label htmlFor={idDeHoraFin} className={ETIQUETA}>
                Hora fin
              </label>
              <CampoHora
                id={idDeHoraFin}
                etiqueta="Hora fin"
                value={form.horaFin}
                onChange={(valor) => onCambiarCampo("horaFin", valor)}
              />
            </div>
          )}
        </div>

        {/* El horario de la sede elegida ese día; se anuncia al cambiar de sede o de fecha. */}
        {sedes && (
          <p id={idDelHorarioDeLaSede} aria-live="polite" className="-mt-2 text-xs text-texto-2">
            {avisoDelHorarioDeLaSede}
          </p>
        )}

        <CampoFormulario
          etiqueta="Precio (opcional)"
          // Texto y no número, como el precio del tablero: en un `type="number"`
          // "8.000" llegaba como 8. Lo escrito lo lee `leerMonto`.
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={form.precio}
          onChange={(e) => onCambiarCampo("precio", e.target.value)}
          icono={<span className="text-sm" aria-hidden="true">$</span>}
          className="tabular-nums"
        />

        {puedeAsignarProfesional && avisoDeEquipo && <Aviso>{avisoDeEquipo}</Aviso>}

        {puedeAsignarProfesional && profesionales.length > 0 && (
          <Selector
            etiqueta={frases.profesional.etiqueta}
            value={form.memberId}
            onChange={(e) => cambiarProfesional(e.target.value)}
            opciones={profesionales.map((profesional) => ({ valor: profesional.id, texto: profesional.nombre }))}
          >
            <option value="">Sin asignar</option>
          </Selector>
        )}

        {/* Clínica dental: el sillón, opcional. Sólo los activos; un choque en el sillón es un 409, no una advertencia. */}
        {sillones && (
          <Selector
            etiqueta="Sillón (opcional)"
            value={form.sillonId ?? ""}
            onChange={(e) => onCambiarCampo("sillonId", e.target.value)}
            opciones={opcionesDeSillon(sillones)}
          >
            <option value="">Sin sillón</option>
          </Selector>
        )}

        <div>
          <label htmlFor={idDeNotas} className={cn(ETIQUETA, "mb-2")}>
            Notas (opcional)
          </label>
          {/* 16px de letra, como los otros campos: con menos, el teléfono acerca la pantalla al tocarlo. */}
          <textarea
            id={idDeNotas}
            value={form.notas}
            onChange={(e) => onCambiarCampo("notas", e.target.value)}
            placeholder="Observaciones, instrucciones..."
            className={cn(CAMPO, "h-24 resize-none px-4 py-3 text-base")}
          />
        </div>

        {aviso && (avisoDeSillonOcupado ? <Aviso titulo="Sillón ocupado">{aviso}</Aviso> : <Aviso>{aviso}</Aviso>)}

        {hayAdvertencias && (
          <Aviso tono="atencion" rol="alert" titulo="¿Guardar igual?">
            {advertencias.map((advertencia) => (
              <span key={advertencia.tipo} className="block">
                {advertencia.mensaje}
              </span>
            ))}
          </Aviso>
        )}

        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row">
          <Boton type="button" variante="secundario" className="w-full" disabled={guardando} onClick={onCerrar}>
            Cancelar
          </Boton>
          {hayAdvertencias ? (
            <Boton type="button" className="w-full" cargando={guardando} onClick={onGuardarIgual}>
              Guardar igual
            </Boton>
          ) : (
            <Boton type="submit" className="w-full" cargando={guardando}>
              {frases.guardarCita}
            </Boton>
          )}
        </div>
      </form>
    </MarcoDeModal>
  )
}
