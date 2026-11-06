"use client"

import { useEffect, useId, useState, type FormEvent } from "react"
import { Boton } from "@/components/comunes/boton"
import { Aviso } from "@/components/panel/aviso"
import { CAMPO, CAMPO_CON_ERROR, ERROR_DE_CAMPO, ETIQUETA } from "@/components/panel/estilos"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { formatearMonto, montoParaEscribir } from "@/lib/dinero"
import {
  NOMBRE_DE_LA_ETAPA_DEL_ODONTOGRAMA,
  errorDePiezaYCaras,
  type EtapaRespuesta,
  type OrigenDeVersion,
  type PlanRespuesta,
  type PrestacionRespuesta,
} from "@/lib/edicion-del-plan"
import { carasDe, nombreDeCara, nombreDePieza, ordenarCaras, piezasDe, type Cara } from "@/lib/odontograma"
import { cn } from "@/lib/utils"
import {
  agregarEtapa,
  agregarPrestacion,
  cambiarEstadoDePrestacion,
  crearVersionDelPlan,
  leerCitasDelPaciente,
  leerOdontologos,
  leerServicios,
  type CitaDelPaciente,
  type PrestacionNueva,
  type ServicioDeLaClinica,
} from "../_datos"
import { citasParaAgendar, cuandoEsLaCita, leerValor } from "../_formato"
import type { UsuarioDeLaFicha } from "./ficha-del-paciente"

/**
 * Los dos botones del pie de cada modal: en el teléfono, el que confirma arriba.
 * `esperando`: todavía falta algo para poder confirmar (lo que se elige está cargando).
 */
function PieDelModal({ texto, guardando, esperando = false, alCerrar }: { texto: string; guardando: boolean; esperando?: boolean; alCerrar: () => void }) {
  return (
    <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row">
      <Boton type="button" variante="secundario" className="w-full" disabled={guardando} onClick={alCerrar}>
        Cancelar
      </Boton>
      <Boton type="submit" className="w-full" cargando={guardando || esperando}>
        {texto}
      </Boton>
    </div>
  )
}

// ─── Nueva versión ───────────────────────────────────────────────────────────

interface PropsDeModalNuevaVersion {
  pacienteId: string
  /** La versión vigente, o `null` si el paciente todavía no tiene plan. */
  versionVigente: number | null
  conOdontograma: boolean
  alTerminar: (plan: PlanRespuesta) => void
  alCerrar: () => void
}

/**
 * Armar el plan, o una versión nueva: desde el odontograma, copiando la
 * vigente, o vacía. Con un plan vigente se dice qué pasa con él: queda como
 * versión anterior.
 */
