"use client"

import { useId, useMemo, useRef, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { ListPlus, Plus, Scissors } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Aviso } from "@/components/panel/aviso"
import { ModalConfirmar } from "@/components/panel/modal-confirmar"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { montoParaEscribir } from "@/lib/dinero"
import {
  SIN_FILTRO_DE_LA_LISTA,
  categoriaCanonica,
  categoriasDe,
  conActivo,
  conCategoria,
  conCategoriaRenombrada,
  contarDeLaCategoria,
  fusionarServicios,
  vistaDeLaLista,
  type FiltroDeLaLista,
  type GrupoDeLaLista,
} from "@/lib/lista-de-servicios"
import { alternarUna, conMarca, estadoDeLaSeleccion, marcadasEntre } from "@/lib/seleccion-multiple"
import { claveDeCategoria } from "@/lib/servicios-por-categoria"
import type { ServicioParaCargar } from "@/lib/servicios-en-lote"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { BarraDeSeleccion } from "./barra-de-seleccion"
import { BarraDeServicios } from "./barra-de-servicios"
import { FilaDeServicio } from "./fila-de-servicio"
import { GrupoDeServicios } from "./grupo-de-servicios"
import { ModalCargaRapida } from "./modal-carga-rapida"
import { ModalCategoriaDeServicios } from "./modal-categoria-de-servicios"
import { ModalRenombrarCategoria, type PlanConfirmable } from "./modal-renombrar-categoria"
import { ModalServicio } from "./modal-servicio"
import { ResumenDeCargaAviso } from "./resumen-de-carga-aviso"
import {
  borrarServicio,
  cambiarServiciosEnLote,
  cargarServiciosEnLote,
  crearServicio,
  editarServicio,
  activarODesactivarServicio,
  leerServicios,
  renombrarCategoria,
  type DatosDeServicio,
  type Servicio,
} from "../_datos"
import { frasesDeConfiguracion } from "../_frases"
import type { ResumenParaMostrar } from "../_frases-de-servicios"

const SERVICIO_EN_BLANCO: DatosDeServicio = { name: "", description: "", duration: 30, price: "", category: "", frecuenciaDias: "", esUrgencia: false }

interface PropsDeSeccionServicios {
  serviciosIniciales: Servicio[]
  /**
   * Si puede marcar un servicio como urgencia (`puedeMarcarServicioComoUrgencia`,
   * una clínica dental): `page.tsx` lo pregunta a `lib/permisos.ts` y acá no se
   * compara ningún rol ni rubro. El servidor lo vuelve a decidir.
   *
   * La sección entera sólo se dibuja para quien `puedeGestionarServicios`
   * (dueño y encargado): `page.tsx` lo decide y no la monta para nadie más.
   */
  puedeMarcarUrgencia?: boolean
}

/** Lo que pide un cambio en lote que se está por confirmar. */
type CambioDeEstado = "activar" | "desactivar"

