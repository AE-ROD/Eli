"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { planConocido, type PlanId } from "@/lib/planes"
import type { RubroId } from "@/lib/rubros"
import { crearCuenta, recordarInvitacion } from "../_datos"
import { AccesoConGoogle } from "../_componentes/acceso-con-google"
import { AvisoDeError } from "../_componentes/aviso-de-error"
import { CamposDelNegocio } from "../_componentes/campos-del-negocio"
import { ElegirPlan } from "../_componentes/elegir-plan"
import {
  borrarSiEs,
  CONTRASENA_CORTA,
  CONTRASENAS_DISTINTAS,
  FALTA_EL_PLAN,
  FALTA_EL_TIPO_DE_NEGOCIO,
} from "../_componentes/errores-de-validacion"
import { IndicadorDePasos } from "../_componentes/indicador-de-pasos"
import { MarcoDeAcceso, PreguntaConEnlace } from "../_componentes/marco-de-acceso"

/**
 * El código de `?invita=` si se llegó por el enlace de invitación de otro
 * negocio. Se lee de la URL al enviar, no al dibujar: así la página no
 * necesita `useSearchParams` ni un `Suspense` alrededor.
 */
function codigoDeInvitacion(): string | undefined {
  return new URLSearchParams(window.location.search).get("invita") ?? undefined
}

/**
 * Los campos de cada paso: un error del servidor en uno de ellos vuelve a ese
 * paso. El plan (paso 3) es donde se envía, así que su error se queda ahí.
 */
const CAMPOS_DEL_PASO_1: readonly string[] = ["nombre", "email", "contrasena"]
const CAMPOS_DEL_PASO_2: readonly string[] = ["nombreNegocio", "tipoNegocio"]

/** Los pasos de crear la cuenta: tus datos, tu negocio y tu plan. */
const TOTAL_DE_PASOS = 3

