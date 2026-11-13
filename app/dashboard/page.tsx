"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import {
  actorDeSesion,
  esClinicaDental,
  puedeGestionarSillones,
  puedeInvitarNegocios,
  veElPanelDeSuDia,
  veLaListaDeInicio,
} from "@/lib/permisos"
import {
  leerListaDeInicio,
  marcarEnlaceCompartido,
  mostrarListaDeInicio,
  type DatosDeListaDeInicio,
} from "@/lib/lista-de-inicio"
import { leerInvitacion, type DatosDeInvitacion } from "@/lib/invitar-negocios"
import { Aviso } from "@/components/panel/aviso"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { fechaLargaEn } from "@/lib/fechas"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import { frasesDelInicio } from "./_frases"
import { leerEstadisticas, type EstadisticasDelPanel } from "./_datos"
import { VistaDiaProfesional } from "./_componentes/vista-dia-profesional"
import { EstadisticasDelNegocio } from "./_componentes/estadisticas-del-negocio"
import { CitasDeHoy } from "./_componentes/citas-de-hoy"
import { ResumenDeClientes } from "./_componentes/resumen-de-clientes"
import { EnlaceDeReservas } from "./_componentes/enlace-de-reservas"
import { CitasPorHora } from "./_componentes/citas-por-hora"
import { ResumenDelNegocio } from "./_componentes/resumen-del-negocio"
import { ListaDeInicio } from "./_componentes/lista-de-inicio"
import { QrDelLocal } from "./_componentes/qr-del-local"
import { InvitarNegocios } from "./_componentes/invitar-negocios"
import { InicioDeLaClinica } from "./_componentes/inicio-de-la-clinica"

/**
 * La agenda abre el modal de cita nueva al llegar con `?nueva=1`, y lo saca de
 * la dirección: recargar o volver atrás no lo abre otra vez.
 */
const AGENDA_CON_CITA_NUEVA = "/dashboard/agenda?nueva=1"

export default function PaginaPanel() {
  const [estadisticas, setEstadisticas] = useState<EstadisticasDelPanel | null>(null)
  const [aviso, setAviso] = useState("")
  const router = useRouter()
  const { data: sesion, status: estadoSesion } = useSession()
  // "Nueva hora" en un salón, "Nueva cita" en una clínica o sin rubro.
  const nuevaCita = frasesDelInicio(vocabularioDe(useRubroDelPanel()).palabras).nuevaCita
  // El panel del profesional es su día (F-014), no el tablero del negocio:
  // dueño y encargado siguen viendo exactamente lo de antes, sin tocar su rama.
  // Mientras no se sabe el rol no se elige ninguna rama: evita el parpadeo de
  // mostrarle a un profesional el tablero de administración por un instante.
  const rolConocido = estadoSesion !== "loading"
  const verPanelDeSuDia = veElPanelDeSuDia(actorDeSesion(sesion))
  const slugDelNegocio = sesion?.user?.businessSlug ?? ""
  const nombreDelNegocio = sesion?.user?.businessName ?? ""
  const verListaDeInicio = veLaListaDeInicio(actorDeSesion(sesion))
  const [listaDeInicio, setListaDeInicio] = useState<DatosDeListaDeInicio | null>(null)
  const verInvitacion = puedeInvitarNegocios(actorDeSesion(sesion))
  // Clínica dental: "Sillones ahora", la sala de espera y los presupuestos,
  // arriba de lo de siempre (dueña, encargado y odontólogo). En otro rubro, nada.
  const clinica = esClinicaDental(actorDeSesion(sesion))
  const [invitacion, setInvitacion] = useState<DatosDeInvitacion | null>(null)

  useEffect(() => {
    leerEstadisticas().then((resultado) => {
      if (resultado.ok) setEstadisticas(resultado.datos)
      else setAviso(resultado.error)
    })
  }, [])

  // La lista de inicio es un extra: si no llega, simplemente no se muestra,
  // sin aviso. Sólo se pide para el dueño (al resto el endpoint le da 401).
  useEffect(() => {
    if (!verListaDeInicio) return
    leerListaDeInicio().then((resultado) => {
      if (resultado.ok) setListaDeInicio(resultado.datos)
    })
  }, [verListaDeInicio])

  // Lo mismo con la tarjeta de invitar: un extra, sólo del dueño.
  useEffect(() => {
    if (!verInvitacion) return
    leerInvitacion().then((resultado) => {
      if (resultado.ok) setInvitacion(resultado.datos)
    })
  }, [verInvitacion])

  // Al copiar el enlace: se anota en el servidor y el paso se marca en la
  // lista sin recargar. Sin esperar ni avisar si falla: el enlace ya se copió.
  const alCopiarElEnlace = useCallback(() => {
    void marcarEnlaceCompartido()
    setListaDeInicio((lista) => (lista ? { ...lista, pasos: { ...lista.pasos, enlace: true } } : lista))
  }, [])

  // Si las cifras no llegaron, los bloques que viven de ellas no se dibujan:
  // dirían "Cargando..." para siempre debajo del aviso. El enlace de reservas
  // no depende de ellas y se queda.
  const sinEstadisticas = aviso !== ""
  const citasDeHoy = estadisticas?.citasHoyLista ?? null
  // El día en la zona del negocio, la misma con que el servidor contó "hoy".
  // Recién con las cifras: en el servidor (y en la primera pintura) no hay
  // fecha, así el HTML no cambia al hidratar ni dice el día del dispositivo.
  const subtitulo = estadisticas ? fechaLargaEn(estadisticas.zona) : undefined

  return (
    <div className="min-h-dvh">
      <BarraSuperior
        titulo="Inicio"
        subtitulo={subtitulo}
        accionPrincipal={{
          texto: nuevaCita,
          onClick: () => router.push(AGENDA_CON_CITA_NUEVA),
        }}
      />

      <div className="space-y-4 px-4 pt-6 pb-10 sm:space-y-6 sm:px-6">
        {aviso && <Aviso>{aviso}</Aviso>}

        {!rolConocido ? (
          <div aria-busy="true" className={cn(TARJETA_DEL_PANEL, "p-8 text-center text-sm text-texto-2")}>
            Cargando...
          </div>
        ) : verPanelDeSuDia ? (
          <>
            {clinica && <InicioDeLaClinica gestionaSillones={false} />}
            {!sinEstadisticas && <VistaDiaProfesional estadisticas={estadisticas} />}
          </>
        ) : (
          <>
            {clinica && <InicioDeLaClinica gestionaSillones={puedeGestionarSillones(actorDeSesion(sesion))} />}

            {listaDeInicio && mostrarListaDeInicio(listaDeInicio) && <ListaDeInicio pasos={listaDeInicio.pasos} />}

            {invitacion && <InvitarNegocios datos={invitacion} />}

            {!sinEstadisticas && (
              <>
                <EstadisticasDelNegocio estadisticas={estadisticas} />

                <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
                  <CitasDeHoy citas={citasDeHoy} zona={estadisticas?.zona} className="lg:col-span-2" />
                  <ResumenDeClientes estadisticas={estadisticas} />
                </div>
              </>
            )}

            {slugDelNegocio && (
              <div className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-2 xl:items-start">
                <EnlaceDeReservas slug={slugDelNegocio} alCopiar={verListaDeInicio ? alCopiarElEnlace : undefined} />
                <QrDelLocal slug={slugDelNegocio} nombreNegocio={nombreDelNegocio} />
              </div>
            )}

            {!sinEstadisticas && (
              <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
                <CitasPorHora citas={citasDeHoy} zona={estadisticas?.zona} />
                <ResumenDelNegocio estadisticas={estadisticas} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
