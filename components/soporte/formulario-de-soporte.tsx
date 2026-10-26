"use client"

import { useId, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react"
import { Mail, Send } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { ErrorDeCampo } from "@/components/comunes/error-de-campo"
import {
  CLASES_DE_CAMPO,
  CLASES_DE_CAMPO_CON_ERROR,
  CLASES_DE_ETIQUETA,
} from "@/components/comunes/estilos-de-campo"
import { Selector } from "@/components/comunes/selector"
import { Aviso } from "@/components/panel/aviso"
import { enviarSolicitud, mensajeDeErrorDeEnvio } from "@/components/soporte/enviar-solicitud"
import {
  AREAS,
  CAMPO_TRAMPA,
  LIMITES,
  esquemaDeContacto,
  esquemaDeSolicitud,
  type AreaDeSoporte,
  type CuerpoDeSolicitudDeSoporte,
  type TipoDeSolicitud,
} from "@/lib/soporte"
import { cn } from "@/lib/utils"

/** Lo que la persona lleva escrito. Vive en el centro de ayuda: ir atrás y volver no lo borra. */
export interface Borrador {
  asunto: string
  descripcion: string
  dondeOcurrio: string
  nombre: string
  email: string
}

export const BORRADOR_VACIO: Borrador = { asunto: "", descripcion: "", dondeOcurrio: "", nombre: "", email: "" }

type Campo = "nombre" | "email" | "area" | "asunto" | "descripcion" | "dondeOcurrio"

/** En el orden en que aparecen: el foco va al primero que tenga un error. */
const ORDEN_DE_LOS_CAMPOS: readonly Campo[] = ["nombre", "email", "area", "asunto", "descripcion", "dondeOcurrio"]

/** Lo que cambia según el tipo de solicitud: las etiquetas, las ayudas y el botón. */
const TEXTOS: Record<
  TipoDeSolicitud,
  { asunto: string; ejemploDeAsunto: string; descripcion: string; ayuda: ReactNode; enviar: string }
> = {
  falla: {
    asunto: "¿Qué pasó?",
    ejemploDeAsunto: "Ej.: No se guarda un servicio nuevo",
    descripcion: "Cuéntanos el detalle",
    ayuda: (
      <>
        <span className="font-medium text-navy">Para entenderlo rápido, cuéntanos:</span>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
          <li>qué estabas haciendo,</li>
          <li>qué esperabas que pasara,</li>
          <li>qué pasó en cambio (si viste un mensaje, cópialo).</li>
        </ul>
      </>
    ),
    enviar: "Enviar reporte",
  },
  reclamo: {
    asunto: "¿De qué se trata, en pocas palabras?",
    ejemploDeAsunto: "Ej.: Una reserva que se perdió",
    descripcion: "Cuéntanos qué pasó",
    ayuda: "Incluye las fechas y lo que esperabas. Con más detalle, podemos revisarlo mejor.",
    enviar: "Enviar reclamo",
  },
  consulta: {
    asunto: "Tu pregunta, en pocas palabras",
    ejemploDeAsunto: "Ej.: ¿Puedo tener dos horarios el mismo día?",
    descripcion: "Cuéntanos más",
    ayuda: "Lo que nos sirva para responderte bien: qué quieres hacer y desde dónde.",
    enviar: "Enviar consulta",
  },
}

interface PropsDeFormulario {
  tipo: TipoDeSolicitud
  /** El área elegida en el paso anterior. En una consulta puede faltar: se elige acá. */
  area: AreaDeSoporte | null
  /** Sólo la consulta elige el área en el formulario; la falla y el reclamo ya la eligieron. */
  areaEditable: boolean
  alCambiarArea: (area: AreaDeSoporte) => void
  borrador: Borrador
  alCambiarBorrador: (borrador: Borrador) => void
  conSesion: boolean
  emailDeSesion?: string
  /** Llega con el número de caso cuando el servidor la guardó. */
  alEnviar: (numero: string) => void
}

/**
 * El formulario de una solicitud de soporte. Valida con los mismos esquemas
 * que el servidor (`lib/soporte.ts`), así los mensajes son los mismos; si el
 * servidor igual la rechaza, muestra lo que dijo y conserva lo escrito.
 *
 * Con sesión no pide nombre ni correo: el servidor los toma de la cuenta.
 */
export function FormularioDeSoporte({
  tipo,
  area,
  areaEditable,
  alCambiarArea,
  borrador,
  alCambiarBorrador,
  conSesion,
  emailDeSesion,
  alEnviar,
}: PropsDeFormulario) {
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({})
  const [errorDeEnvio, setErrorDeEnvio] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [trampa, setTrampa] = useState("")
  const prefijo = useId()
  const idDe = (campo: Campo) => `${prefijo}-${campo}`
  const textos = TEXTOS[tipo]

  const cambiar = (campo: keyof Borrador, valor: string) => {
    alCambiarBorrador({ ...borrador, [campo]: valor })
    // El error se va cuando la persona corrige ese campo, no antes.
    if (errores[campo]) setErrores((anteriores) => ({ ...anteriores, [campo]: undefined }))
  }

  const validar = (): Partial<Record<Campo, string>> => {
    const encontrados: Partial<Record<Campo, string>> = {}
    const anotar = (issues: { path: (string | number)[]; message: string }[]) => {
      for (const issue of issues) {
        const campo = issue.path[0] as Campo
        if (ORDEN_DE_LOS_CAMPOS.includes(campo) && !encontrados[campo]) encontrados[campo] = issue.message
      }
    }

    const solicitud = esquemaDeSolicitud.safeParse({
      tipo,
      area: area ?? undefined,
      asunto: borrador.asunto,
      descripcion: borrador.descripcion,
      dondeOcurrio: borrador.dondeOcurrio,
    })
    if (!solicitud.success) anotar(solicitud.error.issues)

    if (!conSesion) {
      const contacto = esquemaDeContacto.safeParse({ nombre: borrador.nombre, email: borrador.email })
      if (!contacto.success) anotar(contacto.error.issues)
    }
    return encontrados
  }

  const enviar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (enviando) return
    setErrorDeEnvio("")

    const encontrados = validar()
    setErrores(encontrados)
    const primero = ORDEN_DE_LOS_CAMPOS.find((campo) => encontrados[campo])
    if (primero) {
      document.getElementById(idDe(primero))?.focus()
      return
    }
    if (!area) return

    const cuerpo: CuerpoDeSolicitudDeSoporte = {
      tipo,
      area,
      asunto: borrador.asunto.trim(),
      descripcion: borrador.descripcion.trim(),
      ...(tipo === "falla" && borrador.dondeOcurrio.trim() ? { dondeOcurrio: borrador.dondeOcurrio.trim() } : {}),
      ...(conSesion ? {} : { nombre: borrador.nombre.trim(), email: borrador.email.trim() }),
      [CAMPO_TRAMPA]: trampa,
    }

    setEnviando(true)
    const resultado = await enviarSolicitud(cuerpo)
    setEnviando(false)

    if (!resultado.ok) {
      setErrorDeEnvio(mensajeDeErrorDeEnvio(resultado.error, resultado.codigo))
      return
    }
    alEnviar(resultado.datos.numero)
  }

  /**
   * Enter en un campo de una línea pasa al siguiente en vez de enviar: el
   * teclado del teléfono muestra "Siguiente" y enviar a medio escribir sólo
   * llenaría la pantalla de errores.
   */
  const pasarAlSiguiente = (evento: KeyboardEvent<HTMLInputElement>, siguiente: Campo) => {
    if (evento.key !== "Enter" || evento.nativeEvent.isComposing) return
    evento.preventDefault()
    document.getElementById(idDe(siguiente))?.focus()
  }

  const idDeLaAyuda = `${prefijo}-ayuda`
  const idDelErrorDeDescripcion = `${idDe("descripcion")}-error`

  return (
    <form onSubmit={enviar} noValidate className="space-y-6">
      {!conSesion && (
        <div className="grid gap-5 sm:grid-cols-2">
          <CampoFormulario
            id={idDe("nombre")}
            etiqueta="Tu nombre"
            value={borrador.nombre}
            onChange={(evento) => cambiar("nombre", evento.target.value)}
            onKeyDown={(evento) => pasarAlSiguiente(evento, "email")}
            error={errores.nombre}
            autoComplete="name"
            autoCapitalize="words"
            enterKeyHint="next"
            maxLength={LIMITES.nombre.max}
          />
          <CampoFormulario
            id={idDe("email")}
            etiqueta="Tu correo"
            type="email"
            value={borrador.email}
            onChange={(evento) => cambiar("email", evento.target.value)}
            onKeyDown={(evento) => pasarAlSiguiente(evento, areaEditable ? "area" : "asunto")}
            error={errores.email}
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="next"
            maxLength={LIMITES.email.max}
            placeholder="tu@correo.com"
          />
        </div>
      )}

      {areaEditable && (
        <Selector
          id={idDe("area")}
          etiqueta="¿Sobre qué parte de Eli es?"
          value={area ?? ""}
          onChange={(evento) => {
            alCambiarArea(evento.target.value as AreaDeSoporte)
            if (errores.area) setErrores((anteriores) => ({ ...anteriores, area: undefined }))
          }}
          opciones={AREAS.map((opcion) => ({ valor: opcion.valor, texto: opcion.etiqueta }))}
          error={errores.area}
        >
          <option value="" disabled>
            Elige un área
          </option>
        </Selector>
      )}

      <CampoFormulario
        id={idDe("asunto")}
        etiqueta={textos.asunto}
        value={borrador.asunto}
        onChange={(evento) => cambiar("asunto", evento.target.value)}
        onKeyDown={(evento) => pasarAlSiguiente(evento, "descripcion")}
        error={errores.asunto}
        placeholder={textos.ejemploDeAsunto}
        autoComplete="off"
        autoCapitalize="sentences"
        enterKeyHint="next"
        maxLength={LIMITES.asunto.max}
      />

      <div className="space-y-2">
        <label htmlFor={idDe("descripcion")} className={CLASES_DE_ETIQUETA}>
          {textos.descripcion}
        </label>
        <div id={idDeLaAyuda} className="text-sm text-pretty text-texto-2">
          {textos.ayuda}
        </div>
        <textarea
          id={idDe("descripcion")}
          value={borrador.descripcion}
          onChange={(evento) => cambiar("descripcion", evento.target.value)}
          rows={6}
          maxLength={LIMITES.descripcion.max}
          autoCapitalize="sentences"
          aria-invalid={errores.descripcion ? true : undefined}
          aria-describedby={[idDeLaAyuda, errores.descripcion && idDelErrorDeDescripcion].filter(Boolean).join(" ")}
          className={cn(
            CLASES_DE_CAMPO,
            "block min-h-40 w-full resize-y px-4 py-3 text-base leading-relaxed",
            errores.descripcion && CLASES_DE_CAMPO_CON_ERROR
          )}
        />
        {errores.descripcion && <ErrorDeCampo id={idDelErrorDeDescripcion}>{errores.descripcion}</ErrorDeCampo>}
      </div>

      {tipo === "falla" && (
        <div className="space-y-2">
          <CampoFormulario
            id={idDe("dondeOcurrio")}
            etiqueta="¿Dónde ocurrió? (opcional)"
            value={borrador.dondeOcurrio}
            onChange={(evento) => cambiar("dondeOcurrio", evento.target.value)}
            error={errores.dondeOcurrio}
            placeholder="Ej.: Agenda, vista Semana, desde el teléfono"
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="send"
            maxLength={LIMITES.dondeOcurrio.max}
            // `CampoFormulario` apunta sólo a su error: acá va también la ayuda de abajo.
            aria-describedby={[`${idDe("dondeOcurrio")}-ayuda`, errores.dondeOcurrio && `${idDe("dondeOcurrio")}-error`]
              .filter(Boolean)
              .join(" ")}
          />
          <p id={`${idDe("dondeOcurrio")}-ayuda`} className="text-sm text-texto-2">
            La pantalla o el botón, y si fue en el teléfono o en el computador.
          </p>
        </div>
      )}

      {/*
        El campo trampa: oculto para las personas y fuera del orden de Tab. Un
        bot que llena todo lo completa, y el servidor descarta la solicitud.
      */}
      <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${prefijo}-trampa`}>No llenes este campo</label>
        <input
          id={`${prefijo}-trampa`}
          type="text"
          name={CAMPO_TRAMPA}
          value={trampa}
          onChange={(evento) => setTrampa(evento.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <p className="flex items-start gap-2.5 rounded-campo bg-superficie px-4 py-3 text-sm text-pretty text-texto-2 squircle">
        <Mail aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-navy" strokeWidth={1.75} />
        <span>
          {conSesion ? (
            emailDeSesion ? (
              <>
                Te responderemos a <strong className="font-medium break-all text-navy">{emailDeSesion}</strong>.
              </>
            ) : (
              "Te responderemos al correo de tu cuenta."
            )
          ) : (
            "Te responderemos al correo que escribiste arriba."
          )}{" "}
          Tu mensaje queda registrado con un número de caso.
        </span>
      </p>

      {errorDeEnvio && <Aviso>{errorDeEnvio}</Aviso>}

      <Boton
        type="submit"
        cargando={enviando}
        icono={<Send aria-hidden="true" strokeWidth={1.75} />}
        className="w-full sm:w-auto"
      >
        {enviando ? "Enviando…" : textos.enviar}
      </Boton>
    </form>
  )
}
