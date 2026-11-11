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

/** Una línea con los espacios normalizados (tabs y dobles espacios → uno). */
const normalizar = (linea: string) => linea.trim().replace(/\s+/g, " ")

/** Posición del `}` que cierra el `{` que está en `abre`, o -1. */
function cierreDe(texto: string, abre: number): number {
  let profundidad = 0
  for (let i = abre; i < texto.length; i++) {
    if (texto[i] === "{") profundidad++
    if (texto[i] === "}") {
      profundidad--
      if (profundidad === 0) return i
    }
  }
  return -1
}

/**
 * El cuerpo (sin las llaves) de la función `nombre` de un archivo TypeScript:
 * salta los paréntesis de los parámetros y del tipo (que pueden traer `{ ... }`)
 * y toma el primer bloque que sigue.
 */
function cuerpoDeFuncion(fuente: string, nombre: string): string {
  const inicio = fuente.search(new RegExp(`(?:function|const|let)\\s+${nombre}\\b`))
  expect(inicio, `no encuentro la función ${nombre}`).toBeGreaterThan(-1)
  const abreParametros = fuente.indexOf("(", inicio)
  let profundidad = 0
  let cierraParametros = -1
  for (let i = abreParametros; i < fuente.length; i++) {
    if (fuente[i] === "(") profundidad++
    if (fuente[i] === ")") {
      profundidad--
      if (profundidad === 0) {
        cierraParametros = i
        break
      }
    }
  }
  const abre = fuente.indexOf("{", cierraParametros)
  const cierra = cierreDe(fuente, abre)
  expect(cierra, `no encuentro el final de ${nombre}`).toBeGreaterThan(abre)
  return fuente.slice(abre + 1, cierra)
}

// ---------------------------------------------------------------------------
// Un lector mínimo de Caddyfile: bloques anidados `algo { ... }` y directivas.
// Alcanza para saber QUÉ directiva está dentro de QUÉ bloque (no sólo que el
// texto exista en algún lado del archivo).
// ---------------------------------------------------------------------------

interface NodoCaddy {
  cabecera: string
  contenido: (string | NodoCaddy)[]
}

