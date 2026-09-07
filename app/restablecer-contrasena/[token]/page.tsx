"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { EliLogo } from "@/components/shared/eli-logo"
import { CampoFormulario } from "@/components/app/formularios/campo-formulario"
import { BotonPrimario } from "@/components/app/formularios/boton-primario"
import { Lock, ArrowRight } from "lucide-react"

export default function RestablecerContrasenaPage() {
  const params = useParams()
  const token = params.token as string
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirmarPassword, setConfirmarPassword] = useState("")
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState("")

  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres")
      return
    }
    if (password !== confirmarPassword) {
      setError("Las contraseñas no coinciden")
      return
    }

    setCargando(true)

    try {
      const res = await fetch("/api/auth/restablecer-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "No se pudo restablecer la contraseña")
        setCargando(false)
        return
      }

      router.push("/iniciar-sesion")
    } catch {
      setError("No se pudo restablecer la contraseña")
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Link href="/" className="flex justify-center mb-8">
          <EliLogo size="lg" />
        </Link>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">Crea una nueva contraseña</h1>
          <p className="mt-2 text-muted-foreground">
            Elige una contraseña segura de al menos 8 caracteres.
          </p>
        </div>

        <form className="space-y-5" onSubmit={manejarEnvio}>
          <CampoFormulario
            etiqueta="Nueva contraseña"
            type="password"
            placeholder="Tu nueva contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icono={<Lock className="h-4 w-4" />}
            required
          />

          <CampoFormulario
            etiqueta="Confirmar contraseña"
            type="password"
            placeholder="Repite tu nueva contraseña"
            value={confirmarPassword}
            onChange={(e) => setConfirmarPassword(e.target.value)}
            icono={<Lock className="h-4 w-4" />}
            required
          />

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          <BotonPrimario
            type="submit"
            anchoCompleto
            tamaño="lg"
            cargando={cargando}
            icono={<ArrowRight className="h-4 w-4" />}
            iconoDerecha
          >
            Restablecer contraseña
          </BotonPrimario>
        </form>
      </motion.div>
    </div>
  )
}
