"use client"

import { useId, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight, Globe, Save } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CLASES_DEL_LOCAL } from "@/components/comunes/colores-del-local"
import { CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { ImagenConRespaldo } from "@/components/comunes/imagen-con-respaldo"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { CAMPO, ETIQUETA, TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { SelectorDeFoto } from "@/components/panel/selector-de-foto"
import { MEDIOS_DE_PAGO } from "@/lib/medios-de-pago"
import { PALETA_DEL_LOCAL, colorDelNegocio, iniciales } from "@/lib/pagina-del-negocio"
import { mostrarTelefono } from "@/lib/telefono"
import { cn } from "@/lib/utils"
import { ejemplosDe, textoDeEjemplo } from "@/lib/ejemplos-por-rubro"
import { vocabularioDe } from "@/lib/vocabulario"
import { guardarPaginaPublica, quitarFotoDelNegocio, subirFotoDelNegocio, type DatosDePaginaPublica } from "../_datos"

/** Como en el modal de servicio: el radio no se ve y el anillo lo dibuja la opción entera. */
const ANILLO_DE_LA_OPCION =
  "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--anillo) has-focus-visible:shadow-[0_0_0_6px_var(--halo)]"

interface PropsDeSeccionPaginaPublica {
  slug: string
  nombreDelNegocio: string
  inicial: DatosDePaginaPublica
  /** El profesional ve cómo está la página, sin poder cambiarla (`puedeEditarPaginaDelNegocio`). */
  soloLectura: boolean
  /** El logo y la portada que hay guardados (URLs del propio sitio), o `null`. Van aparte de `inicial`: no se mandan con "Guardar". */
  fotosIniciales: FotosDelNegocio
  /** Si puede subir el logo y la portada (`puedeEditarFotosDelNegocio`); si no, ve la vista previa sin controles. */
  puedeEditarFotos: boolean
}

/** El logo y la portada de la página pública. */
export interface FotosDelNegocio {
  logo: string | null
  portada: string | null
}

/**
 * El editor de la mini página pública (`/reservar/[slug]`): dirección,
 * contacto, enlace de reseñas en Google, color, medios de pago y la
 * especialidad de cada profesional.
 * La categoría de los servicios se edita en Servicios, con cada servicio.
 * El logo y la portada se suben acá mismo y se guardan al instante, aparte de
 * "Guardar" (que guarda los textos): no se pegan URLs.
 */
export function SeccionPaginaPublica({
  slug,
  nombreDelNegocio,
  inicial,
  soloLectura,
  fotosIniciales,
  puedeEditarFotos,
}: PropsDeSeccionPaginaPublica) {
  const idDelTitulo = useId()
  const nombreDelColor = useId()
  // "Pacientes" y "odontólogo" en una clínica dental.
  const rubro = useRubroDelPanel()
  const { clientes, profesional } = vocabularioDe(rubro)
  // Los ejemplos de los campos, del oficio del negocio (`lib/ejemplos-por-rubro.ts`).
  const ejemplos = ejemplosDe(rubro)
  const [datos, setDatos] = useState<DatosDePaginaPublica>(inicial)
  const [fotos, setFotos] = useState<FotosDelNegocio>(fotosIniciales)
  // Las especialidades como están guardadas: al guardar se mandan sólo las que cambiaron (#113).
  const [especialidadesGuardadas, setEspecialidadesGuardadas] = useState(inicial.especialidades)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [aviso, setAviso] = useState("")
  const router = useRouter()
  // El enlace de reseñas como está guardado: "Mensajes a clientes" depende de él.
  const [enlaceGuardado, setEnlaceGuardado] = useState(inicial.enlaceResenas)

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
    const enviadas = datos.especialidades
    const resultado = await guardarPaginaPublica(datos, especialidadesGuardadas)
    setGuardando(false)
    if (!resultado.ok) return setAviso(resultado.error)
    setEspecialidadesGuardadas(enviadas)
    // Lo que quedó guardado, ya normalizado: el WhatsApp con espacios y el Instagram sin @.
    const guardada = resultado.datos
    setDatos((previos) => ({
      ...previos,
      address: guardada.address ?? "",
      comuna: guardada.comuna ?? "",
      whatsapp: mostrarTelefono(guardada.whatsapp),
      instagram: guardada.instagram ? `@${guardada.instagram}` : "",
      enlaceResenas: guardada.enlaceResenas ?? "",
      color: guardada.color ?? previos.color,
      mediosDePago: guardada.mediosDePago,
    }))
    setGuardado(true)
    // "Pedir reseña en Google" dice si falta el enlace con lo que leyó la
    // página al entrar: si el enlace cambió, se vuelve a leer del servidor.
    // Lo que se está editando en las otras secciones no se pierde.
    const enlaceNuevo = guardada.enlaceResenas ?? ""
    if (enlaceNuevo !== enlaceGuardado) {
      setEnlaceGuardado(enlaceNuevo)
      router.refresh()
    }
  }

  const color = colorDelNegocio(datos.color)

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        nivel={3}
        titulo="Tu página pública"
        subtitulo={
          <>
            Lo que ven tus {clientes} al reservar.{" "}
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

        {puedeEditarFotos && (
          <fieldset className="min-w-0">
            <legend className={cn(CLASES_DE_ETIQUETA, "mb-1")}>Logo y portada</legend>
            <p className="mb-4 text-[13px] text-texto-2">
              Las fotos se guardan al subirlas: no hace falta apretar &ldquo;Guardar&rdquo;. La foto de cada {profesional} se
              sube en Equipo, o en &ldquo;Mi foto&rdquo; por quien atiende.
            </p>
            <div className="space-y-6">
              <SelectorDeFoto
                titulo="Logo"
                nombreConArticulo="el logo"
                ayuda="Se ve en un círculo, arriba de tu página. Funciona mejor una imagen cuadrada."
                forma="circulo"
                url={fotos.logo}
                nombre={nombreDelNegocio}
                clasesDelRespaldo={CLASES_DEL_LOCAL[color.clave]}
                puedeEditar
                onSubir={(foto) => subirFotoDelNegocio("logo", foto)}
                onQuitar={() => quitarFotoDelNegocio("logo")}
                alCambiar={(url) => setFotos((previas) => ({ ...previas, logo: url }))}
              />
              <SelectorDeFoto
                titulo="Portada"
                nombreConArticulo="la portada"
                ayuda="La franja ancha de arriba. Se recorta según la pantalla: deja lo importante al centro."
                forma="banner"
                url={fotos.portada}
                nombre={nombreDelNegocio}
                clasesDelRespaldo={CLASES_DEL_LOCAL[color.clave]}
                puedeEditar
                onSubir={(foto) => subirFotoDelNegocio("portada", foto)}
                onQuitar={() => quitarFotoDelNegocio("portada")}
                alCambiar={(url) => setFotos((previas) => ({ ...previas, portada: url }))}
              />
            </div>
          </fieldset>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Dirección" valor={datos.address} alCambiar={(valor) => cambiar("address", valor)} maximo={200} placeholder="Av. Providencia 1234, local 5" autoComplete="street-address" />
          <Campo etiqueta="Comuna" valor={datos.comuna} alCambiar={(valor) => cambiar("comuna", valor)} maximo={80} placeholder="Providencia" />
          <Campo etiqueta="WhatsApp del negocio" valor={datos.whatsapp} alCambiar={(valor) => cambiar("whatsapp", valor)} maximo={30} placeholder="+56 9 1234 5678" tipo="tel" />
          <Campo etiqueta="Instagram" valor={datos.instagram} alCambiar={(valor) => cambiar("instagram", valor)} maximo={200} placeholder={ejemplos.instagram} />
          <div className="sm:col-span-2">
            <Campo
              etiqueta="Enlace para dejar una reseña en Google"
              valor={datos.enlaceResenas}
              alCambiar={(valor) => cambiar("enlaceResenas", valor)}
              maximo={500}
              placeholder="https://g.page/r/…/review"
              tipo="url"
              ayuda="Lo copias desde tu Perfil de Empresa en Google, en «Pedir reseñas». Se usa en el correo que pide una reseña el día después de la visita, si lo activas en Mensajes a clientes."
            />
          </div>
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

          {/* Vista previa: la cabecera de la página con el color elegido, el logo y la portada. */}
          <div aria-hidden="true" className="mt-3 overflow-hidden rounded-[20px] border border-borde squircle">
            <div className={cn("relative h-16", CLASES_DEL_LOCAL[color.clave])}>
              {fotos.portada && (
                <ImagenConRespaldo src={fotos.portada} alt="" fill sizes="(min-width: 768px) 672px, 100vw" className="object-cover" />
              )}
            </div>
            <div className="flex items-center gap-3 bg-tarjeta px-4 pb-3">
              <span
                className={cn(
                  "relative -mt-6 grid size-12 shrink-0 place-items-center overflow-hidden rounded-full font-medium ring-4 ring-tarjeta",
                  CLASES_DEL_LOCAL[color.clave]
                )}
              >
                {fotos.logo ? (
                  <ImagenConRespaldo
                    src={fotos.logo}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                    respaldo={iniciales(nombreDelNegocio)}
                  />
                ) : (
                  iniciales(nombreDelNegocio)
                )}
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
            <legend className={cn(CLASES_DE_ETIQUETA, "mb-1")}>Especialidad de cada {profesional}</legend>
            <p className="mb-3 text-[13px] text-texto-2">Se muestra bajo su nombre, en &ldquo;Equipo&rdquo;.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {datos.especialidades.map((fila) => (
                <Campo
                  key={fila.memberId}
                  etiqueta={fila.nombre}
                  valor={fila.especialidad}
                  alCambiar={(valor) => cambiarEspecialidad(fila.memberId, valor)}
                  maximo={60}
                  placeholder={textoDeEjemplo(ejemplos.especialidad)}
                />
              ))}
            </div>
          </fieldset>
        )}
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
  tipo?: "text" | "tel" | "url"
  autoComplete?: string
  /** Una línea debajo del campo que explica de dónde sale o para qué se usa. */
  ayuda?: string
}

function Campo({ etiqueta, valor, alCambiar, maximo, placeholder, tipo = "text", autoComplete = "off", ayuda }: PropsDeCampo) {
  const id = useId()
  const idDeLaAyuda = `${id}-ayuda`
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
        aria-describedby={ayuda ? idDeLaAyuda : undefined}
        className={cn(CAMPO, "disabled:cursor-default disabled:bg-superficie disabled:text-texto-2 disabled:opacity-100")}
      />
      {ayuda && (
        <p id={idDeLaAyuda} className="mt-1.5 text-[13px] text-texto-2">
          {ayuda}
        </p>
      )}
    </div>
  )
}
