"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { Armchair, FileText } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { ICONOS_DE_MODULO } from "@/components/comunes/icono-de-modulo"
import { Insignia } from "@/components/comunes/insignia"
import { Aviso } from "@/components/panel/aviso"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { deCentavos } from "@/lib/atenciones"
import { formatearMonto } from "@/lib/dinero"
import { fechaRelativa } from "@/lib/fechas"
import type { Resultado } from "@/lib/peticiones"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { AsignarSillon } from "../agenda/_componentes/asignar-sillon"
import { leerSillones, type SillonDeLaAgenda } from "../agenda/_datos"
import { horaEn } from "../agenda/_hora-del-negocio"
import {
  leerInicioDeLaClinica,
  pasarAlSillon,
  type InicioDeLaClinica as DatosDelInicio,
  type PersonaEnLaSalaDeEspera,
  type SillonAhora,
} from "../_datos"

/** Cada cuánto se vuelve a mirar quién está en cada sillón y quién espera. */
const CADA_MS = 60_000

interface PropsDeInicioDeLaClinica {
  /** Si quien mira gestiona los sillones: sin sillones, el aviso lleva a Configuración. */
  gestionaSillones: boolean
}

/**
 * Lo que la clínica dental suma arriba del inicio (`GET /api/dashboard/clinica`):
 * "Sillones ahora", la sala de espera con "Pasar al sillón" y "Asignar
 * sillón", y los presupuestos por responder. Se vuelve a pedir cada minuto y
 * después de cada acción.
 *
 * Cada rol ve lo suyo (lo recorta el servidor). Para el odontólogo
 * (`alcance: "propias"`) los sillones muestran sólo sus citas, y se dice así:
 * un sillón sin citas suyas no está "libre" para la clínica.
 */
export function InicioDeLaClinica({ gestionaSillones }: PropsDeInicioDeLaClinica) {
  const [inicio, setInicio] = useState<Resultado<DatosDelInicio> | null>(null)
  const [sillones, setSillones] = useState<SillonDeLaAgenda[] | null>(null)

  const recargar = useCallback(async () => {
    const resultado = await leerInicioDeLaClinica()
    // Si una recarga falla, se queda lo último que llegó bien; sólo sin nada se muestra el error.
    setInicio((previo) => (resultado.ok || !previo?.ok ? resultado : previo))
  }, [])

  useEffect(() => {
    let vigente = true
    leerInicioDeLaClinica().then((resultado) => {
      if (vigente) setInicio(resultado)
    })
    // Los sillones, para "Asignar sillón". Si no cargan, ese botón no se ofrece.
    leerSillones().then((resultado) => {
      if (vigente && resultado.ok) setSillones(resultado.datos)
    })
    const reloj = setInterval(() => void recargar(), CADA_MS)
    return () => {
      vigente = false
      clearInterval(reloj)
    }
  }, [recargar])

  if (inicio && !inicio.ok) {
    return (
      <Aviso
        accion={
          <Boton variante="secundario" tamano="sm" onClick={() => void recargar()}>
            Reintentar
          </Boton>
        }
      >
        {inicio.error}
      </Aviso>
    )
  }

  const datos = inicio?.ok ? inicio.datos : null

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-3 xl:items-start">
      <SillonesAhora datos={datos} gestionaSillones={gestionaSillones} className="xl:col-span-2" />
      <div className="flex flex-col gap-4 sm:gap-6">
        <SalaDeEspera datos={datos} sillones={sillones} alCambiar={recargar} />
        {datos?.presupuestosPorResponder && <PresupuestosPorResponder datos={datos} />}
      </div>
    </div>
  )
}

// ─── Sillones ahora ──────────────────────────────────────────────────────────

