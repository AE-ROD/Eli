"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { EliLogo } from "@/components/eli/eli-logo"
import { CampoFormulario } from "@/components/eli/app/campo-formulario"
import { BotonPrimario } from "@/components/eli/app/boton-primario"
import { Mail, Lock, User, Building2, ArrowRight, Check } from "lucide-react"

const tiposNegocio = [
  { id: "salon", nombre: "Salón de belleza / Spa", icono: "💇" },
  { id: "salud", nombre: "Consultorio de salud", icono: "🏥" },
  { id: "fitness", nombre: "Estudio fitness / Yoga", icono: "🧘" },
  { id: "otro", nombre: "Otro tipo de negocio", icono: "📋" },
]

export default function CrearCuentaPage() {
  const router = useRouter()
  const [cargando, setCargando] = useState(false)
  const [paso, setPaso] = useState(1)
  const [tipoNegocio, setTipoNegocio] = useState("")
  const [error, setError] = useState("")
  const [formData, setFormData] = useState({
    nombre: "",
    email: "",
    contrasena: "",
    confirmarContrasena: "",
    nombreNegocio: "",
  })

  const actualizarCampo = (campo: string, valor: string) => {
    setFormData((prev) => ({ ...prev, [campo]: valor }))
  }

  const manejarEnvio = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")

    if (paso === 1) {
      if (formData.contrasena !== formData.confirmarContrasena) {
        setError("Las contraseñas no coinciden")
        return
      }
      if (formData.contrasena.length < 8) {
        setError("La contraseña debe tener al menos 8 caracteres")
        return
      }
      setPaso(2)
      return
    }

    if (!tipoNegocio) {
      setError("Selecciona el tipo de negocio")
      return
    }

    setCargando(true)

    try {
      const respuesta = await fetch("/api/auth/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: formData.nombre,
          email: formData.email,
          contrasena: formData.contrasena,
          nombreNegocio: formData.nombreNegocio,
          tipoNegocio,
        }),
      })

      const datos = await respuesta.json()

      if (!respuesta.ok) {
        setError(datos.error ?? "Error al crear la cuenta")
        setCargando(false)
        return
      }

      const resultado = await signIn("credentials", {
        email: formData.email,
        password: formData.contrasena,
        redirect: false,
      })

      if (resultado?.error) {
        setError("Cuenta creada pero no se pudo iniciar sesión automáticamente")
        setCargando(false)
      } else {
        router.push("/dashboard")
        router.refresh()
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.")
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Panel izquierdo - Decorativo */}
      <div className="hidden lg:flex lg:flex-1 bg-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,255,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_70%,rgba(255,255,255,0.08),transparent_40%)]" />

        <div className="relative z-10 flex flex-col justify-center px-12 text-primary-foreground">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            <h2 className="text-3xl font-bold mb-4 text-balance">
              Comienza a crecer tu negocio hoy
            </h2>
            <p className="text-lg opacity-90 text-pretty">
              Únete a cientos de profesionales que ya confían en Eli para gestionar su día a día.
            </p>

            <div className="mt-10 space-y-6">
              {[
                { titulo: "Gratis para empezar", desc: "Sin tarjeta de crédito requerida" },
                { titulo: "Configuración en 5 minutos", desc: "Empieza a agendar citas al instante" },
                { titulo: "Soporte dedicado", desc: "Ayuda cuando la necesites" },
              ].map((item, index) => (
                <motion.div
                  key={item.titulo}
                  className="flex items-start gap-4"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + index * 0.1, duration: 0.4 }}
                >
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                    <Check className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{item.titulo}</h3>
                    <p className="text-sm opacity-80">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Panel derecho - Formulario */}
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

          {/* Progress indicator */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className={`w-8 h-1 rounded-full transition-colors ${paso >= 1 ? "bg-primary" : "bg-muted"}`} />
            <div className={`w-8 h-1 rounded-full transition-colors ${paso >= 2 ? "bg-primary" : "bg-muted"}`} />
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-foreground">
              {paso === 1 ? "Crea tu cuenta" : "Cuéntanos de tu negocio"}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {paso === 1
                ? "Completa tus datos personales"
                : "Esto nos ayuda a personalizar tu experiencia"}
            </p>
          </div>

          <motion.form
            className="space-y-5"
            onSubmit={manejarEnvio}
            key={paso}
            initial={{ opacity: 0, x: paso === 1 ? 0 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            {paso === 1 ? (
              <>
                <CampoFormulario
                  etiqueta="Nombre completo"
                  type="text"
                  placeholder="Tu nombre"
                  value={formData.nombre}
                  onChange={(e) => actualizarCampo("nombre", e.target.value)}
                  icono={<User className="h-4 w-4" />}
                  required
                />

                <CampoFormulario
                  etiqueta="Correo electrónico"
                  type="email"
                  placeholder="tu@email.com"
                  value={formData.email}
                  onChange={(e) => actualizarCampo("email", e.target.value)}
                  icono={<Mail className="h-4 w-4" />}
                  required
                />

                <CampoFormulario
                  etiqueta="Contraseña"
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  value={formData.contrasena}
                  onChange={(e) => actualizarCampo("contrasena", e.target.value)}
                  icono={<Lock className="h-4 w-4" />}
                  required
                />

                <CampoFormulario
                  etiqueta="Confirmar contraseña"
                  type="password"
                  placeholder="Repite tu contraseña"
                  value={formData.confirmarContrasena}
                  onChange={(e) => actualizarCampo("confirmarContrasena", e.target.value)}
                  icono={<Lock className="h-4 w-4" />}
                  required
                />
              </>
            ) : (
              <>
                <CampoFormulario
                  etiqueta="Nombre de tu negocio"
                  type="text"
                  placeholder="Ej: Salón María"
                  value={formData.nombreNegocio}
                  onChange={(e) => actualizarCampo("nombreNegocio", e.target.value)}
                  icono={<Building2 className="h-4 w-4" />}
                  required
                />

                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">
                    Tipo de negocio
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {tiposNegocio.map((tipo) => (
                      <motion.button
                        key={tipo.id}
                        type="button"
                        className={`
                          p-4 rounded-xl border-2 text-left transition-all
                          ${tipoNegocio === tipo.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                          }
                        `}
                        onClick={() => setTipoNegocio(tipo.id)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <span className="text-2xl mb-2 block">{tipo.icono}</span>
                        <span className="text-sm font-medium text-foreground">
                          {tipo.nombre}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}

            <div className="flex gap-3 pt-2">
              {paso === 2 && (
                <BotonPrimario
                  type="button"
                  variante="secundario"
                  anchoCompleto
                  tamaño="lg"
                  onClick={() => { setPaso(1); setError("") }}
                >
                  Atrás
                </BotonPrimario>
              )}
              <BotonPrimario
                type="submit"
                anchoCompleto
                tamaño="lg"
                cargando={cargando}
                icono={<ArrowRight className="h-4 w-4" />}
                iconoDerecha
              >
                {paso === 1 ? "Continuar" : "Crear cuenta"}
              </BotonPrimario>
            </div>
          </motion.form>

          {paso === 1 && (
            <>
              <div className="mt-8">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-background text-muted-foreground">
                      o regístrate con
                    </span>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <BotonPrimario variante="secundario" anchoCompleto>
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Google
                  </BotonPrimario>
                  <BotonPrimario variante="secundario" anchoCompleto>
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.09.682-.218.682-.485 0-.236-.009-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .269.18.579.688.481C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                    </svg>
                    GitHub
                  </BotonPrimario>
                </div>
              </div>

              <p className="mt-8 text-center text-sm text-muted-foreground">
                ¿Ya tienes una cuenta?{" "}
                <Link
                  href="/iniciar-sesion"
                  className="font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  Inicia sesión
                </Link>
              </p>
            </>
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Al crear una cuenta, aceptas nuestros{" "}
            <Link href="/terminos" className="underline hover:text-foreground">
              Términos de servicio
            </Link>{" "}
            y{" "}
            <Link href="/privacidad" className="underline hover:text-foreground">
              Política de privacidad
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  )
}
