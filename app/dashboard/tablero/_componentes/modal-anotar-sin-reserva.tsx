"use client"

import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { Search, User, UserPlus } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { CAMPO, CAMPO_CON_ERROR, ERROR_DE_CAMPO, ETIQUETA } from "@/components/panel/estilos"
import { lineasDesdeFilas, type FilaDeServicio } from "@/lib/acciones-del-tablero"
import type { Resultado } from "@/lib/peticiones"
import { cn } from "@/lib/utils"
import {
  buscarClientes,
  type Catalogo,
  type ClienteEncontrado,
  type DatosSinReserva,
} from "../_datos"
import { Aviso } from "@/components/panel/aviso"
import { EditorDeServicios, filaVacia } from "./editor-de-servicios"

/** Lo que acepta el servidor para un cliente nuevo. */
const LARGO_MINIMO_DEL_NOMBRE = 2
const LARGO_MAXIMO_DEL_NOMBRE = 100
const LARGO_MAXIMO_DEL_TELEFONO = 30
const LARGO_MAXIMO_DE_LAS_NOTAS = 1000

/** Con menos letras la búsqueda trae medio negocio. */
const LETRAS_PARA_BUSCAR = 2

type ModoCliente = "existente" | "nuevo"

/**
 * El radio no se ve, así que el anillo del foco lo dibuja la opción entera
 * cuando el radio de adentro lo tiene: el de `anillo-foco`, con las mismas
 * variables (contorno de 2 px separado 2 px y el halo del módulo).
 */
const ANILLO_DE_LA_OPCION =
  "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--anillo) has-focus-visible:shadow-[0_0_0_6px_var(--halo)]"

/**
 * El foco de una fila de la lista de clientes, hacia adentro: la lista se
 * desplaza y recorta lo que se sale de ella. El contorno queda dentro de la
 * fila y el halo es su fondo.
 */
const ANILLO_HACIA_ADENTRO =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--anillo) focus-visible:bg-(--halo)"

interface ModalAnotarSinReservaProps {
  catalogo: Catalogo
  eligeProfesional: boolean
  /** El profesional anota a su nombre: sin al menos un servicio, la atención no sería de nadie. */
  servicioObligatorio: boolean
  puedeConfigurarServicios: boolean
  /** Por qué no se pudo anotar, si falló. */
  aviso: string
  guardando: boolean
  onAnotar: (datos: DatosSinReserva) => void
  onCerrar: () => void
}

/**
 * Anotar a alguien que llegó sin reserva: un cliente que ya existe (con el
 * mismo buscador de la cita nueva de la agenda) o uno nuevo, y los servicios
 * si ya se saben. Entra al tablero en espera.
 */
