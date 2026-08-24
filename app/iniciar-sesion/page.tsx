"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { EliLogo } from "@/components/shared/eli-logo"
import { CampoFormulario } from "@/components/app/formularios/campo-formulario"
import { BotonPrimario } from "@/components/app/formularios/boton-primario"
import { Mail, Lock, ArrowRight } from "lucide-react"

export default function IniciarSesionPage() {
  const router = useRouter()
  const [cargando, setCargando] = useState(false)
  const [email, setEmail] = useState("")
  const [contrasena, setContrasena] = useState("")
  const [error, setError] = useState("")

  // Se lee del navegador y no con useSearchParams: ese hook obliga a envolver
  // la página en un <Suspense> o el prerender falla.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("error")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- responde al redirect de OAuth, no a un valor de render
      setError("No se pudo iniciar sesión con Google. Verifica que tu cuenta esté habilitada.")
    }
  }, [])

  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault()
    setCargando(true) 
    setError("")

    const resultado = await signIn("credentials", {
      email,
      password: contrasena,
      redirect: false,
    })

    if (resultado?.error) {
      setError("Correo o contraseña incorrectos")
      setCargando(false)
    } else {
      router.push("/dashboard")
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Panel izquierdo - Formulario */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 lg:px-8">
        <motion.div
          className="sm:mx-auto sm:w-full sm:max-w-md"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Link href="/" className="flex justify-center mb-8">
            <EliLogo size="lg" />
          </Link>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-foreground">
              Bienvenido de vuelta
            </h1>
            <p className="mt-2 text-muted-foreground">
              Ingresa tus credenciales para acceder a tu cuenta
            </p>
          </div>

          <motion.form
            className="space-y-5"
            onSubmit={manejarEnvio}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <CampoFormulario
              etiqueta="Correo electrónico"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icono={<Mail className="h-4 w-4" />}
              required
            />

            <CampoFormulario
              etiqueta="Contraseña"
              type="password"
              placeholder="Tu contraseña"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              icono={<Lock className="h-4 w-4" />}
              required
            />

            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-sm text-muted-foreground">Recordarme</span>
              </label>
              <Link
                href="/recuperar-contrasena"
                className="text-sm text-primary hover:text-primary/80 transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            <BotonPrimario
              type="submit"
              anchoCompleto
              tamaño="lg"
              cargando={cargando}
              icono={<ArrowRight className="h-4 w-4" />}
              iconoDerecha
            >
              Iniciar Sesión
            </BotonPrimario>
          </motion.form>

          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-background text-muted-foreground">
                  o continúa con
                </span>
              </div>
            </div>

            <div className="mt-6">
              <BotonPrimario
                variante="secundario"
                anchoCompleto
                onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
              >
                <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continuar con Google
              </BotonPrimario>
            </div>
          </div>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            ¿No tienes una cuenta?{" "}
            <Link
              href="/crear-cuenta"
              className="font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Regístrate gratis
            </Link>
          </p>
        </motion.div>
      </div>

      {/* Panel derecho - Decorativo */}
      <div className="hidden lg:flex lg:flex-1 bg-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(255,255,255,0.08),transparent_40%)]" />

        <div className="relative z-10 flex flex-col justify-center px-12 text-primary-foreground">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            <h2 className="text-3xl font-bold mb-4 text-balance">
              Gestiona tu negocio de forma inteligente
            </h2>
            <p className="text-lg opacity-90 text-pretty">
              Centraliza reservas, clientes y comunicación en una sola plataforma diseñada para profesionales del bienestar y la salud.
            </p>

            <div className="mt-8 space-y-4">
              {[
                "Calendario visual intuitivo",
                "CRM de clientes completo",
                "Chat integrado con notificaciones",
                "Reportes y métricas en tiempo real",
              ].map((feature, index) => (
                <motion.div
                  key={feature}
                  className="flex items-center gap-3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + index * 0.1, duration: 0.4 }}
                >
                  <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                  <span className="opacity-90">{feature}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
