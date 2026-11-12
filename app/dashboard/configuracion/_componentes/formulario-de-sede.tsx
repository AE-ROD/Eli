"use client"

import { useId } from "react"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { vocabularioDe } from "@/lib/vocabulario"
import { frasesDeConfiguracion } from "../_frases"
import {
  LARGO_MAXIMO_DE_LA_COMUNA,
  LARGO_MAXIMO_DE_LA_DIRECCION,
  LARGO_MAXIMO_DEL_NOMBRE_DE_SEDE,
  LARGO_MAXIMO_DEL_TELEFONO,
  type CampoDeSede,
  type DatosDeSede,
  type ErroresDeSede,
} from "../_sedes"

interface PropsDeFormularioDeSede {
  datos: DatosDeSede
  errores: ErroresDeSede
  alCambiar: (campo: CampoDeSede, valor: string) => void
  /** El foco entra al nombre al abrirse el formulario. */
  enfocarElNombre?: boolean
  /** Mientras se guarda: sólo lectura, y no deshabilitado (un campo deshabilitado pierde el foco). */
  guardando?: boolean
}

/**
 * Los cuatro campos de una sede: nombre, dirección, comuna y teléfono
 * (opcional). Los usan el modal de agregar o editar una sede y el de pasar a
 * varios lugares (dos sedes a la vez). Cada error va junto a su campo; los
 * largos son los que exige la base (`_sedes.ts`).
 */
export function FormularioDeSede({ datos, errores, alCambiar, enfocarElNombre = false, guardando = false }: PropsDeFormularioDeSede) {
  const { modal: frases } = frasesDeConfiguracion(vocabularioDe(useRubroDelPanel()).palabras).sedes
  const idDeLaAyuda = useId()

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <CampoFormulario
          etiqueta={frases.nombre}
          placeholder={frases.nombreEjemplo}
          value={datos.nombre}
          maxLength={LARGO_MAXIMO_DEL_NOMBRE_DE_SEDE}
          onChange={(evento) => alCambiar("nombre", evento.target.value)}
          error={errores.nombre}
          autoFocus={enfocarElNombre}
          autoComplete="off"
          readOnly={guardando}
          // Con un error, el campo apunta al error; sin él, a la ayuda.
          {...(errores.nombre ? {} : { "aria-describedby": idDeLaAyuda })}
        />
        <p id={idDeLaAyuda} className="text-[13px] text-texto-2">
          {frases.nombreAyuda}
        </p>
      </div>
      <CampoFormulario
        etiqueta={frases.direccion}
        placeholder={frases.direccionEjemplo}
        value={datos.direccion}
        maxLength={LARGO_MAXIMO_DE_LA_DIRECCION}
        onChange={(evento) => alCambiar("direccion", evento.target.value)}
        error={errores.direccion}
        autoComplete="off"
        readOnly={guardando}
      />
      <CampoFormulario
        etiqueta={frases.comuna}
        placeholder={frases.comunaEjemplo}
        value={datos.comuna}
        maxLength={LARGO_MAXIMO_DE_LA_COMUNA}
        onChange={(evento) => alCambiar("comuna", evento.target.value)}
        error={errores.comuna}
        autoComplete="off"
        readOnly={guardando}
      />
      <CampoFormulario
        etiqueta={frases.telefono}
        placeholder={frases.telefonoEjemplo}
        type="tel"
        inputMode="tel"
        value={datos.telefono}
        maxLength={LARGO_MAXIMO_DEL_TELEFONO}
        onChange={(evento) => alCambiar("telefono", evento.target.value)}
        error={errores.telefono}
        autoComplete="off"
        readOnly={guardando}
      />
    </div>
  )
}
