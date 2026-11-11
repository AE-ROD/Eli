import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { spawnSync } from "node:child_process"
import path from "node:path"

/**
 * Guardas del kit de despliegue en VPS (`deploy/`). Leen los archivos como
 * texto: no prueban que Caddy o systemd funcionen (eso se comprueba en el
 * servidor, ver `deploy/README.md`, paso 12), sino que nadie quite o separe
 * por accidente lo que la seguridad y los crons suponen.
 */

const RAIZ = path.resolve(__dirname, "..")
const leer = (relativa: string) => readFileSync(path.join(RAIZ, relativa), "utf8")

/** El archivo sin las líneas de comentario: un comentario no cuenta como configuración. */
const sinComentarios = (texto: string) =>
  texto
    .split("\n")
    .filter((linea) => !linea.trim().startsWith("#"))
    .join("\n")

/** El contenido (sin las llaves) del primer bloque `{ ... }` que sigue a `inicio`. */
function bloqueDespuesDe(texto: string, inicio: string): string {
  const desde = texto.indexOf(inicio)
  if (desde === -1) return ""
  const abre = texto.indexOf("{", desde)
  if (abre === -1) return ""
  let profundidad = 0
  for (let i = abre; i < texto.length; i++) {
    if (texto[i] === "{") profundidad++
    if (texto[i] === "}") {
      profundidad--
      if (profundidad === 0) return texto.slice(abre + 1, i)
    }
  }
  return ""
}

