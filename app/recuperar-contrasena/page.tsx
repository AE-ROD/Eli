"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { EliLogo } from "@/components/shared/eli-logo"
import { CampoFormulario } from "@/components/app/formularios/campo-formulario"
import { BotonPrimario } from "@/components/app/formularios/boton-primario"
import { Mail, ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react"

export default function RecuperarContrasenaPage() {
  const [email, setEmail] = useState("")
  const [cargando, setCargando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState("")

  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault()
    setCargando(true)
    setError("")

    try {
      const res = await fetch("/api/auth/olvide-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? "No se pudo procesar la solicitud")
        setCargando(false)
        return
      }

      setEnviado(true)
    } catch {
      setError("No se pudo procesar la solicitud")
    } finally {
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

        {enviado ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle2 className="h-6 w-6 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Revisa tu correo</h1>
            <p className="mt-2 text-muted-foreground">
              Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña. El enlace expira en 1 hora.
            </p>
            <Link
              href="/iniciar-sesion"
              className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver a iniciar sesión
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-foreground">¿Olvidaste tu contraseña?</h1>
              <p className="mt-2 text-muted-foreground">
                Ingresa tu correo y te enviaremos un enlace para restablecerla.
              </p>
            </div>

            <form className="space-y-5" onSubmit={manejarEnvio}>
              <CampoFormulario
                etiqueta="Correo electrónico"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                icono={<Mail className="h-4 w-4" />}
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
                Enviar enlace
              </BotonPrimario>
            </form>

            <p className="mt-8 text-center text-sm text-muted-foreground">
              <Link
                href="/iniciar-sesion"
                className="font-medium text-primary hover:text-primary/80 transition-colors inline-flex items-center gap-1"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver a iniciar sesión
              </Link>
            </p>
          </>
        )}
      </motion.div>
    </div>
  )
}
