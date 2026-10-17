"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { CircleCheck } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CampoFormulario } from "@/components/comunes/campo-formulario"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { CuadroDeIcono, IconoDeModulo } from "@/components/comunes/icono-de-modulo"
import { signIn } from "next-auth/react"
import { nombreDelRol } from "@/lib/nombres-de-roles"
import { leerInvitacion, aceptarInvitacion, type Invitacion } from "../../_datos"
import { AvisoDeError } from "../../_componentes/aviso-de-error"
import { borrarSiEs, CONTRASENA_CORTA, CONTRASENAS_DISTINTAS } from "../../_componentes/errores-de-validacion"
import { MarcoDeAcceso, PreguntaConEnlace } from "../../_componentes/marco-de-acceso"

/** La invitación es la puerta de entrada al equipo: las pantallas llevan su ícono y su pastel. */
const ICONO_DEL_EQUIPO = <IconoDeModulo modulo="equipo" tamano="lg" />

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
        bajada="Ya puedes iniciar sesión con tu correo y tu contraseña."
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

  return (
    <MarcoDeAcceso
      clave={estado}
      modulo="equipo"
      arriba={ICONO_DEL_EQUIPO}
      antetitulo="Invitación al equipo"
      titulo={`Únete a ${invitacion?.negocio ?? ""}`}
      bajada={`Hola, ${invitacion?.nombre ?? ""}. Para entrar al equipo, crea tu contraseña.`}
    >
      <dl className="grid gap-4 rounded-campo bg-superficie px-5 py-4 text-sm squircle sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8">
        <div className="min-w-0">
          <dt className="text-texto-2">Tu cuenta</dt>
          <dd className="mt-1 break-words font-medium">{invitacion?.email}</dd>
        </div>
        <div>
          <dt className="text-texto-2">Tu rol</dt>
          {/* Los nombres del producto, los mismos del correo de la invitación. */}
          <dd className="mt-1 font-medium">{nombreDelRol(invitacion?.rol)}</dd>
        </div>
      </dl>

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
              <p>Después, vuelve a abrir este enlace.</p>
              <Boton href="/iniciar-sesion" variante="enlace" tamano="sm">
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
