import type { Metadata } from "next"
import Link from "next/link"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { Antetitulo } from "@/components/comunes/antetitulo"
import { Boton } from "@/components/comunes/boton"
import { LogoEli } from "@/components/comunes/logo-eli"
import { CentroDeAyuda } from "@/components/soporte/centro-de-ayuda"

export const metadata: Metadata = {
  title: "Centro de ayuda — Eli",
  description:
    "Preguntas frecuentes sobre Eli y contacto con soporte: reporta una falla, haz un reclamo o haz una consulta y te respondemos por correo.",
}

/**
 * El centro de ayuda público: para quien no tiene cuenta o no puede entrar.
 * Sin sesión, el formulario pide nombre y correo, y se sugiere entrar al panel
 * para que sepamos de qué negocio escribe. Con sesión, se comporta como el del
 * panel.
 */
export default async function PaginaSoporte() {
  const session = await getServerSession(authOptions)
  // Con sesión, el servidor toma de ella quién escribe (`POST /api/soporte`):
  // el formulario no pide nombre ni correo, igual que en el panel.
  const conSesion = Boolean(session?.user?.id)

  return (
    <div className="flex min-h-dvh flex-col bg-crema text-navy">
      <a
        href="#contenido"
        className="fixed top-4 left-4 z-[110] inline-flex h-12 -translate-y-[calc(100%+2rem)] items-center rounded-boton bg-navy px-5 font-medium text-white shadow-md squircle anillo-foco focus:translate-y-0"
      >
        Saltar al contenido
      </a>

      <header className="contenedor flex h-[68px] shrink-0 items-center justify-between gap-3 pr-4 pl-4 md:h-20 md:px-10">
        <Link
          href="/"
          aria-label="Eli, ir al inicio"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[12px] px-1.5 anillo-foco"
        >
          <LogoEli tamaño="md" />
        </Link>
        {conSesion ? (
          <Boton href="/dashboard" variante="secundario" tamano="sm">
            Ir al panel
          </Boton>
        ) : (
          <Boton href="/iniciar-sesion" variante="secundario" tamano="sm">
            Iniciar sesión
          </Boton>
        )}
      </header>

      <main id="contenido" className="flex-1 px-4 pt-4 pb-16 md:px-10 md:pt-10">
        <div className="mx-auto w-full max-w-4xl">
          <Antetitulo>Soporte</Antetitulo>
          <h1 className="titulo-seccion mt-3 text-balance">Centro de ayuda</h1>
          <p className="mt-3 max-w-2xl text-pretty text-texto-2">
            {conSesion ? (
              <>
                Tienes una sesión abierta: te responderemos al correo de tu cuenta. También puedes escribirnos
                desde la{" "}
                <Link href="/dashboard/ayuda" className="font-medium text-navy underline underline-offset-4 anillo-foco rounded-sm">
                  ayuda del panel
                </Link>
                .
              </>
            ) : (
              <>
                ¿Tienes cuenta?{" "}
                <Link href="/iniciar-sesion" className="font-medium text-navy underline underline-offset-4 anillo-foco rounded-sm">
                  Entra al panel
                </Link>{" "}
                y escríbenos desde Ayuda: así sabremos de qué negocio nos escribes.
              </>
            )}
          </p>

          <div className="mt-10 md:mt-12">
            <CentroDeAyuda conSesion={conSesion} emailDeSesion={session?.user?.email || undefined} />
          </div>
        </div>
      </main>

      <footer className="contenedor flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-borde px-4 py-6 text-sm text-texto-2 md:px-10">
        <span>© {new Date().getFullYear()} Eli</span>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-sm underline-offset-4 anillo-foco hover:text-navy hover:underline">
          Volver a la página de inicio
        </Link>
      </footer>
    </div>
  )
}
