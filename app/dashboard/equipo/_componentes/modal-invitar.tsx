"use client"

import { useId, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { Mail, MailCheck, User, UserRound, UsersRound, type LucideIcon } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { CLASES_DE_ETIQUETA } from "@/components/comunes/estilos-de-campo"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { Aviso } from "@/components/panel/aviso"
import { MarcoDeModal } from "@/components/panel/marco-de-modal"
import { cn } from "@/lib/utils"
import { invitarAlEquipo } from "../_datos"

interface PropsDeModalInvitar {
  abierto: boolean
  onCerrar: () => void
  onInvitado: () => void
}

/**
 * Los roles que se pueden dar al invitar, con los nombres del producto. Lo
 * que dice cada uno es lo que le permite `lib/permisos.ts`: el encargado
 * gestiona la operación, pero no define comisiones ni anula lo cobrado.
 */
const roles: readonly { id: "worker" | "admin"; nombre: string; descripcion: string; icono: LucideIcon }[] = [
  {
    id: "worker",
    nombre: "Profesional",
    descripcion: "Gestiona su propio horario y citas",
    icono: UserRound,
  },
  {
    id: "admin",
    nombre: "Encargado",
    descripcion: "Gestiona el equipo, la agenda, los horarios, los servicios y los cobros. Puede invitar a otros.",
    icono: UsersRound,
  },
]

export function ModalInvitar({ abierto, onCerrar, onInvitado }: PropsDeModalInvitar) {
  const [nombre, setNombre] = useState("")
  const [email, setEmail] = useState("")
  const [rol, setRol] = useState<"worker" | "admin">("worker")
  const [error, setError] = useState("")
  const [exito, setExito] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const resetear = () => {
    setNombre("")
    setEmail("")
    setRol("worker")
    setError("")
    setExito(false)
    setEnviando(false)
  }

  const cerrar = () => {
    resetear()
    onCerrar()
  }

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setEnviando(true)

    const resultado = await invitarAlEquipo({ nombre, email, rol })

    if (!resultado.ok) {
      setError(resultado.error)
      setEnviando(false)
      return
    }

    setExito(true)
    setEnviando(false)
    onInvitado()
  }

  return (
    <AnimatePresence>
      {abierto && (
        <MarcoDeModal
          titulo={exito ? "Invitación enviada" : "Invitar al equipo"}
          antetitulo="Equipo"
          bloqueado={enviando}
          alCerrar={cerrar}
        >
          {exito ? (
            <div>
              <CuadroDeIcono icono={MailCheck} color="turquesa" tamano="lg" />
              <p role="status" className="mt-4 text-pretty text-texto-2">
                <strong className="font-medium break-words text-navy">{nombre}</strong> recibirá un correo en{" "}
                <strong className="font-medium break-all text-navy">{email}</strong> con el enlace para crear su cuenta.
              </p>
              <BotonPrimario onClick={cerrar} anchoCompleto variante="secundario" className="mt-6">
                Cerrar
              </BotonPrimario>
            </div>
          ) : (
            <form onSubmit={enviar} className="space-y-5">
              <CampoFormulario
                etiqueta="Nombre"
                type="text"
                placeholder="Nombre de la persona"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                icono={<User className="h-4 w-4" />}
                required
              />
              <CampoFormulario
                etiqueta="Correo electrónico"
                type="email"
                placeholder="correo@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                icono={<Mail className="h-4 w-4" />}
                required
              />

              <EleccionDeRol elegido={rol} alElegir={setRol} />

              {error && <Aviso>{error}</Aviso>}

              <BotonPrimario type="submit" anchoCompleto cargando={enviando} icono={<Mail className="h-4 w-4" />}>
                Enviar invitación
              </BotonPrimario>
            </form>
          )}
        </MarcoDeModal>
      )}
    </AnimatePresence>
  )
}

/** El radio no se ve: el anillo del foco lo dibuja la fila entera cuando el radio de adentro lo tiene. */
const ANILLO_DE_LA_FILA =
  "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--anillo) has-focus-visible:shadow-[0_0_0_6px_var(--halo)]"

/**
 * Elegir el rol entre dos, los dos a la vista. Son radios nativos: el lector
 * de pantalla dice cuál está elegido y las flechas pasan de uno al otro. Antes
 * eran botones que no decían cuál estaba elegido.
 */
function EleccionDeRol({ elegido, alElegir }: { elegido: "worker" | "admin"; alElegir: (rol: "worker" | "admin") => void }) {
  const nombreDelGrupo = useId()

  return (
    <fieldset className="min-w-0">
      <legend className={cn(CLASES_DE_ETIQUETA, "mb-2")}>Rol</legend>
      <div className="flex flex-col gap-2">
        {roles.map((opcion) => {
          const esElElegido = elegido === opcion.id
          return (
            <label
              key={opcion.id}
              className={cn(
                "relative flex cursor-pointer items-center gap-3 rounded-campo border-[1.5px] bg-tarjeta py-3 pr-4 pl-3 text-navy squircle transition-[border-color] duration-150 ease-suave",
                ANILLO_DE_LA_FILA,
                esElElegido ? "border-navy" : "border-borde hover:border-texto-2"
              )}
            >
              <input
                type="radio"
                name={nombreDelGrupo}
                value={opcion.id}
                checked={esElElegido}
                onChange={() => alElegir(opcion.id)}
                className="sr-only"
              />
              <CuadroDeIcono icono={opcion.icono} color="turquesa" activo={esElElegido} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{opcion.nombre}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-texto-2">{opcion.descripcion}</span>
              </span>
              {/* El círculo vacío o con el punto: lo que dice que es una elección, con contraste de 3:1. */}
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] bg-tarjeta transition-colors duration-150 ease-suave",
                  esElElegido ? "border-navy" : "border-texto-2"
                )}
              >
                <span
                  className={cn(
                    "size-2.5 rounded-full bg-navy transition-transform duration-150 ease-suave",
                    esElElegido ? "scale-100" : "scale-0"
                  )}
                />
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
