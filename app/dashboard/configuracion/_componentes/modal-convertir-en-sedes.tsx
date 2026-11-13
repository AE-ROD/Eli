"use client"

import { useRef, useState } from "react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Aviso } from "@/components/panel/aviso"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { vocabularioDe } from "@/lib/vocabulario"
import { convertirEnVariasSedes, type Sede } from "../_datos"
import { frasesDeConfiguracion } from "../_frases"
import { SEDE_VACIA, revisarConversion, type CampoDeSede, type DatosDeSede, type ErroresDeLaConversion } from "../_sedes"
import { FormularioDeSede } from "./formulario-de-sede"

interface PropsDeModalConvertirEnSedes {
  /** La dirección y la comuna que hoy tiene el negocio: la primera sede las trae escritas. */
  direccionDelNegocio: string
  comunaDelNegocio: string
  alConvertir: (sedes: Sede[]) => void
  alCerrar: () => void
}

/**
 * El paso de «un solo lugar» a varios: pide el nombre de la sede donde se
 * atiende hoy (con la dirección y la comuna del negocio ya escritas, que se
 * pueden corregir) y los datos de la segunda. El servidor crea las dos, le da
 * a la primera el horario de siempre y deja la segunda sin horario.
 */
export function ModalConvertirEnSedes({ direccionDelNegocio, comunaDelNegocio, alConvertir, alCerrar }: PropsDeModalConvertirEnSedes) {
  const palabras = vocabularioDe(useRubroDelPanel()).palabras
  const { convertir } = frasesDeConfiguracion(palabras).sedes
  const [principal, setPrincipal] = useState<DatosDeSede>({ ...SEDE_VACIA, direccion: direccionDelNegocio, comuna: comunaDelNegocio })
  const [nueva, setNueva] = useState<DatosDeSede>(SEDE_VACIA)
  const [errores, setErrores] = useState<ErroresDeLaConversion>({ principal: {}, nueva: {} })
  const [aviso, setAviso] = useState("")
  const [guardando, setGuardando] = useState(false)
  const formulario = useRef<HTMLFormElement>(null)

  const cambiarPrincipal = (campo: CampoDeSede, valor: string) => {
    setPrincipal((previos) => ({ ...previos, [campo]: valor }))
    setErrores((previos) => ({ ...previos, principal: { ...previos.principal, [campo]: undefined } }))
    setAviso("")
  }
  const cambiarNueva = (campo: CampoDeSede, valor: string) => {
    setNueva((previos) => ({ ...previos, [campo]: valor }))
    setErrores((previos) => ({ ...previos, nueva: { ...previos.nueva, [campo]: undefined } }))
    setAviso("")
  }

  const crear = async (evento: React.SyntheticEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (guardando) return
    const revisada = revisarConversion(principal, nueva)
    if (!revisada.ok) {
      setErrores(revisada.errores)
      requestAnimationFrame(() => formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setAviso("")
    setGuardando(true)
    const resultado = await convertirEnVariasSedes({ principal: revisada.principal, nueva: revisada.nueva }, palabras)
    setGuardando(false)
    if (!resultado.ok) return setAviso(resultado.error)
    alConvertir(resultado.datos)
  }

  return (
    <MarcoDeModal titulo={convertir.titulo} descripcion={convertir.modal.descripcion} ancho="lg" bloqueado={guardando} alCerrar={alCerrar}>
      <form ref={formulario} onSubmit={crear} noValidate className="space-y-6">
        <fieldset className="min-w-0 space-y-4">
          <legend className="font-serif text-xl font-medium text-navy">{convertir.modal.principal.leyenda}</legend>
          <p className="text-sm text-pretty text-texto-2">{convertir.modal.principal.ayuda}</p>
          <FormularioDeSede datos={principal} errores={errores.principal} alCambiar={cambiarPrincipal} enfocarElNombre guardando={guardando} />
        </fieldset>

        <fieldset className="min-w-0 space-y-4 border-t border-borde pt-6">
          <legend className="font-serif text-xl font-medium text-navy">{convertir.modal.nueva.leyenda}</legend>
          <p className="text-sm text-pretty text-texto-2">{convertir.modal.nueva.ayuda}</p>
          <FormularioDeSede datos={nueva} errores={errores.nueva} alCambiar={cambiarNueva} guardando={guardando} />
        </fieldset>

        {aviso && <Aviso>{aviso}</Aviso>}
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row">
          <BotonPrimario type="button" variante="secundario" anchoCompleto disabled={guardando} onClick={alCerrar}>
            {convertir.modal.cancelar}
          </BotonPrimario>
          <BotonPrimario type="submit" anchoCompleto cargando={guardando}>
            {convertir.modal.crear}
          </BotonPrimario>
        </div>
      </form>
    </MarcoDeModal>
  )
}