export function ModalNuevaVersion({ pacienteId, versionVigente, conOdontograma, alTerminar, alCerrar }: PropsDeModalNuevaVersion) {
  const opciones: { id: OrigenDeVersion; titulo: string; texto: string }[] = [
    ...(conOdontograma
      ? [
          {
            id: "odontograma" as const,
            titulo: "Desde el odontograma",
            texto: `Una etapa «${NOMBRE_DE_LA_ETAPA_DEL_ODONTOGRAMA}» con una restauración por cada pieza con caries y una exodoncia por cada extracción indicada, del odontograma guardado.`,
          },
        ]
      : []),
    ...(versionVigente !== null
      ? [{ id: "copia" as const, titulo: "Copiando la versión vigente", texto: "Parte igual a la vigente, con lo aprobado y lo agendado, para cambiarla." }]
      : []),
    { id: "vacio", titulo: "Vacía", texto: "Sin etapas: las agregas tú." },
  ]
  const [desde, setDesde] = useState<OrigenDeVersion>(opciones[0].id)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState("")
  const id = useId()

  const armar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    setAviso("")
    setGuardando(true)
    const resultado = await crearVersionDelPlan(pacienteId, desde)
    setGuardando(false)
    if (!resultado.ok) return setAviso(resultado.error)
    alTerminar(resultado.datos)
  }

  return (
    <MarcoDeModal
      titulo={versionVigente === null ? "Armar el plan de tratamiento" : `Versión ${versionVigente + 1} del plan`}
      descripcion={
        versionVigente === null
          ? "Elige con qué empieza. Después se agregan etapas y prestaciones."
          : `La versión ${versionVigente} deja de estar vigente y queda como anterior.`
      }
      bloqueado={guardando}
      ancho="lg"
      alCerrar={alCerrar}
    >
      <form onSubmit={armar} className="space-y-5">
        <fieldset>
          <legend className={ETIQUETA}>Con qué empieza</legend>
          <div className="space-y-2">
            {opciones.map((opcion) => (
              <label
                key={opcion.id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-[16px] border-[1.5px] px-4 py-3 squircle",
                  desde === opcion.id ? "border-navy bg-lila-suave/60" : "border-borde hover:bg-superficie"
                )}
              >
                <input
                  type="radio"
                  name={`${id}-desde`}
                  value={opcion.id}
                  checked={desde === opcion.id}
                  onChange={() => setDesde(opcion.id)}
                  className="anillo-foco mt-1 size-4 shrink-0 cursor-pointer accent-navy"
                />
                <span>
                  <span className="block font-medium">{opcion.titulo}</span>
                  <span className="mt-0.5 block text-sm text-texto-2">{opcion.texto}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {aviso && <Aviso>{aviso}</Aviso>}
        <PieDelModal texto={versionVigente === null ? "Armar el plan" : `Armar la versión ${versionVigente + 1}`} guardando={guardando} alCerrar={alCerrar} />
      </form>
    </MarcoDeModal>
  )
}

// ─── Nueva etapa ─────────────────────────────────────────────────────────────

export function ModalNuevaEtapa({ pacienteId, alTerminar, alCerrar }: { pacienteId: string; alTerminar: (plan: PlanRespuesta) => void; alCerrar: () => void }) {
  const [nombre, setNombre] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState("")
  const id = useId()

  const agregar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (nombre.trim() === "") return setAviso("Escribe el nombre de la etapa")
    setAviso("")
    setGuardando(true)
    const resultado = await agregarEtapa(pacienteId, nombre.trim())
    setGuardando(false)
    if (!resultado.ok) return setAviso(resultado.error)
    alTerminar(resultado.datos)
  }

  return (
    <MarcoDeModal titulo="Agregar etapa" descripcion="Va al final del plan, por aprobar." bloqueado={guardando} alCerrar={alCerrar}>
      <form onSubmit={agregar} className="space-y-5" noValidate>
        <div>
          <label htmlFor={`${id}-nombre`} className={ETIQUETA}>
            Nombre de la etapa
          </label>
          <input
            id={`${id}-nombre`}
            autoFocus
            maxLength={80}
            placeholder="Por ejemplo, Higiene y urgencia"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={cn(CAMPO, "text-base")}
          />
        </div>
        {aviso && <Aviso>{aviso}</Aviso>}
        <PieDelModal texto="Agregar etapa" guardando={guardando} alCerrar={alCerrar} />
      </form>
    </MarcoDeModal>
  )
}

// ─── Prestación ──────────────────────────────────────────────────────────────

/** El valor del selector de profesional: nadie, el dueño o un miembro (su id). */
const SIN_ASIGNAR = ""
const DEL_DUEÑO = "duenio"

interface PropsDeModalPrestacion {
  pacienteId: string
  etapa: EtapaRespuesta
  usuario: UsuarioDeLaFicha
  alTerminar: (plan: PlanRespuesta) => void
  alCerrar: () => void
}

/**
 * Una prestación nueva en una etapa por aprobar: la pieza (o boca completa) y
 * sus caras, la prestación (un servicio de la clínica, que trae su nombre y
 * su precio, o un nombre escrito), quién la hace y el valor. La pieza y las
 * caras se revisan con la regla del servidor (`errorDePiezaYCaras`).
 */