function leerCaddyfile(texto: string): NodoCaddy {
  const raiz: NodoCaddy = { cabecera: "", contenido: [] }
  const pila: NodoCaddy[] = [raiz]
  for (const cruda of sinComentarios(texto).split("\n")) {
    const linea = normalizar(cruda)
    if (!linea) continue
    const actual = pila[pila.length - 1]
    if (linea === "}") {
      expect(pila.length, "Caddyfile con una } de más").toBeGreaterThan(1)
      pila.pop()
    } else if (linea === "{" || /\s\{$/.test(linea)) {
      const nodo: NodoCaddy = { cabecera: linea === "{" ? "" : linea.slice(0, -1).trim(), contenido: [] }
      actual.contenido.push(nodo)
      pila.push(nodo)
    } else {
      actual.contenido.push(linea)
    }
  }
  expect(pila.length, "Caddyfile con un { sin cerrar").toBe(1)
  return raiz
}

const directivasDe = (nodo: NodoCaddy) => nodo.contenido.filter((c): c is string => typeof c === "string")
const bloquesDe = (nodo: NodoCaddy) => nodo.contenido.filter((c): c is NodoCaddy => typeof c !== "string")
const bloqueLlamado = (nodo: NodoCaddy, cabecera: string | RegExp) =>
  bloquesDe(nodo).find((b) => (typeof cabecera === "string" ? b.cabecera === cabecera : cabecera.test(b.cabecera)))

/** Todas las líneas `header_up ...` de un nodo y sus hijos, en orden de aparición. */
function headerUpEnOrden(nodo: NodoCaddy): string[] {
  return nodo.contenido.flatMap((c) => (typeof c === "string" ? (c.startsWith("header_up ") ? [c] : []) : headerUpEnOrden(c)))
}

/** Para cada cabecera, la ÚLTIMA instrucción header_up (la que gana en Caddy). */
function ultimaOperacionPorCabecera(lineas: string[]): Map<string, string> {
  const mapa = new Map<string, string>()
  for (const linea of lineas) {
    const [, operacion, ...valor] = linea.split(" ")
    mapa.set(operacion.replace(/^[-+]/, "").toLowerCase(), [operacion.startsWith("-") ? "-" : operacion.startsWith("+") ? "+" : "=", ...valor].join(" ").trim())
  }
  return mapa
}

describe("deploy/Caddyfile — la IP del cliente no la elige el cliente", () => {
  const texto = leer("deploy/Caddyfile")
  const caddyfile = sinComentarios(texto)
  const arbol = leerCaddyfile(texto)
  const www = bloqueLlamado(arbol, "www.eliagenda.com")
  const sitio = bloqueLlamado(arbol, "eliagenda.com")
  const proxy = sitio && bloqueLlamado(sitio, "reverse_proxy 127.0.0.1:3000")
  const delProxy = proxy ? headerUpEnOrden(proxy) : []
  const ultimas = ultimaOperacionPorCabecera(delProxy)

  it("define los dos sitios (www y el dominio sin www) y el reverse_proxy dentro del segundo", () => {
    expect(www, "falta el bloque de www.eliagenda.com").toBeDefined()
    expect(sitio, "falta el bloque de eliagenda.com").toBeDefined()
    expect(proxy, "falta 'reverse_proxy 127.0.0.1:3000 { ... }' dentro de eliagenda.com").toBeDefined()
    expect(caddyfile).toMatch(/reverse_proxy 127\.0\.0\.1:3000/)
  })

  it("cada sitio escucha SÓLO en IPv4 (bind 0.0.0.0): en IPv6 un atacante rota dentro de su /64 y se salta el límite", () => {
    // Todos los bloques de sitio (cabecera con un dominio), no el de opciones globales.
    const sitios = bloquesDe(arbol).filter((b) => b.cabecera !== "")
    expect(sitios.length).toBeGreaterThanOrEqual(2)
    for (const s of sitios) {
      expect(directivasDe(s), `el sitio ${s.cabecera} no tiene 'bind 0.0.0.0'`).toContain("bind 0.0.0.0")
    }
    // Y nada que vuelva a abrir IPv6 en ningún lado.
    expect(caddyfile).not.toMatch(/\bbind\b[^\n]*(::|\[)/)
    expect(caddyfile).not.toMatch(/\bdefault_bind\b[^\n]*::/)
    for (const linea of caddyfile.split("\n").map(normalizar)) {
      if (linea.startsWith("bind ")) expect(linea).toBe("bind 0.0.0.0")
    }
  })

  it("la última instrucción sobre x-vercel-forwarded-for es BORRARLA: obtenerIp la lee primero y el cliente la podría inventar", () => {
    expect(ultimas.get("x-vercel-forwarded-for")).toBe("-")
  })

  it("la última instrucción sobre X-Real-IP es FIJARLA con la IP de la conexión (un segundo header_up posterior la pisaría)", () => {
    expect(ultimas.get("x-real-ip")).toBe("= {remote_host}")
  })

  it("la última instrucción sobre X-Forwarded-For es FIJARLA con la IP de la conexión", () => {
    expect(ultimas.get("x-forwarded-for")).toBe("= {remote_host}")
  })

  it("no hay header_up (ni request_header) sobre esas cabeceras fuera del bloque del proxy", () => {
    const enElProxy = new Set(delProxy)
    const todas = caddyfile.split("\n").map(normalizar)
    for (const linea of todas.filter((l) => l.startsWith("header_up "))) {
      expect(enElProxy.has(linea), `header_up fuera de reverse_proxy: ${linea}`).toBe(true)
    }
    expect(todas.filter((l) => /^request_header\b.*\b(x-vercel-forwarded-for|x-real-ip|x-forwarded-for)\b/i.test(l))).toEqual([])
  })

  it("no confía en proxies de afuera (trusted_proxies / client_ip_headers abrirían la puerta a cabeceras falsas)", () => {
    expect(caddyfile).not.toMatch(/trusted_proxies/)
    expect(caddyfile).not.toMatch(/client_ip_headers/)
  })

  it("no vuelve a sumar (+) ninguna de esas cabeceras", () => {
    expect(caddyfile).not.toMatch(/header_up\s+\+(X-Vercel-Forwarded-For|X-Real-IP|X-Forwarded-For)/i)
  })

  it("cada cabecera de IP que lee obtenerIp (comillas dobles, simples, constantes, has/get) está borrada o fijada en el Caddyfile", () => {
    const fuente = leer("lib/rate-limit.ts")
    const cuerpo = cuerpoDeFuncion(fuente, "obtenerIp")
    const leidas = new Set<string>()

    // (a) lo que se le pasa a .get( / .has(: literal con cualquier comilla, o una constante del archivo.
    for (const m of cuerpo.matchAll(/\.(?:get|has)\(\s*([^)]*?)\s*\)/g)) {
      const argumento = m[1]
      const literal = argumento.match(/^(["'`])([^"'`$]+)\1$/)
      if (literal) {
        leidas.add(literal[2].toLowerCase())
        continue
      }
      const constante = argumento.match(/^[A-Za-z_$][\w$]*$/)
        ? fuente.match(new RegExp(`(?:const|let|var)\\s+${argumento.replace(/\$/g, "\\$")}\\s*(?::[^=]+)?=\\s*(["'\`])([^"'\`]+)\\1`))
        : null
      if (constante) leidas.add(constante[2].toLowerCase())
      else leidas.add(`NO-SE-PUDO-RESOLVER(${argumento})`)
    }
    // (b) red de seguridad: cualquier texto entre comillas con pinta de cabecera de IP, esté donde esté.
    for (const m of cuerpo.matchAll(/(["'`])((?:x-|cf-|true-client|forwarded|fastly-|fly-|client-ip|x_)[a-z0-9_-]*)\1/gi)) {
      leidas.add(m[2].toLowerCase())
    }

    // Si esto da vacío o dice NO-SE-PUDO-RESOLVER, cambió la forma de obtenerIp: revisar esta prueba y el Caddyfile.
    expect(leidas.size).toBeGreaterThan(0)
    expect([...leidas].filter((c) => c.startsWith("no-se-pudo") || c.startsWith("NO-SE-PUDO"))).toEqual([])
    for (const cabecera of leidas) {
      const operacion = ultimas.get(cabecera)
      expect(operacion, `obtenerIp lee "${cabecera}" y el Caddyfile no la borra ni la fija`).toBeDefined()
      expect(["-", "= {remote_host}"], `"${cabecera}": el Caddyfile la deja en "${operacion}"`).toContain(operacion)
    }
  })

  it("el www redirige al dominio sin www, de forma permanente (y sólo eso)", () => {
    expect(directivasDe(www!).filter((d) => d !== "bind 0.0.0.0")).toEqual(["redir https://eliagenda.com{uri} permanent"])
  })

  it("comprime con zstd y gzip DENTRO del sitio principal", () => {
    expect(directivasDe(sitio!)).toContain("encode zstd gzip")
  })

  it("limita el cuerpo del pedido (request_body max_size) dentro del sitio principal", () => {
    const bloque = bloqueLlamado(sitio!, "request_body")
    expect(bloque, "falta request_body { ... } dentro de eliagenda.com").toBeDefined()
    expect(directivasDe(bloque!)).toEqual(["max_size 6MB"])
  })

  it("manda Strict-Transport-Security y quita Server dentro de header { ... } del sitio principal (Vercel ponía HSTS solo; la app no)", () => {
    const bloque = bloqueLlamado(sitio!, "header")
    expect(bloque, "falta header { ... } dentro de eliagenda.com").toBeDefined()
    const dentro = directivasDe(bloque!)
    expect(dentro).toContain('Strict-Transport-Security "max-age=31536000"')
    expect(dentro).toContain("-Server")
  })

  it("cierra /api/cron/* con un 404 ANTES del proxy (los crons llaman directo a 127.0.0.1:3000)", () => {
    const directivas = directivasDe(sitio!)
    const matcher = directivas.find((d) => d.startsWith("@cron path "))
    expect(matcher, "falta '@cron path /api/cron /api/cron/*'").toBeDefined()
    expect(matcher!.split(" ").slice(2)).toEqual(expect.arrayContaining(["/api/cron/*"]))
    expect(directivas).toContain("respond @cron 404")
    // El orden de Caddy ejecuta respond antes que reverse_proxy, pero que el archivo lo diga también evita malentendidos.
    const orden = sitio!.contenido.map((c) => (typeof c === "string" ? c : c.cabecera))
    expect(orden.indexOf("respond @cron 404")).toBeGreaterThan(-1)
    expect(orden.indexOf("respond @cron 404")).toBeLessThan(orden.indexOf("reverse_proxy 127.0.0.1:3000"))
  })
})

describe("deploy/cron-eli — mismos crons que vercel.json", () => {
  const vercel = JSON.parse(leer("vercel.json")) as { crons: { path: string; schedule: string }[] }
  const lineasDelArchivo = sinComentarios(leer("deploy/cron-eli"))
    .split("\n")
    .map((linea) => linea.trim())
    .filter(Boolean)
  const variables = lineasDelArchivo.filter((linea) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(linea))
  const lineas = lineasDelArchivo
    .filter((linea) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(linea))
    .map((linea) => {
      const partes = linea.split(/\s+/)
      return {
        crudo: linea,
        schedule: partes.slice(0, 5).join(" "),
        usuario: partes[5],
        comando: partes.slice(6).join(" "),
      }
    })
  const llamadas = lineas.filter((linea) => linea.comando.includes("llamar-cron.sh"))

  it("vercel.json sigue teniendo crons (si no, esta prueba no compara nada)", () => {
    expect(vercel.crons.length).toBeGreaterThan(0)
  })

  it("toda línea que no es una variable es un horario de 5 campos numéricos + usuario + comando (nada de @daily, @reboot ni alias)", () => {
    expect(lineas.length).toBeGreaterThan(0)
    for (const linea of lineas) {
      expect(linea.crudo, "alias de cron no permitido").not.toMatch(/^@/)
      const campos = linea.crudo.split(/\s+/)
      expect(campos.length, `línea de cron incompleta: ${linea.crudo}`).toBeGreaterThanOrEqual(7)
      for (const campo of campos.slice(0, 5)) expect(campo, `campo de horario raro en: ${linea.crudo}`).toMatch(/^[0-9*/,-]+$/)
    }
  })

  it("fija CRON_TZ=UTC (los 13:00 son UTC), SHELL, PATH y MAILTO vacío ANTES del primer horario", () => {
    expect(variables).toContain("CRON_TZ=UTC")
    expect(variables).toContain("SHELL=/bin/bash")
    expect(variables.some((v) => v.startsWith("PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"))).toBe(true)
    expect(variables).toContain('MAILTO=""')
    const crudo = sinComentarios(leer("deploy/cron-eli")).split("\n")
    const primerHorario = crudo.findIndex((l) => /^\d/.test(l.trim()))
    for (const nombre of ["CRON_TZ=UTC", 'MAILTO=""']) {
      expect(crudo.findIndex((l) => l.trim() === nombre), `${nombre} debe ir antes del primer horario`).toBeLessThan(primerHorario)
    }
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

  it("el respaldo nocturno está programado (06:30 UTC, antes del reinicio automático de las 07:00)", () => {
    const respaldo = lineas.find((linea) => linea.comando.endsWith("/respaldo.sh"))
    expect(respaldo, "falta el respaldo en deploy/cron-eli").toBeDefined()
    expect(respaldo!.schedule).toBe("30 6 * * *")
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

  it("llamar-cron.sh y respaldo.sh avisan por correo al fallar, y el aviso usa la API de Resend sin la clave en la línea de comandos", () => {
    for (const nombre of ["llamar-cron.sh", "respaldo.sh"]) {
      expect(sinComentarios(leer(`deploy/${nombre}`)), nombre).toMatch(/avisar_por_correo/)
    }
    const lib = sinComentarios(leer("deploy/lib-entorno.sh"))
    expect(lib).toContain("https://api.resend.com/emails")
    expect(lib).toContain("--config -")
    expect(lib).not.toMatch(/curl[^\n]*(-H\s|--header)/)
    for (const variable of ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "SOPORTE_EMAIL"]) expect(lib).toContain(variable)
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

describe("deploy/README.md — lo que la seguridad y la recuperación suponen", () => {
  const guia = leer("deploy/README.md")

  it("instala el sudoers validando ANTES con visudo -cf sobre un temporal, y con install -m 440", () => {
    expect(guia).toContain("visudo -cf")
    expect(guia).toMatch(/install -m 440 -o root -g root/)
    expect(guia, "ya no se escribe el sudoers con tee directo sobre /etc/sudoers.d").not.toMatch(/tee \/etc\/sudoers\.d/)
  })

  it("el paso 12.7 NO ejecuta los recordatorios reales antes de la mudanza (sólo prueba el 401)", () => {
    const desde = guia.indexOf("**12.7")
    const hasta = guia.indexOf("**12.8")
    expect(desde).toBeGreaterThan(-1)
    expect(hasta).toBeGreaterThan(desde)
    expect(guia.slice(desde, hasta)).not.toMatch(/llamar-cron\.sh/)
  })

  it("explica el chequeo de IPv6, la protección de main, la contraseña fuerte de eli y el --ignore-scripts", () => {
    for (const texto of ["ip -6 addr show scope global", "Settings", "openssl rand -base64 24", "--ignore-scripts", "equivale a root", "bind 0.0.0.0"]) {
      expect(guia, `falta en la guía: ${texto}`).toContain(texto)
    }
  })

  it("usa el dominio real eliagenda.com (sin marcadores): IP, NEXTAUTH_URL, URI de Google, DNS y Resend", () => {
    expect(guia).not.toMatch(/example\.cl/)
    expect(guia).not.toMatch(/prueba\.eliagenda/)
    expect(guia).toMatch(/^NEXTAUTH_URL=https:\/\/eliagenda\.com$/m)
    expect(guia).toContain("https://eliagenda.com/api/auth/callback/google")
    expect(guia).toContain("187.41.114.36")
    expect(guia).toMatch(/\| CNAME \| `www` \| `eliagenda\.com` \|/)
    expect(guia).toMatch(/\| A \| `@` \| `187\.41\.114\.36` \|/)
    for (const texto of ["SPF", "DKIM", "DMARC", "no-reply@eliagenda.com"]) expect(guia, texto).toContain(texto)
    expect(leer("deploy/Caddyfile")).not.toMatch(/example\.cl/)
  })

  it("trae el runbook de restauración real y la advertencia de datos de salud sin cifrar", () => {
    expect(guia).toMatch(/pg_restore --no-owner --no-privileges --exit-on-error --dbname/)
    expect(guia).toMatch(/Ley 20\.584/)
    expect(guia).toMatch(/FileVault/)
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

  it("tiene límite de arranques (StartLimit*): por eso el reinicio de los scripts tiene que hacer reset-failed antes", () => {
    expect(unidad).toMatch(/^StartLimitIntervalSec=\d+$/m)
    expect(unidad).toMatch(/^StartLimitBurst=\d+$/m)
    for (const nombre of ["actualizar.sh", "volver-atras.sh"]) {
      const codigo = sinComentarios(leer(`deploy/${nombre}`))
      const reinicio = codigo.match(/CMD_REINICIAR="\$\{ELI_CMD_REINICIAR:-([^}]*)\}"/)
      expect(reinicio, `${nombre}: no encuentro el CMD_REINICIAR por defecto`).not.toBeNull()
      expect(reinicio![1], nombre).toMatch(/systemctl reset-failed eli;\s*sudo -n systemctl restart eli/)
    }
  })

  it("no activa MemoryDenyWriteExecute (rompería V8) y sí NoNewPrivileges", () => {
    expect(unidad).not.toMatch(/^MemoryDenyWriteExecute=yes$/m)
    expect(unidad).toMatch(/^NoNewPrivileges=yes$/m)
  })

  it("el proceso de Eli no ve los respaldos (InaccessiblePaths) y no declara grupos extra (SupplementaryGroups vacío)", () => {
    expect(unidad).toMatch(/^InaccessiblePaths=-?\/var\/backups\/eli$/m)
    expect(unidad).toMatch(/^SupplementaryGroups=$/m)
    // Nadie vuelve a darle permiso de escritura sobre los respaldos.
    expect(unidad).not.toMatch(/^ReadWritePaths=.*\/var\/backups/m)
  })
})

describe("deploy/sudoers-eli — lo único que eli puede hacer como root", () => {
  const archivo = leer("deploy/sudoers-eli")
  const reglas = sinComentarios(archivo)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
  const comandosPermitidos = ["/usr/bin/systemctl reset-failed eli", "/usr/bin/systemctl restart eli"]

  it("tiene exactamente una regla, para el usuario eli, como root, sin contraseña", () => {
    expect(reglas).toHaveLength(1)
    expect(reglas[0]).toMatch(/^eli ALL=\(root\) NOPASSWD: \//)
  })

  it("permite SOLO restart eli y reset-failed eli (rutas absolutas, argumentos exactos)", () => {
    const comandos = reglas[0].replace(/^eli ALL=\(root\) NOPASSWD:\s*/, "").split(",").map((c) => c.trim())
    expect([...comandos].sort()).toEqual([...comandosPermitidos].sort())
  })

  it("no usa comodines ni ALL como comando, ni abre una shell o un editor", () => {
    expect(reglas.join("\n")).not.toMatch(/[*?]/)
    expect(reglas[0].replace(/^eli ALL=\(root\) NOPASSWD:/, "")).not.toMatch(/\bALL\b/)
    expect(reglas.join("\n")).not.toMatch(/\b(sh|bash|su|vi|vim|nano|less|env)\b(?!\w)/)
    expect(archivo).not.toMatch(/!authenticate|SETENV/)
  })

  it("cada 'sudo -n systemctl ...' de los scripts está permitido por el sudoers (si no, fallaría en el VPS)", () => {
    const usados = new Set<string>()
    for (const nombre of readdirSync(path.join(RAIZ, "deploy")).filter((n) => n.endsWith(".sh"))) {
      for (const m of sinComentarios(leer(`deploy/${nombre}`)).matchAll(/sudo -n systemctl (\S+) (\S+)/g)) {
        usados.add(`/usr/bin/systemctl ${m[1].replace(/[";')}]+$/, "")} ${m[2].replace(/[";')}]+$/, "")}`)
      }
    }
    expect(usados.size).toBeGreaterThan(0)
    for (const comando of usados) expect(comandosPermitidos, `un script usa 'sudo -n ${comando.replace("/usr/bin/", "")}' y deploy/sudoers-eli no lo permite`).toContain(comando)
  })

  it("la guía lo instala desde deploy/sudoers-eli hacia /etc/sudoers.d/eli (sin punto en el nombre)", () => {
    const guia = leer("deploy/README.md")
    expect(guia).toMatch(/\/etc\/sudoers\.d\/eli(?![\w.-])/)
    expect(guia).toContain("deploy/sudoers-eli")
  })

  const hayVisudo = spawnSync("visudo", ["--version"]).status === 0
  it.skipIf(!hayVisudo)("visudo -cf lo acepta", () => {
    const resultado = spawnSync("visudo", ["-cf", path.join(RAIZ, "deploy/sudoers-eli")], { encoding: "utf8" })
    expect(resultado.stdout + resultado.stderr).toContain("parsed OK")
    expect(resultado.status).toBe(0)
  })
  if (!hayVisudo) {
    console.warn("[deploy] visudo NO está instalado: se salta la prueba 'visudo -cf lo acepta' (la sintaxis del sudoers sólo se valida por texto).")
  }
})

describe("deploy/*.sh", () => {
  const scripts = readdirSync(path.join(RAIZ, "deploy")).filter((nombre) => nombre.endsWith(".sh"))
  const hayShellcheck = spawnSync("shellcheck", ["--version"]).status === 0

  it("hay scripts que revisar", () => {
    expect(scripts).toEqual(
      expect.arrayContaining(["actualizar.sh", "volver-atras.sh", "respaldo.sh", "llamar-cron.sh", "probar-restauracion.sh", "probar-cabeceras.sh", "lib-entorno.sh"])
    )
  })

  it.each(scripts)("%s pasa bash -n y arranca con set -euo pipefail", (nombre) => {
    const ruta = path.join(RAIZ, "deploy", nombre)
    const resultado = spawnSync("bash", ["-n", ruta], { encoding: "utf8" })
    expect(resultado.stderr).toBe("")
    expect(resultado.status).toBe(0)
    if (nombre !== "lib-entorno.sh") expect(leer(`deploy/${nombre}`)).toMatch(/^set -euo pipefail$/m)
  })

  /**
   * shellcheck NO viene en todas las máquinas. Si falta, estas pruebas se
   * SALTAN (vitest las cuenta como "skipped") y aquí se avisa en voz alta, para
   * que un verde sin shellcheck no pase por una revisión completa. Para exigirlo
   * (por ejemplo en CI): ELI_EXIGIR_SHELLCHECK=1 npx vitest run deploy/
   */
  it("shellcheck está instalado (o se declara que se salta)", () => {
    if (hayShellcheck) return
    const mensaje = "[deploy] shellcheck NO está instalado: se SALTAN las pruebas de shellcheck de los .sh (instálalo: sudo apt install shellcheck, o pip install shellcheck-py)."
    console.warn(mensaje)
    if (process.env.ELI_EXIGIR_SHELLCHECK) throw new Error(mensaje)
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

  it("actualizar.sh instala con --ignore-scripts y genera el cliente de Prisma aparte (los scripts de las dependencias no corren)", () => {
    const codigo = sinComentarios(leer("deploy/actualizar.sh"))
    expect(codigo).toMatch(/CMD_INSTALAR="\$\{ELI_CMD_INSTALAR:-npm ci [^}]*--ignore-scripts[^}]*\}"/)
    expect(codigo).toMatch(/CMD_COMPILAR="\$\{ELI_CMD_COMPILAR:-npx prisma generate && npm run build\}"/)
  })

  it("actualizar.sh y volver-atras.sh se niegan a correr como root", () => {
    for (const nombre of ["actualizar.sh", "volver-atras.sh"]) {
      const codigo = sinComentarios(leer(`deploy/${nombre}`))
      expect(codigo, nombre).toMatch(/id -u\)" -eq 0 && -z "\$\{ELI_PERMITIR_ROOT:-\}"/)
    }
  })

  it("la comprobación de salud es una sola (lib-entorno.sh), revisa la URL extra y la usan los dos scripts", () => {
    const lib = sinComentarios(leer("deploy/lib-entorno.sh"))
    expect(lib).toMatch(/esperar_salud\(\)/)
    expect(lib).toContain("ELI_URL_SALUD_EXTRA")
    for (const nombre of ["actualizar.sh", "volver-atras.sh"]) {
      const codigo = sinComentarios(leer(`deploy/${nombre}`))
      expect(codigo, nombre).toMatch(/esperar_salud/)
      expect(codigo, `${nombre} no debe redefinir esperar_salud`).not.toMatch(/esperar_salud\(\)/)
    }
  })

  it("respaldo.sh borra por antigüedad en minutos (-mmin) para que 'más de N días' sea literal, y la guía lo dice igual", () => {
    const codigo = sinComentarios(leer("deploy/respaldo.sh"))
    expect(codigo).toMatch(/-mmin "\+\$\(\(RETENCION_DIAS \* 1440\)\)"/)
    expect(codigo).not.toMatch(/-mtime/)
    expect(codigo).toMatch(/RETENCION_DIAS="\$\{ELI_RETENCION_DIAS:-14\}"/)
    expect(leer("deploy/README.md")).toMatch(/más de \*\*14 días\*\*/)
  })

  it("respaldo.sh compara las filas de usuarios, negocios y citas contra la base antes de dar el respaldo por bueno", () => {
    const codigo = sinComentarios(leer("deploy/respaldo.sh"))
    expect(codigo).toMatch(/for tabla in usuarios negocios citas/)
    expect(codigo.indexOf("for tabla in usuarios negocios citas")).toBeLessThan(codigo.indexOf('mv "$TEMPORAL" "$FINAL"'))
  })

  it("ningún script pasa contraseñas por la línea de comandos", () => {
    for (const nombre of scripts) {
      const codigo = sinComentarios(leer(`deploy/${nombre}`))
      expect(codigo, nombre).not.toMatch(/(pg_dump|pg_restore|psql)[^\n]*(postgres(ql)?:\/\/|\$\{?(DIRECT_URL|DATABASE_URL))/)
      expect(codigo, nombre).not.toMatch(/PGPASSWORD=/)
    }
  })

  it("probar-cabeceras.sh acepta la ruta del Caddyfile (para probar el instalado) y revisa el bind y el 404 de los crons", () => {
    const codigo = sinComentarios(leer("deploy/probar-cabeceras.sh"))
    expect(codigo).toMatch(/CADDYFILE="\$\{1:-/)
    expect(codigo).toContain("bind")
    expect(codigo).toContain("/api/cron/recordatorios")
  })
})
