import { NextAuthOptions } from "next-auth"
import type { JWT } from "next-auth/jwt"
import CredentialsProvider from "next-auth/providers/credentials"
import GoogleProvider from "next-auth/providers/google"
import { prisma } from "@/lib/prisma"
import type { Rol } from "@/lib/permisos"
import { normalizarEmail } from "@/lib/validaciones"
import bcrypt from "bcryptjs"

/** El usuario con lo necesario para saber en qué negocio entra y con qué rol. */
const CON_NEGOCIO = {
  business: true,
  // La más antigua primero: sin `orderBy`, Postgres puede devolver otra en cada
  // login y quien trabaje en dos negocios entraría a uno distinto cada vez.
  memberships: { include: { business: true }, orderBy: { createdAt: "asc" }, take: 1 },
} as const

type UsuarioConNegocio = NonNullable<
  Awaited<ReturnType<typeof buscarUsuario>>
>

function buscarUsuario(where: { id: string } | { email: string }) {
  return prisma.user.findUnique({ where, include: CON_NEGOCIO })
}

/**
 * Un usuario es dueño si el negocio le pertenece; si no, entra por su membresía.
 * Sin membresía válida cae a `worker`, el rol con menos permisos.
 *
 * El dueño entra a **su** negocio y sin `memberId`, aunque además sea miembro de
 * otro: si se le dejara la membresía ajena, el par `(businessId, memberId)` de la
 * sesión apuntaría a dos negocios distintos y cualquier consulta por `memberId`
 * leería del equivocado.
 */
function perfilDe(usuario: UsuarioConNegocio) {
  const esDueño = !!usuario.business
  const membresia = usuario.memberships[0]
  const negocio = usuario.business ?? membresia?.business ?? null

  return {
    role: (esDueño ? "owner" : membresia?.role === "admin" ? "admin" : "worker") as Rol,
    businessId: negocio?.id ?? null,
    businessName: negocio?.name ?? null,
    businessSlug: negocio?.slug ?? null,
    memberId: esDueño ? null : (membresia?.id ?? null),
  }
}

/**
 * Cada cuánto el token se vuelve a contrastar con la base. Con JWT no hay
 * sesión en el servidor que borrar: sin esta revisión, un miembro eliminado o
 * una contraseña restablecida dejaban la sesión vieja viva hasta que venciera.
 * Cinco minutos es el máximo que alguien conserva un acceso que ya perdió, a
 * cambio de una consulta cada cinco minutos por sesión y no una por petición.
 */
export const REVALIDAR_CADA_MS = 5 * 60 * 1000

/** El código que la pantalla de iniciar sesión traduce (`errores-de-acceso.ts`). */
const ERROR_CUENTA_CON_CONTRASENA = "CuentaConContrasena"

/** Siete días: lo que dura una sesión sin volver a entrar. */
const DURACION_DE_SESION_S = 7 * 24 * 60 * 60

/** Sin negocio no hay rol ni membresía: `actorDeSesion` devuelve null (401) y el proxy manda a completar el perfil. */
function quitarNegocio(token: JWT): JWT {
  token.role = undefined
  token.businessId = null
  token.businessName = null
  token.businessSlug = null
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
 */
async function revalidar(token: JWT, ahora: number): Promise<JWT> {
  token.revalidadoEn = ahora
  const usuario = token.id ? await buscarUsuario({ id: token.id }) : null

  const revocada =
    !usuario ||
    (!!usuario.sesionesValidasDesde && (token.emitidoEn ?? 0) < usuario.sesionesValidasDesde.getTime())

  if (revocada) return revocar(token)

  Object.assign(token, { id: usuario.id, email: usuario.email }, perfilDe(usuario))
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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const usuario = await buscarUsuario({ email: normalizarEmail(credentials.email) })

        // Quien se registró con Google no tiene contraseña que comparar.
        if (!usuario?.password) return null
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

    async jwt({ token, user, account, trigger }) {
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
          role: user.role,
          businessId: user.businessId,
          businessName: user.businessName,
          businessSlug: user.businessSlug,
          memberId: user.memberId,
          emitidoEn: ahora,
          revalidadoEn: ahora,
        })
      }

      // Vida máxima absoluta: NextAuth renueva la cookie en cada uso, así que
      // sin esto una sesión activa no vencería nunca. Se cuenta desde que se
      // emitió; un token sin fecha de emisión cuenta como emitido en 0.
      if (ahora - (token.emitidoEn ?? 0) > DURACION_DE_SESION_S * 1000) return revocar(token)

      // Al completar el perfil ("update") se rearma en el acto; en cualquier
      // otra lectura, si pasaron más de 5 minutos desde la última revisión.
      const vencido = !token.revalidadoEn || ahora - token.revalidadoEn >= REVALIDAR_CADA_MS
      if (trigger === "update" || vencido) return revalidar(token, ahora)

      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id
        session.user.role = token.role ?? null
        session.user.businessId = token.businessId ?? ""
        session.user.businessName = token.businessName ?? ""
        session.user.businessSlug = token.businessSlug ?? ""
        session.user.memberId = token.memberId ?? null
      }
      return session
    },
  },
}
