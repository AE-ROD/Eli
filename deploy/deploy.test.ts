import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, chmodSync, existsSync, rmSync } from "node:fs"
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process"
import { createServer, type Server } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"

/**
 * Guardas del kit de despliegue en VPS (`deploy/`). Leen los archivos como
 * texto: no prueban que nginx o systemd funcionen (eso se comprueba en el
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

/** El texto entre dos marcas (la segunda excluida); falla si falta alguna. */
function tramo(texto: string, desde: string, hasta: string): string {
  const i = texto.indexOf(desde)
  expect(i, `no encuentro "${desde}"`).toBeGreaterThan(-1)
  const j = texto.indexOf(hasta, i + desde.length)
  expect(j, `no encuentro "${hasta}" después de "${desde}"`).toBeGreaterThan(i)
  return texto.slice(i, j)
}

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
// Un lector mínimo de configuración de nginx: bloques anidados `algo { ... }` y
// directivas que terminan en `;`. Alcanza para saber QUÉ directiva está dentro
// de QUÉ bloque (no sólo que el texto exista en algún lado del archivo): en
// nginx eso importa, porque add_header y proxy_set_header se HEREDAN sólo si el
// nivel de abajo no define los suyos.
// ---------------------------------------------------------------------------

interface NodoNginx {
  cabecera: string
  contenido: (string | NodoNginx)[]
}

function leerNginx(texto: string): NodoNginx {
  const raiz: NodoNginx = { cabecera: "", contenido: [] }
  const pila: NodoNginx[] = [raiz]
  for (const cruda of sinComentarios(texto).split("\n")) {
    const linea = normalizar(cruda)
    if (!linea) continue
    const actual = pila[pila.length - 1]
    if (linea === "}") {
      expect(pila.length, "configuración de nginx con una } de más").toBeGreaterThan(1)
      pila.pop()
    } else if (linea.endsWith("{")) {
      const nodo: NodoNginx = { cabecera: linea.slice(0, -1).trim(), contenido: [] }
      actual.contenido.push(nodo)
      pila.push(nodo)
    } else {
      expect(linea, `directiva sin ';' (¿dos por línea?): ${linea}`).toMatch(/;$/)
      actual.contenido.push(linea.slice(0, -1).trim())
    }
  }
  expect(pila.length, "configuración de nginx con un { sin cerrar").toBe(1)
  return raiz
}

const directivasNginx = (nodo: NodoNginx) => nodo.contenido.filter((c): c is string => typeof c === "string")
const bloquesNginx = (nodo: NodoNginx) => nodo.contenido.filter((c): c is NodoNginx => typeof c !== "string")
const servidoresDe = (arbol: NodoNginx) => bloquesNginx(arbol).filter((b) => b.cabecera === "server")
const servidorLlamado = (arbol: NodoNginx, nombre: string) =>
  servidoresDe(arbol).find((s) => directivasNginx(s).includes(`server_name ${nombre}`))
const locationDe = (servidor: NodoNginx, cabecera: string) => bloquesNginx(servidor).find((b) => b.cabecera === `location ${cabecera}`)
/** Todos los bloques `location` del servidor (y los anidados). */
const locationsDe = (nodo: NodoNginx): NodoNginx[] =>
  bloquesNginx(nodo).flatMap((b) => (b.cabecera.startsWith("location ") ? [b, ...locationsDe(b)] : locationsDe(b)))
/** Todas las directivas de un nodo y sus hijos, en orden de aparición. */
const todasLasDirectivas = (nodo: NodoNginx): string[] =>
  nodo.contenido.flatMap((c) => (typeof c === "string" ? [c] : todasLasDirectivas(c)))

/** Para cada cabecera, el valor de la ÚLTIMA instrucción proxy_set_header (la que gana en nginx). */
function ultimoValorPorCabecera(directivas: string[]): Map<string, string> {
  const mapa = new Map<string, string>()
  for (const d of directivas) {
    const m = d.match(/^proxy_set_header\s+(\S+)\s+(.*)$/)
    if (m) mapa.set(m[1].toLowerCase(), m[2].trim())
  }
  return mapa
}

const hayNginx = spawnSync("nginx", ["-v"]).status === 0 && spawnSync("node", ["--version"]).status === 0

