"use client"

import { useId, useState } from "react"
import { ArrowUpRight, Camera, Globe, Save } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CLASES_DEL_LOCAL } from "@/components/comunes/colores-del-local"
import { CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { CAMPO, ETIQUETA, TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { MEDIOS_DE_PAGO } from "@/lib/medios-de-pago"
import { PALETA_DEL_LOCAL, colorDelNegocio, iniciales } from "@/lib/pagina-del-negocio"
import { mostrarTelefono } from "@/lib/telefono"
import { cn } from "@/lib/utils"
import { guardarPaginaPublica, type DatosDePaginaPublica } from "../_datos"

/** Como en el modal de servicio: el radio no se ve y el anillo lo dibuja la opción entera. */
const ANILLO_DE_LA_OPCION =
  "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--anillo) has-focus-visible:shadow-[0_0_0_6px_var(--halo)]"

interface PropsDeSeccionPaginaPublica {
  slug: string
  nombreDelNegocio: string
  inicial: DatosDePaginaPublica
  /** El profesional ve cómo está la página, sin poder cambiarla (`puedeEditarPaginaDelNegocio`). */
  soloLectura: boolean
}

/**
 * El editor de la mini página pública (`/reservar/[slug]`): dirección,
 * contacto, color, medios de pago y la especialidad de cada profesional.
 * La categoría de los servicios se edita en Servicios, con cada servicio.
 * Las fotos esperan a que exista la subida: no se pegan URLs.
 */
export function SeccionPaginaPublica({ slug, nombreDelNegocio, inicial, soloLectura }: PropsDeSeccionPaginaPublica) {
  const idDelTitulo = useId()
  const nombreDelColor = useId()
  const [datos, setDatos] = useState<DatosDePaginaPublica>(inicial)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [aviso, setAviso] = useState("")

  const cambiar = <Campo extends keyof DatosDePaginaPublica>(campo: Campo, valor: DatosDePaginaPublica[Campo]) => {
    setGuardado(false)
    setDatos((previos) => ({ ...previos, [campo]: valor }))
  }

  const alternarMedio = (id: string) =>
    cambiar(
      "mediosDePago",
      datos.mediosDePago.includes(id) ? datos.mediosDePago.filter((medio) => medio !== id) : [...datos.mediosDePago, id]
    )

  const cambiarEspecialidad = (memberId: string, especialidad: string) =>
    cambiar(
      "especialidades",
      datos.especialidades.map((fila) => (fila.memberId === memberId ? { ...fila, especialidad } : fila))
    )

  const guardar = async () => {
    setAviso("")
    setGuardando(true)
    const resultado = await guardarPaginaPublica(datos)
    setGuardando(false)
    if (!resultado.ok) return setAviso(resultado.error)
    // Lo que quedó guardado, ya normalizado: el WhatsApp con espacios y el Instagram sin @.
    const guardada = resultado.datos
    setDatos((previos) => ({
      ...previos,
      address: guardada.address ?? "",
      comuna: guardada.comuna ?? "",
      whatsapp: mostrarTelefono(guardada.whatsapp),
      instagram: guardada.instagram ? `@${guardada.instagram}` : "",
      color: guardada.color ?? previos.color,
      mediosDePago: guardada.mediosDePago,
    }))
    setGuardado(true)
  }

  const color = colorDelNegocio(datos.color)

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Tu página pública"
        subtitulo={
          <>
            Lo que ven tus clientes al reservar.{" "}
            <a
              href={`/reservar/${slug}`}
              target="_blank"
              rel="noopener"
              className="anillo-foco inline-flex items-center gap-0.5 rounded-sm font-medium text-navy underline underline-offset-2"
            >
              Ver mi página
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </a>
          </>
        }
        icono={{ figura: Globe }}
        accion={
          soloLectura ? undefined : (
            <BotonPrimario
              tamaño="sm"
              icono={<Save className="h-4 w-4" />}
              cargando={guardando}
              onClick={guardar}
              variante={guardado ? "secundario" : "primario"}
            >
              {guardado ? "Guardado" : "Guardar"}
            </BotonPrimario>
          )
        }
      />
      <p role="status" className="sr-only">
        {guardado ? "Página guardada" : ""}
      </p>

      {soloLectura && (
        <Aviso tono="info" className="mt-5">
          Sólo el dueño o el encargado pueden cambiar la página pública.
        </Aviso>
      )}
      {aviso && <Aviso className="mt-5">{aviso}</Aviso>}

      {/* `disabled` en el fieldset apaga todos los campos de una vez para el profesional. */}
      <fieldset disabled={soloLectura} className="mt-5 min-w-0 space-y-6">
        <legend className="sr-only">Datos de la página pública</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Dirección" valor={datos.address} alCambiar={(valor) => cambiar("address", valor)} maximo={200} placeholder="Av. Providencia 1234, local 5" autoComplete="street-address" />
          <Campo etiqueta="Comuna" valor={datos.comuna} alCambiar={(valor) => cambiar("comuna", valor)} maximo={80} placeholder="Providencia" />
          <Campo etiqueta="WhatsApp del negocio" valor={datos.whatsapp} alCambiar={(valor) => cambiar("whatsapp", valor)} maximo={30} placeholder="+56 9 1234 5678" tipo="tel" />
          <Campo etiqueta="Instagram" valor={datos.instagram} alCambiar={(valor) => cambiar("instagram", valor)} maximo={200} placeholder="@tu.salon" />
        </div>

        <fieldset className="min-w-0">
          <legend className={cn(CLASES_DE_ETIQUETA, "mb-2")}>Color de tu página</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PALETA_DEL_LOCAL.map((opcion) => {
              const elegido = color.clave === opcion.clave
              return (
                <label
                  key={opcion.clave}
                  className={cn(
                    "relative flex h-11 cursor-pointer items-center gap-2 rounded-campo border bg-tarjeta px-3 text-sm font-medium text-navy squircle transition-[border-color] duration-150 ease-suave",
                    "has-disabled:cursor-default",
                    ANILLO_DE_LA_OPCION,
                    elegido ? "border-navy border-2" : "border-texto-2 hover:border-navy"
                  )}
                >
                  <input
                    type="radio"
                    name={nombreDelColor}
                    value={opcion.clave}
                    checked={elegido}
                    onChange={() => cambiar("color", opcion.clave)}
                    className="sr-only"
                  />
                  <span aria-hidden="true" className={cn("size-5 shrink-0 rounded-full ring-1 ring-texto-2/30", CLASES_DEL_LOCAL[opcion.clave])} />
                  {opcion.nombre}
                </label>
              )
            })}
          </div>

          {/* Vista previa: la cabecera de la página con el color elegido. */}
          <div aria-hidden="true" className="mt-3 overflow-hidden rounded-[20px] border border-borde squircle">
            <div className={cn("h-16", CLASES_DEL_LOCAL[color.clave])} />
            <div className="flex items-center gap-3 bg-tarjeta px-4 pb-3">
              <span
                className={cn(
                  "-mt-6 grid size-12 shrink-0 place-items-center rounded-full font-medium ring-4 ring-tarjeta",
                  CLASES_DEL_LOCAL[color.clave]
                )}
              >
                {iniciales(nombreDelNegocio)}
              </span>
              <span className="min-w-0 pt-2">
                <span className="block truncate font-serif text-lg font-medium">{nombreDelNegocio}</span>
                {datos.comuna.trim() && <span className="block truncate text-sm text-texto-2">{datos.comuna.trim()}</span>}
              </span>
            </div>
          </div>
        </fieldset>

        <fieldset className="min-w-0">
          <legend className={cn(CLASES_DE_ETIQUETA, "mb-2")}>Medios de pago que aceptas</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {MEDIOS_DE_PAGO.map((medio) => (
              <label key={medio.id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm has-disabled:cursor-default">
                <input
                  type="checkbox"
                  checked={datos.mediosDePago.includes(medio.id)}
                  onChange={() => alternarMedio(medio.id)}
                  className="anillo-foco size-5 shrink-0 accent-navy"
                />
                {medio.nombre}
              </label>
            ))}
          </div>
        </fieldset>

        {datos.especialidades.length > 0 && (
          <fieldset className="min-w-0">
            <legend className={cn(CLASES_DE_ETIQUETA, "mb-1")}>Especialidad de cada profesional</legend>
            <p className="mb-3 text-[13px] text-texto-2">Se muestra bajo su nombre, en &ldquo;Equipo&rdquo;.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {datos.especialidades.map((fila) => (
                <Campo
                  key={fila.memberId}
                  etiqueta={fila.nombre}
                  valor={fila.especialidad}
                  alCambiar={(valor) => cambiarEspecialidad(fila.memberId, valor)}
                  maximo={60}
                  placeholder="Ej.: Colorista"
                />
              ))}
            </div>
          </fieldset>
        )}

        <div className="flex items-start gap-3 rounded-[20px] bg-superficie p-4 text-sm text-texto-2 squircle">
          <Camera className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            <strong className="font-medium text-navy">Fotos: próximamente.</strong> Pronto vas a poder subir tu logo, una
            portada y la foto de cada profesional. Mientras, la página usa tu color y tus iniciales.
          </p>
        </div>
      </fieldset>
    </section>
  )
}

interface PropsDeCampo {
  etiqueta: string
  valor: string
  alCambiar: (valor: string) => void
  maximo: number
  placeholder?: string
  tipo?: "text" | "tel"
  autoComplete?: string
}

function Campo({ etiqueta, valor, alCambiar, maximo, placeholder, tipo = "text", autoComplete = "off" }: PropsDeCampo) {
  const id = useId()
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={ETIQUETA}>
        {etiqueta}
      </label>
      <input
        id={id}
        type={tipo}
        value={valor}
        onChange={(evento) => alCambiar(evento.target.value)}
        maxLength={maximo}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={cn(CAMPO, "disabled:bg-superficie disabled:text-texto-2")}
      />
    </div>
  )
}
