"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { LogoEli } from "@/components/comunes/logo-eli"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { Lock, ArrowRight } from "lucide-react"
import { restablecerContrasena } from "../../_datos"

export default function PaginaRestablecerContrasena() {
  const params = useParams()
  const token = params.token as string
  const router = useRouter()
  const [contrasena, setContrasena] = useState("")
  const [confirmarContrasena, setConfirmarContrasena] = useState("")
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState("")

  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (contrasena.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres")
      return
    }
    if (contrasena !== confirmarContrasena) {
      setError("Las contraseñas no coinciden")
      return
    }

    setCargando(true)

    const resultado = await restablecerContrasena(token, contrasena)

    if (!resultado.ok) {
      setError(resultado.error)
      setCargando(false)
      return
    }

    router.push("/iniciar-sesion")
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
          <LogoEli tamaño="lg" />
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
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            icono={<Lock className="h-4 w-4" />}
            required
          />

          <CampoFormulario
            etiqueta="Confirmar contraseña"
            type="password"
            placeholder="Repite tu nueva contraseña"
            value={confirmarContrasena}
            onChange={(e) => setConfirmarContrasena(e.target.value)}
            icono={<Lock className="h-4 w-4" />}
            required
          />

          {error && <p role="alert" className="text-sm text-red-500 text-center">{error}</p>}

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
