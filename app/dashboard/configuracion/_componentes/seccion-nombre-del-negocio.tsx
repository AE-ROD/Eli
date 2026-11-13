"use client"

import { useEffect, useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { CircleCheck, Pencil, Save, Store } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { LARGO_MAXIMO_DEL_NOMBRE_DEL_NEGOCIO, leerNombreDelNegocio, nombreCambio } from "@/lib/nombre-del-negocio"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { guardarNombreDelNegocio } from "../_datos"
import { frasesDeConfiguracion } from "../_frases"

interface PropsDeSeccionNombreDelNegocio {
  /** El nombre que tiene el negocio ahora (`Business.name`). */
  nombreInicial: string
  /** El profesional ve el nombre sin el botón (`puedeEditarNombreDelNegocio`). */
  soloLectura: boolean
}

/**
 * El nombre del negocio con "Editar nombre": se edita en el lugar, con Guardar y
 * Cancelar. Va arriba de la página pública (Tu negocio).
 *
 * El nombre cambia en el negocio de la sesión y nada más: la dirección de la
 * página pública (el `slug`) queda igual, así que los enlaces ya compartidos
 * siguen funcionando. Al guardar se renueva la sesión (`update()`, que
 * `lib/auth.ts` rearma desde la base) y se vuelve a pedir la página al servidor,
 * para que la barra lateral y la vista previa de la página muestren el nombre
 * nuevo de inmediato. Quien comparte el negocio lo ve en su próxima revisión.
 */
export function SeccionNombreDelNegocio({ nombreInicial, soloLectura }: PropsDeSeccionNombreDelNegocio) {
  const idDelTitulo = useId()
  const idDelBotonEditar = useId()
  const frases = frasesDeConfiguracion(vocabularioDe(useRubroDelPanel()).palabras).nombreDelNegocio
  const router = useRouter()
  const { update } = useSession()
  const campo = useRef<HTMLInputElement>(null)
  const sePidioEditar = useRef(false)

  const [guardado, setGuardado] = useState(nombreInicial)
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(nombreInicial)
  const [guardando, setGuardando] = useState(false)
  const [errorDelCampo, setErrorDelCampo] = useState("")
  const [aviso, setAviso] = useState("")
  const [listo, setListo] = useState(false)

  // Al abrir el editor el foco va al campo, con el nombre seleccionado; al
  // cerrarlo vuelve al botón que lo abrió (quien navega con teclado no se pierde).
  useEffect(() => {
    if (editando) {
      sePidioEditar.current = true
      campo.current?.focus()
      campo.current?.select()
    } else if (sePidioEditar.current) {
      document.getElementById(idDelBotonEditar)?.focus()
    }
  }, [editando, idDelBotonEditar])

  const empezar = () => {
    setTexto(guardado)
    setErrorDelCampo("")
    setAviso("")
    setListo(false)
    setEditando(true)
  }

  const cancelar = () => {
    if (guardando) return
    setEditando(false)
  }

  const guardar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    if (guardando) return
    setAviso("")
    const leido = leerNombreDelNegocio(texto)
    if (!leido.ok) {
      setErrorDelCampo(leido.error)
      campo.current?.focus()
      return
    }
    setErrorDelCampo("")
    // Sin cambios (o sólo espacios de más) no hay nada que guardar.
    if (!nombreCambio(texto, guardado)) return setEditando(false)

    setGuardando(true)
    const resultado = await guardarNombreDelNegocio(leido.nombre)
    if (!resultado.ok) {
      setGuardando(false)
      return setAviso(resultado.error)
    }
    setGuardado(resultado.datos.nombre)
    // El nombre ya quedó guardado: si la sesión no se puede renovar ahora, la barra lo toma en su próxima revisión.
    try {
      await update()
    } catch {
      // Sin red a esta altura: nada que deshacer.
    }
    setGuardando(false)
    setEditando(false)
    setListo(true)
    router.refresh()
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        nivel={3}
        titulo={frases.etiqueta}
        subtitulo={soloLectura ? undefined : frases.ayuda}
        icono={{ figura: Store }}
        accion={
          soloLectura || editando ? undefined : (
            <BotonPrimario id={idDelBotonEditar} tamaño="sm" variante="secundario" icono={<Pencil className="h-4 w-4" />} onClick={empezar}>
              Editar nombre
            </BotonPrimario>
          )
        }
      />

      {editando ? (
        <form
          onSubmit={guardar}
          noValidate
          onKeyDown={(evento) => {
            if (evento.key === "Escape") {
              evento.stopPropagation()
              cancelar()
            }
          }}
          className="mt-5 space-y-4"
        >
          <CampoFormulario
            ref={campo}
            etiqueta={frases.etiqueta}
            value={texto}
            onChange={(evento) => {
              setTexto(evento.target.value)
              setErrorDelCampo("")
            }}
            maxLength={LARGO_MAXIMO_DEL_NOMBRE_DEL_NEGOCIO}
            autoComplete="organization"
            error={errorDelCampo}
            // Sólo lectura y no `disabled`: un campo desactivado pierde el foco en pleno guardado.
            readOnly={guardando}
          />
          {aviso && <Aviso>{aviso}</Aviso>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <BotonPrimario type="button" variante="secundario" onClick={cancelar} disabled={guardando}>
              Cancelar
            </BotonPrimario>
            <BotonPrimario type="submit" icono={<Save className="h-4 w-4" />} cargando={guardando}>
              Guardar
            </BotonPrimario>
          </div>
        </form>
      ) : (
        <p className="mt-5 font-serif text-xl font-medium break-words text-navy">{guardado}</p>
      )}

      {/* Siempre en el árbol: el lector de pantalla anuncia el texto cuando aparece. */}
      <p role="status" className={listo && !editando ? "mt-2 flex items-center gap-1.5 text-[13px] text-texto-2" : "sr-only"}>
        {listo && !editando && (
          <>
            <CircleCheck aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
            {frases.guardado}
          </>
        )}
      </p>
    </section>
  )
}
