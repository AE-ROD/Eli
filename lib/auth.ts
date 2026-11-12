import { NextAuthOptions } from "next-auth"
import type { JWT } from "next-auth/jwt"
import CredentialsProvider from "next-auth/providers/credentials"
import GoogleProvider from "next-auth/providers/google"
import { prisma } from "@/lib/prisma"
import { buscarContexto, contextoDeLaSesion, contextosDe, MAXIMO_DE_CONTEXTOS, type Contexto } from "@/lib/contextos"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import { REVALIDAR_CADA_MS } from "@/lib/renovacion-de-sesion"
import { hashDeToken } from "@/lib/tokens"
import { normalizarEmail } from "@/lib/validaciones"
import bcrypt from "bcryptjs"

/** Lo justo del negocio para armar un contexto (`lib/contextos.ts`). */
const NEGOCIO_DE_CONTEXTO = { select: { id: true, name: true, slug: true, type: true } } as const

/**
 * El usuario con todos sus contextos: el negocio propio y cada membresía, la
 * más antigua primero (un orden estable para la pantalla de elegir).
 */
const CON_CONTEXTOS = {
  business: NEGOCIO_DE_CONTEXTO,
  memberships: {
    select: { id: true, role: true, business: NEGOCIO_DE_CONTEXTO },
    orderBy: { createdAt: "asc" },
    take: MAXIMO_DE_CONTEXTOS,
  },
} as const

type UsuarioConNegocio = NonNullable<
  Awaited<ReturnType<typeof buscarUsuario>>
>

function buscarUsuario(where: { id: string } | { email: string }) {
  return prisma.user.findUnique({ where, include: CON_CONTEXTOS })
}

/**
 * Los contextos de la cuenta, leídos de la base. Para la pantalla de elegir
 * negocio: nunca de lo que diga la sesión ni el navegador.
 */
export async function contextosDeLaCuenta(userId: string): Promise<Contexto[]> {
  if (!userId) return []
  const usuario = await buscarUsuario({ id: userId })
  return usuario ? contextosDe(usuario) : []
}

/**
 * Lo que va al token: el contexto con el que trabaja la sesión y, de él, el
 * rol, el negocio y la membresía. Una cuenta puede estar en varios negocios
 * (`lib/contextos.ts`); la sesión trabaja con uno solo a la vez.
 *
 * `elegido` es el id del contexto que la sesión ya tenía (o el que pidió al
 * cambiar). Se busca entre los contextos que la base dice que la cuenta
 * tiene: si ya no está (la sacaron del equipo, dejó de ser dueña), no se
 * conserva nada de él y la sesión queda SIN negocio, aunque a la cuenta le
 * quede un solo contexto: nunca se cambia sola a otro (`contextoDeLaSesion`).
 * Sólo sin elegido (el login, un token que nunca eligió) se entra directo al
 * único contexto si hay uno solo. Sin negocio, el proxy manda a elegir
 * (`/elegir-negocio`), o a completar el perfil si no queda ninguno.
 *
 * `rol`, `businessId`, `memberId` y `rubro` salen siempre del MISMO contexto:
 * el par `(businessId, memberId)` nunca apunta a dos negocios distintos, y el
 * rubro (que abre lo clínico en `lib/permisos.ts`) es el de ese negocio.
 */
function perfilDe(usuario: UsuarioConNegocio, elegido?: unknown) {
  const contextos = contextosDe(usuario)
  const contexto = contextoDeLaSesion(contextos, elegido)

  return {
    contexto: contexto?.id ?? null,
    contextos: contextos.length,
    tieneNegocioPropio: !!usuario.business,
    role: contexto?.rol,
    businessId: contexto?.businessId ?? null,
    businessName: contexto?.businessName ?? null,
    businessSlug: contexto?.businessSlug ?? null,
    rubro: contexto?.rubro ?? null,
    memberId: contexto?.memberId ?? null,
  }
}

/**
 * El contexto que pide `update({ contexto })` desde el navegador. Es sólo un
 * pedido: `revalidar` lo busca entre los de la cuenta en la base y, si no es
 * suyo, lo ignora. `undefined` si el pedido no trae uno.
 */
function contextoPedido(datos: unknown): unknown {
  if (!datos || typeof datos !== "object" || !("contexto" in datos)) return undefined
  return (datos as { contexto: unknown }).contexto
}

/**
 * Cada cuánto el token se vuelve a contrastar con la base (definido en
 * `lib/renovacion-de-sesion.ts`, que también fija cada cuánto el navegador
 * renueva la cookie dentro del panel para que esto sea una consulta cada cinco
 * minutos por sesión y no una por petición). Con JWT no hay sesión en el
 * servidor que borrar: sin esta revisión, un miembro eliminado o una contraseña
 * restablecida dejaban la sesión vieja viva hasta que venciera.
 */
export { REVALIDAR_CADA_MS }

