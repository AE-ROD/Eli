"use client"

import { useRef, useState } from "react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Aviso } from "@/components/panel/aviso"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { vocabularioDe } from "@/lib/vocabulario"
import { agregarSede, editarSede, type Sede } from "../_datos"
import { frasesDeConfiguracion } from "../_frases"
import { SEDE_VACIA, datosDeLaSede, revisarSede, type CampoDeSede, type DatosDeSede, type ErroresDeSede } from "../_sedes"
import { FormularioDeSede } from "./formulario-de-sede"

interface PropsDeModalSede {
  /** La sede a editar, o `null` para una nueva (activa, al final de la lista, sin horario). */
  sede: Sede | null
  /** Las sedes que hay: el nombre no puede repetir el de otra. */
  sedes: readonly Sede[]
  alGuardar: (sede: Sede) => void
  alCerrar: () => void
}

/**
 * Agregar una sede o cambiarle los datos (nombre, dirección, comuna y
 * teléfono). Se revisa antes de enviar, con cada error junto a su campo; si el
 * servidor la rechaza (un nombre repetido, ya hay 5 activas), el modal sigue
 * abierto con el motivo.
 */
export function ModalSede({ sede, sedes, alGuardar, alCerrar }: PropsDeModalSede) {
  const palabras = vocabularioDe(useRubroDelPanel()).palabras
  const { modal: frases } = frasesDeConfiguracion(palabras).sedes
  const [datos, setDatos] = useState<DatosDeSede>(sede ? datosDeLaSede(sede) : SEDE_VACIA)
  const [errores, setErrores] = useState<ErroresDeSede>({})
  const [aviso, setAviso] = useState("")
  const [guardando, setGuardando] = useState(false)
  const formulario = useRef<HTMLFormElement>(null)

  const cambiar = (campo: CampoDeSede, valor: string) => {
    setDatos((previos) => ({ ...previos, [campo]: valor }))
    setErrores((previos) => ({ ...previos, [campo]: undefined }))
    setAviso("")
  }

  const guardar = async (evento: React.SyntheticEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (guardando) return
    const revisada = revisarSede(datos, sedes, sede?.id)
    if (!revisada.ok) {
      setErrores(revisada.errores)
      // El foco va al primer campo con error: quien usa lector de pantalla oye cuál es.
      requestAnimationFrame(() => formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setAviso("")
    setGuardando(true)
    const resultado = sede ? await editarSede(sede.id, revisada.cuerpo, palabras) : await agregarSede(revisada.cuerpo, palabras)
    setGuardando(false)
    if (!resultado.ok) return setAviso(resultado.error)
    alGuardar(resultado.datos)
  }

  return (
    <MarcoDeModal
      titulo={sede ? frases.tituloEditar : frases.tituloAgregar}
      descripcion={sede ? undefined : frases.ayudaAgregar}
      bloqueado={guardando}
      alCerrar={alCerrar}
    >
      <form ref={formulario} onSubmit={guardar} noValidate className="space-y-5">
        <FormularioDeSede datos={datos} errores={errores} alCambiar={cambiar} enfocarElNombre guardando={guardando} />
        {aviso && <Aviso>{aviso}</Aviso>}
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row">
          <BotonPrimario type="button" variante="secundario" anchoCompleto disabled={guardando} onClick={alCerrar}>
            {frases.cancelar}
          </BotonPrimario>
          <BotonPrimario type="submit" anchoCompleto cargando={guardando}>
            {sede ? frases.guardar : frases.agregar}
          </BotonPrimario>
        </div>
      </form>
    </MarcoDeModal>
  )
}
