"use client"

import { motion } from "framer-motion"
import { Users, Mail, Clock, ShieldCheck, UserCircle2 } from "lucide-react"
import type { MiembroAPI, InvitacionAPI } from "../page"

function rolLabel(rol: string) {
  return rol === "admin" ? "Administrador" : "Trabajador"
}

function rolColor(rol: string) {
  return rol === "admin"
    ? "bg-purple-100 text-purple-700"
    : "bg-blue-100 text-blue-700"
}

interface Props {
  miembros: MiembroAPI[]
  invitaciones: InvitacionAPI[]
  cargando: boolean
}

export function ListaEquipo({ miembros, invitaciones, cargando }: Props) {
  if (cargando) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-muted/40 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  const sinDatos = miembros.length === 0 && invitaciones.length === 0

  return (
    <div className="space-y-8">
      {/* Miembros activos */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Miembros activos ({miembros.length})
        </h2>

        {miembros.length === 0 && !sinDatos ? (
          <p className="text-sm text-muted-foreground py-4">Aún no hay trabajadores activos.</p>
        ) : sinDatos ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="font-semibold text-foreground mb-1">Sin trabajadores aún</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Usa el botón "Invitar trabajador" para agregar personas a tu equipo.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {miembros.map((m, i) => (
              <motion.div
                key={m.id}
                className="flex items-center gap-4 bg-card border border-border/50 rounded-xl p-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <UserCircle2 className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">{m.user.name}</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {m.user.email}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1 ${rolColor(m.role)}`}>
                  <ShieldCheck className="h-3 w-3" />
                  {rolLabel(m.role)}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Invitaciones pendientes */}
      {invitaciones.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Invitaciones pendientes ({invitaciones.length})
          </h2>
          <div className="space-y-3">
            {invitaciones.map((inv, i) => (
              <motion.div
                key={inv.id}
                className="flex items-center gap-4 bg-card border border-border/50 rounded-xl p-4 opacity-80"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 0.8, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">{inv.name}</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {inv.email}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${rolColor(inv.role)}`}>
                    {rolLabel(inv.role)}
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">Pendiente</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
