"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import type { RubroId } from "@/lib/rubros"
import { crearCuenta } from "../_datos"
import { AccesoConGoogle } from "../_componentes/acceso-con-google"
import { AvisoDeError } from "../_componentes/aviso-de-error"
import { CamposDelNegocio } from "../_componentes/campos-del-negocio"
import {
  CONTRASENA_CORTA,
  CONTRASENAS_DISTINTAS,
  FALTA_EL_TIPO_DE_NEGOCIO,
} from "../_componentes/errores-de-validacion"
import { IndicadorDePasos } from "../_componentes/indicador-de-pasos"
import { MarcoDeAcceso, PreguntaConEnlace } from "../_componentes/marco-de-acceso"

export default function PaginaCrearCuenta() {
  const router = useRouter()
  const [cargando, setCargando] = useState(false)
  const [paso, setPaso] = useState(1)
  const [tipoNegocio, setTipoNegocio] = useState<RubroId | "">("")
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
        setError(CONTRASENAS_DISTINTAS)
        return
      }
      if (formData.contrasena.length < 8) {
        setError(CONTRASENA_CORTA)
        return
      }
      setPaso(2)
      return
    }

    if (!tipoNegocio) {
      setError(FALTA_EL_TIPO_DE_NEGOCIO)
      return
    }

    setCargando(true)

    const registro = await crearCuenta({
      nombre: formData.nombre,
      email: formData.email,
      contrasena: formData.contrasena,
      nombreNegocio: formData.nombreNegocio,
      tipoNegocio,
    })

    if (!registro.ok) {
      setError(registro.error)
      setCargando(false)
      return
    }

    // `signIn` es de next-auth y sí puede lanzar si se cae la red, a
    // diferencia de `crearCuenta`, que devuelve el error.
    try {
      const inicioDeSesion = await signIn("credentials", {
        email: formData.email,
        password: formData.contrasena,
        redirect: false,
      })

      if (inicioDeSesion?.error) {
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

  // Lo que se valida acá va debajo de su campo; lo que responde el servidor, arriba del botón.
  const errorDeContrasena = error === CONTRASENA_CORTA ? error : undefined
  const errorDeConfirmacion = error === CONTRASENAS_DISTINTAS ? error : undefined
  const errorDeRubro = error === FALTA_EL_TIPO_DE_NEGOCIO ? error : undefined
  const esDeUnCampo = Boolean(errorDeContrasena || errorDeConfirmacion || errorDeRubro)
  const pasoUno = paso === 1

  return (
    <MarcoDeAcceso
      clave={paso}
      arriba={<IndicadorDePasos actual={paso} total={2} />}
      antetitulo={pasoUno ? "Paso 1 de 2 · Tus datos" : "Paso 2 de 2 · Tu negocio"}
      titulo={pasoUno ? "Crea tu cuenta" : "Cuéntanos de tu negocio"}
      bajada={
        pasoUno
          ? "Primero, tus datos para entrar a Eli. En el paso siguiente, los de tu negocio."
          : "El nombre es el que ven tus clientes cuando reservan."
      }
      pie={
        pasoUno && (
          <PreguntaConEnlace pregunta="¿Ya tienes cuenta?" href="/iniciar-sesion">
            Inicia sesión
          </PreguntaConEnlace>
        )
      }
    >
      <form className="flex flex-col gap-5" onSubmit={manejarEnvio}>
        {pasoUno ? (
          <>
            <CampoFormulario
              etiqueta="Nombre completo"
              type="text"
              autoComplete="name"
              placeholder="Por ejemplo, María González"
              value={formData.nombre}
              onChange={(e) => actualizarCampo("nombre", e.target.value)}
              required
            />

            <CampoFormulario
              etiqueta="Correo electrónico"
              type="email"
              autoComplete="email"
              placeholder="tu@correo.com"
              value={formData.email}
              onChange={(e) => actualizarCampo("email", e.target.value)}
              required
            />

            <CampoFormulario
              etiqueta="Contraseña"
              type="password"
              autoComplete="new-password"
              placeholder="Al menos 8 caracteres"
              value={formData.contrasena}
              onChange={(e) => actualizarCampo("contrasena", e.target.value)}
              error={errorDeContrasena}
              required
            />

            <CampoFormulario
              etiqueta="Repite la contraseña"
              type="password"
              autoComplete="new-password"
              value={formData.confirmarContrasena}
              onChange={(e) => actualizarCampo("confirmarContrasena", e.target.value)}
              error={errorDeConfirmacion}
              required
            />
          </>
        ) : (
          <CamposDelNegocio
            nombre={formData.nombreNegocio}
            alCambiarNombre={(nombre) => actualizarCampo("nombreNegocio", nombre)}
            rubro={tipoNegocio}
            alElegirRubro={setTipoNegocio}
            errorDeRubro={errorDeRubro}
          />
        )}

        <AvisoDeError mensaje={error} visible={!esDeUnCampo} />

        <div className="flex gap-3 pt-1">
          {!pasoUno && (
            <Boton
              variante="secundario"
              tamano="lg"
              onClick={() => { setPaso(1); setError("") }}
            >
              Atrás
            </Boton>
          )}
          <Boton type="submit" tamano="lg" cargando={cargando} className="flex-1">
            {pasoUno ? "Continuar" : "Crear cuenta"}
          </Boton>
        </div>
      </form>

      {pasoUno && (
        <AccesoConGoogle alElegir={() => signIn("google", { callbackUrl: "/dashboard" })}>
          Registrarse con Google
        </AccesoConGoogle>
      )}
    </MarcoDeAcceso>
  )
}
