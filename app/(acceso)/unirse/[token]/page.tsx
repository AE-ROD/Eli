"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { LogoEli } from "@/components/comunes/logo-eli"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Lock, CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { signIn } from "next-auth/react"
import { leerInvitacion, aceptarInvitacion, type Invitacion } from "../../_datos"

export default function PaginaUnirse() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [estado, setEstado] = useState<"cargando" | "valida" | "invalida" | "aceptada">("cargando")
  const [invitacion, setInvitacion] = useState<Invitacion | null>(null)
  const [contrasena, setContrasena] = useState("")
  const [confirmarContrasena, setConfirmarContrasena] = useState("")
  const [error, setError] = useState("")
  const [requiereSesion, setRequiereSesion] = useState(false)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    leerInvitacion(token).then((resultado) => {
      if (!resultado.ok) return setEstado("invalida")
      setInvitacion(resultado.datos)
      setEstado("valida")
    })
  }, [token])

  const aceptar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setRequiereSesion(false)

    if (contrasena.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres")
      return
    }
    if (contrasena !== confirmarContrasena) {
      setError("Las contraseñas no coinciden")
      return
    }

    setEnviando(true)

    const resultado = await aceptarInvitacion(token, contrasena)

    if (!resultado.ok) {
      setError(resultado.error)
      setRequiereSesion(resultado.requiereSesion)
      setEnviando(false)
      return
    }

    // Si la cuenta ya existía, aceptar solo suma la membresía: la sesión
    // que ya tenía la persona sigue siendo válida, no hay contraseña nueva.
    if (!resultado.datos.cuentaNueva) {
      router.push("/dashboard")
      return
    }

    // Iniciar sesión automáticamente con la contraseña recién creada
    const inicioDeSesion = await signIn("credentials", {
      email: invitacion!.email,
      password: contrasena,
      redirect: false,
    })

    if (inicioDeSesion?.ok) {
      router.push("/dashboard")
    } else {
      setEstado("aceptada")
    }
  }

  if (estado === "cargando") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (estado === "invalida") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <motion.div
          className="text-center max-w-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <XCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Invitación no válida</h1>
          <p className="text-muted-foreground">
            Este enlace de invitación expiró, ya fue usado o no existe.
          </p>
        </motion.div>
      </div>
    )
  }

  if (estado === "aceptada") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <motion.div
          className="text-center max-w-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Cuenta creada</h1>
          <p className="text-muted-foreground mb-6">
            Ya puedes iniciar sesión con tu correo y contraseña.
          </p>
          <BotonPrimario anchoCompleto onClick={() => router.push("/iniciar-sesion")}>
            Ir a iniciar sesión
          </BotonPrimario>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex justify-center mb-8">
          <LogoEli tamaño="lg" />
        </div>

        {/* Tarjeta de invitación */}
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 mb-8">
          <p className="text-xs text-muted-foreground uppercase font-medium tracking-wide mb-1">
            Fuiste invitado a
          </p>
          <p className="text-xl font-bold text-foreground">{invitacion?.negocio}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Tu rol: <span className="font-medium text-foreground capitalize">
              {invitacion?.rol === "admin" ? "Administrador" : "Trabajador"}
            </span>
          </p>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">Crea tu contraseña</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Tu cuenta será <strong>{invitacion?.email}</strong>
          </p>
        </div>

        <form onSubmit={aceptar} className="space-y-4">
          <CampoFormulario
            etiqueta="Contraseña"
            type="password"
            placeholder="Mínimo 8 caracteres"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            icono={<Lock className="h-4 w-4" />}
            required
          />
          <CampoFormulario
            etiqueta="Confirmar contraseña"
            type="password"
            placeholder="Repite la contraseña"
            value={confirmarContrasena}
            onChange={(e) => setConfirmarContrasena(e.target.value)}
            icono={<Lock className="h-4 w-4" />}
            required
          />

          {error && (
            // El aviso abarca también la indicación de iniciar sesión: sin ella,
            // quien no ve la pantalla oye el error pero no qué hacer.
            <div role="alert" className="text-center">
              <p className="text-sm text-red-500">{error}</p>
              {requiereSesion && (
                <>
                  <p className="text-xs text-muted-foreground mt-1">
                    Iniciá sesión y volvé a este enlace para aceptar la invitación.
                  </p>
                  <button
                    type="button"
                    className="text-sm text-primary underline mt-1"
                    onClick={() => router.push("/iniciar-sesion")}
                  >
                    Ir a iniciar sesión
                  </button>
                </>
              )}
            </div>
          )}

          <BotonPrimario
            type="submit"
            anchoCompleto
            tamaño="lg"
            cargando={enviando}
            icono={<CheckCircle2 className="h-4 w-4" />}
          >
            Crear cuenta y entrar
          </BotonPrimario>
        </form>
      </motion.div>
    </div>
  )
}