export function ModalAnotarSinReserva({
  catalogo,
  eligeProfesional,
  servicioObligatorio,
  puedeConfigurarServicios,
  aviso,
  guardando,
  onAnotar,
  onCerrar,
}: ModalAnotarSinReservaProps) {
  const idBase = useId()
  const botonCambiar = useRef<HTMLButtonElement>(null)
  const campoNombre = useRef<HTMLInputElement>(null)
  const campoBusqueda = useRef<HTMLInputElement>(null)
  const [modo, setModo] = useState<ModoCliente>("existente")
  const [busqueda, setBusqueda] = useState("")
  const [busquedaHecha, setBusquedaHecha] = useState<{ texto: string; resultado: Resultado<ClienteEncontrado[]> } | null>(null)
  const [elegido, setElegido] = useState<ClienteEncontrado | null>(null)
  const [nombre, setNombre] = useState("")
  const [telefono, setTelefono] = useState("")
  const [filas, setFilas] = useState<FilaDeServicio[]>(() =>
    servicioObligatorio ? [filaVacia(catalogo, "fila-inicial")] : []
  )
  const [notas, setNotas] = useState("")
  const [intentoAnotar, setIntentoAnotar] = useState(false)

  const textoBuscado = busqueda.trim()
  const debeBuscar = modo === "existente" && !elegido && textoBuscado.length >= LETRAS_PARA_BUSCAR

  // La búsqueda espera a que se deje de escribir, igual que en la agenda. El
  // resultado se guarda con el texto que lo pidió: si llega tarde, de una
  // búsqueda vieja, no se muestra como si fuera de la actual.
  useEffect(() => {
    if (!debeBuscar) return
    let vigente = true
    const espera = setTimeout(async () => {
      const resultado = await buscarClientes(textoBuscado)
      if (vigente) setBusquedaHecha({ texto: textoBuscado, resultado })
    }, 300)
    return () => {
      vigente = false
      clearTimeout(espera)
    }
  }, [debeBuscar, textoBuscado])

  const resultadoActual = debeBuscar && busquedaHecha?.texto === textoBuscado ? busquedaHecha.resultado : null
  const buscando = debeBuscar && resultadoActual === null
  const sugerencias = resultadoActual?.ok ? resultadoActual.datos : []
  const avisoDeBusqueda = resultadoActual && !resultadoActual.ok ? resultadoActual.error : ""
  const sinResultados = resultadoActual?.ok === true && sugerencias.length === 0

  // Validación: se calcula siempre, se muestra después del primer intento.
  const validacionDeServicios = lineasDesdeFilas(filas, eligeProfesional)
  const errorDeCliente =
    modo === "existente"
      ? elegido
        ? null
        : "Elige un cliente de la lista, o anótalo como cliente nuevo."
      : nombre.trim().length >= LARGO_MINIMO_DEL_NOMBRE
        ? null
        : `Escribe el nombre del cliente (al menos ${LARGO_MINIMO_DEL_NOMBRE} letras).`
  const errorDeServicios =
    servicioObligatorio && filas.length === 0 ? "Agrega el servicio que vas a hacer: la atención queda a tu nombre." : null
  const mostrarErrores = intentoAnotar

  // Al abrir, el foco va al buscador: es lo primero que se hace. Con un
  // efecto y no con `autoFocus`, para que volver a "Ya es cliente" con las
  // flechas no le robe el foco al grupo de opciones.
  useEffect(() => {
    campoBusqueda.current?.focus()
  }, [])

  const cambiarModo = (nuevo: ModoCliente) => {
    setModo(nuevo)
    // Si la búsqueda no encontró a nadie, lo escrito es casi seguro el nombre;
    // salvo que se haya buscado por teléfono, que no es un nombre.
    if (nuevo === "nuevo" && !nombre && !elegido && /\p{L}/u.test(textoBuscado)) setNombre(textoBuscado)
  }

  // Elegir un cliente o pasar a uno nuevo saca de la pantalla el botón que se
  // apretó: el foco se lleva a lo que aparece en su lugar, para que no caiga
  // fuera del diálogo.
  const elegirCliente = (cliente: ClienteEncontrado) => {
    setElegido(cliente)
    requestAnimationFrame(() => botonCambiar.current?.focus())
  }

  const anotarComoNuevo = () => {
    cambiarModo("nuevo")
    requestAnimationFrame(() => campoNombre.current?.focus())
  }

  const anotar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    setIntentoAnotar(true)
    if (errorDeCliente || errorDeServicios || !validacionDeServicios.ok) return

    onAnotar({
      cliente: modo === "existente" && elegido ? { id: elegido.id } : { nuevo: { nombre, telefono } },
      lineas: validacionDeServicios.lineas,
      notas,
    })
  }

  return (
    <MarcoDeModal
      antetitulo="Tablero"
      titulo="Anotar sin reserva"
      descripcion="Entra al tablero en espera."
      ancho="lg"
      bloqueado={guardando}
      alCerrar={onCerrar}
    >
      <form onSubmit={anotar} noValidate className="space-y-6">
        {/* ── Cliente ── */}
        <fieldset className="space-y-3">
          <legend className="mb-3 text-sm font-semibold">Cliente</legend>

          {/* Las dos opciones lado a lado, la elegida en navy: el borde gris de los campos dice que son controles. */}
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="¿Ya es cliente?">
            {(
              [
                { id: "existente", texto: "Ya es cliente", icono: User },
                { id: "nuevo", texto: "Cliente nuevo", icono: UserPlus },
              ] as const
            ).map(({ id, texto, icono: Icono }) => (
              <label
                key={id}
                className={cn(
                  "flex h-12 cursor-pointer items-center justify-center gap-2 rounded-campo border px-3 text-center text-sm font-medium squircle",
                  "transition-[border-color,background-color,color] duration-150 ease-suave",
                  ANILLO_DE_LA_OPCION,
                  modo === id ? "border-navy bg-navy text-white" : "border-texto-2 bg-tarjeta text-navy hover:border-navy"
                )}
              >
                <input
                  type="radio"
                  name={`${idBase}-modo`}
                  value={id}
                  checked={modo === id}
                  disabled={guardando}
                  onChange={() => cambiarModo(id)}
                  className="sr-only"
                />
                <Icono className="size-4 shrink-0" aria-hidden="true" strokeWidth={1.75} />
                {texto}
              </label>
            ))}
          </div>

          {modo === "existente" ? (
            elegido ? (
              <div className="flex items-center justify-between gap-3 rounded-campo bg-superficie py-2 pl-4 pr-2 squircle">
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">{elegido.nombre}</p>
                  {elegido.detalle && <p className="text-xs break-words text-texto-2">{elegido.detalle}</p>}
                </div>
                <Boton
                  ref={botonCambiar}
                  variante="fantasma"
                  tamano="sm"
                  onClick={() => {
                    setElegido(null)
                    requestAnimationFrame(() => campoBusqueda.current?.focus())
                  }}
                  disabled={guardando}
                >
                  Cambiar
                </Boton>
              </div>
            ) : (
              <div>
                <label htmlFor={`${idBase}-buscar`} className={ETIQUETA}>
                  Buscar cliente
                </label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-texto-2"
                    aria-hidden="true"
                  />
                  <input
                    ref={campoBusqueda}
                    id={`${idBase}-buscar`}
                    type="search"
                    autoComplete="off"
                    value={busqueda}
                    disabled={guardando}
                    placeholder="Nombre, teléfono o correo"
                    aria-describedby={
                      mostrarErrores && errorDeCliente
                        ? `${idBase}-estado-busqueda ${idBase}-error-cliente`
                        : `${idBase}-estado-busqueda`
                    }
                    aria-invalid={mostrarErrores && errorDeCliente ? true : undefined}
                    onChange={(evento) => setBusqueda(evento.target.value)}
                    className={cn(CAMPO, "pl-10", mostrarErrores && errorDeCliente && CAMPO_CON_ERROR)}
                  />
                </div>

                <div id={`${idBase}-estado-busqueda`} aria-live="polite" className="mt-1.5 text-xs text-texto-2">
                  {textoBuscado.length < LETRAS_PARA_BUSCAR && `Escribe al menos ${LETRAS_PARA_BUSCAR} letras para buscar.`}
                  {buscando && "Buscando…"}
                  {sugerencias.length > 0 &&
                    (sugerencias.length === 1 ? "1 cliente encontrado." : `${sugerencias.length} clientes encontrados.`)}
                  {sinResultados && "No hay clientes con ese texto."}
                </div>

                {avisoDeBusqueda && (
                  <Aviso tono="error" rol="alert" className="mt-2">
                    {avisoDeBusqueda}
                  </Aviso>
                )}

                {sugerencias.length > 0 && (
                  <ul className="mt-2 max-h-56 divide-y divide-borde overflow-y-auto rounded-campo bg-tarjeta inset-ring-1 inset-ring-borde squircle">
                    {sugerencias.map((cliente) => (
                      <li key={cliente.id}>
                        <button
                          type="button"
                          onClick={() => elegirCliente(cliente)}
                          disabled={guardando}
                          className={cn(
                            "flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 ease-suave hover:bg-superficie",
                            ANILLO_HACIA_ADENTRO
                          )}
                        >
                          <User className="size-4 shrink-0 text-texto-2" aria-hidden="true" strokeWidth={1.75} />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium break-words">{cliente.nombre}</span>
                            {cliente.detalle && (
                              <span className="block text-xs break-words text-texto-2">{cliente.detalle}</span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {sinResultados && (
                  <Boton variante="enlace" tamano="sm" onClick={anotarComoNuevo} disabled={guardando} className="mt-1">
                    Anotarlo como cliente nuevo
                  </Boton>
                )}
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CampoFormulario
                ref={campoNombre}
                etiqueta="Nombre"
                value={nombre}
                maxLength={LARGO_MAXIMO_DEL_NOMBRE}
                autoComplete="off"
                required
                disabled={guardando}
                error={mostrarErrores && errorDeCliente ? errorDeCliente : undefined}
                onChange={(evento) => setNombre(evento.target.value)}
                icono={<User className="h-4 w-4" aria-hidden="true" />}
              />
              <CampoFormulario
                etiqueta="Teléfono (opcional)"
                type="tel"
                value={telefono}
                maxLength={LARGO_MAXIMO_DEL_TELEFONO}
                autoComplete="off"
                disabled={guardando}
                onChange={(evento) => setTelefono(evento.target.value)}
              />
            </div>
          )}

          {mostrarErrores && errorDeCliente && modo === "existente" && (
            <p id={`${idBase}-error-cliente`} className={ERROR_DE_CAMPO}>
              {errorDeCliente}
            </p>
          )}
        </fieldset>

        {/* ── Servicios ── */}
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Servicios</legend>
          <p className="text-sm text-texto-2">
            {servicioObligatorio
              ? "Agrega el servicio que vas a hacer: la atención queda a tu nombre."
              : "Opcional: si todavía no se sabe, se agregan después desde la tarjeta."}
          </p>
          <EditorDeServicios
            filas={filas}
            catalogo={catalogo}
            eligeProfesional={eligeProfesional}
            puedeConfigurarServicios={puedeConfigurarServicios}
            errores={mostrarErrores && !validacionDeServicios.ok ? validacionDeServicios.errores : {}}
            deshabilitado={guardando}
            onCambiar={setFilas}
          />
          {mostrarErrores && errorDeServicios && <p className={ERROR_DE_CAMPO}>{errorDeServicios}</p>}
        </fieldset>

        {/* ── Notas ── */}
        <div>
          <label htmlFor={`${idBase}-notas`} className={ETIQUETA}>
            Notas (opcional)
          </label>
          <textarea
            id={`${idBase}-notas`}
            value={notas}
            maxLength={LARGO_MAXIMO_DE_LAS_NOTAS}
            disabled={guardando}
            onChange={(evento) => setNotas(evento.target.value)}
            placeholder="Ej.: prefiere que la atienda Carla"
            className={cn(CAMPO, "resize-none h-20")}
          />
        </div>

        {mostrarErrores && (errorDeCliente || errorDeServicios || !validacionDeServicios.ok) && (
          <Aviso tono="error" rol="alert">
            Revisa lo marcado antes de anotar.
          </Aviso>
        )}
        {aviso && (
          <Aviso tono="error" rol="alert">
            {aviso}
          </Aviso>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <Boton type="button" variante="secundario" onClick={onCerrar} disabled={guardando} className="w-full">
            Cancelar
          </Boton>
          <Boton type="submit" cargando={guardando} aria-label={guardando ? "Anotando" : undefined} className="w-full">
            Anotar en espera
          </Boton>
        </div>
      </form>
    </MarcoDeModal>
  )
}