export default function PaginaCrearCuenta() {
  const router = useRouter()
  const [cargando, setCargando] = useState(false)
  const [cargandoGoogle, setCargandoGoogle] = useState(false)
  const [paso, setPaso] = useState(1)
  const [tipoNegocio, setTipoNegocio] = useState<RubroId | "">("")
  const [plan, setPlan] = useState<PlanId | "">("")
  const [error, setError] = useState("")
  const [formulario, setFormulario] = useState({
    nombre: "",
    email: "",
    contrasena: "",
    confirmarContrasena: "",
    nombreNegocio: "",
  })

  // `?plan=independiente|equipo` deja elegido el plan del enlace (el de la
  // landing, por ejemplo). Se lee del navegador y no con useSearchParams, como
  // en iniciar-sesion: ese hook obliga a envolver la página en un <Suspense>.
  // Cualquier otro valor se ignora: el plan que vale es el que se elige acá y
  // el servidor lo vuelve a validar.
  useEffect(() => {
    const delEnlace = planConocido(new URLSearchParams(window.location.search).get("plan"))
    /* eslint-disable react-hooks/set-state-in-effect -- preselecciona desde la URL al llegar, no responde a un valor de render */
    if (delEnlace) setPlan(delEnlace)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  const actualizarCampo = (campo: string, valor: string) => {
    setFormulario((prev) => ({ ...prev, [campo]: valor }))
  }

  const manejarEnvio = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")

    if (paso === 1) {
      if (formulario.contrasena !== formulario.confirmarContrasena) {
        setError(CONTRASENAS_DISTINTAS)
        return
      }
      if (formulario.contrasena.length < 8) {
        setError(CONTRASENA_CORTA)
        return
      }
      setPaso(2)
      return
    }

    if (paso === 2) {
      if (!tipoNegocio) {
        setError(FALTA_EL_TIPO_DE_NEGOCIO)
        return
      }
      setPaso(3)
      return
    }

    // Sólo por si el rubro faltara al llegar al último paso: se vuelve a pedir en el suyo.
    if (!tipoNegocio) {
      setPaso(2)
      setError(FALTA_EL_TIPO_DE_NEGOCIO)
      return
    }

    if (!plan) {
      setError(FALTA_EL_PLAN)
      return
    }

    setCargando(true)

    const registro = await crearCuenta({
      nombre: formulario.nombre,
      email: formulario.email,
      contrasena: formulario.contrasena,
      nombreNegocio: formulario.nombreNegocio,
      tipoNegocio,
      plan,
      invita: codigoDeInvitacion(),
    })

    if (!registro.ok) {
      // Un error de un paso anterior (el correo ya tiene cuenta, el nombre no
      // vale) vuelve a ese paso, junto a sus campos, y no se queda debajo del
      // plan. El del plan se muestra donde está.
      if (registro.campo && CAMPOS_DEL_PASO_1.includes(registro.campo)) setPaso(1)
      else if (registro.campo && CAMPOS_DEL_PASO_2.includes(registro.campo)) setPaso(2)
      setError(registro.error)
      setCargando(false)
      return
    }

    // La cuenta ya existe: si entrar falla (el límite de intentos, la red), no
    // se ofrece "Crear cuenta" otra vez (diría que el correo ya tiene cuenta),
    // se lleva a iniciar sesión diciendo que la cuenta quedó creada. `signIn`
    // es de next-auth y sí puede lanzar, a diferencia de `crearCuenta`.
    let entro = false
    try {
      const inicioDeSesion = await signIn("credentials", {
        email: formulario.email,
        password: formulario.contrasena,
        redirect: false,
      })
      entro = Boolean(inicioDeSesion?.ok && !inicioDeSesion.error)
    } catch {
      entro = false
    }

    router.push(entro ? "/dashboard" : "/iniciar-sesion?aviso=CuentaCreada")
    router.refresh()
  }

  // Con Google el negocio se crea a la vuelta, en completar-perfil: el código
  // de invitación se deja antes en una cookie del servidor. Si eso falla, se
  // sigue igual: la cuenta se crea, sólo que sin invitación.
  const registrarseConGoogle = async () => {
    setCargandoGoogle(true)
    try {
      const invita = codigoDeInvitacion()
      if (invita) await recordarInvitacion(invita)
      await signIn("google", { callbackUrl: "/dashboard" })
    } catch {
      setError("No se pudo conectar con Google. Revisa tu conexión e inténtalo de nuevo.")
      setCargandoGoogle(false)
    }
  }

  // Lo que se valida acá va debajo de su campo; lo que responde el servidor, arriba del botón.
  const errorDeContrasena = error === CONTRASENA_CORTA ? error : undefined
  const errorDeConfirmacion = error === CONTRASENAS_DISTINTAS ? error : undefined
  const errorDeRubro = error === FALTA_EL_TIPO_DE_NEGOCIO ? error : undefined
  const errorDePlan = error === FALTA_EL_PLAN ? error : undefined
  const esDeUnCampo = Boolean(errorDeContrasena || errorDeConfirmacion || errorDeRubro || errorDePlan)
  const pasoUno = paso === 1
  const pasoTres = paso === 3

  return (
    <MarcoDeAcceso
      clave={paso}
      arriba={<IndicadorDePasos actual={paso} total={TOTAL_DE_PASOS} />}
      antetitulo={
        pasoUno
          ? `Paso 1 de ${TOTAL_DE_PASOS} · Tus datos`
          : pasoTres
            ? `Paso 3 de ${TOTAL_DE_PASOS} · Tu plan`
            : `Paso 2 de ${TOTAL_DE_PASOS} · Tu negocio`
      }
      titulo={pasoUno ? "Crea tu cuenta" : pasoTres ? "Elige tu plan" : "Cuéntanos de tu negocio"}
      bajada={
        pasoUno
          ? "Primero, tus datos para entrar a Eli. Después, los de tu negocio y tu plan."
          : pasoTres
            ? "Elige el que se parece a cómo trabajas."
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
              value={formulario.nombre}
              onChange={(e) => actualizarCampo("nombre", e.target.value)}
              required
            />

            <CampoFormulario
              etiqueta="Correo electrónico"
              type="email"
              autoComplete="email"
              placeholder="tu@correo.com"
              value={formulario.email}
              onChange={(e) => actualizarCampo("email", e.target.value)}
              required
            />

            <CampoFormulario
              etiqueta="Contraseña"
              type="password"
              autoComplete="new-password"
              placeholder="Al menos 8 caracteres"
              value={formulario.contrasena}
              onChange={(e) => {
                actualizarCampo("contrasena", e.target.value)
                setError(borrarSiEs(CONTRASENA_CORTA))
              }}
              error={errorDeContrasena}
              required
            />

            <CampoFormulario
              etiqueta="Repite la contraseña"
              type="password"
              autoComplete="new-password"
              value={formulario.confirmarContrasena}
              onChange={(e) => {
                actualizarCampo("confirmarContrasena", e.target.value)
                setError(borrarSiEs(CONTRASENAS_DISTINTAS))
              }}
              error={errorDeConfirmacion}
              required
            />
          </>
        ) : pasoTres ? (
          <ElegirPlan
            plan={plan}
            alElegir={(elegido) => {
              setPlan(elegido)
              setError(borrarSiEs(FALTA_EL_PLAN))
            }}
            rubro={tipoNegocio}
            error={errorDePlan}
          />
        ) : (
          <CamposDelNegocio
            nombre={formulario.nombreNegocio}
            alCambiarNombre={(nombre) => actualizarCampo("nombreNegocio", nombre)}
            rubro={tipoNegocio}
            alElegirRubro={(rubro) => {
              setTipoNegocio(rubro)
              setError(borrarSiEs(FALTA_EL_TIPO_DE_NEGOCIO))
            }}
            errorDeRubro={errorDeRubro}
          />
        )}

        <AvisoDeError mensaje={error} visible={!esDeUnCampo} />

        <div className="flex gap-3 pt-1">
          {!pasoUno && (
            <Boton
              variante="secundario"
              tamano="lg"
              onClick={() => { setPaso(paso - 1); setError("") }}
            >
              Atrás
            </Boton>
          )}
          <Boton type="submit" tamano="lg" cargando={cargando} className="flex-1">
            {pasoTres ? "Crear cuenta" : "Continuar"}
          </Boton>
        </div>
      </form>

      {pasoUno && (
        <AccesoConGoogle alElegir={registrarseConGoogle} cargando={cargandoGoogle}>
          Registrarse con Google
        </AccesoConGoogle>
      )}
    </MarcoDeAcceso>
  )
}