/** Los códigos que la pantalla de iniciar sesión traduce (`errores-de-acceso.ts`). */
const ERROR_CUENTA_CON_CONTRASENA = "CuentaConContrasena"
const ERROR_DEMASIADOS_INTENTOS = "DemasiadosIntentos"

/**
 * Un hash bcrypt (costo 12, el mismo de las contraseñas reales) de un texto al
 * azar que nadie conoce. Cuando el correo no tiene cuenta, o la cuenta no
 * tiene contraseña, se compara igual contra éste: así responder "no" tarda lo
 * mismo exista o no la cuenta, y el tiempo no sirve para averiguar quién está
 * registrado.
 */
const HASH_FICTICIO = "$2b$12$HDnu1MsT/w6nG8TEHkZpx.SLimFdbSC5tt1VNXxQkGLTEmeUlB2ne"

/** Las cabeceras del pedido que NextAuth le pasa a `authorize` (un objeto plano), como `Headers`. */
function cabecerasDelPedido(pedido: unknown): Headers {
  const cabeceras = new Headers()
  const crudas = (pedido as { headers?: unknown } | undefined)?.headers
  if (crudas && typeof crudas === "object") {
    for (const [nombre, valor] of Object.entries(crudas)) {
      if (typeof valor === "string") cabeceras.set(nombre, valor)
    }
  }
  return cabeceras
}

/**
 * El tope de intentos de login, adentro de `authorize`: es el único lugar por
 * el que pasa todo intento, llegue por la URL que llegue. El del proxy
 * (`proxy.ts`) compara la ruta y una ruta se puede escribir de varias formas
 * (`/api/auth/callback/credential%73`); éste no depende de eso.
 *
 * Dos baldes, los dos fallan cerrado si Upstash falla: por IP (`login`, 10
 * por minuto) y por cuenta (`loginPorCuenta`, 30 por 15 minutos; el correo
 * normalizado, en hash: no va en claro a Upstash). El de cuenta frena a quien
 * prueba contraseñas de una misma persona rotando IPs, y es más amplio que el
 * de IP para que un tercero con unos pocos intentos no deje fuera a la dueña
 * de la cuenta (los números, en `lib/rate-limit.ts`). Las claves llevan su
 * propio prefijo y no chocan con las del proxy, que cuenta la IP aparte.
 */
async function quedanIntentosDeLogin(pedido: unknown, email: string): Promise<boolean> {
  const ip = obtenerIp({ headers: cabecerasDelPedido(pedido) })
  const [porIp, porCuenta] = await Promise.all([
    verificarLimite("login", `authorize:ip:${ip}`),
    verificarLimite("loginPorCuenta", `authorize:cuenta:${hashDeToken(email)}`),
  ])
  return porIp.permitido && porCuenta.permitido
}

/** Siete días: lo que dura una sesión sin volver a entrar. */
const DURACION_DE_SESION_S = 7 * 24 * 60 * 60

/**
 * Sin contexto no hay rol, negocio ni membresía: `actorDeSesion` devuelve null
 * (401) y el proxy manda a elegir negocio o, si la cuenta no tiene ninguno, a
 * completar el perfil.
 */
function quitarNegocio(token: JWT): JWT {
  token.contexto = null
  token.role = undefined
  token.businessId = null
  token.businessName = null
  token.businessSlug = null
  token.rubro = null
  token.memberId = null
  return token
}

/**
 * Una sesión revocada deja de identificar a nadie: sin `id` ni negocio, y
 * tampoco con el email, el nombre o la foto, que de otro modo seguirían
 * llegando a `session.user` y bastarían para lo que identifica por correo.
 */
function revocar(token: JWT): JWT {
  token.id = ""
  token.contextos = 0
  token.tieneNegocioPropio = false
  delete token.email
  delete token.name
  delete token.picture
  return quitarNegocio(token)
}

/**
 * Rearma el token desde la base. Si el usuario ya no existe, o el token se
 * emitió antes de que se cerraran sus sesiones (restablecer la contraseña),
 * el token deja también de identificarlo: sin `id`, ni completar-perfil lo
 * acepta. Un token de antes de este cambio no trae `emitidoEn` y cuenta como
 * emitido en 0, así que no sobrevive a un restablecimiento.
 *
 * El contexto de la sesión se vuelve a buscar entre los de la cuenta (ver
 * `perfilDe`). `pedido` es el que mandó el navegador con `update({ contexto })`
 * para cambiar: si es uno de la cuenta, pasa a ser el de la sesión; si no (de
 * otra cuenta, inventado, una membresía que ya no existe), se ignora y la
 * sesión sigue con el suyo, revalidado igual que siempre.
 */