export function SeccionServicios({ serviciosIniciales, puedeMarcarUrgencia = false }: PropsDeSeccionServicios) {
  const idDelTitulo = useId()
  const rubro = useRubroDelPanel()
  const palabras = useMemo(() => vocabularioDe(rubro).palabras, [rubro])
  const { servicios: frases } = useMemo(() => frasesDeConfiguracion(palabras), [palabras])
  const [servicios, setServicios] = useState<Servicio[]>(serviciosIniciales)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [servicioEditando, setServicioEditando] = useState<Servicio | null>(null)
  const [form, setForm] = useState<DatosDeServicio>(SERVICIO_EN_BLANCO)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState("")
  const [avisoDelModal, setAvisoDelModal] = useState("")
  // El servicio que se está por eliminar, con su modal de confirmación.
  const [aEliminar, setAEliminar] = useState<Servicio | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const [avisoDeEliminar, setAvisoDeEliminar] = useState("")

  // La lista: qué se ve y qué está plegado.
  const [filtro, setFiltro] = useState<FiltroDeLaLista>(SIN_FILTRO_DE_LA_LISTA)
  const [plegadas, setPlegadas] = useState<ReadonlySet<string>>(new Set())
  // La selección en lote.
  const [seleccionando, setSeleccionando] = useState(false)
  const [seleccion, setSeleccion] = useState<ReadonlySet<string>>(new Set())
  const [categoriaAbierta, setCategoriaAbierta] = useState(false)
  const [cambioDeEstado, setCambioDeEstado] = useState<CambioDeEstado | null>(null)
  const [aRenombrar, setARenombrar] = useState<GrupoDeLaLista<Servicio> | null>(null)
  const [trabajandoEnLote, setTrabajandoEnLote] = useState(false)
  const [avisoDelLote, setAvisoDelLote] = useState("")
  // La carga rápida y lo que dijo la última acción en lote, para el lector de pantalla.
  const [cargaAbierta, setCargaAbierta] = useState(false)
  const [resultado, setResultado] = useState<ResumenParaMostrar | null>(null)
  const botonDeCarga = useRef<HTMLButtonElement>(null)
  const botonDeSeleccion = useRef<HTMLButtonElement>(null)

  const vista = useMemo(() => vistaDeLaLista(servicios, filtro), [servicios, filtro])
  const categorias = useMemo(() => categoriasDe(servicios), [servicios])
  const idsVisibles = useMemo(() => vista.visibles.map((servicio) => servicio.id), [vista.visibles])
  // Sólo cuenta lo marcado que se ve: una acción no debe tocar lo que un filtro esconde.
  const marcados = useMemo(() => marcadasEntre(seleccion, idsVisibles), [seleccion, idsVisibles])
  const unSoloGrupoSinNombre = vista.grupos.length === 1 && vista.grupos[0].sinCategoria

  const abrirNuevo = () => {
    setServicioEditando(null)
    setForm(SERVICIO_EN_BLANCO)
    setAvisoDelModal("")
    setModalAbierto(true)
  }

  const abrirEdicion = (servicio: Servicio) => {
    setServicioEditando(servicio)
    setForm({
      name: servicio.name,
      description: servicio.description ?? "",
      duration: servicio.duration,
      price: servicio.price == null ? "" : montoParaEscribir(servicio.price),
      category: servicio.category ?? "",
      frecuenciaDias: servicio.frecuenciaDias?.toString() ?? "",
      esUrgencia: servicio.esUrgencia,
    })
    setAvisoDelModal("")
    setModalAbierto(true)
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setServicioEditando(null)
  }

  /** Pone en la lista el servicio tal como volvió del servidor. */
  const reemplazarEnLista = (actualizado: Servicio) =>
    setServicios((previos) => previos.map((servicio) => (servicio.id === actualizado.id ? actualizado : servicio)))

  const guardar = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setAvisoDelModal("")
    setGuardando(true)
    // Una categoría que ya existe con otras mayúsculas ("color" y "Color") se guarda como la existente.
    const datos = { ...form, category: categoriaCanonica(categorias, form.category) }
    const resultado = servicioEditando
      ? await editarServicio(servicioEditando.id, datos, palabras, puedeMarcarUrgencia)
      : await crearServicio(datos, palabras, puedeMarcarUrgencia)
    setGuardando(false)

    // Si el servidor lo rechaza, el modal queda abierto con lo cargado y el
    // motivo: cerrarlo haría parecer que se guardó.
    if (!resultado.ok) return setAvisoDelModal(resultado.error)

    // El aviso de una falla anterior (activar, borrar) ya no corresponde: si
    // quedara, parecería que esto tampoco se guardó.
    setAviso("")
    setResultado(null)
    const guardado = resultado.datos
    if (servicioEditando) reemplazarEnLista(guardado)
    else setServicios((previos) => [...previos, guardado])
    cerrarModal()
  }

  const alternarActivo = async (servicio: Servicio) => {
    setAviso("")
    setResultado(null)
    const resultado = await activarODesactivarServicio(servicio.id, !servicio.active, palabras)
    if (resultado.ok) reemplazarEnLista(resultado.datos)
    else setAviso(resultado.error)
  }

  const pedirEliminar = (servicio: Servicio) => {
    setAvisoDeEliminar("")
    setAEliminar(servicio)
  }

  /** Si el servidor no lo deja (por ejemplo, porque tiene citas), el motivo queda en el modal. */
  const confirmarEliminar = async () => {
    if (!aEliminar) return
    const id = aEliminar.id
    setAvisoDeEliminar("")
    setEliminando(true)
    const resultado = await borrarServicio(id, palabras)
    setEliminando(false)
    if (!resultado.ok) return setAvisoDeEliminar(resultado.error)
    setAviso("")
    setResultado(null)
    setServicios((previos) => previos.filter((servicio) => servicio.id !== id))
    setAEliminar(null)
  }

  // ─── La lista: plegar, seleccionar ─────────────────────────────────────────

  const alternarGrupo = (clave: string) =>
    setPlegadas((previas) => {
      const nuevas = new Set(previas)
      if (!nuevas.delete(clave)) nuevas.add(clave)
      return nuevas
    })

  const alternarSeleccion = () => {
    setSeleccionando((antes) => !antes)
    setSeleccion(new Set())
  }

  /** Sale del modo de selección, cuando una acción en lote terminó. */
  const terminarSeleccion = () => {
    setSeleccionando(false)
    setSeleccion(new Set())
  }

  /**
   * Cuando se cierra un modal de la lista y lo que lo abrió ya no está (la
   * barra de selección se fue, o la categoría se unió con otra), el foco vuelve
   * al botón de seleccionar, que sigue ahí: no cae al <body>.
   */
  const devolverElFoco = () => {
    const actual = document.activeElement
    if (!actual || actual === document.body) botonDeSeleccion.current?.focus()
  }

  /** Trae la lista del servidor y la junta con la que se tenía (una carga o un cambio agregó o movió servicios). `false` si no se pudo. */
  const refrescarLista = async (): Promise<boolean> => {
    const leidos = await leerServicios(palabras)
    if (leidos.ok) setServicios((previos) => fusionarServicios(previos, leidos.datos))
    return leidos.ok
  }

  // ─── Cambios en lote ───────────────────────────────────────────────────────

  const abrirCategoria = () => {
    setAvisoDelLote("")
    setCategoriaAbierta(true)
  }

  const abrirCambioDeEstado = (cambio: CambioDeEstado) => {
    setAvisoDelLote("")
    setCambioDeEstado(cambio)
  }

  const abrirRenombrar = (grupo: GrupoDeLaLista<Servicio>) => {
    setAvisoDelLote("")
    setARenombrar(grupo)
  }

  /**
   * Cambia la categoría o el estado de los marcados. Si el servidor cambió
   * todos, la lista se actualiza sin pedirla otra vez; si cambió menos (o falló
   * a medias), se vuelve a leer para mostrar lo que de verdad quedó. Si falla,
   * el motivo queda en el modal, abierto.
   */
  const aplicarCambio = async (cambios: { category: string | null } | { active: boolean }, decir: (n: number) => string) => {
    const ids = marcados
    setAvisoDelLote("")
    setTrabajandoEnLote(true)
    const hecho = await cambiarServiciosEnLote(ids, cambios, palabras)
    const cambiados = hecho.actualizados
    if (!hecho.ok || cambiados < ids.length) await refrescarLista()
    else {
      const conjunto = new Set(ids)
      setServicios((previos) =>
        "category" in cambios ? conCategoria(previos, conjunto, cambios.category) : conActivo(previos, conjunto, cambios.active)
      )
    }
    setTrabajandoEnLote(false)
    if (!hecho.ok) return setAvisoDelLote(hecho.error)

    setAviso("")
    setResultado(
      cambiados === 0
        ? { tono: "atencion", titulo: frases.seleccion.sinCambios, detalles: [] }
        : { tono: "listo", titulo: decir(cambiados), detalles: [] }
    )
    setCategoriaAbierta(false)
    setCambioDeEstado(null)
    terminarSeleccion()
  }

  const confirmarCategoria = (categoria: string) =>
    aplicarCambio({ category: categoria === "" ? null : categoria }, (n) => frases.cambiarCategoria.resultado(n, categoria === "" ? null : categoria))

  const confirmarEstado = (cambio: CambioDeEstado) =>
    aplicarCambio({ active: cambio === "activar" }, cambio === "activar" ? frases.activarEnLote.resultadoActivar : frases.activarEnLote.resultadoDesactivar)

  /**
   * Renombra una categoría, o la une con otra que ya existe (el plan lo dice
   * el modal). El servidor compara el nombre sin mayúsculas ni espacios de más,
   * así que un solo pedido cambia todas sus escrituras. Si cambió justo los
   * que se esperaban, la lista se actualiza sin pedirla; si no (el servidor
   * también compara sin tildes, y puede haber movido más), se vuelve a leer.
   */
  const confirmarRenombrar = async (plan: PlanConfirmable) => {
    if (!aRenombrar) return
    const { clave, categoria } = aRenombrar
    const esperados = servicios.filter(
      (servicio) => (servicio.category ?? "").trim() !== "" && claveDeCategoria(servicio.category) === clave && servicio.category !== plan.nuevo
    ).length
    setAvisoDelLote("")
    setTrabajandoEnLote(true)
    const hecho = await renombrarCategoria(categoria, plan.nuevo, palabras)
    if (hecho.ok && hecho.datos.actualizados === esperados) {
      setServicios((previos) => conCategoriaRenombrada(previos, clave, plan.nuevo))
    } else {
      await refrescarLista()
    }
    setTrabajandoEnLote(false)
    if (!hecho.ok) return setAvisoDelLote(hecho.error)

    setAviso("")
    setResultado({
      tono: "listo",
      titulo:
        plan.tipo === "unir"
          ? frases.renombrarCategoria.resultadoUnir(categoria, plan.nuevo, hecho.datos.actualizados)
          : frases.renombrarCategoria.resultadoRenombrar(categoria, plan.nuevo, hecho.datos.actualizados),
      detalles: [],
    })
    setARenombrar(null)
  }

  // ─── La carga rápida ───────────────────────────────────────────────────────

  const abrirCarga = () => {
    setAviso("")
    setCargaAbierta(true)
  }

  /**
   * Envía lo que eligió la carga rápida (de a 100) y trae la lista al día, sin
   * recargar la página. Si todo llegó y se agregó algo, el resumen queda en la
   * sección y el modal se cierra. Si no (nada se agregó, o se cortó a la
   * mitad), el resumen se muestra en el modal, que sigue abierto.
   */
  const agregarEnLote = async (lista: ServicioParaCargar[]): Promise<{ resumen: ResumenParaMostrar; cerrar: boolean }> => {
    const enviado = await cargarServiciosEnLote(lista, palabras)
    let resumen = frases.resumenDeCarga(enviado)
    if (enviado.creados > 0 && !(await refrescarLista())) {
      resumen = { ...resumen, detalles: [frases.errorDeLote(null, "", "leer"), ...resumen.detalles] }
    }
    const cerrar = enviado.error === null && enviado.creados > 0
    if (cerrar) {
      setAviso("")
      setResultado(resumen)
    }
    return { resumen, cerrar }
  }

  /** Si lo que abrió la carga rápida ya no está (el estado vacío se fue al agregar), el foco vuelve a su botón. */
  const devolverElFocoALaCarga = () => {
    const actual = document.activeElement
    if (!actual || actual === document.body) botonDeCarga.current?.focus()
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        nivel={3}
        titulo={frases.titulo}
        subtitulo={frases.subtitulo}
        icono={{ figura: Scissors }}
        accion={
          <div className="flex flex-wrap items-center gap-2">
            <Boton ref={botonDeCarga} variante="secundario" tamano="sm" icono={<ListPlus />} onClick={abrirCarga}>
              {frases.carga.boton}
            </Boton>
            <BotonPrimario tamaño="sm" icono={<Plus className="h-4 w-4" />} onClick={abrirNuevo}>
              {frases.nuevo}
            </BotonPrimario>
          </div>
        }
      />

      {aviso && <Aviso className="mt-5">{aviso}</Aviso>}

      {/* Lo que dijo la última carga o cambio en lote. La región está siempre: el lector anuncia lo que aparece adentro. */}
      <div role="status" aria-live="polite">
        {resultado && (
          <ResumenDeCargaAviso
            resumen={resultado}
            className="mt-5"
            accion={
              <BotonPrimario variante="fantasma" tamaño="sm" onClick={() => setResultado(null)}>
                {frases.entendido}
              </BotonPrimario>
            }
          />
        )}
      </div>

      {servicios.length === 0 ? (
        <EstadoVacio className="mt-5" titulo={frases.sinServicios.titulo}>
          {frases.sinServicios.ayuda}
          <span className="mt-4 flex justify-center">
            <BotonPrimario icono={<ListPlus className="h-4 w-4" />} onClick={abrirCarga}>
              {frases.carga.boton}
            </BotonPrimario>
          </span>
        </EstadoVacio>
      ) : (
        <>
          <BarraDeServicios
            frases={frases}
            conFiltros={vista.conFiltros}
            filtro={vista.filtro}
            alCambiarFiltro={setFiltro}
            seleccionando={seleccionando}
            alAlternarSeleccion={alternarSeleccion}
            botonDeSeleccion={botonDeSeleccion}
          />

          {/* Lo que el filtro deja a la vista, para el lector de pantalla. */}
          {vista.conFiltros && (
            <p role="status" className="mt-3 min-h-5 text-sm text-texto-2">
              {vista.filtrando ? frases.lista.mostrando(vista.visibles.length, vista.total) : ""}
            </p>
          )}

          {vista.visibles.length === 0 ? (
            <EstadoVacio className="mt-5" titulo={frases.lista.sinResultados.titulo}>
              {frases.lista.sinResultados.ayuda}
              <span className="mt-4 flex justify-center">
                <BotonPrimario variante="secundario" tamaño="sm" onClick={() => setFiltro(SIN_FILTRO_DE_LA_LISTA)}>
                  {frases.lista.sinResultados.quitar}
                </BotonPrimario>
              </span>
            </EstadoVacio>
          ) : unSoloGrupoSinNombre ? (
            // Sin ninguna categoría puesta, un título "Sin categoría" sobre todo no dice nada: la lista de siempre.
            <ul className="mt-5 divide-y divide-borde">
              {vista.grupos[0].servicios.map((servicio) => (
                <FilaDeServicio
                  key={servicio.id}
                  servicio={servicio}
                  frases={frases}
                  seleccionando={seleccionando}
                  marcado={seleccion.has(servicio.id)}
                  alMarcar={() => setSeleccion((previa) => alternarUna(previa, servicio.id))}
                  alAlternarActivo={() => alternarActivo(servicio)}
                  alEditar={() => abrirEdicion(servicio)}
                  alEliminar={() => pedirEliminar(servicio)}
                />
              ))}
            </ul>
          ) : (
            <div className="mt-5 space-y-4">
              {vista.grupos.map((grupo) => {
                const nombre = grupo.sinCategoria ? frases.lista.sinCategoria : grupo.categoria
                const ids = grupo.servicios.map((servicio) => servicio.id)
                return (
                  <GrupoDeServicios
                    key={grupo.clave}
                    nombre={nombre}
                    cantidad={ids.length}
                    conteoEnPalabras={frases.lista.cuantos(ids.length)}
                    // Una búsqueda despliega lo que encontró: un resultado plegado no se vería.
                    abierto={vista.buscando || !plegadas.has(grupo.clave)}
                    alAlternar={() => alternarGrupo(grupo.clave)}
                    seleccion={
                      seleccionando
                        ? {
                            etiqueta: frases.seleccion.marcarCategoria(nombre),
                            estado: estadoDeLaSeleccion(seleccion, ids),
                            alCambiar: (marcado) => setSeleccion((previa) => conMarca(previa, ids, marcado)),
                          }
                        : undefined
                    }
                    renombrar={
                      !seleccionando && !grupo.sinCategoria
                        ? { etiqueta: frases.lista.renombrarLa(nombre), texto: frases.lista.renombrar, alPulsar: () => abrirRenombrar(grupo) }
                        : undefined
                    }
                  >
                    {grupo.servicios.map((servicio) => (
                      <FilaDeServicio
                        key={servicio.id}
                        servicio={servicio}
                        frases={frases}
                        seleccionando={seleccionando}
                        marcado={seleccion.has(servicio.id)}
                        alMarcar={() => setSeleccion((previa) => alternarUna(previa, servicio.id))}
                        alAlternarActivo={() => alternarActivo(servicio)}
                        alEditar={() => abrirEdicion(servicio)}
                        alEliminar={() => pedirEliminar(servicio)}
                      />
                    ))}
                  </GrupoDeServicios>
                )
              })}
            </div>
          )}

          {seleccionando && (
            <BarraDeSeleccion
              frases={frases}
              marcados={marcados.length}
              visibles={idsVisibles.length}
              alMarcarTodos={() => setSeleccion((previa) => conMarca(previa, idsVisibles, true))}
              alQuitarSeleccion={() => setSeleccion((previa) => conMarca(previa, idsVisibles, false))}
              alCambiarCategoria={abrirCategoria}
              alActivar={() => abrirCambioDeEstado("activar")}
              alDesactivar={() => abrirCambioDeEstado("desactivar")}
            />
          )}
        </>
      )}

      <AnimatePresence>
        {modalAbierto && (
          <ModalServicio
            form={form}
            categorias={categorias}
            guardando={guardando}
            aviso={avisoDelModal}
            modoEdicion={!!servicioEditando}
            onCambiarCampo={(campo, valor) => setForm((previo) => ({ ...previo, [campo]: valor }))}
            onSubmit={guardar}
            onCerrar={cerrarModal}
            frecuenciaDias={form.frecuenciaDias}
            onCambiarFrecuencia={(valor) => setForm((previo) => ({ ...previo, frecuenciaDias: valor }))}
            urgencia={form.esUrgencia}
            onCambiarUrgencia={puedeMarcarUrgencia ? (valor) => setForm((previo) => ({ ...previo, esUrgencia: valor })) : undefined}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {aEliminar && (
          <ModalConfirmar
            titulo={`¿Eliminar ${aEliminar.name}?`}
            descripcion={frases.eliminar.descripcion}
            textoConfirmar={frases.eliminar.confirmar}
            textoCancelar="No eliminar"
            peligro
            trabajando={eliminando}
            aviso={avisoDeEliminar}
            onConfirmar={confirmarEliminar}
            onCerrar={() => setAEliminar(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence onExitComplete={devolverElFocoALaCarga}>
        {cargaAbierta && <ModalCargaRapida servicios={servicios} alAgregar={agregarEnLote} alCerrar={() => setCargaAbierta(false)} />}
      </AnimatePresence>

      <AnimatePresence onExitComplete={devolverElFoco}>
        {categoriaAbierta && (
          <ModalCategoriaDeServicios
            frases={frases}
            cantidad={marcados.length}
            categorias={categorias}
            trabajando={trabajandoEnLote}
            aviso={avisoDelLote}
            alConfirmar={confirmarCategoria}
            alCerrar={() => setCategoriaAbierta(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence onExitComplete={devolverElFoco}>
        {cambioDeEstado && (
          <ModalConfirmar
            titulo={cambioDeEstado === "activar" ? frases.activarEnLote.tituloActivar(marcados.length) : frases.activarEnLote.tituloDesactivar(marcados.length)}
            descripcion={cambioDeEstado === "activar" ? frases.activarEnLote.descripcionActivar : frases.activarEnLote.descripcionDesactivar}
            textoConfirmar={cambioDeEstado === "activar" ? frases.activarEnLote.confirmarActivar : frases.activarEnLote.confirmarDesactivar}
            textoCancelar={frases.activarEnLote.cancelar}
            trabajando={trabajandoEnLote}
            aviso={avisoDelLote}
            onConfirmar={() => confirmarEstado(cambioDeEstado)}
            onCerrar={() => setCambioDeEstado(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence onExitComplete={devolverElFoco}>
        {aRenombrar && (
          <ModalRenombrarCategoria
            frases={frases}
            categoria={aRenombrar.categoria}
            clave={aRenombrar.clave}
            cantidad={contarDeLaCategoria(servicios, aRenombrar.clave)}
            servicios={servicios}
            trabajando={trabajandoEnLote}
            aviso={avisoDelLote}
            alConfirmar={confirmarRenombrar}
            alCerrar={() => setARenombrar(null)}
          />
        )}
      </AnimatePresence>
    </section>
  )
}
