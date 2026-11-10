"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { CircleCheck, WifiOff } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { CuadroDeIcono, IconoDeModulo } from "@/components/comunes/icono-de-modulo"
import { signIn, useSession } from "next-auth/react"
import { nombreDelRol } from "@/lib/nombres-de-roles"
import { leerInvitacion, aceptarInvitacion, invitacionNoValida, type Invitacion } from "../../_datos"
import { AvisoDeError } from "../../_componentes/aviso-de-error"
import { DEMASIADOS_INTENTOS, mensajeDeErrorAlEntrar } from "../../_componentes/errores-de-acceso"
import { borrarSiEs, CONTRASENA_CORTA, CONTRASENAS_DISTINTAS } from "../../_componentes/errores-de-validacion"
import { MarcoDeAcceso, PreguntaConEnlace } from "../../_componentes/marco-de-acceso"

/** La invitación es la puerta de entrada al equipo: las pantallas llevan su ícono y su pastel. */
const ICONO_DEL_EQUIPO = <IconoDeModulo modulo="equipo" tamano="lg" />

/** El correo como lo compara el servidor: sin espacios en las puntas y en minúsculas. */
const normalizar = (email: string | null | undefined) => (email ?? "").trim().toLowerCase()

export default function PaginaUnirse() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string
  const { data: sesion, update } = useSession()

  const [estado, setEstado] = useState<"cargando" | "valida" | "invalida" | "sin-conexion" | "aceptada">("cargando")
  const [invitacion, setInvitacion] = useState<Invitacion | null>(null)
  const [contrasena, setContrasena] = useState("")
  const [confirmarContrasena, setConfirmarContrasena] = useState("")
  const [error, setError] = useState("")
  const [requiereSesion, setRequiereSesion] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [avisoAlEntrar, setAvisoAlEntrar] = useState("")
  // Cada intento de cargar la invitación: "Reintentar" lo sube y el efecto vuelve a pedirla.
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vigente = true
    leerInvitacion(token).then((resultado) => {
      if (!vigente) return
      // Sólo un 404 o un 410 dicen que el enlace no sirve. Sin red, un 5xx o
      // el límite de pedidos no dicen nada del enlace: se ofrece reintentar.
      if (!resultado.ok) return setEstado(invitacionNoValida(resultado.codigo) ? "invalida" : "sin-conexion")
      setInvitacion(resultado.datos)
      setEstado("valida")
    })
    return () => {
      vigente = false
    }
  }, [token, intento])

  const reintentar = () => {
    setEstado("cargando")
    setIntento((anterior) => anterior + 1)
  }

  // Con una sesión del mismo correo de la invitación, la cuenta ya existe y es
  // suya: aceptar sólo suma este negocio (otro contexto), sin contraseña nueva.
  // Vale también para la dueña invitada a su propio negocio.
  const conSuCuenta = !!invitacion && !!sesion?.user?.id && normalizar(sesion.user.email) === normalizar(invitacion.email)
  const volverAca = `/iniciar-sesion?volver=${encodeURIComponent(`/unirse/${token}`)}`

  /**
   * Entra al negocio que se acaba de sumar: `update({ contexto })` y el
   * servidor lo verifica contra la base. Si no lo toma (la sesión es de otra
   * cuenta, o se pasó el límite de pedidos), se elige a mano.
   */
  const entrarAlContexto = async (contexto: string | null) => {
    let entro = false
    if (contexto) {
      try {
        const nueva = await update({ contexto })
        entro = nueva?.user?.contexto === contexto
      } catch {
        entro = false
      }
    }
    // Navegación completa y no `router.push`: el enrutador del navegador
    // guarda que "/dashboard" pudo redirigir a otra parte (con la
    // sesión de antes) y con `push` podía repetir esa redirección. Además el
    // panel se arma de cero, sin nada del contexto anterior en memoria.
    window.location.assign(entro ? "/dashboard" : "/elegir-negocio")
  }

  const aceptarConSuCuenta = async () => {
    setError("")
    setRequiereSesion(false)
    setEnviando(true)

    const resultado = await aceptarInvitacion(token)
    if (!resultado.ok) {
      setError(resultado.error)
      setRequiereSesion(resultado.requiereSesion)
      setEnviando(false)
      return
    }
    await entrarAlContexto(resultado.datos.contexto)
  }

  const aceptar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setRequiereSesion(false)

    if (contrasena.length < 8) {
      setError(CONTRASENA_CORTA)
      return
    }
    if (contrasena !== confirmarContrasena) {
      setError(CONTRASENAS_DISTINTAS)
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

    // Si la cuenta ya existía (con una sesión de esa cuenta), aceptar sólo
    // sumó el negocio: se entra a él sin contraseña nueva.
    if (!resultado.datos.cuentaNueva) {
      await entrarAlContexto(resultado.datos.contexto)
      return
    }

    // Iniciar sesión automáticamente con la contraseña recién creada. Una
    // cuenta nueva tiene un solo negocio: entra directo. `signIn` lanza sin
    // red o con una respuesta que no espera; la cuenta ya quedó creada, así
    // que el plan B es ir a iniciar sesión, nunca un botón que gira.
    try {
      const inicioDeSesion = await signIn("credentials", {
        email: invitacion!.email,
        password: contrasena,
        redirect: false,
      })
      if (inicioDeSesion?.ok && !inicioDeSesion.error) {
        router.push("/dashboard")
        return
      }
      if (inicioDeSesion?.error === DEMASIADOS_INTENTOS) setAvisoAlEntrar(mensajeDeErrorAlEntrar(DEMASIADOS_INTENTOS))
    } catch {
      // Sigue abajo: la cuenta existe igual.
    }
    setEstado("aceptada")
  }

  // Cada estado es una pantalla distinta del mismo marco: al pasar de uno a
  // otro, el marco lleva el foco al título nuevo.
  if (estado === "cargando") {
    return (
      <MarcoDeAcceso
        clave={estado}
        modulo="equipo"
        arriba={ICONO_DEL_EQUIPO}
        antetitulo="Invitación al equipo"
        titulo="Cargando la invitación"
        // Con la forma de lo que va a llegar (saludo, datos, dos campos y el
        // botón), para que al cargar salte lo menos posible.
        bajada={
          <span className="flex flex-col gap-2.5 pt-1.5">
            <Esqueleto className="h-3.5" />
            <Esqueleto className="h-3.5 w-2/3" />
          </span>
        }
        ocupado
      >
        <div className="flex flex-col gap-5">
          {/* Los datos van en dos filas en el teléfono y en una desde sm. */}
          <Esqueleto className="h-[136px] rounded-campo sm:h-[76px]" />
          {["w-24", "w-36"].map((anchoDeLaEtiqueta) => (
            <span key={anchoDeLaEtiqueta} className="flex flex-col gap-2.5">
              <Esqueleto className={`h-3.5 ${anchoDeLaEtiqueta}`} />
              <Esqueleto className="h-12 rounded-campo" />
            </span>
          ))}
          <Esqueleto className="h-14 rounded-boton-lg" />
        </div>
      </MarcoDeAcceso>
    )
  }

  if (estado === "sin-conexion") {
    return (
      <MarcoDeAcceso
        clave={estado}
        modulo="equipo"
        arriba={<CuadroDeIcono icono={WifiOff} color="turquesa" tamano="lg" />}
        antetitulo="Invitación al equipo"
        titulo="No se pudo cargar la invitación"
        bajada="Puede ser la conexión o un problema nuestro. El enlace no se gastó: vuelve a intentarlo."
      >
        <Boton onClick={reintentar} tamano="lg" className="w-full">
          Reintentar
        </Boton>
      </MarcoDeAcceso>
    )
  }

  if (estado === "invalida") {
    return (
      <MarcoDeAcceso
        clave={estado}
        modulo="equipo"
        arriba={ICONO_DEL_EQUIPO}
        antetitulo="Invitación al equipo"
        titulo="Invitación no válida"
        bajada="El enlace venció, ya se usó o no existe. Pídele a quien te invitó que te mande otro."
        pie={
          <PreguntaConEnlace pregunta="¿Ya la aceptaste?" href="/iniciar-sesion">
            Inicia sesión
          </PreguntaConEnlace>
        }
      />
    )
  }

  if (estado === "aceptada") {
    return (
      <MarcoDeAcceso
        clave={estado}
        modulo="equipo"
        arriba={<CuadroDeIcono icono={CircleCheck} color="turquesa" activo tamano="lg" />}
        antetitulo="Invitación aceptada"
        titulo="Cuenta creada"
        bajada={
          avisoAlEntrar
            ? `Tu cuenta quedó creada, pero no pudimos entrar: ${avisoAlEntrar.charAt(0).toLowerCase()}${avisoAlEntrar.slice(1)}`
            : "Tu cuenta quedó creada. Inicia sesión con tu correo y tu contraseña."
        }
      >
        <Boton href="/iniciar-sesion" tamano="lg" className="w-full">
          Ir a iniciar sesión
        </Boton>
      </MarcoDeAcceso>
    )
  }

  // Lo que se valida acá va debajo de su campo; lo que responde el servidor, arriba del botón.
  const errorDeContrasena = error === CONTRASENA_CORTA ? error : undefined
  const errorDeConfirmacion = error === CONTRASENAS_DISTINTAS ? error : undefined

  const datosDeLaInvitacion = (
    <dl className="grid gap-4 rounded-campo bg-superficie px-5 py-4 text-sm squircle sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8">
      <div className="min-w-0">
        <dt className="text-texto-2">Tu cuenta</dt>
        <dd className="mt-1 break-words font-medium">{invitacion?.email}</dd>
      </div>
      <div>
        <dt className="text-texto-2">Tu rol</dt>
        {/* Los nombres del producto, los mismos del correo de la invitación. */}
        <dd className="mt-1 font-medium">{nombreDelRol(invitacion?.rol, invitacion?.rubro)}</dd>
      </div>
    </dl>
  )

  if (conSuCuenta) {
    return (
      <MarcoDeAcceso
        clave="con-su-cuenta"
        modulo="equipo"
        arriba={ICONO_DEL_EQUIPO}
        antetitulo="Invitación al equipo"
        titulo={`Únete a ${invitacion?.negocio ?? ""}`}
        bajada={`Hola, ${invitacion?.nombre ?? ""}. Ya tienes una cuenta en Eli con este correo: súmate al equipo con ella. Tus otros negocios siguen igual y puedes cambiar entre ellos desde el panel.`}
      >
        {datosDeLaInvitacion}
        <div className="mt-6 flex flex-col gap-5">
          <AvisoDeError mensaje={error} />
          <Boton onClick={aceptarConSuCuenta} tamano="lg" cargando={enviando} className="w-full">
            Unirme con mi cuenta
          </Boton>
        </div>
      </MarcoDeAcceso>
    )
  }

  return (
    <MarcoDeAcceso
      clave={estado}
      modulo="equipo"
      arriba={ICONO_DEL_EQUIPO}
      antetitulo="Invitación al equipo"
      titulo={`Únete a ${invitacion?.negocio ?? ""}`}
      bajada={`Hola, ${invitacion?.nombre ?? ""}. Para entrar al equipo, crea tu contraseña.`}
      pie={
        <PreguntaConEnlace pregunta="¿Ya tienes cuenta en Eli con este correo?" href={volverAca}>
          Inicia sesión
        </PreguntaConEnlace>
      }
    >
      {datosDeLaInvitacion}

      <form onSubmit={aceptar} className="mt-6 flex flex-col gap-5">
        <CampoFormulario
          etiqueta="Contraseña"
          type="password"
          autoComplete="new-password"
          placeholder="Al menos 8 caracteres"
          value={contrasena}
          onChange={(e) => {
            setContrasena(e.target.value)
            setError(borrarSiEs(CONTRASENA_CORTA))
          }}
          error={errorDeContrasena}
          required
        />
        <CampoFormulario
          etiqueta="Repite la contraseña"
          type="password"
          autoComplete="new-password"
          value={confirmarContrasena}
          onChange={(e) => {
            setConfirmarContrasena(e.target.value)
            setError(borrarSiEs(CONTRASENAS_DISTINTAS))
          }}
          error={errorDeConfirmacion}
          required
        />

        {/* El aviso abarca también la indicación de iniciar sesión: sin ella,
            quien no ve la pantalla oye el error pero no qué hacer. */}
        <AvisoDeError mensaje={error} visible={!errorDeContrasena && !errorDeConfirmacion}>
          {requiereSesion && (
            <>
              <p>Al entrar vuelves a esta invitación.</p>
              <Boton href={volverAca} variante="enlace" tamano="sm">
                Ir a iniciar sesión
              </Boton>
            </>
          )}
        </AvisoDeError>

        <Boton type="submit" tamano="lg" cargando={enviando} className="w-full">
          Crear cuenta y entrar
        </Boton>
      </form>
    </MarcoDeAcceso>
  )
}