async function revalidar(token: JWT, ahora: number, pedido?: unknown): Promise<JWT> {
  token.revalidadoEn = ahora
  const usuario = token.id ? await buscarUsuario({ id: token.id }) : null

  const revocada =
    !usuario ||
    (!!usuario.sesionesValidasDesde && (token.emitidoEn ?? 0) < usuario.sesionesValidasDesde.getTime())

  if (revocada) return revocar(token)

  const elegido = buscarContexto(contextosDe(usuario), pedido) ? pedido : token.contexto
  Object.assign(token, { id: usuario.id, email: usuario.email }, perfilDe(usuario, elegido))
  return token.businessId ? token : quitarNegocio(token)
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: DURACION_DE_SESION_S },
  pages: { signIn: "/iniciar-sesion" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials, pedido) {
        if (!credentials?.email || !credentials?.password) return null

        const email = normalizarEmail(credentials.email)

        // Lanzar es la forma de que NextAuth devuelva un código propio: la
        // pantalla lo recibe en `?error=` y dice "Demasiados intentos".
        if (!(await quedanIntentosDeLogin(pedido, email))) throw new Error(ERROR_DEMASIADOS_INTENTOS)

        const usuario = await buscarUsuario({ email })

        // Quien se registró con Google no tiene contraseña que comparar. Sin
        // cuenta, o sin contraseña, se compara igual contra el hash ficticio:
        // que la respuesta tarde lo mismo que con una contraseña equivocada.
        if (!usuario?.password) {
          await bcrypt.compare(credentials.password, HASH_FICTICIO)
          return null
        }
        if (!(await bcrypt.compare(credentials.password, usuario.password))) return null

        return {
          id: usuario.id,
          name: usuario.name,
          email: usuario.email,
          ...perfilDe(usuario),
        }
      },
    }),
  ],
  callbacks: {
    // Crea el usuario la primera vez que entra con Google (M1, PRODUCTO.md, sección 5).
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true

      // Sin email verificado, Google no prueba que quien entra sea dueño de la
      // casilla: con eso bastaba para tomar la cuenta de otro.
      if ((profile as { email_verified?: unknown } | undefined)?.email_verified !== true) return false

      try {
        const email = normalizarEmail(user.email!)
        const existente = await prisma.user.findUnique({ where: { email } })

        // Una cuenta con contraseña no se vincula a Google: quien controle ese
        // Gmail no pasa a ser dueño de una cuenta que se creó con correo y
        // contraseña. Se le dice cómo entrar en vez de un error genérico.
        if (existente?.password) return `/iniciar-sesion?error=${ERROR_CUENTA_CON_CONTRASENA}`

        if (!existente) {
          // Sin contraseña: este usuario sólo puede entrar por Google.
          await prisma.user.create({
            data: { name: user.name ?? "Usuario", email, password: "" },
          })
        }
        return true
      } catch {
        return false
      }
    },

    async jwt({ token, user, account, trigger, session }) {
      const ahora = Date.now()

      // Al entrar con Google el token se arma desde la base: es la única
      // fuente confiable del rol y el negocio.
      if (account?.provider === "google") {
        const usuario = await buscarUsuario({ email: normalizarEmail(token.email!) })
        if (usuario) Object.assign(token, { id: usuario.id }, perfilDe(usuario))
        return Object.assign(token, { emitidoEn: ahora, revalidadoEn: ahora })
      }

      // Primer login con credenciales: lo que devolvió `authorize`.
      if (user) {
        return Object.assign(token, {
          id: user.id,
          contexto: user.contexto ?? null,
          contextos: user.contextos ?? 0,
          tieneNegocioPropio: user.tieneNegocioPropio ?? false,
          role: user.role,
          businessId: user.businessId,
          businessName: user.businessName,
          businessSlug: user.businessSlug,
          rubro: user.rubro,
          memberId: user.memberId,
          emitidoEn: ahora,
          revalidadoEn: ahora,
        })
      }

      // Vida máxima absoluta: NextAuth renueva la cookie en cada uso, así que
      // sin esto una sesión activa no vencería nunca. Se cuenta desde que se
      // emitió; un token sin fecha de emisión cuenta como emitido en 0.
      if (ahora - (token.emitidoEn ?? 0) > DURACION_DE_SESION_S * 1000) return revocar(token)

      // Con `update()` (al completar el perfil, al aceptar una invitación, al
      // elegir o cambiar de negocio) se rearma en el acto, con el contexto
      // pedido si vino uno; en cualquier otra lectura, si pasaron más de 5
      // minutos desde la última revisión.
      if (trigger === "update") return revalidar(token, ahora, contextoPedido(session))
      const vencido = !token.revalidadoEn || ahora - token.revalidadoEn >= REVALIDAR_CADA_MS
      if (vencido) return revalidar(token, ahora)

      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id
        session.user.role = token.role ?? null
        session.user.businessId = token.businessId ?? ""
        session.user.businessName = token.businessName ?? ""
        session.user.businessSlug = token.businessSlug ?? ""
        // Una sesión de antes de este campo no lo trae: null, que no es dental
        // (falla cerrado) hasta la próxima revalidación, que lo completa.
        session.user.rubro = token.rubro ?? null
        session.user.memberId = token.memberId ?? null
        session.user.contexto = token.contexto ?? null
        session.user.contextos = token.contextos ?? 0
      }
      return session
    },
  },
}