describe("deploy/nginx-eliagenda.conf — la IP del cliente no la elige el cliente", () => {
  const texto = leer("deploy/nginx-eliagenda.conf")
  const conf = sinComentarios(texto)
  const arbol = leerNginx(texto)
  const www = servidorLlamado(arbol, "www.eliagenda.com")
  const sitio = servidorLlamado(arbol, "eliagenda.com")
  const proxy = sitio && locationDe(sitio, "/")
  const delProxy = proxy ? todasLasDirectivas(proxy) : []
  const ultimas = ultimoValorPorCabecera(delProxy)

  it("define los dos servidores (www y el dominio sin www) y el proxy_pass a 127.0.0.1:3000 en 'location /' del segundo", () => {
    expect(servidoresDe(arbol)).toHaveLength(2)
    expect(www, "falta el server de www.eliagenda.com").toBeDefined()
    expect(sitio, "falta el server de eliagenda.com").toBeDefined()
    expect(proxy, "falta 'location / { ... }' dentro de eliagenda.com").toBeDefined()
    expect(directivasNginx(proxy!)).toContain("proxy_pass http://127.0.0.1:3000")
    expect(directivasNginx(proxy!)).toContain("proxy_http_version 1.1")
    expect(directivasNginx(proxy!)).toContain("proxy_set_header Host $host")
    expect(directivasNginx(proxy!)).toContain("proxy_set_header X-Forwarded-Proto $scheme")
    // El proxy es de UN solo lugar: ningún otro location ni server habla con Eli.
    expect(conf.match(/proxy_pass/g)).toHaveLength(1)
  })

  it("escucha SÓLO en IPv4 (listen 80, sin [::]) y no toca el sitio por defecto de sistemaone (sin default_server)", () => {
    const listens = todasLasDirectivas(arbol).filter((d) => d.startsWith("listen"))
    expect(listens).toEqual(["listen 80", "listen 80"])
    expect(conf).not.toMatch(/listen[^\n;]*\[/)
    expect(conf).not.toMatch(/ipv6only/)
    expect(conf).not.toMatch(/default_server/)
    expect(conf).not.toMatch(/\breuseport\b/)
    // sin http2: el socket 443 lo comparte sistemaone y no se le cambia nada.
    expect(conf).not.toMatch(/\bhttp2\b/)
  })

  it("la última instrucción sobre x-vercel-forwarded-for es VACIARLA (valor \"\"): obtenerIp la lee primero y el cliente la podría inventar", () => {
    expect(ultimas.get("x-vercel-forwarded-for")).toBe('""')
  })

  it("la última instrucción sobre X-Real-IP es FIJARLA con $remote_addr (una segunda posterior la pisaría)", () => {
    expect(ultimas.get("x-real-ip")).toBe("$remote_addr")
  })

  it("la última instrucción sobre X-Forwarded-For es FIJARLA con $remote_addr", () => {
    expect(ultimas.get("x-forwarded-for")).toBe("$remote_addr")
  })

  it("NUNCA $proxy_add_x_forwarded_for (suma lo que mande el cliente), ni en un comentario-trampa dentro de una directiva", () => {
    expect(conf).not.toMatch(/proxy_add_x_forwarded_for/)
    expect(conf).not.toMatch(/\$http_x_forwarded_for|\$http_x_real_ip|\$http_x_vercel/i)
  })

  it("todos los proxy_set_header están dentro de 'location /' (si un nivel define uno, pierde los heredados) y no hay otras formas de tocar las cabeceras", () => {
    const fuera = todasLasDirectivas(arbol).filter((d) => d.startsWith("proxy_set_header"))
    expect(fuera.length).toBeGreaterThan(0)
    expect(directivasNginx(proxy!).filter((d) => d.startsWith("proxy_set_header"))).toEqual(fuera)
    expect(conf).not.toMatch(/\b(proxy_pass_request_headers|underscores_in_headers|ignore_invalid_headers)\b/)
  })

  it("no confía en proxies de afuera (realip, PROXY protocol, set_real_ip_from abrirían la puerta a cabeceras falsas)", () => {
    expect(conf).not.toMatch(/set_real_ip_from|real_ip_header|real_ip_recursive|proxy_protocol/)
  })

  it("cada cabecera de IP que lee obtenerIp (comillas dobles, simples, constantes, has/get) está vaciada o fijada con $remote_addr", () => {
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

    // Si esto da vacío o dice NO-SE-PUDO-RESOLVER, cambió la forma de obtenerIp: revisar esta prueba y el archivo de nginx.
    expect(leidas.size).toBeGreaterThan(0)
    expect([...leidas].filter((c) => c.startsWith("no-se-pudo") || c.startsWith("NO-SE-PUDO"))).toEqual([])
    for (const cabecera of leidas) {
      const valor = ultimas.get(cabecera)
      expect(valor, `obtenerIp lee "${cabecera}" y nginx-eliagenda.conf no la vacía ni la fija`).toBeDefined()
      expect(['""', "$remote_addr"], `"${cabecera}": nginx la deja en "${valor}"`).toContain(valor)
    }
  })

  it("también vacía Forwarded, True-Client-IP y CF-Connecting-IP (hoy obtenerIp no las lee; defensa por si algún día las lee)", () => {
    for (const c of ["forwarded", "true-client-ip", "cf-connecting-ip"]) expect(ultimas.get(c), c).toBe('""')
  })

  it("el www redirige al dominio sin www con 301 DENTRO de 'location /' (un return a nivel server taparía el desafío de Certbot)", () => {
    expect(directivasNginx(www!).filter((d) => d.startsWith("return"))).toEqual([])
    expect(directivasNginx(locationDe(www!, "/")!)).toEqual(["return 301 https://eliagenda.com$request_uri"])
    expect(directivasNginx(sitio!).filter((d) => d.startsWith("return"))).toEqual([])
  })

  it("limita el cuerpo del pedido (client_max_body_size 6m) a nivel del server principal", () => {
    expect(directivasNginx(sitio!)).toContain("client_max_body_size 6m")
    expect(conf.match(/client_max_body_size/g)).toHaveLength(1)
  })

  it("no anuncia la versión (server_tokens off) y comprime (gzip on) en el server principal", () => {
    expect(directivasNginx(sitio!)).toContain("server_tokens off")
    expect(directivasNginx(www!)).toContain("server_tokens off")
    expect(conf).not.toMatch(/server_tokens\s+on/)
    expect(directivasNginx(sitio!)).toContain("gzip on")
  })

  it("HSTS está a nivel de server (los dos), con 'always', y ningún location define add_header (si lo hiciera, el location perdería el HSTS por herencia)", () => {
    const hsts = 'add_header Strict-Transport-Security "max-age=31536000" always'
    expect(directivasNginx(sitio!)).toContain(hsts)
    expect(directivasNginx(www!)).toContain(hsts)
    expect(conf.match(/add_header/g)).toHaveLength(2)
    for (const s of servidoresDe(arbol)) {
      for (const l of locationsDe(s)) {
        expect(todasLasDirectivas(l).filter((d) => d.startsWith("add_header")), `add_header dentro de "${l.cabecera}": anula el HSTS del server`).toEqual([])
      }
    }
  })

  it("cierra /api/cron y /api/cron/* con 404 ANTES de 'location /', sin distinguir mayúsculas (los crons llaman directo a 127.0.0.1:3000)", () => {
    const bloques = bloquesNginx(sitio!).map((b) => b.cabecera)
    const cron = bloquesNginx(sitio!).find((b) => /^location ~\*\s/.test(b.cabecera) && /api\/cron/.test(b.cabecera))
    expect(cron, "falta 'location ~* ^/api/cron(/|$) { return 404; }'").toBeDefined()
    expect(directivasNginx(cron!)).toEqual(["return 404"])
    expect(bloques.indexOf(cron!.cabecera)).toBeLessThan(bloques.indexOf("location /"))
    // La expresión regular de verdad, probada en JS contra lo que nginx le va a pasar (la ruta ya normalizada).
    const regex = new RegExp(cron!.cabecera.replace(/^location ~\*\s+/, ""), "i")
    for (const ruta of ["/api/cron", "/api/cron/", "/api/cron/recordatorios", "/API/CRON/recordatorios", "/Api/Cron/x"]) {
      expect(regex.test(ruta), ruta).toBe(true)
    }
    // y no se come otras rutas
    for (const ruta of ["/api/cronista", "/api/cro", "/api/otra/cron", "/", "/api/crono/x"]) {
      expect(regex.test(ruta), ruta).toBe(false)
    }
  })

  it("la mutación se detecta: sin '~*', con $proxy_add_x_forwarded_for o sin vaciar la cabecera, las comprobaciones de arriba fallarían", () => {
    const sinVaciar = leerNginx(texto.replace('proxy_set_header X-Vercel-Forwarded-For "";', ""))
    const l1 = locationDe(servidorLlamado(sinVaciar, "eliagenda.com")!, "/")!
    expect(ultimoValorPorCabecera(todasLasDirectivas(l1)).get("x-vercel-forwarded-for")).toBeUndefined()
    const sumando = leerNginx(texto.replace("proxy_set_header X-Forwarded-For $remote_addr;", "proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"))
    const l2 = locationDe(servidorLlamado(sumando, "eliagenda.com")!, "/")!
    expect(ultimoValorPorCabecera(todasLasDirectivas(l2)).get("x-forwarded-for")).not.toBe("$remote_addr")
    const reordenado = leerNginx(texto.replace("proxy_set_header X-Real-IP $remote_addr;", 'proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Real-IP $http_x_real_ip;'))
    const l3 = locationDe(servidorLlamado(reordenado, "eliagenda.com")!, "/")!
    expect(ultimoValorPorCabecera(todasLasDirectivas(l3)).get("x-real-ip")).not.toBe("$remote_addr")
    const conLocationHsts = leerNginx(texto.replace("return 404;", 'add_header X-Algo "1"; return 404;'))
    const cron = bloquesNginx(servidorLlamado(conLocationHsts, "eliagenda.com")!).find((b) => /api\/cron/.test(b.cabecera))!
    expect(directivasNginx(cron).some((d) => d.startsWith("add_header"))).toBe(true)
  })
})

describe("deploy/nginx-eliagenda-https.conf — el HTTPS escrito a mano (plan B de Certbot)", () => {
  const principal = leerNginx(leer("deploy/nginx-eliagenda.conf"))
  const texto = leer("deploy/nginx-eliagenda-https.conf")
  const conf = sinComentarios(texto)
  const arbol = leerNginx(texto)
  const http = servidoresDe(arbol).find((s) => directivasNginx(s).includes("listen 80"))
  const www = servidoresDe(arbol).find((s) => directivasNginx(s).includes("server_name www.eliagenda.com"))
  const sitio = servidoresDe(arbol).find((s) => directivasNginx(s).includes("server_name eliagenda.com"))

  it("tiene el 80 (todo a https://eliagenda.com, dentro de location /) y los dos 443; sólo IPv4, sin default_server ni http2", () => {
    expect(servidoresDe(arbol)).toHaveLength(3)
    expect(directivasNginx(http!).filter((d) => d.startsWith("return"))).toEqual([])
    expect(directivasNginx(locationDe(http!, "/")!)).toEqual(["return 301 https://eliagenda.com$request_uri"])
    expect(todasLasDirectivas(arbol).filter((d) => d.startsWith("listen"))).toEqual(["listen 80", "listen 443 ssl", "listen 443 ssl"])
    expect(conf).not.toMatch(/listen[^\n;]*\[|default_server|ipv6only|\bhttp2\b|reuseport/)
    for (const s of [www!, sitio!]) {
      expect(directivasNginx(s)).toContain("ssl_certificate /etc/letsencrypt/live/eliagenda.com/fullchain.pem")
      expect(directivasNginx(s)).toContain("ssl_certificate_key /etc/letsencrypt/live/eliagenda.com/privkey.pem")
    }
  })

  it("el bloque del proxy, el del 404 de /api/cron y las directivas del server principal son IDÉNTICOS a los del archivo de HTTP", () => {
    const origen = servidorLlamado(principal, "eliagenda.com")!
    expect(locationDe(sitio!, "/")).toEqual(locationDe(origen, "/"))
    expect(bloquesNginx(sitio!).find((b) => /api\/cron/.test(b.cabecera))).toEqual(bloquesNginx(origen).find((b) => /api\/cron/.test(b.cabecera)))
    for (const d of directivasNginx(origen).filter((d) => !/^(listen|server_name)\b/.test(d))) {
      expect(directivasNginx(sitio!), d).toContain(d)
    }
    expect(directivasNginx(www!)).toContain('add_header Strict-Transport-Security "max-age=31536000" always')
  })

  it("sin $proxy_add_x_forwarded_for, sin realip y ningún add_header dentro de un location", () => {
    expect(conf).not.toMatch(/proxy_add_x_forwarded_for|set_real_ip_from|real_ip_header|proxy_protocol/)
    for (const s of servidoresDe(arbol)) {
      for (const l of locationsDe(s)) expect(todasLasDirectivas(l).filter((d) => d.startsWith("add_header")), l.cabecera).toEqual([])
    }
  })
})

describe("deploy/probar-cabeceras.sh — prueba con un nginx real, sin tocar el de producción", () => {
  const codigo = sinComentarios(leer("deploy/probar-cabeceras.sh"))

  it("acepta la ruta del archivo de nginx (para probar el instalado), lo extrae y revisa listen [::], default_server y el 404 de /api/cron", () => {
    expect(codigo).toMatch(/ARCHIVO="\$\{1:-/)
    expect(codigo).toContain("nginx-eliagenda.conf")
    expect(codigo).toContain("proxy_pass")
    expect(codigo).toContain("/api/cron/recordatorios")
    expect(codigo).toContain("default_server")
    for (const cabecera of ["X-Vercel-Forwarded-For", "X-Real-IP", "X-Forwarded-For", "Forwarded", "True-Client-IP", "CF-Connecting-IP"]) {
      expect(codigo, cabecera).toContain(`${cabecera}:`)
    }
  })

  it("levanta SU PROPIO nginx (-p/-c, pid y registros en un temporal, puerto alto en 127.0.0.1) y jamás toca el del sistema", () => {
    expect(codigo).toMatch(/"\$NGINX" -p "\$TEMPORAL\/" -c "\$TEMPORAL\/nginx\.conf"/)
    expect(codigo).toMatch(/^pid \$TEMPORAL\/nginx\.pid;/m)
    expect(codigo).toMatch(/^error_log \$TEMPORAL\//m)
    expect(codigo).toMatch(/access_log \$TEMPORAL\//)
    expect(codigo).toMatch(/listen 127\.0\.0\.1:\$PUERTO_NGINX;/)
    expect(codigo).toMatch(/PUERTO_NGINX=38080/)
    // Nada de sudo, systemctl, service, señales ni de la configuración real.
    expect(codigo).not.toMatch(/\bsudo\b/)
    expect(codigo).not.toMatch(/systemctl|\bservice\s+nginx|nginx\s+-s\b|pkill|killall/)
    expect(codigo).not.toMatch(/\/etc\/nginx\/nginx\.conf|\/run\/nginx\.pid|\/var\/log\/nginx/)
    expect(codigo).not.toMatch(/listen (80|443)\b/)
  })

  it.skipIf(!hayNginx)("CON nginx real: pasa con el archivo de HTTP y con el de HTTPS, y FALLA con versiones sabotadas (mutación real)", () => {
    const script = path.join(RAIZ, "deploy/probar-cabeceras.sh")
    const correr = (archivo: string) => spawnSync("bash", [script, archivo], { encoding: "utf8", timeout: 90_000 })
    for (const archivo of ["deploy/nginx-eliagenda.conf", "deploy/nginx-eliagenda-https.conf"]) {
      const r = correr(path.join(RAIZ, archivo))
      expect(r.stdout + r.stderr, archivo).toContain("TODO BIEN")
      expect(r.status, archivo).toBe(0)
    }
    const directorio = mkdtempSync(path.join(tmpdir(), "eli-nginx-mutante-"))
    try {
      const original = leer("deploy/nginx-eliagenda.conf")
      const mutantes: Record<string, string> = {
        "suma la cabecera del cliente": original.replace("proxy_set_header X-Forwarded-For $remote_addr;", "proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"),
        "deja pasar x-vercel-forwarded-for": original.replace('proxy_set_header X-Vercel-Forwarded-For "";', ""),
        "cron sin distinguir mayúsculas roto": original.replace("location ~* ^/api/cron", "location ~ ^/api/cron"),
        "add_header en el location de cron": original.replace("return 404;", 'add_header X-Algo "1";\n        return 404;'),
        "sin límite de cuerpo": original.replace("client_max_body_size 6m;", "client_max_body_size 60m;"),
      }
      for (const [nombre, contenido] of Object.entries(mutantes)) {
        expect(contenido, nombre).not.toBe(original)
        const archivo = path.join(directorio, "mutante.conf")
        writeFileSync(archivo, contenido)
        const r = correr(archivo)
        expect(r.status, `el mutante "${nombre}" no fue detectado:\n${r.stdout}`).not.toBe(0)
        expect(r.stdout + r.stderr, nombre).toContain("FALLA")
      }
    } finally {
      rmSync(directorio, { recursive: true, force: true })
    }
  }, 180_000)
  if (!hayNginx) {
    console.warn("[deploy] nginx o node NO están en el PATH: se salta la prueba que corre probar-cabeceras.sh con un nginx real (A COMPROBAR en el VPS: deploy/probar-cabeceras.sh).")
  }
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

  it("explica el chequeo de IPv6, la contraseña fuerte de eli y el --ignore-scripts", () => {
    for (const texto of ["ip -6 addr show scope global", "openssl rand -base64 24", "--ignore-scripts", "equivale a root", "listen [::]"]) {
      expect(guia, `falta en la guía: ${texto}`).toContain(texto)
    }
  })

  it("5.7 (protección de main): 0 aprobaciones con un solo usuario, dice qué NO ataja y comprueba la regla SIN empujar a main", () => {
    const seccion = tramo(guia, "### 5.7", "## Paso 6")
    expect(seccion).toContain("Require a pull request before merging")
    expect(seccion).toMatch(/\*\*0\*\* aprobaciones/)
    expect(seccion, "con un solo usuario, '1 aprobación' lo deja sin poder entrar a main").not.toMatch(/al menos \*\*1\*\* aprobación/)
    expect(seccion).toMatch(/No\*\* protege contra un token/)
    expect(seccion).toContain("NUNCA pruebes empujando a `main`")
    expect(seccion).toMatch(/Settings\* → \*Rules\*/)
    expect(seccion).toContain("git push origin HEAD:prueba-regla-1")
    expect(seccion, "la prueba ya no empuja un cambio cualquiera a main").not.toMatch(/intenta `git push origin main`/)
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
    expect(leer("deploy/nginx-eliagenda.conf")).not.toMatch(/example\.cl/)
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

  it("no permite tocar nginx (ni nada que no sea el servicio eli): sistemaone.com vive en ese nginx", () => {
    expect(archivo.replace(/^#.*$/gm, "")).not.toMatch(/nginx|certbot|caddy/i)
    for (const regla of reglas) expect(regla).not.toMatch(/nginx|certbot/i)
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

})

describe("deploy/README.md — crons del VPS: nunca encendidos antes del lanzamiento por descuido", () => {
  const guia = leer("deploy/README.md")
  const s103 = tramo(guia, "### 10.3", "### 10.4")
  const s143 = tramo(guia, "### 14.3", "## Paso 15")
  const s135 = tramo(guia, "### 13.5", "### 13.6")
  const reCopia = /deploy\/cron-eli \/etc\/cron\.d\/eli/
  const comandoSed = /sed -i -E '(s\|\^\(0 13 \.\*llamar-cron\)\|#DESACTIVADO# \\1\|)'/

  it.each([
    ["10.3", s103],
    ["14.3", s143],
  ])("%s: instalar cron-eli y apagar las dos líneas de correo es UN SOLO comando encadenado (&&)", (_nombre, seccion) => {
    const encadenados = seccion.split("\n").filter((l) => reCopia.test(l) && comandoSed.test(l))
    expect(encadenados.length, "falta el comando 'install ... && sudo sed ...'").toBeGreaterThanOrEqual(1)
    for (const l of encadenados) expect(l).toMatch(/\/etc\/cron\.d\/eli && sudo sed -i -E /)
  })

  it.each([
    ["10.3", s103],
    ["14.3", s143],
  ])("%s: el install SIN sed sólo aparece después de la marca 'DESPUÉS del lanzamiento'", (_nombre, seccion) => {
    const marca = seccion.indexOf("DESPUÉS del lanzamiento")
    expect(marca, "falta la marca 'DESPUÉS del lanzamiento'").toBeGreaterThan(-1)
    let posicion = 0
    for (const l of seccion.split("\n")) {
      if (/^sudo install .*cron-eli \/etc\/cron\.d\/eli$/.test(l.trim())) {
        expect(posicion, `install sin sed antes del lanzamiento: ${l}`).toBeGreaterThan(marca)
      }
      posicion += l.length + 1
    }
  })

  it("el sed de la guía apaga EXACTAMENTE las dos líneas de correo de cron-eli, deja un archivo de cron válido, y el de 13.5 lo deja idéntico al original", () => {
    const expresion = s103.match(comandoSed)![1]
    expect(s143.match(comandoSed)![1], "10.3 y 14.3 deben usar el mismo sed").toBe(expresion)
    const original = leer("deploy/cron-eli")
    const apagado = spawnSync("sed", ["-E", expresion], { input: original, encoding: "utf8" }).stdout
    const lineas = apagado.split("\n")
    const apagadas = lineas.filter((l) => l.startsWith("#DESACTIVADO# 0 13 "))
    expect(apagadas).toHaveLength(2)
    expect(apagadas.every((l) => l.includes("llamar-cron.sh"))).toBe(true)
    // Lo único que cron ve activo ya no llama a ningún cron de correo; el respaldo sigue.
    const activas = sinComentarios(apagado).split("\n").filter((l) => /^\d/.test(l.trim()))
    expect(activas).toHaveLength(1)
    expect(activas[0]).toMatch(/^30 6 \* \* \*\s+eli\s+\S+\/respaldo\.sh$/)
    expect(sinComentarios(apagado)).not.toContain("llamar-cron")
    const encender = s135.match(/sed -i '(s\|\^#DESACTIVADO# \|\|)'/)
    expect(encender, "13.5 debe traer el comando para encenderlas").not.toBeNull()
    expect(spawnSync("sed", [encender![1]], { input: apagado, encoding: "utf8" }).stdout).toBe(original)
  })

  it("TODO 'llamar-cron.sh' de la guía va con el prefijo ELI_URL_LOCAL=http://127.0.0.1:1, salvo el único de 13.5 (el real)", () => {
    const inicio13 = guia.indexOf(s135)
    const fin13 = inicio13 + s135.length
    let dentroDeBloque = false
    let posicion = 0
    let conPrefijo = 0
    let reales = 0
    for (const linea of guia.split("\n")) {
      if (linea.trim().startsWith("```")) dentroDeBloque = !dentroDeBloque
      else if (dentroDeBloque && /llamar-cron\.sh/.test(linea)) {
        if (posicion >= inicio13 && posicion < fin13) reales++
        else {
          conPrefijo++
          expect(linea.trim(), "un llamar-cron.sh sin prefijo ejecutaría el cron REAL").toMatch(/^ELI_URL_LOCAL=http:\/\/127\.0\.0\.1:1 \S*llamar-cron\.sh /)
        }
      }
      posicion += linea.length + 1
    }
    expect(conPrefijo, "la prueba de 10.5 desapareció: esta guarda ya no mira nada").toBeGreaterThanOrEqual(1)
    expect(reales).toBe(1)
  })

  it("10.5 avisa en voz alta (antes del comando) que hay que copiarlo con el prefijo", () => {
    const s105 = tramo(guia, "### 10.5", "## Paso 11")
    const aviso = s105.indexOf("copia el comando COMPLETO")
    expect(aviso).toBeGreaterThan(-1)
    expect(aviso).toBeLessThan(s105.indexOf("llamar-cron.sh /api/cron/recordatorios"))
    expect(s105).toContain("manda los\n> recordatorios reales a los clientes")
  })

  it("13.2 avisa que el interruptor de Vercel puede pedir un nuevo despliegue, y 13.5 no promete algo confuso", () => {
    expect(tramo(guia, "### 13.2", "### 13.3")).toContain("**nuevo despliegue**")
    expect(s135).not.toContain("sólo adelanta los de mañana")
    expect(s135).toContain("SÍ ejecuta el cron de verdad")
  })
})

describe("deploy/README.md — nginx convive con sistemaone.com: nunca se apaga, sólo se recarga", () => {
  const guia = leer("deploy/README.md")
  /** Las líneas de los bloques ``` de la guía (lo que alguien copia y pega). */
  const lineasDeComandos: string[] = []
  let dentro = false
  for (const linea of guia.split("\n")) {
    if (/^\s*(>\s*)?```/.test(linea)) {
      dentro = !dentro
      continue
    }
    if (dentro) lineasDeComandos.push(linea.replace(/^\s*>\s?/, ""))
  }
  const sinCitas = guia.replace(/\n>\s?/g, " ").replace(/\s+/g, " ")

  it("lee bien los bloques de comandos (si esto falla, las pruebas de abajo no prueban nada)", () => {
    expect(lineasDeComandos.length).toBeGreaterThan(200)
    expect(lineasDeComandos.some((l) => l.includes("sudo nginx -t && sudo systemctl reload nginx"))).toBe(true)
  })

  it("prohíbe stop/restart/disable de nginx, con la advertencia repetida (al inicio y en el paso 9) y el comando permitido", () => {
    const advertencias = sinCitas.match(/nunca `systemctl stop`, `restart` ni `disable` de nginx/gi) ?? []
    expect(advertencias.length).toBeGreaterThanOrEqual(2)
    expect(guia.indexOf("ESTE VPS YA ALOJA `sistemaone.com` CON nginx")).toBeGreaterThan(-1)
    expect(guia.indexOf("ESTE VPS YA ALOJA `sistemaone.com` CON nginx")).toBeLessThan(guia.indexOf("## Qué es cada cosa"))
    expect(tramo(guia, "## Paso 9.", "## Paso 10.")).toMatch(/NUNCA `systemctl stop`, `restart` ni `disable` de nginx/)
    expect(sinCitas).toContain("Lo único permitido es `sudo nginx -t && sudo systemctl reload nginx`")
    expect(sinCitas.match(/sudo nginx -t && sudo systemctl reload nginx/g)!.length).toBeGreaterThanOrEqual(4)
  })

  it("NINGÚN bloque de comandos apaga, reinicia, deshabilita ni mata nginx (ni solo ni junto a otra unidad), ni toca sistemaone", () => {
    for (const l of lineasDeComandos) {
      expect(l, l).not.toMatch(/systemctl\s+(stop|restart|disable|mask|kill|try-restart|force-reload|reload-or-restart)\b[^\n]*\bnginx\b/)
      expect(l, l).not.toMatch(/systemctl\s+(stop|restart|disable|mask|kill)\b[^\n]*\bcaddy\b/)
      expect(l, l).not.toMatch(/\bservice\s+nginx\s+(stop|restart|force-reload)\b|\bnginx\s+-s\s+(stop|quit|reopen)\b|\b(pkill|killall)\b[^\n]*nginx/)
      expect(l, l).not.toMatch(/\bapt(-get)?\s+(remove|purge|install)\b[^\n]*\b(nginx|caddy|certbot)\b/)
      expect(l, l).not.toMatch(/\b(rm|mv|cp|install|ln|tee|sed\s+-i|nano|vim?)\b[^\n]*(sites-(enabled|available)\/sistemaone|\/etc\/nginx\/nginx\.conf|\/etc\/nginx\/conf\.d)/)
      expect(l, l).not.toMatch(/caddy/i)
    }
  })

  it("todo cambio a nginx se aplica con reload tras nginx -t, y se comprueba sistemaone.com antes y después", () => {
    const paso9 = tramo(guia, "## Paso 9.", "## Paso 10.")
    const reloads = lineasDeComandos.filter((l) => /systemctl\s+reload\s+nginx/.test(l) && !/--deploy-hook/.test(l))
    expect(reloads.length).toBeGreaterThanOrEqual(3)
    for (const l of reloads) expect(l, "un reload sin 'nginx -t &&' delante").toMatch(/nginx -t && (sudo )?systemctl reload nginx|&& sudo nginx -t && sudo systemctl reload nginx/)
    expect(paso9.match(/curl -sI https:\/\/sistemaone\.com \| head -1/g)!.length).toBeGreaterThanOrEqual(8)
    // 9.4: primero la línea base, luego el cambio, luego otra comprobación.
    const s94 = tramo(guia, "### 9.4", "### 9.5")
    const base = s94.indexOf("curl -sI https://sistemaone.com | head -1")
    const reload = s94.indexOf("sudo nginx -t && sudo systemctl reload nginx\n```")
    expect(base).toBeGreaterThan(-1)
    expect(reload).toBeGreaterThan(base)
    expect(s94.indexOf("curl -sI https://sistemaone.com | head -1", reload)).toBeGreaterThan(reload)
  })

  it("9.4 usa el enlace 'zz-eliagenda' (para que sistemaone siga siendo el sitio por defecto), y el plan de vuelta atrás quita el enlace y recarga", () => {
    const s94 = tramo(guia, "### 9.4", "### 9.5")
    expect(s94).toContain("sudo ln -s /etc/nginx/sites-available/eliagenda /etc/nginx/sites-enabled/zz-eliagenda")
    expect(lineasDeComandos.filter((l) => /sites-enabled\/eliagenda\b/.test(l))).toEqual([])
    const s99 = tramo(guia, "### 9.9", "## Paso 10.")
    expect(s99).toContain("sudo rm /etc/nginx/sites-enabled/zz-eliagenda")
    expect(s99.indexOf("sudo rm /etc/nginx/sites-enabled/zz-eliagenda")).toBeLessThan(s99.indexOf("sudo nginx -t && sudo systemctl reload nginx"))
  })

  it("9.6: el orden es ensayo (--dry-run) ANTES del certbot real, sin --hsts, y comprueba la config final con nginx -T y la renovación", () => {
    const s96 = tramo(guia, "### 9.6", "### 9.7")
    expect(s96.indexOf("sudo certbot --nginx --dry-run -d eliagenda.com -d www.eliagenda.com")).toBeGreaterThan(-1)
    expect(s96.indexOf("--dry-run")).toBeLessThan(s96.indexOf("sudo certbot --nginx -d eliagenda.com -d www.eliagenda.com --redirect"))
    expect(s96).not.toMatch(/certbot[^\n]*--hsts/)
    expect(s96).toContain("sudo nginx -T")
    expect(s96).toContain("probar-cabeceras.sh /etc/nginx/sites-available/eliagenda")
    expect(s96).toContain("sudo certbot renew --dry-run --cert-name eliagenda.com")
    for (const linea of ["X-Vercel-Forwarded-For", "X-Real-IP", "X-Forwarded-For", "Strict-Transport-Security", "/api/cron", "client_max_body_size"]) {
      expect(s96, linea).toContain(linea)
    }
  })

  it("los comandos de nginx -T de la guía no muestran el contenido de claves y filtran sólo el sitio de Eli", () => {
    for (const l of lineasDeComandos.filter((x) => /nginx -T/.test(x))) {
      expect(l).not.toMatch(/privkey|\.key\b/)
    }
  })

  it("no queda ningún rastro de Caddy como herramienta (sólo la frase de que ya no se usa) y el Caddyfile ya no existe", () => {
    expect(existsSync(path.join(RAIZ, "deploy/Caddyfile"))).toBe(false)
    const menciones = guia.match(/caddy/gi) ?? []
    // La nota inicial, el aviso del paso 9, "no instales Caddy" de 3.3 y "nada de caddy" del inventario.
    expect(menciones.length).toBeLessThanOrEqual(4)
    for (const archivo of ["deploy/eli.service", "deploy/cron-eli", "deploy/llamar-cron.sh", "deploy/actualizar.sh", "deploy/volver-atras.sh", "deploy/lib-entorno.sh", "deploy/sudoers-eli", "deploy/probar-cabeceras.sh", "deploy/nginx-eliagenda.conf", "deploy/nginx-eliagenda-https.conf"]) {
      expect(leer(archivo), archivo).not.toMatch(/caddy/i)
    }
  })

  it("ninguno de los scripts ni el servicio apagan o reinician nginx", () => {
    for (const nombre of readdirSync(path.join(RAIZ, "deploy")).filter((n) => n.endsWith(".sh") || n.endsWith(".service") || n.startsWith("cron-"))) {
      expect(sinComentarios(leer(`deploy/${nombre}`)), nombre).not.toMatch(/systemctl\s+(stop|restart|disable|mask|kill)\b[^\n]*\bnginx\b|\bservice\s+nginx\b|\bnginx\s+-s\s+(stop|quit)\b/)
    }
  })

  it("la mutación se detecta: un 'systemctl restart nginx' en un bloque, aunque venga junto a otra unidad, lo atraparía la regla", () => {
    const regla = /systemctl\s+(stop|restart|disable|mask|kill|try-restart|force-reload|reload-or-restart)\b[^\n]*\bnginx\b/
    for (const malo of ["sudo systemctl restart nginx", "sudo systemctl stop nginx", "sudo systemctl disable --now nginx", "sudo systemctl restart eli nginx", "sudo systemctl kill nginx"]) {
      expect(malo, malo).toMatch(regla)
    }
    for (const bueno of ["sudo nginx -t && sudo systemctl reload nginx", "systemctl status nginx --no-pager", "systemctl is-active eli nginx fail2ban"]) {
      expect(bueno, bueno).not.toMatch(regla)
    }
  })
})

describe("deploy/README.md — correcciones de la iteración 3", () => {
  const guia = leer("deploy/README.md")

  it("B2: antes de crear el DMARC se mira si ya hay uno (un segundo TXT _dmarc invalida DMARC)", () => {
    const s = tramo(guia, "### 7.4", "## Paso 8")
    expect(s).toContain("dig +short TXT _dmarc.eliagenda.com")
    expect(s.indexOf("dig +short TXT _dmarc")).toBeLessThan(s.indexOf("`v=DMARC1; p=none"))
    expect(s).toMatch(/edita ese registro/)
  })

  it("B3: 11.5 avisa que Vercel de respaldo apunta a la base vieja y que --exit-on-error puede abortar por errores inocuos", () => {
    const s = tramo(guia, "### 11.5", "### 11.6")
    expect(s).toMatch(/Si Vercel quedó de respaldo/)
    expect(s).toMatch(/`DATABASE_URL` también apunta a la base vieja/)
    expect(s).toMatch(/COMMENT ON EXTENSION/)
    expect(s).toMatch(/A COMPROBAR en la prueba mensual/)
    expect(s).toMatch(/pg_restore --no-owner --no-privileges --dbname=/)
  })

  it("el paso 3.1 instala openssl (6.2 lo usa para generar secretos)", () => {
    expect(tramo(guia, "### 3.1", "### 3.2")).toMatch(/apt install -y [^\n]*\bopenssl\b/)
  })

  it("12.4b prueba las siete variantes de /api/cron (mayúsculas, //, %2f, %63, sin barra y con barra final)", () => {
    const s = tramo(guia, "**12.4b", "**12.5")
    for (const ruta of ["/api/cron/recordatorios", "/API/CRON/recordatorios", "//api/cron/recordatorios", "/api/cron%2frecordatorios", "/api/%63ron/recordatorios", "/api/cron /api/cron/;"]) {
      expect(s, ruta).toContain(ruta)
    }
    expect(s).toContain("404 404 404 404 404 404 404")
  })

  it("14.3: antes de reinstalar eli.service se corre systemd-analyze verify sobre el archivo", () => {
    const s = tramo(guia, "**`eli.service`**", "**`sudoers-eli`:**")
    expect(s.indexOf("systemd-analyze verify /opt/eli/repo/deploy/eli.service")).toBeGreaterThan(-1)
    expect(s.indexOf("systemd-analyze verify")).toBeLessThan(s.indexOf("sudo install -m 644 /opt/eli/repo/deploy/eli.service"))
  })

  it("M4: el estado de los avisos vive en ~/.eli-avisos, no en /var/backups/eli, y la guía ya no lo dice", () => {
    expect(guia).not.toMatch(/\/var\/backups\/eli\/\.avisos/)
    expect(guia).toContain("~/.eli-avisos")
    const lib = sinComentarios(leer("deploy/lib-entorno.sh"))
    expect(lib).toContain('ELI_DIR_AVISOS:-${HOME:-/var/tmp}/.eli-avisos')
    expect(lib).not.toMatch(/\/var\/backups\/eli/)
  })
})

describe("deploy/*.sh — el reinicio siempre pasa por CMD_REINICIAR (mutación)", () => {
  // Si alguien cambia UN sitio de llamada (p. ej. a 'sudo -n systemctl restart eli'
  // a secas) sin tocar la definición, se pierde el reset-failed y el regreso
  // automático puede fallar con start-limit-hit. La prueba de arriba sólo mira la
  // definición; ésta mira los sitios de llamada.
  const esperados: Record<string, number> = { "actualizar.sh": 2, "volver-atras.sh": 2 }
  it.each(Object.entries(esperados))("%s: %i sitios de llamada, todos exactamente 'bash -c \"$CMD_REINICIAR\"', y ningún 'systemctl restart' fuera de la definición", (nombre, cuantos) => {
    const lineas = sinComentarios(leer(`deploy/${nombre}`)).split("\n")
    const fueraDeLaDefinicion = lineas.filter((l) => !/^CMD_REINICIAR=/.test(l.trim()))
    expect(fueraDeLaDefinicion.join("\n"), `${nombre}: un reinicio escrito a mano esquiva el reset-failed`).not.toMatch(/systemctl\s+(restart|start|reload)/)
    const usos = fueraDeLaDefinicion.flatMap((l) => [...l.matchAll(/CMD_REINICIAR/g)].map(() => l))
    expect(usos).toHaveLength(cuantos)
    for (const l of usos) expect(l).toMatch(/bash -c "\$CMD_REINICIAR"/)
  })

  it("la mutación se detecta: un sitio de llamada cambiado a mano ya no cumple la regla", () => {
    const original = sinComentarios(leer("deploy/actualizar.sh"))
    const mutado = original.replace('if bash -c "$CMD_REINICIAR" && esperar_salud; then\n  if [[ -n "$DIR_ANTERIOR"', 'if sudo -n systemctl restart eli && esperar_salud; then\n  if [[ -n "$DIR_ANTERIOR"')
    expect(mutado).not.toBe(original)
    expect(mutado).toMatch(/systemctl\s+restart/)
    expect([...mutado.matchAll(/bash -c "\$CMD_REINICIAR"/g)]).toHaveLength(1)
  })
})

describe("deploy/actualizar.sh — 'esa versión ya está activa' no se dice con el servicio caído", () => {
  const codigo = sinComentarios(leer("deploy/actualizar.sh"))
  it("antes de salir con 'nada que hacer' comprueba la salud con esperar_salud (espera corta); si no responde, sigue y sólo reinicia", () => {
    const bloque = tramo(codigo, 'if [[ "$COMMIT" == "$COMMIT_ACTUAL" ]]; then', "migraciones_nuevas() {")
    expect(bloque).toMatch(/ESPERA_SALUD_SEGUNDOS > 10 \)\) && ESPERA_SALUD_SEGUNDOS=10/)
    expect(bloque.indexOf("esperar_salud")).toBeGreaterThan(-1)
    expect(bloque.indexOf("esperar_salud")).toBeLessThan(bloque.indexOf("exit 0"))
    expect(bloque.match(/exit 0/g)).toHaveLength(1)
    expect(codigo).not.toContain("Esa versión ya está activa. No hay nada que hacer.")
  })

  it("si reinicia la misma versión y sigue sin responder no 'vuelve' a la misma carpeta en bucle", () => {
    expect(codigo).toMatch(/if \[\[ "\$DIR_ANTERIOR" == "\$DESTINO" \]\]; then\n\s+fallo /)
  })
})

describe("respaldo.sh — otro respaldo corriendo no es un fallo", () => {
  const codigo = sinComentarios(leer("deploy/respaldo.sh"))
  it("sale con 75 sin correo (no usa falla(), que dispara el aviso)", () => {
    expect(codigo).not.toMatch(/falla "Ya hay otro respaldo/)
    expect(codigo).toMatch(/OTRO_CORRIENDO=si\n\s+exit 75/)
    expect(codigo).toMatch(/\[\[ "\$codigo" -ne 0 && "\$OTRO_CORRIENDO" != si \]\]/)
  })
})

describe("avisar_por_correo y llamar-cron.sh/respaldo.sh — comportamiento con un Resend de juguete (sin red real)", () => {
  const rutaLib = path.join(RAIZ, "deploy/lib-entorno.sh")
  const curlReal = spawnSync("bash", ["-c", "command -v curl"], { encoding: "utf8" }).stdout.trim()
  const hayHerramientas = Boolean(curlReal) && spawnSync("node", ["--version"]).status === 0 && spawnSync("flock", ["--version"]).status === 0
  const hoy = () => new Date().toISOString().slice(0, 10)
  const CLAVE_RESEND = "re_CLAVE_SECRETA_DE_PRUEBA"
  const SECRETO_CRON = "secreto-de-cron-de-prueba"

  let dir = ""
  let servidor: Server
  let puerto = 0
  let estadoResend = 200
  const correos: { auth: string | undefined; cuerpo: { from: string; to: string[]; subject: string; text: string } }[] = []

  function correr(orden: string, args: string[], env: Record<string, string>): Promise<{ code: number | null; salida: string }> {
    return new Promise((resolve) => {
      const hijo: ChildProcessWithoutNullStreams = spawn(orden, args, { env: { PATH: `${path.join(dir, "bin")}:${process.env.PATH}`, ...env } as unknown as NodeJS.ProcessEnv })
      let salida = ""
      hijo.stdout.on("data", (d) => (salida += d))
      hijo.stderr.on("data", (d) => (salida += d))
      hijo.on("close", (code) => resolve({ code, salida }))
    })
  }

  const entorno = (extra: Record<string, string> = {}) => ({
    HOME: path.join(dir, "home"),
    ELI_ENV_FILE: path.join(dir, "eli.env"),
    ELI_DIR_AVISOS: path.join(dir, "avisos"),
    ELI_URL_RESEND: `http://127.0.0.1:${puerto}/emails`,
    ELI_URL_LOCAL: `http://127.0.0.1:${puerto}`,
    ELI_RAIZ: path.join(dir, "no-existe"),
    ...extra,
  })
  const avisar = (clave: string, extra: Record<string, string> = {}) =>
    correr("bash", ["-c", 'source "$1"; avisar_por_correo "$2" "Asunto de prueba" "Texto de prueba"', "_", rutaLib, clave], entorno(extra))

  beforeAll(async () => {
    if (!hayHerramientas) return
    dir = mkdtempSync(path.join(tmpdir(), "eli-deploy-test-"))
    spawnSync("mkdir", ["-p", path.join(dir, "bin"), path.join(dir, "home")])
    // curl de mentira que anota sus argumentos (lo que "ps" mostraría) y luego llama al real.
    writeFileSync(path.join(dir, "bin/curl"), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${dir}/argv-curl.log"\nexec "${curlReal}" "$@"\n`)
    chmodSync(path.join(dir, "bin/curl"), 0o755)
    writeFileSync(
      path.join(dir, "eli.env"),
      `RESEND_API_KEY=${CLAVE_RESEND}\nRESEND_FROM_EMAIL=Eli <no-reply@demo.eli>\nSOPORTE_EMAIL=dueno@demo.eli\nCRON_SECRET=${SECRETO_CRON}\n`
    )
    servidor = createServer((req, res) => {
      let datos = ""
      req.on("data", (d) => (datos += d))
      req.on("end", () => {
        if (req.method === "POST" && req.url === "/emails") {
          correos.push({ auth: req.headers.authorization, cuerpo: JSON.parse(datos) })
          res.statusCode = estadoResend
          res.end("{}")
        } else if (req.url?.startsWith("/api/cron/")) {
          res.statusCode = req.headers.authorization === `Bearer ${SECRETO_CRON}` ? 200 : 401
          res.end('{"total":0}')
        } else {
          res.statusCode = 404
          res.end()
        }
      })
    })
    await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok))
    puerto = (servidor.address() as { port: number }).port
  })
  afterAll(async () => {
    if (!hayHerramientas) return
    await new Promise((ok) => servidor.close(ok))
    rmSync(dir, { recursive: true, force: true })
  })

  const leerAviso = (clave: string) => (existsSync(path.join(dir, "avisos", clave)) ? readFileSync(path.join(dir, "avisos", clave), "utf8").trim() : null)

  it.skipIf(!hayHerramientas)("manda UN correo con la clave de Resend en el encabezado, nunca en los argumentos de curl; y guarda la fecha de hoy", async () => {
    const r = await avisar("prueba-a")
    expect(r.code).toBe(0)
    expect(correos).toHaveLength(1)
    expect(correos[0].auth).toBe(`Bearer ${CLAVE_RESEND}`)
    expect(correos[0].cuerpo).toMatchObject({ from: "Eli <no-reply@demo.eli>", to: ["dueno@demo.eli"], subject: "Asunto de prueba", text: "Texto de prueba" })
    expect(JSON.stringify(correos[0].cuerpo)).not.toContain(CLAVE_RESEND)
    expect(leerAviso("prueba-a")).toBe(hoy())
    const argv = readFileSync(path.join(dir, "argv-curl.log"), "utf8")
    expect(argv).toContain("--config -")
    expect(argv, "la clave de Resend no puede verse en los argumentos de curl (ps)").not.toContain(CLAVE_RESEND)
    expect(r.salida).not.toContain(CLAVE_RESEND)
  })

  it.skipIf(!hayHerramientas)("tope diario: la misma clave el mismo día no repite el correo; otra clave sí; una fecha de ayer sí", async () => {
    const antes = correos.length
    const repetido = await avisar("prueba-a")
    expect(repetido.code).toBe(0)
    expect(repetido.salida).toContain("Ya se avisó hoy")
    expect(correos).toHaveLength(antes)
    await avisar("prueba-b")
    expect(correos).toHaveLength(antes + 1)
    writeFileSync(path.join(dir, "avisos/prueba-a"), "2000-01-01\n")
    await avisar("prueba-a")
    expect(correos).toHaveLength(antes + 2)
    expect(leerAviso("prueba-a")).toBe(hoy())
  })

  it.skipIf(!hayHerramientas)("si Resend rechaza el envío NO se gasta el cupo (el siguiente intento lo reintenta) y el script que llama no falla", async () => {
    estadoResend = 500
    try {
      const r = await avisar("prueba-c")
      expect(r.code).toBe(0)
      expect(r.salida).toContain("No pude mandar el aviso por correo")
      expect(leerAviso("prueba-c")).toBeNull()
    } finally {
      estadoResend = 200
    }
    const antes = correos.length
    await avisar("prueba-c")
    expect(correos).toHaveLength(antes + 1)
  })

  it.skipIf(!hayHerramientas)("el estado por defecto vive en ~/.eli-avisos (modo 700), no en /var/backups/eli", async () => {
    const env = entorno()
    delete (env as Record<string, string | undefined>).ELI_DIR_AVISOS
    const antes = correos.length
    const r = await correr("bash", ["-c", 'source "$1"; avisar_por_correo prueba-d "A" "T"', "_", rutaLib], env)
    expect(r.code).toBe(0)
    expect(correos).toHaveLength(antes + 1)
    const carpeta = path.join(dir, "home/.eli-avisos")
    expect(readFileSync(path.join(carpeta, "prueba-d"), "utf8").trim()).toBe(hoy())
    expect(statSync(carpeta).mode & 0o777).toBe(0o700)
  })

  it.skipIf(!hayHerramientas)("sin las variables de Resend no manda nada y no falla", async () => {
    writeFileSync(path.join(dir, "sin-resend.env"), `CRON_SECRET=${SECRETO_CRON}\n`)
    const antes = correos.length
    const r = await avisar("prueba-e", { ELI_ENV_FILE: path.join(dir, "sin-resend.env") })
    expect(r.code).toBe(0)
    expect(correos).toHaveLength(antes)
  })

  it.skipIf(!hayHerramientas)("llamar-cron.sh: en ÉXITO (200) no manda ningún correo; con un secreto malo (401) manda uno y sale con 1", async () => {
    const antes = correos.length
    const bien = await correr(path.join(RAIZ, "deploy/llamar-cron.sh"), ["/api/cron/recordatorios"], entorno())
    expect(bien.code).toBe(0)
    expect(bien.salida).toContain("-> 200")
    expect(correos).toHaveLength(antes)
    expect(leerAviso("cron-recordatorios")).toBeNull()

    writeFileSync(path.join(dir, "malo.env"), `CRON_SECRET=otro\nRESEND_API_KEY=${CLAVE_RESEND}\nRESEND_FROM_EMAIL=Eli <no-reply@demo.eli>\nSOPORTE_EMAIL=dueno@demo.eli\n`)
    const mal = await correr(path.join(RAIZ, "deploy/llamar-cron.sh"), ["/api/cron/recordatorios"], entorno({ ELI_ENV_FILE: path.join(dir, "malo.env") }))
    expect(mal.code).toBe(1)
    expect(correos).toHaveLength(antes + 1)
    expect(correos[antes].cuerpo.subject).toBe("Eli: falló el cron /api/cron/recordatorios")
    expect(correos[antes].cuerpo.text).toContain("401")
    expect(JSON.stringify(correos[antes].cuerpo)).not.toContain("otro\n")
  })

  const hayPg = spawnSync("bash", ["-c", "command -v pg_dump && command -v pg_restore && command -v psql"]).status === 0
  it.skipIf(!hayHerramientas || !hayPg)("respaldo.sh con otro respaldo corriendo: sale con 75, sin correo y sin gastar el cupo", async () => {
    const destino = path.join(dir, "respaldos")
    spawnSync("mkdir", ["-p", destino])
    const otro = spawn("flock", [path.join(destino, ".candado"), "sleep", "8"])
    try {
      await new Promise((ok) => setTimeout(ok, 500))
      const antes = correos.length
      const r = await correr(path.join(RAIZ, "deploy/respaldo.sh"), [], entorno({ ELI_RESPALDOS: destino }))
      expect(r.code).toBe(75)
      expect(r.salida).toContain("Ya hay otro respaldo corriendo")
      expect(correos).toHaveLength(antes)
      expect(leerAviso("respaldo")).toBeNull()
    } finally {
      otro.kill()
    }
  })
})