function SillonesAhora({
  datos,
  gestionaSillones,
  className,
}: {
  datos: DatosDelInicio | null
  gestionaSillones: boolean
  className?: string
}) {
  const idDelTitulo = useId()
  const propias = datos?.alcance === "propias"

  return (
    <section aria-labelledby={idDelTitulo} aria-busy={!datos || undefined} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6", className)}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Sillones ahora"
        subtitulo={
          propias
            ? "Tus citas en cada sillón. Un sillón sin citas tuyas puede estar ocupado por otro odontólogo."
            : "Quién está en cada sillón y quién sigue."
        }
        icono={{ figura: Armchair, color: "naranja" }}
        accion={
          <Boton href="/dashboard/agenda" variante="enlace" tamano="sm">
            Ver agenda
          </Boton>
        }
      />

      <div className="mt-5">
        {!datos ? (
          <TarjetasCargando />
        ) : datos.sillones.length === 0 ? (
          <EstadoVacio titulo="Todavía no hay sillones activos">
            {gestionaSillones ? (
              <>
                Agrégalos en{" "}
                <Link
                  href="/dashboard/configuracion#sillones"
                  className="rounded-sm font-medium text-navy underline decoration-[1.5px] underline-offset-4 anillo-foco"
                >
                  Configuración
                </Link>{" "}
                para ver aquí quién está en cada uno.
              </>
            ) : (
              "Los agrega la dueña o el encargado en Configuración."
            )}
          </EstadoVacio>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {datos.sillones.map((sillon) => (
              <li key={sillon.id}>
                <TarjetaDeSillon sillon={sillon} zona={datos.zona} ahora={datos.ahora} propias={propias} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/**
 * Un sillón: atendiendo (en el naranja de lo que se está atendiendo) o libre
 * (en gris), dicho siempre en palabras. Libre, hasta cuándo y quién sigue.
 */
function TarjetaDeSillon({ sillon, zona, ahora, propias }: { sillon: SillonAhora; zona: string; ahora: string; propias: boolean }) {
  const atendiendo = sillon.estado === "atendiendo" && sillon.actual
  const siguiente = sillon.siguiente
  // La siguiente ya debía haber empezado: se dice, no se esconde.
  const atrasada = !atendiendo && sillon.libreHasta !== null && new Date(sillon.libreHasta).getTime() < new Date(ahora).getTime()

  const estado = atendiendo ? "Atendiendo" : propias ? "Sin citas tuyas ahora" : "Libre"
  const titular = atendiendo
    ? (sillon.actual?.paciente?.nombre ?? "Sin paciente")
    : atrasada && siguiente
      ? `Atrasada la de las ${horaEn(siguiente.inicio, zona)}`
      : sillon.libreHasta
        ? propias
          ? `Tu próxima cita, a las ${horaEn(sillon.libreHasta, zona)}`
          : `Hasta las ${horaEn(sillon.libreHasta, zona)}`
        : propias
          ? "Sin más citas tuyas hoy"
          : "Libre el resto del día"

  return (
    <article
      className={cn(
        "flex h-full flex-col gap-1 rounded-[24px] p-4 text-navy squircle",
        atendiendo ? "bg-naranja-suave" : "bg-superficie"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold break-words">{sillon.nombre}</h3>
        <span className="inline-flex h-6 items-center rounded-full bg-tarjeta px-2.5 text-xs font-medium">{estado}</span>
      </div>
      <p className="mt-1 text-lg leading-snug font-medium break-words">{titular}</p>
      {atendiendo && sillon.actual ? (
        <>
          <p className="text-sm break-words">{sillon.actual.titulo}</p>
          <p className="text-[13px] break-words text-navy/80">
            {[sillon.actual.odontologo?.nombre, `desde ${horaEn(sillon.actual.desde, zona)}`].filter(Boolean).join(" · ")}
          </p>
          {siguiente && (
            <p className="mt-1 text-[13px] break-words text-navy/80">
              Sigue: {siguiente.paciente?.nombre ?? siguiente.titulo}, a las {horaEn(siguiente.inicio, zona)}
            </p>
          )}
        </>
      ) : siguiente ? (
        <>
          <p className="text-sm break-words">
            Sigue: {siguiente.paciente?.nombre ?? "Sin paciente"}
            {atrasada ? "" : `, a las ${horaEn(siguiente.inicio, zona)}`}
          </p>
          <p className="text-[13px] break-words text-texto-2">
            {[siguiente.titulo, siguiente.odontologo?.nombre].filter(Boolean).join(" · ")}
          </p>
        </>
      ) : null}
    </article>
  )
}

/** Cuatro tarjetas grises mientras llega: nada salta cuando aparecen los sillones. */
function TarjetasCargando() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <span className="sr-only">Cargando los sillones...</span>
      {[0, 1].map((tarjeta) => (
        <div key={tarjeta} aria-hidden="true" className="flex h-32 flex-col gap-3 rounded-[24px] bg-superficie p-4">
          <Esqueleto className="w-1/3" />
          <Esqueleto className="w-2/3" />
          <Esqueleto className="h-2.5 w-1/2" />
        </div>
      ))}
    </div>
  )
}

// ─── Sala de espera ──────────────────────────────────────────────────────────

function SalaDeEspera({
  datos,
  sillones,
  alCambiar,
}: {
  datos: DatosDelInicio | null
  sillones: SillonDeLaAgenda[] | null
  alCambiar: () => Promise<void>
}) {
  const idDelTitulo = useId()
  const vocabulario = vocabularioDe(useRubroDelPanel())
  const sala = datos?.salaDeEspera
  const resumen = !sala
    ? "Cargando..."
    : sala.cantidad === 0
      ? "Nadie esperando."
      : `${sala.cantidad === 1 ? "1 esperando" : `${sala.cantidad} esperando`}${
          sala.mayorEsperaMinutos !== null ? ` · la que más espera, ${sala.mayorEsperaMinutos} min` : ""
        }`

  return (
    <section aria-labelledby={idDelTitulo} aria-busy={!datos || undefined} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo={`En ${vocabulario.tablero}`}
        subtitulo={resumen}
        icono={{ figura: ICONOS_DE_MODULO.tablero, color: "naranja" }}
      />
      {sala && (
        <div className="mt-5">
          {sala.lista.length === 0 ? (
            <EstadoVacio>Cuando alguien llegue, aparece aquí.</EstadoVacio>
          ) : (
            <ul className="space-y-2">
              {sala.lista.map((persona) => (
                <li key={persona.atencionId}>
                  <PersonaEsperando persona={persona} sillones={sillones} alCambiar={alCambiar} />
                </li>
              ))}
            </ul>
          )}
          {(sala.cantidad > sala.lista.length || sala.lista.some((persona) => !persona.citaId)) && (
            <div className="mt-3">
              <Boton href="/dashboard/tablero" variante="enlace" tamano="sm">
                {sala.cantidad > sala.lista.length
                  ? `Ver los ${sala.cantidad} en la ${vocabulario.tablero}`
                  : `Ir a la ${vocabulario.tablero}`}
              </Boton>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * Quien espera: cuánto lleva, a qué viene y en qué sillón. Con sillón, "Pasar
 * al sillón" (su atención pasa a "en atención", como en la sala de espera);
 * con cita y sin sillón, "Asignar sillón". Sin una cita que quien mira vea
 * (llegó sin reserva, o es de un colega), se atiende desde la sala de espera.
 */
function PersonaEsperando({
  persona,
  sillones,
  alCambiar,
}: {
  persona: PersonaEnLaSalaDeEspera
  sillones: SillonDeLaAgenda[] | null
  alCambiar: () => Promise<void>
}) {
  const [pasando, setPasando] = useState(false)
  const [error, setError] = useState("")
  const [asignando, setAsignando] = useState(false)
  const idDelFormulario = useId()
  const contenedor = useRef<HTMLDivElement>(null)
  // Recién asignado el sillón, el foco va a "Pasar al sillón" cuando aparece:
  // el formulario de donde venía ya no está.
  const enfocarAlPasar = useRef(false)
  const sillonId = persona.sillon?.id
  useEffect(() => {
    if (!sillonId || !enfocarAlPasar.current) return
    enfocarAlPasar.current = false
    contenedor.current?.querySelector<HTMLElement>("[data-pasar-al-sillon]")?.focus()
  }, [sillonId])

  const pasar = async () => {
    if (pasando) return
    setError("")
    setPasando(true)
    const resultado = await pasarAlSillon(persona.atencionId)
    if (!resultado.ok) {
      setPasando(false)
      return setError(resultado.error)
    }
    await alCambiar()
  }

  const detalle = [persona.titulo, persona.sillon ? persona.sillon.nombre : persona.citaId ? "sin sillón asignado" : "sin reserva"]
    .filter(Boolean)
    .join(" · ")

  return (
    <div ref={contenedor} className="rounded-[20px] bg-superficie p-3.5 squircle">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium break-words">{persona.paciente.nombre}</p>
          <p className="text-[13px] break-words text-texto-2">{detalle}</p>
        </div>
        <p className="shrink-0 text-[13px] text-texto-2 tabular-nums">
          {persona.minutos} min<span className="sr-only"> esperando</span>
        </p>
      </div>

      {persona.sillon ? (
        <Boton
          tamano="sm"
          className="mt-3"
          data-pasar-al-sillon=""
          cargando={pasando}
          onClick={pasar}
          aria-label={`Pasar al sillón a ${persona.paciente.nombre}`}
        >
          Pasar al sillón
        </Boton>
      ) : persona.citaId && sillones ? (
        <>
          <Boton
            tamano="sm"
            variante="secundario"
            className="mt-3"
            aria-expanded={asignando}
            aria-controls={asignando ? idDelFormulario : undefined}
            onClick={() => setAsignando((abierto) => !abierto)}
            aria-label={`Asignar sillón a ${persona.paciente.nombre}`}
          >
            Asignar sillón
          </Boton>
          {asignando && (
            <div id={idDelFormulario} className="mt-3">
              <AsignarSillon
                citaId={persona.citaId}
                sillonId={null}
                sillon={null}
                sillones={sillones}
                etiqueta="Sillón"
                paciente={persona.paciente.nombre}
                onAsignado={() => {
                  enfocarAlPasar.current = true
                  void alCambiar()
                }}
              />
            </div>
          )}
        </>
      ) : null}

      {error && <Aviso className="mt-3">{error}</Aviso>}
    </div>
  )
}

// ─── Presupuestos por responder ──────────────────────────────────────────────

function PresupuestosPorResponder({ datos }: { datos: DatosDelInicio }) {
  const idDelTitulo = useId()
  const vocabulario = vocabularioDe(useRubroDelPanel())
  const presupuestos = datos.presupuestosPorResponder
  // El "hace cuánto" se mide contra la hora que mandó el servidor, la misma para todas.
  const ahora = new Date(datos.ahora).getTime()
  if (!presupuestos) return null

  const { cantidad, totalCents, lista } = presupuestos
  const resumen =
    cantidad === 0
      ? "Ninguno esperando respuesta."
      : `${cantidad === 1 ? "1 presentado" : `${cantidad} presentados`} sin respuesta${
          totalCents !== undefined ? ` · ${formatearMonto(deCentavos(totalCents))} en total` : ""
        }`

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Presupuestos por responder"
        subtitulo={resumen}
        icono={{ figura: FileText, color: "lila" }}
      />
      {lista.length > 0 && (
        <ul className="mt-4 divide-y divide-borde">
          {lista.map((presupuesto) => (
            <li key={presupuesto.etapaId} className="flex items-start justify-between gap-3 py-3 first:pt-1 last:pb-0">
              <div className="min-w-0">
                <Link
                  href={`/dashboard/clientes/${encodeURIComponent(presupuesto.paciente.id)}`}
                  className="rounded-sm font-medium break-words text-navy underline-offset-4 anillo-foco hover:underline"
                >
                  {presupuesto.paciente.nombre}
                  <span className="sr-only">, abrir la ficha del {vocabulario.cliente}</span>
                </Link>
                <p className="text-[13px] break-words text-texto-2">
                  {presupuesto.etapa}
                  {presupuesto.presentadaEn && ` · presentado ${fechaRelativa(presupuesto.presentadaEn, ahora).toLocaleLowerCase("es-CL")}`}
                </p>
              </div>
              {presupuesto.montoCents !== undefined && (
                <p className="shrink-0 font-medium tabular-nums">{formatearMonto(deCentavos(presupuesto.montoCents))}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {cantidad > lista.length && (
        <p className="mt-3 text-sm text-texto-2">
          Y {cantidad - lista.length} más: están en la ficha de cada {vocabulario.cliente}.
        </p>
      )}
    </section>
  )
}