describe("deploy/Caddyfile — la IP del cliente no la elige el cliente", () => {
  const caddyfile = sinComentarios(leer("deploy/Caddyfile"))
  const proxy = bloqueDespuesDe(caddyfile, "reverse_proxy 127.0.0.1:3000")
  const lineasDelProxy = proxy.split("\n").map((linea) => linea.trim().replace(/\s+/g, " "))

  it("manda el tráfico a la app en 127.0.0.1:3000", () => {
    expect(caddyfile).toMatch(/reverse_proxy 127\.0\.0\.1:3000/)
  })

  it("BORRA X-Vercel-Forwarded-For: obtenerIp lo lee primero y el cliente lo podría inventar", () => {
    expect(lineasDelProxy).toContain("header_up -X-Vercel-Forwarded-For")
  })

  it("FIJA X-Real-IP con la IP de la conexión (no la suma ni la deja pasar)", () => {
    expect(lineasDelProxy).toContain("header_up X-Real-IP {remote_host}")
  })

  it("FIJA X-Forwarded-For con la IP de la conexión", () => {
    expect(lineasDelProxy).toContain("header_up X-Forwarded-For {remote_host}")
  })

  it("no confía en proxies de afuera (trusted_proxies abriría la puerta a cabeceras falsas)", () => {
    expect(caddyfile).not.toMatch(/trusted_proxies/)
  })

  it("no vuelve a sumar (+) ninguna de esas cabeceras", () => {
    expect(caddyfile).not.toMatch(/header_up\s+\+(X-Vercel-Forwarded-For|X-Real-IP|X-Forwarded-For)/i)
  })

  it("cada cabecera que lee obtenerIp está borrada o fijada en el Caddyfile", () => {
    const fuente = leer("lib/rate-limit.ts")
    const funcion = fuente.slice(fuente.indexOf("export function obtenerIp"))
    const cuerpo = funcion.slice(0, funcion.indexOf("\n}\n"))
    const leidas = [...cuerpo.matchAll(/headers\.get\("([^"]+)"\)/g)].map((m) => m[1].toLowerCase())

    // Si esto da vacío, cambió la forma de obtenerIp y esta prueba hay que revisarla.
    expect(leidas.length).toBeGreaterThan(0)

    const tratadas = lineasDelProxy
      .filter((linea) => linea.startsWith("header_up "))
      .map((linea) => linea.split(" ")[1].replace(/^[-+]/, "").toLowerCase())
    for (const cabecera of leidas) {
      expect(tratadas, `obtenerIp lee "${cabecera}" y el Caddyfile no la borra ni la fija`).toContain(cabecera)
    }
  })

  it("redirige el www al dominio sin www, de forma permanente", () => {
    expect(caddyfile).toMatch(/www\.eli\.example\.cl\s*\{\s*redir https:\/\/eli\.example\.cl\{uri\} permanent\s*\}/)
  })

  it("comprime y manda Strict-Transport-Security (Vercel lo ponía solo; la app no)", () => {
    expect(caddyfile).toMatch(/encode\s+zstd\s+gzip/)
    expect(caddyfile).toMatch(/Strict-Transport-Security\s+"max-age=\d+"/)
  })
})

describe("deploy/cron-eli — mismos crons que vercel.json", () => {
  const vercel = JSON.parse(leer("vercel.json")) as { crons: { path: string; schedule: string }[] }
  const lineas = sinComentarios(leer("deploy/cron-eli"))
    .split("\n")
    .map((linea) => linea.trim())
    .filter((linea) => /^\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+/.test(linea))
    .map((linea) => {
      const partes = linea.split(/\s+/)
      return {
        schedule: partes.slice(0, 5).join(" "),
        usuario: partes[5],
        comando: partes.slice(6).join(" "),
      }
    })
  const llamadas = lineas.filter((linea) => linea.comando.includes("llamar-cron.sh"))

  it("vercel.json sigue teniendo crons (si no, esta prueba no compara nada)", () => {
    expect(vercel.crons.length).toBeGreaterThan(0)
  })

  it.each(vercel.crons)("$path corre con el mismo horario que en vercel.json ($schedule)", ({ path: ruta, schedule }) => {
    const encontrada = llamadas.find((linea) => linea.comando.endsWith(` ${ruta}`))
    expect(encontrada, `falta ${ruta} en deploy/cron-eli`).toBeDefined()
    expect(encontrada!.schedule).toBe(schedule)
  })

  it("no programa ningún cron que vercel.json no tenga (evita correos de más)", () => {
    const rutasDeVercel = vercel.crons.map((cron) => cron.path)
    for (const llamada of llamadas) {
      const ruta = llamada.comando.split(" ").pop()!
      expect(rutasDeVercel, `${ruta} está en deploy/cron-eli pero no en vercel.json`).toContain(ruta)
    }
  })

  it("los crons corren como el usuario eli, no como root", () => {
    for (const linea of lineas) expect(linea.usuario).toBe("eli")
  })

  it("llamar-cron.sh sólo acepta rutas de cron que existen en app/api/cron", () => {
    const carpetas = readdirSync(path.join(RAIZ, "app/api/cron"))
    const script = leer("deploy/llamar-cron.sh")
    const permitidas = [...script.matchAll(/\/api\/cron\/([a-z-]+)/g)].map((m) => m[1])
    for (const nombre of new Set(permitidas)) expect(carpetas).toContain(nombre)
    for (const cron of vercel.crons) expect(script).toContain(cron.path)
  })

  it("llamar-cron.sh manda el secreto como Authorization: Bearer, lo que valida lib/cron.ts, y no por argumentos", () => {
    const script = sinComentarios(leer("deploy/llamar-cron.sh"))
    expect(leer("lib/cron.ts")).toContain("`Bearer ${secreto}`")
    expect(script).toContain("Authorization: Bearer")
    expect(script).toContain("--config -")
    expect(script).not.toMatch(/curl[^\n]*-H\s/)
    expect(script).not.toMatch(/curl[^\n]*--header/)
  })
})

describe("deploy/README.md — las variables de entorno", () => {
  /** Todos los archivos .ts/.tsx/.mjs bajo `carpeta`, sin las pruebas. */
  function fuentes(carpeta: string): string[] {
    return readdirSync(path.join(RAIZ, carpeta)).flatMap((nombre) => {
      const relativa = `${carpeta}/${nombre}`
      if (statSync(path.join(RAIZ, relativa)).isDirectory()) return fuentes(relativa)
      return /\.(ts|tsx|mjs)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) ? [relativa] : []
    })
  }

  it("lista todas las variables que lee el código (app/, lib/, proxy.ts, prisma.config.ts, esquema)", () => {
    const archivos = [...fuentes("app"), ...fuentes("lib"), "proxy.ts", "prisma.config.ts", "prisma/schema.prisma"]
    const usadas = new Set<string>()
    for (const archivo of archivos) {
      const texto = leer(archivo)
      for (const m of texto.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) usadas.add(m[1])
      for (const m of texto.matchAll(/\benv\("([A-Z][A-Z0-9_]*)"\)/g)) usadas.add(m[1])
    }
    expect(usadas.size).toBeGreaterThan(5)

    const guia = leer("deploy/README.md")
    for (const variable of usadas) {
      expect(guia, `deploy/README.md no menciona ${variable}`).toContain(`\`${variable}\``)
    }
  })

  it("la plantilla de /etc/eli/eli.env trae las obligatorias", () => {
    const guia = leer("deploy/README.md")
    for (const variable of ["NODE_ENV", "DATABASE_URL", "DIRECT_URL", "NEXTAUTH_URL", "NEXTAUTH_SECRET", "CRON_SECRET", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
      expect(guia).toMatch(new RegExp(`^${variable}=`, "m"))
    }
  })
})

describe("deploy/eli.service", () => {
  const unidad = sinComentarios(leer("deploy/eli.service"))

  it("corre como eli, con las variables de /etc/eli/eli.env, y sólo escucha en local", () => {
    expect(unidad).toMatch(/^User=eli$/m)
    expect(unidad).toMatch(/^EnvironmentFile=\/etc\/eli\/eli\.env$/m)
    expect(unidad).toMatch(/next start -H 127\.0\.0\.1 -p 3000/)
  })

  it("se reinicia solo", () => {
    expect(unidad).toMatch(/^Restart=always$/m)
    expect(unidad).toMatch(/^RestartSec=\d+$/m)
  })

  it("no activa MemoryDenyWriteExecute (rompería V8) y sí NoNewPrivileges", () => {
    expect(unidad).not.toMatch(/^MemoryDenyWriteExecute=yes$/m)
    expect(unidad).toMatch(/^NoNewPrivileges=yes$/m)
  })
})

describe("deploy/*.sh", () => {
  const scripts = readdirSync(path.join(RAIZ, "deploy")).filter((nombre) => nombre.endsWith(".sh"))
  const hayShellcheck = spawnSync("shellcheck", ["--version"]).status === 0

  it("hay scripts que revisar", () => {
    expect(scripts).toEqual(
      expect.arrayContaining(["actualizar.sh", "volver-atras.sh", "respaldo.sh", "llamar-cron.sh", "probar-restauracion.sh"])
    )
  })

  it.each(scripts)("%s pasa bash -n y arranca con set -euo pipefail", (nombre) => {
    const ruta = path.join(RAIZ, "deploy", nombre)
    const resultado = spawnSync("bash", ["-n", ruta], { encoding: "utf8" })
    expect(resultado.stderr).toBe("")
    expect(resultado.status).toBe(0)
    if (nombre !== "lib-entorno.sh") expect(leer(`deploy/${nombre}`)).toMatch(/^set -euo pipefail$/m)
  })

  it.skipIf(!hayShellcheck).each(scripts)("%s pasa shellcheck", (nombre) => {
    const resultado = spawnSync("shellcheck", ["--severity=warning", "-x", path.join(RAIZ, "deploy", nombre)], { encoding: "utf8" })
    expect(resultado.stdout).toBe("")
    expect(resultado.status).toBe(0)
  })

  it("actualizar.sh nunca aplica migraciones ni toca el esquema (el contrato del proyecto lo prohíbe)", () => {
    const codigo = sinComentarios(leer("deploy/actualizar.sh"))
    expect(codigo).not.toMatch(/prisma\s+(migrate\s+(deploy|reset|dev)|db\s+(push|execute))/)
    expect(codigo).not.toMatch(/psql[^\n]*\s-f\s/)
    expect(codigo).toContain("YA APLIQUE LAS MIGRACIONES")
  })

  it("actualizar.sh no instala con NODE_ENV=production (npm omitiría typescript, tailwind y prisma)", () => {
    const codigo = sinComentarios(leer("deploy/actualizar.sh"))
    expect(codigo).toMatch(/env -u NODE_ENV/)
  })

  it("ningún script pasa contraseñas por la línea de comandos", () => {
    for (const nombre of scripts) {
      const codigo = sinComentarios(leer(`deploy/${nombre}`))
      expect(codigo, nombre).not.toMatch(/(pg_dump|pg_restore|psql)[^\n]*(postgres(ql)?:\/\/|\$\{?(DIRECT_URL|DATABASE_URL))/)
      expect(codigo, nombre).not.toMatch(/PGPASSWORD=/)
    }
  })
})
