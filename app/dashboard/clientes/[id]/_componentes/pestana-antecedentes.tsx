"use client"

import { useId, useState, type FormEvent } from "react"
import { Boton } from "@/components/comunes/boton"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { CAMPO, CAMPO_CON_ERROR, ERROR_DE_CAMPO, ETIQUETA, TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import {
  MAXIMO_DE_ALERGIAS,
  MAXIMO_DE_ANTECEDENTES,
  NACIMIENTO_MINIMO,
  PREVISIONES,
  errorDeFechaDeNacimiento,
  type FichaClinicaRespuesta,
} from "@/lib/ficha-clinica"
import { cn } from "@/lib/utils"
import { guardarAntecedentes, type AntecedentesEscritos } from "../_datos"
import { fechaYHora } from "../_formato"
import { useCambiosSinGuardar } from "./cambios-sin-guardar"

interface PropsDePestanaAntecedentes {
  pacienteId: string
  ficha: FichaClinicaRespuesta
  editable: boolean
  zona: string
  /** El día del negocio ("AAAA-MM-DD"): la fecha de nacimiento no puede ser posterior. */
  hoy: string
  /** La ficha como quedó: la ficha la usa para la edad, la previsión y la alerta. */
  alGuardar: (ficha: FichaClinicaRespuesta) => void
}

const deLaFicha = (ficha: FichaClinicaRespuesta): AntecedentesEscritos => ({
  fechaNacimiento: ficha.fechaNacimiento ?? "",
  prevision: ficha.prevision ?? "",
  alergias: ficha.alergias ?? "",
  antecedentes: ficha.antecedentes ?? "",
})

/**
 * Los antecedentes del paciente: fecha de nacimiento (de ahí sale la edad),
 * previsión, alergias y enfermedades o antecedentes. Se guardan juntos; un
 * campo vacío queda "sin anotar". Los topes de los textos son los del
 * servidor (`lib/ficha-clinica.ts`), y la fecha se revisa con su misma regla.
 */
export function PestanaAntecedentes({ pacienteId, ficha, editable, zona, hoy, alGuardar }: PropsDePestanaAntecedentes) {
  const [datos, setDatos] = useState<AntecedentesEscritos>(() => deLaFicha(ficha))
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState("")
  const [listo, setListo] = useState("")
  const [errorDeFecha, setErrorDeFecha] = useState("")
  const idDelTitulo = useId()
  const id = useId()

  const guardados = deLaFicha(ficha)
  const hayCambios = (Object.keys(datos) as (keyof AntecedentesEscritos)[]).some((campo) => datos[campo] !== guardados[campo])
  useCambiosSinGuardar("antecedentes", "los antecedentes", editable && hayCambios)

  const cambiar = (campo: keyof AntecedentesEscritos, valor: string) => {
    setDatos((previos) => ({ ...previos, [campo]: valor }))
    setListo("")
    if (campo === "fechaNacimiento") setErrorDeFecha("")
  }

  const guardar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    const error = errorDeFechaDeNacimiento(datos.fechaNacimiento.trim(), hoy)
    if (error) {
      setErrorDeFecha(error)
      return
    }
    setAviso("")
    setGuardando(true)
    const resultado = await guardarAntecedentes(pacienteId, datos)
    setGuardando(false)
    if (!resultado.ok) return setAviso(resultado.error)
    alGuardar(resultado.datos)
    setDatos(deLaFicha(resultado.datos))
    setListo("Antecedentes guardados.")
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "max-w-3xl p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Antecedentes"
        subtitulo={
          ficha.updatedAt
            ? `Ficha actualizada el ${fechaYHora(ficha.updatedAt, zona)}${ficha.actualizadaPor ? ` por ${ficha.actualizadaPor}` : ""}`
            : "Todavía no se anotó nada en la ficha."
        }
      />

      <form onSubmit={guardar} className="mt-5 space-y-5" noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-nacimiento`} className={ETIQUETA}>
              Fecha de nacimiento
            </label>
            <input
              id={`${id}-nacimiento`}
              type="date"
              min={NACIMIENTO_MINIMO}
              max={hoy}
              value={datos.fechaNacimiento}
              onChange={(e) => cambiar("fechaNacimiento", e.target.value)}
              disabled={!editable}
              aria-invalid={errorDeFecha ? true : undefined}
              aria-describedby={errorDeFecha ? `${id}-error-fecha` : undefined}
              className={cn(CAMPO, "text-base", errorDeFecha && CAMPO_CON_ERROR)}
            />
            {errorDeFecha && (
              <p id={`${id}-error-fecha`} className={ERROR_DE_CAMPO}>
                {errorDeFecha}
              </p>
            )}
          </div>
          <div>
            <label htmlFor={`${id}-prevision`} className={ETIQUETA}>
              Previsión
            </label>
            <select
              id={`${id}-prevision`}
              value={datos.prevision}
              onChange={(e) => cambiar("prevision", e.target.value)}
              disabled={!editable}
              className={cn(CAMPO, "cursor-pointer text-base")}
            >
              <option value="">Sin anotar</option>
              {PREVISIONES.map((prevision) => (
                <option key={prevision.id} value={prevision.id}>
                  {prevision.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        <CampoDeTexto
          id={`${id}-alergias`}
          etiqueta="Alergias"
          ayuda="Se muestra como alerta a todo el equipo de la clínica, también a recepción."
          valor={datos.alergias}
          maximo={MAXIMO_DE_ALERGIAS}
          filas={3}
          editable={editable}
          alCambiar={(valor) => cambiar("alergias", valor)}
        />
        <CampoDeTexto
          id={`${id}-antecedentes`}
          etiqueta="Enfermedades y antecedentes"
          ayuda="Enfermedades crónicas, medicamentos, cirugías y lo que haya que saber antes de atender."
          valor={datos.antecedentes}
          maximo={MAXIMO_DE_ANTECEDENTES}
          filas={6}
          editable={editable}
          alCambiar={(valor) => cambiar("antecedentes", valor)}
        />

        {aviso && <Aviso>{aviso}</Aviso>}
        {listo && !hayCambios && (
          <Aviso tono="listo" rol="status">
            {listo}
          </Aviso>
        )}

        {editable && (
          <div className="flex flex-wrap items-center gap-3">
            <Boton type="submit" cargando={guardando}>
              Guardar antecedentes
            </Boton>
            {hayCambios && <p className="text-sm text-texto-2">Hay cambios sin guardar.</p>}
          </div>
        )}
      </form>
    </section>
  )
}

interface PropsDeCampoDeTexto {
  id: string
  etiqueta: string
  ayuda: string
  valor: string
  maximo: number
  filas: number
  editable: boolean
  alCambiar: (valor: string) => void
}

/** Un texto largo con su tope a la vista: "120 de 500". 16px de letra, para que el teléfono no acerque la pantalla. */
function CampoDeTexto({ id, etiqueta, ayuda, valor, maximo, filas, editable, alCambiar }: PropsDeCampoDeTexto) {
  return (
    <div>
      <label htmlFor={id} className={ETIQUETA}>
        {etiqueta}
      </label>
      <textarea
        id={id}
        value={valor}
        rows={filas}
        maxLength={maximo}
        onChange={(e) => alCambiar(e.target.value)}
        disabled={!editable}
        aria-describedby={`${id}-ayuda ${id}-cuenta`}
        className={cn(CAMPO, "resize-y px-4 py-3 text-base")}
      />
      <div className="mt-1.5 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-texto-2">
        <p id={`${id}-ayuda`}>{ayuda}</p>
        <p id={`${id}-cuenta`} className="tabular-nums">
          {valor.length} de {maximo}
        </p>
      </div>
    </div>
  )
}
