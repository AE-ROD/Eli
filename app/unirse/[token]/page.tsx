"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { EliLogo } from "@/components/eli/eli-logo"
import { CampoFormulario } from "@/components/eli/app/campo-formulario"
import { BotonPrimario } from "@/components/eli/app/boton-primario"
import { Lock, CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { signIn } from "next-auth/react"

interface DatosInvitacion {
  nombre: string
  email: string
  rol: string
  negocio: string
  tipoNegocio: string
}

export default function UnirsePage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [estado, setEstado] = useState<"cargando" | "valida" | "invalida" | "aceptada">("cargando")
  const [invitacion, setInvitacion] = useState<DatosInvitacion | null>(null)
  const [password, setPassword] = useState("")
  const [confirmar, setConfirmar] = useState("")
  const [error, setError] = useState("")
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    fetch(`/api/equipo/invitacion/${token}`)
      .then(async (res) => {
        if (!res.ok) { setEstado("invalida"); return }
        const data = await res.json()
        setInvitacion(data)
        setEstado("valida")
      })
      .catch(() => setEstado("invalida"))
  }, [token])

  const aceptar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres")
      return
    }
    if (password !== confirmar) {
      setError("Las contraseñas no coinciden")
      return
    }

    setEnviando(true)

    const res = await fetch(`/api/equipo/invitacion/${token}/aceptar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Error al crear la cuenta")
      setEnviando(false)
      return
    }

    // Iniciar sesión automáticamente
    const loginRes = await signIn("credentials", {
      email: invitacion!.email,
      password,
      redirect: false,
    })

    if (loginRes?.ok) {
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
          <EliLogo size="lg" />
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icono={<Lock className="h-4 w-4" />}
            required
          />
          <CampoFormulario
            etiqueta="Confirmar contraseña"
            type="password"
            placeholder="Repite la contraseña"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            icono={<Lock className="h-4 w-4" />}
            required
          />

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

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
