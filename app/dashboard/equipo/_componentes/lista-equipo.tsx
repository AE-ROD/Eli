"use client"

import { useId, type ReactNode } from "react"
import { Clock, Mail, UsersRound } from "lucide-react"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { Insignia } from "@/components/comunes/insignia"
import { AvatarUsuario } from "@/components/panel/avatar-usuario"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { TARJETA_DEL_PANEL, TITULO_DE_TARJETA } from "@/components/panel/estilos"
import { nombreDelRol } from "@/lib/nombres-de-roles"
import { cn } from "@/lib/utils"
import type { InvitacionPendiente, MiembroDelEquipo } from "../_datos"

/**
 * Una persona por fila: el avatar, el nombre con el correo y el rol. Desde sm
 * el rol va a la derecha; en el teléfono baja debajo del correo, alineado con
 * el texto, para que al nombre y al correo les quede el ancho de la fila.
 */
const FILA_DE_PERSONA =
  "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-4 sm:px-5"
const LUGAR_DEL_AVATAR = "row-span-2 self-start sm:row-span-1 sm:self-center"
const LUGAR_DEL_ROL = "col-start-2 justify-self-start sm:col-start-3 sm:justify-self-end"

/** El encargado lleva el turquesa del equipo; el profesional, gris. El nombre del rol va siempre escrito. */
function InsigniaDelRol({ rol }: { rol: string }) {
  return <Insignia tono={rol === "admin" ? "turquesa" : "gris"}>{nombreDelRol(rol)}</Insignia>
}

interface PropsDeListaEquipo {
  miembros: MiembroDelEquipo[]
  invitaciones: InvitacionPendiente[]
  cargando: boolean
}

export function ListaEquipo({ miembros, invitaciones, cargando }: PropsDeListaEquipo) {
  if (cargando) return <ListaCargando />

  if (miembros.length === 0 && invitaciones.length === 0) {
    return (
      <div className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
        <EstadoVacio
          icono={<CuadroDeIcono icono={UsersRound} color="turquesa" tamano="lg" />}
          titulo="Todavía no hay nadie en tu equipo"
        >
          Usa el botón &ldquo;Invitar al equipo&rdquo; para sumar a tu encargado o a tus profesionales.
        </EstadoVacio>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <SeccionDeLaLista titulo="Miembros activos" cantidad={miembros.length}>
        {miembros.length === 0 ? (
          <EstadoVacio>Aún no hay miembros activos.</EstadoVacio>
        ) : (
          <ul className={cn(TARJETA_DEL_PANEL, "divide-y divide-borde")}>
            {miembros.map((miembro) => (
              <li key={miembro.id} className={FILA_DE_PERSONA}>
                <span className={LUGAR_DEL_AVATAR}>
                  <AvatarUsuario nombre={miembro.user.name} tamaño="md" />
                </span>
                <DatosDeLaPersona nombre={miembro.user.name} email={miembro.user.email} />
                <div className={LUGAR_DEL_ROL}>
                  <InsigniaDelRol rol={miembro.role} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </SeccionDeLaLista>

      {invitaciones.length > 0 && (
        <SeccionDeLaLista titulo="Invitaciones pendientes" cantidad={invitaciones.length}>
          <ul className={cn(TARJETA_DEL_PANEL, "divide-y divide-borde")}>
            {invitaciones.map((invitacion) => (
              <li key={invitacion.id} className={FILA_DE_PERSONA}>
                <span
                  aria-hidden="true"
                  className={cn(LUGAR_DEL_AVATAR, "grid size-10 place-items-center rounded-full bg-superficie text-texto-2")}
                >
                  <Clock className="size-5" strokeWidth={1.75} />
                </span>
                <DatosDeLaPersona nombre={invitacion.name} email={invitacion.email} />
                <div className={cn(LUGAR_DEL_ROL, "flex items-center gap-2 sm:flex-col sm:items-end sm:gap-1")}>
                  <InsigniaDelRol rol={invitacion.role} />
                  <p className="text-xs text-texto-2">Pendiente</p>
                </div>
              </li>
            ))}
          </ul>
        </SeccionDeLaLista>
      )}
    </div>
  )
}

/** Un grupo de la lista: el título en serif con la cantidad en una píldora, y la lista debajo. */
function SeccionDeLaLista({ titulo, cantidad, children }: { titulo: string; cantidad: number; children: ReactNode }) {
  const idDelTitulo = useId()
  return (
    <section aria-labelledby={idDelTitulo}>
      <h2 id={idDelTitulo} className={cn(TITULO_DE_TARJETA, "mb-3 flex items-center gap-2.5")}>
        {titulo}
        <span className="inline-flex h-6 min-w-7 items-center justify-center rounded-full bg-tarjeta px-2 font-sans text-[13px] font-semibold tracking-normal tabular-nums shadow-sm">
          <span className="sr-only">: </span>
          {cantidad}
        </span>
      </h2>
      {children}
    </section>
  )
}

/** El nombre y el correo, enteros aunque sean largos: bajan de renglón antes que salirse de la fila. */
function DatosDeLaPersona({ nombre, email }: { nombre: string; email: string }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="font-medium break-words">{nombre}</p>
      <p className="mt-0.5 flex items-start gap-1.5 text-sm text-texto-2">
        <Mail className="mt-[3px] size-3.5 shrink-0" aria-hidden="true" strokeWidth={1.75} />
        <span className="min-w-0 break-all">{email}</span>
      </p>
    </div>
  )
}

/** Tres filas con el alto de una persona, para que nada salte cuando llega la lista. */
function ListaCargando() {
  return (
    <div aria-busy="true" className={cn(TARJETA_DEL_PANEL, "divide-y divide-borde")}>
      <span className="sr-only">Cargando el equipo...</span>
      {[0, 1, 2].map((fila) => (
        <div key={fila} aria-hidden="true" className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
          <Esqueleto forma="circulo" className="size-10" />
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <Esqueleto className="w-1/3" />
            <Esqueleto className="h-2.5 w-1/2" />
          </span>
          <Esqueleto className="h-6 w-20" />
        </div>
      ))}
    </div>
  )
}