export function ModalPrestacion({ pacienteId, etapa, usuario, alTerminar, alCerrar }: PropsDeModalPrestacion) {
  const [pieza, setPieza] = useState("")
  const [caras, setCaras] = useState<Cara[]>([])
  const [servicioId, setServicioId] = useState("")
  const [nombre, setNombre] = useState("")
  const [profesional, setProfesional] = useState(usuario.rol === "owner" ? DEL_DUEÑO : (usuario.memberId ?? SIN_ASIGNAR))
  const [valor, setValor] = useState("")
  const [servicios, setServicios] = useState<ServicioDeLaClinica[] | null>(null)
  const [odontologos, setOdontologos] = useState<{ id: string; nombre: string }[]>([])
  const [errores, setErrores] = useState<{ caras?: string; nombre?: string; valor?: string }>({})
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState("")
  const id = useId()

  // Los servicios, para todos; el equipo, sólo para la dueña (el servidor no se lo da a nadie más).
  useEffect(() => {
    let vigente = true
    leerServicios().then((resultado) => {
      if (vigente) setServicios(resultado.ok ? resultado.datos : [])
    })
    if (usuario.rol === "owner") {
      leerOdontologos().then((resultado) => {
        if (vigente && resultado.ok) setOdontologos(resultado.datos)
      })
    }
    return () => {
      vigente = false
    }
  }, [usuario.rol])

  const numeroDePieza = pieza === "" ? null : Number(pieza)
  const carasPosibles = numeroDePieza === null ? [] : carasDe(numeroDePieza)
  const servicio = servicios?.find((candidato) => candidato.id === servicioId) ?? null

  const elegirPieza = (texto: string) => {
    setPieza(texto)
    // Las caras que la pieza nueva no tiene se sueltan.
    const posibles: Cara[] = texto === "" ? [] : carasDe(Number(texto))
    setCaras((previas) => previas.filter((cara) => posibles.includes(cara)))
    setErrores((previos) => ({ ...previos, caras: undefined }))
  }

  const elegirServicio = (otroId: string) => {
    setServicioId(otroId)
    const elegido = servicios?.find((candidato) => candidato.id === otroId)
    // El precio del servicio, para verlo y cambiarlo si hace falta.
    if (elegido) setValor(elegido.price !== null ? montoParaEscribir(elegido.price) : "")
    setErrores((previos) => ({ ...previos, nombre: undefined }))
  }

  const alternarCara = (cara: Cara) => {
    setCaras((previas) => (previas.includes(cara) ? previas.filter((c) => c !== cara) : ordenarCaras([...previas, cara])))
    setErrores((previos) => ({ ...previos, caras: undefined }))
  }

  const agregar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    const errorDeCaras = errorDePiezaYCaras(numeroDePieza, caras) ?? undefined
    const errorDeNombre = !servicio && nombre.trim() === "" ? "Escribe qué prestación es o elige un servicio" : undefined
    const leido = leerValor(valor)
    const errorDeValor = leido.ok ? undefined : leido.error
    setErrores({ caras: errorDeCaras, nombre: errorDeNombre, valor: errorDeValor })
    if (errorDeCaras || errorDeNombre || !leido.ok) return

    const datos: PrestacionNueva = {
      pieza: numeroDePieza,
      caras,
      ...(servicio && { serviceId: servicio.id }),
      ...(nombre.trim() !== "" && { nombre: nombre.trim() }),
      ...(leido.centavos !== null && { valorCents: leido.centavos }),
      ...(profesional === DEL_DUEÑO ? { delDueño: true } : profesional !== SIN_ASIGNAR ? { memberId: profesional } : {}),
    }
    setAviso("")
    setGuardando(true)
    const resultado = await agregarPrestacion(pacienteId, etapa.id, datos)
    setGuardando(false)
    if (!resultado.ok) return setAviso(resultado.error)
    alTerminar(resultado.datos)
  }

  const yo = usuario.nombre ? `Yo (${usuario.nombre})` : "Yo"

  return (
    <MarcoDeModal
      titulo="Agregar prestación"
      antetitulo={`Etapa ${etapa.orden} · ${etapa.nombre}`}
      bloqueado={guardando}
      ancho="lg"
      alCerrar={alCerrar}
    >
      <form onSubmit={agregar} className="space-y-5" noValidate>
        <div>
          <label htmlFor={`${id}-pieza`} className={ETIQUETA}>
            Pieza
          </label>
          <select
            id={`${id}-pieza`}
            autoFocus
            value={pieza}
            onChange={(e) => elegirPieza(e.target.value)}
            className={cn(CAMPO, "cursor-pointer text-base")}
          >
            <option value="">Boca completa</option>
            <optgroup label="Dentición permanente">
              {piezasDe("permanente").map((numero) => (
                <option key={numero} value={numero}>
                  {numero} · {nombreDePieza(numero)}
                </option>
              ))}
            </optgroup>
            <optgroup label="Dentición temporal">
              {piezasDe("temporal").map((numero) => (
                <option key={numero} value={numero}>
                  {numero} · {nombreDePieza(numero)}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        {numeroDePieza !== null && (
          <fieldset aria-describedby={errores.caras ? `${id}-error-caras` : undefined}>
            <legend className={ETIQUETA}>Caras (si la prestación es de algunas)</legend>
            <div className="flex flex-wrap gap-2">
              {carasPosibles.map((cara) => (
                <label
                  key={cara}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-2 rounded-[14px] border-[1.5px] px-3 text-sm squircle",
                    caras.includes(cara) ? "border-navy bg-lila-suave/60" : "border-borde hover:bg-superficie"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={caras.includes(cara)}
                    onChange={() => alternarCara(cara)}
                    className="anillo-foco size-4 shrink-0 cursor-pointer accent-navy"
                  />
                  <span className="capitalize">{nombreDeCara(cara)}</span>
                </label>
              ))}
            </div>
            {errores.caras && (
              <p id={`${id}-error-caras`} className={ERROR_DE_CAMPO}>
                {errores.caras}
              </p>
            )}
          </fieldset>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-servicio`} className={ETIQUETA}>
              Servicio de la clínica
            </label>
            <select
              id={`${id}-servicio`}
              value={servicioId}
              onChange={(e) => elegirServicio(e.target.value)}
              disabled={servicios === null}
              className={cn(CAMPO, "cursor-pointer text-base")}
            >
              <option value="">{servicios === null ? "Cargando servicios..." : "Ninguno: escribo el nombre"}</option>
              {(servicios ?? []).map((candidato) => (
                <option key={candidato.id} value={candidato.id}>
                  {candidato.name}
                  {candidato.price !== null ? ` · ${formatearMonto(candidato.price)}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-nombre`} className={ETIQUETA}>
              {servicio ? "Nombre (si no es el del servicio)" : "Nombre de la prestación"}
            </label>
            <input
              id={`${id}-nombre`}
              maxLength={120}
              placeholder={servicio?.name ?? "Por ejemplo, Destartraje"}
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value)
                setErrores((previos) => ({ ...previos, nombre: undefined }))
              }}
              aria-invalid={errores.nombre ? true : undefined}
              aria-describedby={errores.nombre ? `${id}-error-nombre` : undefined}
              className={cn(CAMPO, "text-base", errores.nombre && CAMPO_CON_ERROR)}
            />
            {errores.nombre && (
              <p id={`${id}-error-nombre`} className={ERROR_DE_CAMPO}>
                {errores.nombre}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-profesional`} className={ETIQUETA}>
              Quién la hace
            </label>
            <select
              id={`${id}-profesional`}
              value={profesional}
              onChange={(e) => setProfesional(e.target.value)}
              className={cn(CAMPO, "cursor-pointer text-base")}
            >
              {usuario.rol === "owner" && <option value={DEL_DUEÑO}>{yo}</option>}
              {usuario.rol !== "owner" && usuario.memberId && <option value={usuario.memberId}>{yo}</option>}
              {odontologos.map((odontologo) => (
                <option key={odontologo.id} value={odontologo.id}>
                  {odontologo.nombre}
                </option>
              ))}
              <option value={SIN_ASIGNAR}>Sin asignar</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-valor`} className={ETIQUETA}>
              Valor
            </label>
            <div className="relative">
              <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-texto-2">
                $
              </span>
              <input
                id={`${id}-valor`}
                inputMode="decimal"
                autoComplete="off"
                placeholder={servicio ? "El del servicio" : "0"}
                value={valor}
                onChange={(e) => {
                  setValor(e.target.value)
                  setErrores((previos) => ({ ...previos, valor: undefined }))
                }}
                aria-invalid={errores.valor ? true : undefined}
                aria-describedby={errores.valor ? `${id}-error-valor` : undefined}
                className={cn(CAMPO, "pl-7 text-base tabular-nums", errores.valor && CAMPO_CON_ERROR)}
              />
            </div>
            {errores.valor && (
              <p id={`${id}-error-valor`} className={ERROR_DE_CAMPO}>
                {errores.valor}
              </p>
            )}
          </div>
        </div>

        {aviso && <Aviso>{aviso}</Aviso>}
        <PieDelModal texto="Agregar prestación" guardando={guardando} alCerrar={alCerrar} />
      </form>
    </MarcoDeModal>
  )
}

// ─── Agendar ─────────────────────────────────────────────────────────────────

interface PropsDeModalAgendar {
  pacienteId: string
  prestacion: PrestacionRespuesta
  /** "Restauración (pieza 16)". */
  nombre: string
  zona: string
  hoy: string
  alTerminar: (plan: PlanRespuesta) => void
  alCerrar: () => void
}

/**
 * Marcar una prestación como agendada pide la cita: una de las que el
 * paciente tiene por delante (pendiente o confirmada). La cita se crea en la
 * agenda; acá sólo se elige.
 */
export function ModalAgendar({ pacienteId, prestacion, nombre, zona, hoy, alTerminar, alCerrar }: PropsDeModalAgendar) {
  const [citas, setCitas] = useState<CitaDelPaciente[] | null>(null)
  const [citaId, setCitaId] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState("")
  const id = useId()

  useEffect(() => {
    let vigente = true
    leerCitasDelPaciente(pacienteId).then((resultado) => {
      if (!vigente) return
      if (!resultado.ok) {
        setAviso(resultado.error)
        setCitas([])
        return
      }
      const proximas = citasParaAgendar(resultado.datos, new Date())
      setCitas(proximas)
      setCitaId(proximas[0]?.id ?? "")
    })
    return () => {
      vigente = false
    }
  }, [pacienteId])

  const agendar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!citaId) return setAviso("Elige la cita.")
    setAviso("")
    setGuardando(true)
    const resultado = await cambiarEstadoDePrestacion(pacienteId, prestacion.id, "agendada", citaId)
    setGuardando(false)
    if (!resultado.ok) return setAviso(resultado.error)
    alTerminar(resultado.datos)
  }

  return (
    <MarcoDeModal titulo="¿En qué cita se hace?" descripcion={nombre} bloqueado={guardando} alCerrar={alCerrar}>
      <form onSubmit={agendar} className="space-y-5">
        {citas === null ? (
          <p className="text-sm text-texto-2" aria-busy="true">
            Cargando las citas del paciente...
          </p>
        ) : citas.length === 0 ? (
          <Aviso tono="info" titulo="El paciente no tiene citas por delante">
            Agéndale una en la agenda y vuelve a marcarla.
          </Aviso>
        ) : (
          <fieldset>
            <legend className={ETIQUETA}>Citas por delante</legend>
            <div className="space-y-2">
              {citas.map((cita) => (
                <label
                  key={cita.id}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-[16px] border-[1.5px] px-4 py-2.5 squircle",
                    citaId === cita.id ? "border-navy bg-lila-suave/60" : "border-borde hover:bg-superficie"
                  )}
                >
                  <input
                    type="radio"
                    name={`${id}-cita`}
                    value={cita.id}
                    checked={citaId === cita.id}
                    onChange={() => setCitaId(cita.id)}
                    className="anillo-foco size-4 shrink-0 cursor-pointer accent-navy"
                  />
                  <span>
                    <span className="block font-medium tabular-nums">{cuandoEsLaCita(cita.startTime, zona, hoy)}</span>
                    <span className="block text-sm text-texto-2">{cita.title}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {aviso && <Aviso>{aviso}</Aviso>}
        {citas !== null && citas.length === 0 ? (
          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row">
            <Boton type="button" variante="secundario" className="w-full" onClick={alCerrar}>
              Cerrar
            </Boton>
            <Boton href="/dashboard/agenda" className="w-full">
              Ir a la agenda
            </Boton>
          </div>
        ) : (
          <PieDelModal texto="Marcar agendada" guardando={guardando} esperando={citas === null} alCerrar={alCerrar} />
        )}
      </form>
    </MarcoDeModal>
  )
}
