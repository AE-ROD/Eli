# Eli en un VPS de Hostinger: guía paso a paso

Esta guía lleva Eli de Vercel a tu servidor (VPS) de Hostinger. Está escrita
para alguien que **no es técnico**: cada comando va en su propio recuadro, y
debajo dice qué deberías ver en pantalla. Si lo que ves es distinto, **para y
no sigas**: pega *sólo la salida del comando* (nunca claves ni contraseñas) a
quien te esté ayudando.

> **Regla de oro: nunca pegues contraseñas, claves, tokens ni el contenido de
> `/etc/eli/eli.env` en un chat, un correo o un issue.** Ni siquiera "para que
> me ayuden". Las claves se escriben sólo dentro del servidor (paso 6).

## Qué es cada cosa (el mínimo para no perderse)

| Palabra | Qué es |
|---|---|
| **VPS** | Un computador que alquilas en Hostinger y que está siempre encendido. Ahí vivirá Eli. |
| **SSH** | La forma de "entrar" a ese computador desde tu Mac escribiendo comandos. |
| **root** | El usuario todopoderoso del servidor. Se usa lo mínimo: sólo al principio. |
| **eli** (usuario) | El usuario normal que crearemos. Con él trabajas el día a día. |
| **Llave SSH** | Un par de archivos (uno privado en tu Mac, uno público en el servidor) que reemplazan a la contraseña. Mucho más seguro. |
| **ufw / fail2ban** | El guardia de la puerta (ufw: sólo deja pasar lo necesario) y el que expulsa a quien insiste en adivinar claves (fail2ban). |
| **Node** | El programa que ejecuta Eli. |
| **Caddy** | El "recepcionista" de internet: recibe las visitas en tu dominio, pone el candado HTTPS solo, y se las pasa a Eli. También protege el límite de intentos (ver paso 9). |
| **systemd** | Lo que arranca Eli solo al prender el servidor y lo vuelve a levantar si se cae. |
| **cron** | El reloj del servidor: dispara los recordatorios, los correos y los respaldos a su hora. |
| **Deploy key** | Una llave de *sólo lectura* que deja al servidor bajar el código de GitHub (el repositorio es privado). |
| **Release** | Una carpeta con una versión compilada de Eli. Se guardan las últimas 3 para poder volver atrás. |
| **Neon / Upstash / Resend** | Servicios externos que **siguen igual**: la base de datos, el límite de intentos y el correo. El VPS solo se conecta a ellos. |

## Cómo está armado

```
Internet ──► Caddy (puertos 80 y 443, HTTPS) ──► Eli (Next.js, 127.0.0.1:3000, sólo local)
                                                    │
                          Neon (base) · Upstash (límite de intentos) · Resend (correo)
cron ──► Eli (127.0.0.1:3000/api/cron/...)      cron ──► respaldo ──► /var/backups/eli
```

Carpetas y archivos del servidor:

| Ruta | Qué hay |
|---|---|
| `/opt/eli/repo` | Copia del código (se actualiza con `git pull`). |
| `/opt/eli/releases/<commit>` | Cada versión compilada (se guardan 3). |
| `/opt/eli/current` | Enlace a la versión que está corriendo. |
| `/opt/eli/previous` | Enlace a la versión anterior (para volver atrás). |
| `/etc/eli/eli.env` | **Las claves y variables.** Sólo lo lee root y el grupo eli. |
| `/etc/systemd/system/eli.service` | Cómo se arranca Eli. |
| `/etc/caddy/Caddyfile` | La configuración de Caddy. |
| `/etc/cron.d/eli` | Los relojes (crons y respaldo). |
| `/var/backups/eli` | Los respaldos de la base. |

## Qué se probó y qué NO (honestidad)

Este kit se armó **sin tener el VPS delante**. Lo que se pudo probar en otra
máquina Ubuntu 24.04 está marcado así; lo demás dice **A COMPROBAR EN EL VPS**
y trae el comando exacto.

| Pieza | Estado |
|---|---|
| `respaldo.sh` (contra un Postgres 16 local: dump, verificación, retención, errores) | Probado |
| `probar-restauracion.sh` (restaurar en base vacía; se niega a tocar "producción") | Probado |
| `actualizar.sh` / `volver-atras.sh` (releases, migraciones, salud, reversión automática, poda a 3) | Probado con un repositorio y un servidor de juguete |
| `llamar-cron.sh` (401 sin secreto, 200 con secreto, el secreto no aparece en `ps`) | Probado |
| `next start` con las variables de producción: arranca, `/` responde 200, cabeceras de seguridad y CSP, crons 401 sin secreto | Probado (compilación incluida) |
| `bash -n` y `shellcheck` de todos los `.sh`; `eli.service` con `systemd-analyze verify` | Probado |
| Pruebas automáticas de `deploy/` (`npx vitest run deploy/`) | Probado |
| **Caddyfile**: que `caddy` lo acepte, que pida el certificado, que pise las cabeceras de IP | **A COMPROBAR EN EL VPS** (paso 9 y 12: `deploy/probar-cabeceras.sh`) |
| `eli.service` arrancando de verdad con el endurecimiento (`ProtectSystem`, etc.) | **A COMPROBAR EN EL VPS** (paso 8) |
| Instalación de Node, Caddy y PGDG desde sus repositorios | **A COMPROBAR EN EL VPS** (paso 3; son los métodos oficiales, pero no se pudieron abrir sus páginas desde aquí para recontrastar los comandos) |
| `cron.d` con `CRON_TZ=UTC` | **A COMPROBAR EN EL VPS** (paso 10) |
| Tiempo de compilación en el KVM 2 | **A COMPROBAR** (aquí, con 4 CPU: ~1 minuto) |

---

## Paso 0. Requisitos y datos a mano

Antes de empezar, ten listo (en un gestor de contraseñas o una nota **que no
sea un chat**):

| Dato | Dónde se saca |
|---|---|
| **IP del VPS** | hPanel de Hostinger → *VPS* → tu servidor → *Resumen* (aparece como "Dirección IP"). |
| **Contraseña de root** | La que pusiste al crear el VPS (hPanel → VPS → *Configuración* si la quieres cambiar). |
| **Versión de Ubuntu** | hPanel → VPS → Resumen. Esta guía vale para **22.04 y 24.04**. |
| **Dominio** | El que compres (en esta guía: `eli.example.cl`; reemplázalo por el tuyo). |
| **Variables de Eli** | Vercel → tu proyecto → *Settings* → *Environment Variables*. Son las mismas del paso 6. **`NEXTAUTH_SECRET` tiene que ser EXACTAMENTE el mismo que usa Vercel** (si no, todos pierden la sesión y los enlaces de baja de los correos dejan de servir). |
| **Acceso a GitHub** | Que seas administrador del repositorio `AE-ROD/Eli` (para crear la deploy key). |
| **Acceso a Neon** | Para saber la versión de Postgres (paso 3) y crear una base de pruebas (paso 11). |
| **Acceso a Google Cloud, Resend y Vercel** | Para la mudanza (paso 13). |

**Este kit tiene que estar en la rama `main` de GitHub** (haber pasado por el
PR y el merge) antes del paso 5. Si todavía está en una rama de trabajo, avísale
a quien te ayuda: se puede probar desde esa rama, pero la guía asume `main`.

Dos decisiones que ya vienen tomadas:

- **Dominio sin `www`** (`eli.example.cl`). El `www` redirige a ese. Así hay una
  sola dirección, una sola cookie de sesión y un solo login con Google.
- **Hora del servidor en UTC**, igual que Vercel: así los crons a las 13:00 UTC
  son los de siempre.

---

## Paso 1. Entrar al VPS y crear tu usuario `eli`

### 1.1 Entrar como root desde la terminal de VS Code (en tu Mac)

Abre VS Code → menú *Terminal* → *New Terminal*. Escribe (cambia `IP_DEL_VPS`
por la IP real):

```bash
ssh root@IP_DEL_VPS
```

La primera vez pregunta `Are you sure you want to continue connecting
(yes/no/[fingerprint])?`. Escribe `yes` y Enter. Luego pide la contraseña de
root: **al escribirla no se ve nada, es normal**; escríbela y Enter. Si todo
va bien, el cursor cambia a algo como `root@srv123456:~#`.

**Alternativa sin Mac:** en hPanel → VPS → botón *Terminal* (o "Browser
terminal"). Abre una terminal dentro del navegador, ya como root. Sirve para
todo lo de esta guía; la única diferencia es que ahí pegar es con
`Ctrl+Shift+V`.

### 1.2 Ver qué Ubuntu tienes

```bash
lsb_release -ds
```

Debe decir `Ubuntu 22.04.x LTS` o `Ubuntu 24.04.x LTS`. Si es otra, para.

### 1.3 Crear el usuario `eli`

```bash
adduser eli
```

Pide una contraseña (anótala; es la que te pedirá `sudo`) y luego datos como
nombre y teléfono: déjalos vacíos con Enter. Al final pregunta `Is the
information correct? [Y/n]`: Enter.

```bash
usermod -aG sudo eli
```

No imprime nada si salió bien. Esto le da permiso de administrador a `eli`
(pidiendo su contraseña cada vez).

### 1.4 Crear tu llave SSH (en tu Mac, en OTRA terminal de VS Code)

Abre una **segunda terminal** (el `+` en el panel de la terminal) para no
cerrar la del servidor. En esa nueva terminal (la de tu Mac):

```bash
ssh-keygen -t ed25519 -C "eli-vps"
```

Enter para aceptar la ruta que propone (`/Users/tu-nombre/.ssh/id_ed25519`).
Te pide una frase de contraseña (*passphrase*): **ponla**, protege tu llave si
te roban el computador. Debe terminar mostrando un dibujito (*randomart*) y
`Your public key has been saved in ...id_ed25519.pub`.

> Si ya tenías una llave `id_ed25519`, **no la sobreescribas**: responde `n` y
> usa la que existe.

### 1.5 Instalar la llave pública en el servidor (en tu Mac)

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub eli@IP_DEL_VPS
```

Pide la contraseña del usuario `eli` (la del paso 1.3). Debe terminar con
`Number of key(s) added: 1`.

Si en tu Mac `ssh-copy-id` no existe, hazlo a mano: primero muestra tu llave
pública (es una sola línea que empieza con `ssh-ed25519`):

```bash
cat ~/.ssh/id_ed25519.pub
```

y en la terminal **del servidor (root)** pégala así (reemplaza lo que está
entre comillas por esa línea):

```bash
install -d -m 700 -o eli -g eli /home/eli/.ssh && echo "PEGA_AQUI_LA_LINEA_ssh-ed25519" >> /home/eli/.ssh/authorized_keys && chown eli:eli /home/eli/.ssh/authorized_keys && chmod 600 /home/eli/.ssh/authorized_keys
```

### 1.6 Comprobar que entras con la llave

En tu Mac:

```bash
ssh eli@IP_DEL_VPS
```

Ahora te pide la **frase de contraseña de la llave** (la del 1.4), no la del
usuario, y entras como `eli@srv...:~$`. A partir de aquí **trabaja siempre
como `eli`** y antepón `sudo` cuando la guía lo diga. Puedes cerrar la sesión
de root (`exit` en la terminal vieja).

**No sigas hasta que este paso funcione.**

---

## Paso 2. Endurecer el servidor

Todo esto como `eli` (con `sudo`).

### 2.1 Actualizar el sistema

```bash
sudo apt update && sudo apt -y upgrade
```

Tarda unos minutos. Si al final dice que hace falta reiniciar (a veces muestra
una pantalla rosada/morada con "Daemons using outdated libraries"), Enter para
aceptar.

### 2.2 Poner el reloj en UTC

```bash
sudo timedatectl set-timezone UTC
```

```bash
timedatectl
```

Debe decir `Time zone: Etc/UTC (UTC, +0000)` y `System clock synchronized:
yes`.

### 2.3 Cortafuegos (ufw): sólo 22, 80 y 443

**Primero se permite SSH y recién después se enciende. Si lo haces al revés te
quedas afuera.**

```bash
sudo apt install -y ufw fail2ban unattended-upgrades
```

```bash
sudo ufw default deny incoming
```

```bash
sudo ufw default allow outgoing
```

```bash
sudo ufw allow 22/tcp
```

```bash
sudo ufw allow 80/tcp
```

```bash
sudo ufw allow 443/tcp
```

```bash
sudo ufw enable
```

Pregunta `Command may disrupt existing ssh connections. Proceed with operation
(y|n)?` → `y` (el 22 ya está permitido, tu sesión sigue viva).

```bash
sudo ufw status verbose
```

Debe decir `Status: active` y listar sólo 22, 80 y 443 (`ALLOW IN`).

### 2.4 fail2ban (expulsa a quien intenta adivinar claves)

```bash
sudo systemctl enable --now fail2ban
```

```bash
sudo fail2ban-client status sshd
```

Debe mostrar `Status for the jail: sshd` con `Currently banned: 0` (o algunos).
Si dijera `Sorry but the jail 'sshd' does not exist`, avísale a quien te
ayuda.

### 2.5 Actualizaciones de seguridad automáticas

```bash
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' | sudo tee /etc/apt/apt.conf.d/20auto-upgrades
```

Repite las dos líneas. Esto instala solos los parches de seguridad de Ubuntu.
**No reinicia solo.** Cada mes, mira si el servidor lo pide:

```bash
ls /var/run/reboot-required
```

Si existe (si no, dice `No such file`), reinicia en un momento tranquilo con
`sudo reboot`. Ojo: Node, Caddy y el cliente de Postgres vienen de
repositorios aparte que **no** se actualizan solos; una vez al mes corre
`sudo apt update && sudo apt upgrade`.

### 2.6 Apagar el ingreso por contraseña (SÓLO después de comprobar la llave)

> **CUIDADO: aquí es donde la gente se queda sin poder entrar.** Haz exactamente
> en este orden. Mantén abierta la sesión actual hasta el final.

**(a) Comprueba la llave desde una TERMINAL NUEVA en tu Mac**, forzando a no usar
contraseña:

```bash
ssh -o PasswordAuthentication=no eli@IP_DEL_VPS
```

Tiene que entrar pidiendo sólo la frase de la llave. Si dice `Permission
denied (publickey)`, **NO sigas**: la llave no quedó bien instalada (vuelve al
1.5). Cierra esa sesión de prueba con `exit`.

**(b) Comprueba que `sudo` funciona con `eli`** (en la sesión del servidor):

```bash
sudo whoami
```

Debe imprimir `root`.

**(c) Escribe la configuración** (en el servidor). Se llama `00-eli.conf` para
que se lea *antes* que otros archivos (en SSH gana la primera línea que
aparece; en algunos servidores hay un `50-cloud-init.conf` que vuelve a activar
las contraseñas):

```bash
printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin no\n' | sudo tee /etc/ssh/sshd_config.d/00-eli.conf
```

**(d) Valida antes de aplicar:**

```bash
sudo sshd -t
```

No debe imprimir nada. Si imprime un error, **borra el archivo y no
reinicies**: `sudo rm /etc/ssh/sshd_config.d/00-eli.conf`.

**(e) Aplica:**

```bash
sudo systemctl restart ssh
```

**(f) Comprueba, SIN cerrar la sesión actual**, desde una terminal nueva en tu
Mac:

```bash
ssh eli@IP_DEL_VPS
```

Debe seguir entrando con la llave. Y esta prueba, que fuerza la contraseña, debe
**fallar**:

```bash
ssh -o PubkeyAuthentication=no eli@IP_DEL_VPS
```

Debe terminar en `Permission denied (publickey)` (sin ni siquiera pedir
contraseña).

**Si te quedaste afuera:** entra por la terminal del navegador de Hostinger
(hPanel → VPS → *Terminal*; no usa SSH, así que sigue funcionando), y deshaz con
`sudo rm /etc/ssh/sshd_config.d/00-eli.conf && sudo systemctl restart ssh`.

---

## Paso 3. Instalar Node 22, git, Caddy y el cliente de Postgres

### 3.1 Herramientas base

```bash
sudo apt install -y ca-certificates curl gnupg git
```

### 3.2 Node 22 LTS (repositorio oficial de NodeSource)

Se hace en pasos visibles (en vez de un "curl | bash") para poder revisar cada
uno. Fuente: instrucciones oficiales de NodeSource (*manual installation*).

```bash
sudo mkdir -p /etc/apt/keyrings
```

```bash
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
```

```bash
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
```

```bash
sudo apt update && sudo apt install -y nodejs
```

```bash
node -v
```

Debe decir `v22.` seguido de números. Y:

```bash
npm -v
```

Debe decir `10.` algo. Si `node -v` dice otra versión (por ejemplo `v18`), para:
hay otro Node instalado que gana; avisa.

### 3.3 Caddy (repositorio oficial de Caddy)

Comandos de la documentación oficial de Caddy para Debian/Ubuntu (**A COMPROBAR:**
no pude abrir su página desde donde armé esto; si algún comando falla, la guía
vigente está en `https://caddyserver.com/docs/install#debian-ubuntu-raspbian`).

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
```

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
```

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
```

```bash
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
```

```bash
sudo apt update && sudo apt install -y caddy
```

```bash
caddy version
```

Debe decir `v2.` algo. Caddy queda corriendo con una página de bienvenida; la
reemplazaremos en el paso 9.

### 3.4 El cliente de Postgres, de la MISMA versión que tu base en Neon

`pg_dump` (el respaldo) **se niega a respaldar una base más nueva que él**. Ubuntu
trae un cliente viejo (14 en 22.04, 16 en 24.04), así que se instala el oficial
de PostgreSQL (PGDG) con la versión de Neon.

**¿Qué versión tiene tu base?** En la consola de Neon → tu proyecto →
*SQL Editor* (no hace falta ninguna clave), ejecuta:

```sql
select version();
```

Responde algo como `PostgreSQL 17.5 on aarch64...`. Anota el **primer número**
(aquí `17`). (También aparece en Neon → *Settings* del proyecto.)

Instala el repositorio de PostgreSQL (Enter cuando pregunte):

```bash
sudo apt install -y postgresql-common
```

```bash
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh
```

Termina con la lista de paquetes. Ahora el cliente (cambia `17` por tu número):

```bash
sudo apt install -y postgresql-client-17
```

(**No** instales el paquete `postgresql` a secas: eso es el servidor y no lo
necesitas.)

```bash
pg_dump --version
```

Debe decir `pg_dump (PostgreSQL) 17.x` (tu número). Si dice un número menor al de
Neon, el paso falló.

---

## Paso 4. Memoria de intercambio (swap) de 2 GB, por si acaso

El servidor tiene ~8 GB. Compilar Eli es lo que más memoria pide; el swap es un
colchón para que un pico no tumbe nada.

Primero mira si ya tiene:

```bash
swapon --show
```

Si **no imprime nada**, no hay swap: sigue. (Si lista algo, salta al paso 5.)

```bash
sudo fallocate -l 2G /swapfile
```

```bash
sudo chmod 600 /swapfile
```

```bash
sudo mkswap /swapfile
```

```bash
sudo swapon /swapfile
```

```bash
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

```bash
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-eli-swap.conf
```

```bash
free -m
```

La fila `Swap:` debe decir `total` ≈ 2047. (`swappiness=10` hace que sólo lo use
en apuros; se aplica completo tras el próximo reinicio.)

---

## Paso 5. Traer el código (repositorio privado, con una deploy key de sólo lectura)

### 5.1 Carpeta de trabajo

```bash
sudo install -d -o eli -g eli /opt/eli
```

### 5.2 Crear la llave del servidor para GitHub

```bash
ssh-keygen -t ed25519 -f ~/.ssh/eli_deploy -N "" -C "eli-vps-deploy"
```

(Sin frase, a propósito: el servidor la usa solo. Por eso es de **sólo
lectura**: aunque alguien la robara, no podría cambiar el código.)

```bash
cat ~/.ssh/eli_deploy.pub
```

Imprime una línea que empieza con `ssh-ed25519 ...`. **Cópiala entera** (es la
parte pública; no es secreta).

### 5.3 Dársela a GitHub

En el navegador: `github.com/AE-ROD/Eli` → *Settings* → *Deploy keys* → *Add
deploy key*. Título: `VPS Hostinger`. En *Key* pega la línea. **Deja SIN
marcar** "Allow write access". *Add key*.

### 5.4 Decirle a SSH que use esa llave para GitHub

```bash
printf 'Host github-eli\n  HostName github.com\n  User git\n  IdentityFile ~/.ssh/eli_deploy\n  IdentitiesOnly yes\n' >> ~/.ssh/config
```

```bash
chmod 600 ~/.ssh/config
```

### 5.5 Probar

```bash
ssh -T git@github-eli
```

La primera vez pregunta si confías en el servidor de GitHub y muestra una
huella. **Compárala con la oficial**
(`https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints`;
la de `ed25519` que conozco es `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`,
confírmala en esa página). Si coincide, `yes`. Debe responder:

`Hi AE-ROD/Eli! You've successfully authenticated, but GitHub does not provide shell access.`

(`Permission denied (publickey)` = la deploy key no se agregó bien: repite 5.3.)

### 5.6 Clonar

```bash
git clone git@github-eli:AE-ROD/Eli.git /opt/eli/repo
```

```bash
ls /opt/eli/repo/deploy
```

Debe listar `Caddyfile`, `README.md`, `actualizar.sh`, etc. (Si no existe
`deploy`, el kit todavía no está en `main`: ver paso 0.)

---

## Paso 6. Las variables de Eli: `/etc/eli/eli.env`

### 6.1 Qué variables lee el código

Salen de buscar `process.env` en `app/`, `lib/`, `proxy.ts` y
`prisma.config.ts`. **No hay otras.**

| Variable | ¿Obligatoria? | Para qué / de dónde sale |
|---|---|---|
| `NODE_ENV` | **Sí** → `production` | Modo producción: activa el límite de intentos "cerrado" y desactiva herramientas de desarrollo. |
| `DATABASE_URL` | **Sí** | Neon, conexión **con pooler** (el host trae `-pooler`). Es la que usa la app. También la necesita la compilación. |
| `DIRECT_URL` | **Sí** | Neon, conexión **directa** (sin `-pooler`). La usan los respaldos y Prisma (el esquema la exige para compilar). |
| `NEXTAUTH_URL` | **Sí** (en producción, sin ella los correos no salen) | La dirección pública: `https://eli.example.cl` (sin barra final). |
| `NEXTAUTH_SECRET` | **Sí** | Firma las sesiones y los enlaces de baja. **Copiar el mismo de Vercel.** |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | **Sí** (para entrar con Google) | Google Cloud → Credenciales. Los mismos de Vercel. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | **Sí en producción** | Límite de intentos. **Sin ellas, todo endpoint responde 429** (falla cerrado a propósito). |
| `CRON_SECRET` | **Sí** (si falta, los crons responden siempre 401) | Contraseña que protege `/api/cron/*`. Puedes reusar la de Vercel o crear una nueva: `openssl rand -hex 32`. |
| `RESEND_API_KEY` | Recomendada | Correos. Sin ella no sale ningún correo (ni recordatorios), pero nada se rompe. |
| `RESEND_FROM_EMAIL` | Recomendada | Remitente, p. ej. `Eli <no-reply@tu-dominio-verificado.cl>`. Si falta usa un valor por defecto que no es tuyo. |
| `SOPORTE_EMAIL` | Opcional | Casilla que recibe las solicitudes de soporte. |

`TZ` **no** va en este archivo: el servicio ya la fija en UTC (`eli.service`).

### 6.2 Crear el archivo

Carpeta y archivo vacío con los permisos correctos. Dueño `root`, grupo `eli`,
permiso **640** (root y el grupo eli leen; nadie más). *(El diseño inicial decía
600; con 600 el usuario `eli` no podría leer las variables para compilar ni
para el respaldo. systemd igual las lee como root. 640 con grupo `eli` es lo
mínimo que hace que todo funcione, y sólo `root` puede modificarlas.)*

```bash
sudo install -d -m 750 -o root -g eli /etc/eli
```

```bash
sudo install -m 640 -o root -g eli /dev/null /etc/eli/eli.env
```

Ábrelo con el editor `nano`:

```bash
sudo nano /etc/eli/eli.env
```

Pega esto y **reemplaza cada `CAMBIAR`** con el valor real (cópialos desde
Vercel → *Settings* → *Environment Variables* → ojo para mostrar el valor).
Reglas: sin comillas, sin espacios alrededor del `=`, una variable por línea,
sin la palabra `export`:

```
NODE_ENV=production
DATABASE_URL=CAMBIAR
DIRECT_URL=CAMBIAR
NEXTAUTH_URL=https://eli.example.cl
NEXTAUTH_SECRET=CAMBIAR
GOOGLE_CLIENT_ID=CAMBIAR
GOOGLE_CLIENT_SECRET=CAMBIAR
UPSTASH_REDIS_REST_URL=CAMBIAR
UPSTASH_REDIS_REST_TOKEN=CAMBIAR
CRON_SECRET=CAMBIAR
RESEND_API_KEY=CAMBIAR
RESEND_FROM_EMAIL=CAMBIAR
SOPORTE_EMAIL=CAMBIAR
```

Para guardar en nano: `Ctrl+O`, Enter; para salir: `Ctrl+X`.

**Durante las pruebas** (antes de la mudanza) `NEXTAUTH_URL` lleva la dirección
de prueba (`https://prueba.eli.example.cl`, ver pasos 7 y 13), no la final.

### 6.3 Comprobar (sin mostrar los secretos)

```bash
ls -l /etc/eli/eli.env
```

Debe empezar con `-rw-r-----` y decir `root eli`.

```bash
for v in NODE_ENV DATABASE_URL DIRECT_URL NEXTAUTH_URL NEXTAUTH_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN CRON_SECRET RESEND_API_KEY RESEND_FROM_EMAIL; do if grep -q "^$v=." /etc/eli/eli.env && ! grep -q "^$v=CAMBIAR$" /etc/eli/eli.env; then echo "ok      $v"; else echo "FALTA   $v"; fi; done
```

Debe decir `ok` en todas (`FALTA` si está vacía o todavía dice `CAMBIAR`).
No imprime ningún valor.

Y que `eli` (no root) puede leerlo:

```bash
test -r /etc/eli/eli.env && echo "eli puede leerlo"
```

---

## Paso 7. DNS en Hostinger

El DNS es la libreta que dice "el dominio `eli.example.cl` está en tal IP".

**Primero decide cuál es tu caso:**

- **Caso A, dominio nuevo, que hoy no usa nadie:** apunta el DNS al VPS desde ya
  y prueba directamente con el dominio final. Salta lo de `prueba.` de abajo y
  usa `eli.example.cl` en todos lados.
- **Caso B, el dominio ya sirve a Eli desde Vercel** (o lo quieres mantener
  funcionando mientras pruebas): se prueba primero con un subdominio provisional
  `prueba.eli.example.cl` y recién al final se cambia el dominio real (paso 13).
  La guía usa este caso en los ejemplos.

En el paso 13, Vercel y VPS **nunca** deben atender al mismo tiempo con sus
crons encendidos.

### 7.1 Bajar el TTL (sólo caso B)

El TTL es cuánto tiempo recuerdan los demás una respuesta del DNS. Para poder
volver atrás rápido, bájalo **por lo menos un día antes de la mudanza**:

hPanel → *Dominios* → tu dominio → *DNS / Servidores de nombres* → *Registros
DNS*. En los registros actuales (`A` de `@`, y el de `www`) cambia **TTL a 300**
(5 minutos), sin cambiar nada más. Anota o toma captura de **cómo estaban**
(valor, tipo, TTL): lo necesitas para volver a Vercel.

### 7.2 Crear los registros del VPS

Todavía en *Registros DNS*, *Agregar registro*:

| Tipo | Nombre | Apunta a | TTL |
|---|---|---|---|
| A | `prueba` | IP del VPS | 300 |
| A | `www.prueba` | IP del VPS | 300 |

(En el caso A, los nombres son `@` y `www`.) Si Hostinger trae registros
automáticos del dominio ("parking") que chocan con estos, bórralos.

### 7.3 Comprobar que el DNS ya apunta (en tu Mac)

```bash
dig +short prueba.eli.example.cl
```

Debe imprimir la IP del VPS. Si no imprime nada, espera unos minutos y repite.
(Sin `dig`: `nslookup prueba.eli.example.cl`.)

---

## Paso 8. Compilar y arrancar con systemd

### 8.1 Instalar el servicio

```bash
sudo install -m 644 /opt/eli/repo/deploy/eli.service /etc/systemd/system/eli.service
```

```bash
sudo systemctl daemon-reload
```

```bash
sudo systemctl enable eli
```

Debe decir `Created symlink ... eli.service`. (Aún no arranca: no hay nada
compilado.)

### 8.2 Permiso para reiniciar sólo ese servicio

El script de actualización necesita reiniciar Eli sin pedir contraseña. Se le
da a `eli` permiso para **un solo comando exacto**:

```bash
echo 'eli ALL=(root) NOPASSWD: /usr/bin/systemctl restart eli' | sudo tee /etc/sudoers.d/eli-reiniciar
```

```bash
sudo chmod 440 /etc/sudoers.d/eli-reiniciar
```

```bash
sudo visudo -cf /etc/sudoers.d/eli-reiniciar
```

Debe decir `/etc/sudoers.d/eli-reiniciar: parsed OK`. Si dice error, borra el
archivo (`sudo rm /etc/sudoers.d/eli-reiniciar`) y avisa.

Para poder leer los registros del servicio sin `sudo`:

```bash
sudo usermod -aG systemd-journal eli
```

(Se aplica la próxima vez que entres: `exit` y vuelve a entrar con `ssh`.)

### 8.3 Guardar los registros entre reinicios

```bash
sudo mkdir -p /var/log/journal /etc/systemd/journald.conf.d
```

```bash
printf '[Journal]\nStorage=persistent\nSystemMaxUse=500M\n' | sudo tee /etc/systemd/journald.conf.d/eli.conf
```

```bash
sudo systemctl restart systemd-journald
```

### 8.4 Primera compilación y arranque

> **Antes de seguir:** la base de datos de Neon es la misma que ya usa Vercel, así
> que ya tiene aplicadas todas las migraciones de esta versión. El script te lo
> va a preguntar y consultará la base (sólo lectura) para confirmarlo. **Nunca
> aplica migraciones él mismo.**

```bash
cd /opt/eli/repo && ./deploy/actualizar.sh
```

Verás, en este orden:

1. `==> Bajando los cambios de GitHub...` y la versión a instalar.
2. `==> PRIMER DESPLIEGUE...` con la pregunta de migraciones. Si dice "todas
   constan como aplicadas", escribe exactamente `YA APLIQUE LAS MIGRACIONES` y
   Enter. Cualquier otra cosa cancela sin cambiar nada.
3. `Instalando dependencias (npm ci)...` (1-3 minutos; muchas líneas de
   progreso).
4. `Compilando (npm run build)...` (1-3 minutos aquí; en el KVM 2 puede ser más:
   **A COMPROBAR**). Termina con una lista de rutas (`ƒ (Dynamic)`).
5. `==> Activando la versión nueva y reiniciando el servicio...`, luego
   `Responde (200) en http://127.0.0.1:3000/` y `==> Listo: Eli corre la versión
   ...`.

Si algo falla, el mensaje dice qué y la versión que estaba andando **no se
toca** (y si la nueva arranca pero no responde, el script vuelve solo a la
anterior).

### 8.5 Comprobar

```bash
systemctl status eli --no-pager
```

Debe decir `Active: active (running)`. (`q` si abre un visor.)

```bash
ss -tlnp | grep 3000
```

Debe mostrar `127.0.0.1:3000` (y **no** `0.0.0.0:3000` ni `*:3000`: eso
significaría que quedó expuesto).

```bash
journalctl -u eli -n 20 --no-pager
```

Debe mostrar líneas de Next.js tipo `Ready in ...ms`, sin errores rojos.

**A COMPROBAR EN EL VPS:** que el endurecimiento de systemd no impida a Next
escribir su caché. Si el servicio no arranca y el registro menciona `EROFS`,
`EACCES` o "read-only file system", avisa y pega esas líneas (se ajusta
`ReadWritePaths` en `eli.service`).

---

## Paso 9. Caddy (HTTPS y la IP del cliente)

### 9.1 Qué hace y por qué es crítico

`deploy/Caddyfile` hace cuatro cosas: pone el candado HTTPS solo (Let's
Encrypt), comprime las respuestas, manda `www` al dominio sin `www`, y —lo
importante— **decide qué IP "ve" Eli**.

El límite de intentos de login (10 por minuto por IP, etc.) cuenta por IP. El
código (`lib/rate-limit.ts`, `obtenerIp`) confía primero en la cabecera
`x-vercel-forwarded-for`, luego en `x-real-ip` y luego en `x-forwarded-for`.
En Vercel eso era seguro porque Vercel las pisaba. **Aquí las pisa Caddy**: borra
`X-Vercel-Forwarded-For` y fija `X-Real-IP` y `X-Forwarded-For` con la IP real
de la conexión. Sin eso, un atacante cambiaría de "IP" en cada pedido y se
saltaría el límite de intentos. Hay una prueba automática
(`deploy/deploy.test.ts`) que falla si alguien quita esas líneas, y una
comprobación en vivo en el paso 12 (`deploy/probar-cabeceras.sh`).

> Si algún día pones otro servicio delante de Caddy (Cloudflare, otro proxy),
> esto hay que rehacerlo. Avísale a quien mantiene el código.

### 9.2 Definir tu dominio de prueba (una vez por terminal)

Escribe esto **cambiando el dominio** (si cierras la terminal hay que volver a
escribirlo). Para el caso A pon el dominio final:

```bash
DOMINIO=prueba.eli.example.cl
```

### 9.3 Instalar la configuración

Guarda la original, instala la nuestra y cámbiale el dominio de marcador:

```bash
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.original
```

```bash
sudo install -m 644 /opt/eli/repo/deploy/Caddyfile /etc/caddy/Caddyfile
```

```bash
sudo sed -i "s/eli\.example\.cl/$DOMINIO/g" /etc/caddy/Caddyfile
```

```bash
grep -n "$DOMINIO" /etc/caddy/Caddyfile
```

Debe mostrar dos líneas: `www.$DOMINIO {` y `$DOMINIO {`.

### 9.4 Validar y aplicar

```bash
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

Debe terminar en `Valid configuration`. (Un `adapted ... with warnings` sobre
formato es inofensivo; un error, no: para y avisa.)

```bash
sudo systemctl reload caddy
```

```bash
sudo journalctl -u caddy -n 30 --no-pager
```

Busca `certificate obtained successfully` (o similar) para tu dominio. Si ves
`challenge failed`/`NXDOMAIN`/`timeout`, normalmente el DNS aún no apunta al VPS
(paso 7.3) o el puerto 80/443 está cerrado (paso 2.3).

### 9.5 Probar desde tu Mac

```bash
curl -I https://prueba.eli.example.cl
```

Debe empezar con `HTTP/2 200` y llevar, entre otras, `strict-transport-security`
y `content-security-policy`.

---

## Paso 10. Crons y respaldo nocturno

### 10.1 La hora

Los crons de Eli están pensados para correr a las **13:00 UTC**. Comprueba que
el servidor esté en UTC (ya lo dejaste en 2.2):

```bash
timedatectl | grep "Time zone"
```

Debe decir `Etc/UTC`. **A COMPROBAR EN EL VPS:** el archivo de crons trae
`CRON_TZ=UTC`, que algunas versiones de cron entienden y otras ignoran; con el
servidor en UTC da lo mismo.

### 10.2 Qué hay en `deploy/cron-eli`

| Hora (UTC) | Qué | Equivale a |
|---|---|---|
| 13:00 todos los días | `/api/cron/recordatorios` | `vercel.json` |
| 13:00 todos los días | `/api/cron/correos-de-prueba` (al terminar corre solo `mensajes-a-clientes`) | `vercel.json` |
| 06:30 todos los días | Respaldo de la base | nuevo |

Una prueba automática falla si estas dos rutas/horas se separan de las de
`vercel.json`.

Cada llamada usa `deploy/llamar-cron.sh`: lee `CRON_SECRET` del archivo de
variables, se lo manda a Eli por la entrada estándar de `curl` (no aparece en
`ps` ni en ningún registro) y anota el resultado.

### 10.3 Instalar (con los de correo APAGADOS hasta la mudanza)

> **NO enciendas los crons de correo mientras Vercel siga con los suyos
> encendidos:** cada recordatorio saldría dos veces. Se encienden en el paso 13.
> El respaldo sí puede quedar encendido desde ya.

```bash
sudo install -d -m 700 -o eli -g eli /var/backups/eli
```

```bash
sudo install -m 644 -o root -g root /opt/eli/repo/deploy/cron-eli /etc/cron.d/eli
```

Apaga las dos líneas de correo (las deja comentadas):

```bash
sudo sed -i -E 's|^(0 13 .*llamar-cron)|#DESACTIVADO# \1|' /etc/cron.d/eli
```

```bash
grep -n -E "llamar-cron|respaldo" /etc/cron.d/eli
```

Las dos de `llamar-cron` deben empezar con `#DESACTIVADO#`; la de `respaldo.sh`,
no. (cron relee el archivo solo, no hay que reiniciar nada.)

**Encenderlos (paso 13)**, cuando toque:

```bash
sudo sed -i 's|^#DESACTIVADO# ||' /etc/cron.d/eli
```

### 10.4 Ver que corren

Cuando pase la hora de cada uno:

```bash
journalctl -t eli-cron --since today --no-pager
```

```bash
journalctl -t eli-respaldo --since today --no-pager
```

Una corrida buena dice, p. ej., `/api/cron/recordatorios -> 200 {"total":...}`.
Una mala dice `FALLÓ con código 401` (el `CRON_SECRET` no coincide) o `000`
(Eli no está respondiendo).

---

## Paso 11. Respaldos: cómo se hacen, cuánto duran, y CÓMO PROBAR QUE SIRVEN

Un respaldo que nunca se probó restaurar **no es un respaldo**.

### 11.1 Qué hace `respaldo.sh`

- Se conecta a `DIRECT_URL` (leída del archivo de variables; la contraseña **no**
  pasa por la línea de comandos ni sale por pantalla).
- Hace un `pg_dump` en formato *custom* comprimido, a
  `/var/backups/eli/eli-AAAA-MM-DD_HHMMSS.dump` con permiso 600 (sólo `eli`), y un
  enlace `ultimo.dump`.
- Lo **verifica**: no vacío, `pg_restore --list` lo lee sin errores, y trae tablas
  con datos. Si algo falla, sale con error y lo anota en el registro.
- Borra los respaldos de más de **14 días** (recién cuando el nuevo quedó bien).

### 11.2 Primer respaldo, a mano

```bash
/opt/eli/current/deploy/respaldo.sh
```

Debe terminar con `Respaldo listo y verificado: /var/backups/eli/eli-...dump
(... MB, NN tablas con datos)`.

```bash
ls -lh /var/backups/eli
```

Debe mostrar el `.dump` (permiso `-rw-------`, dueño `eli`) y `ultimo.dump`.

**Si dice `server version mismatch`:** tu `postgresql-client` es más viejo que el
Postgres de Neon → repite el paso 3.4 con el número correcto.
**Si dice `apunta al pooler`:** `DIRECT_URL` tiene un host con `-pooler`; debe ser
la conexión directa (Neon → *Connect* → desactiva "Connection pooling").

### 11.3 PROBAR UNA RESTAURACIÓN (nunca sobre producción)

Se restaura en una base de prueba **vacía y distinta**. El script
`probar-restauracion.sh` se niega por su cuenta a tocar la base de producción
(compara servidor y nombre con `DATABASE_URL`/`DIRECT_URL`) y a restaurar sobre
una base con tablas.

**(a) Crea la base de prueba.** La opción más segura es un **proyecto nuevo y
aparte** en Neon: consola de Neon → *New Project*, nombre `eli-pruebas`,
**la misma versión de Postgres que producción**, cualquier región. Trae una base
vacía (`neondb`). Así es imposible confundirla con producción. (Se puede borrar
al terminar.)

**(b) Copia su URL.** En ese proyecto → botón *Connect* → desactiva "Connection
pooling" (queremos la directa) → copia la cadena que empieza con
`postgresql://`. **No la pegues en ningún chat.**

**(c) Corre la prueba** y, cuando pida la URL, pégala (no se verá nada al pegar)
y Enter:

```bash
/opt/eli/current/deploy/probar-restauracion.sh
```

Debe terminar con `Restauración terminada`, el número de tablas, algunas
cuentas de filas (`negocios`, `usuarios`, `clientes`, `citas`) y `Prueba de
restauración OK`. Compara esas cuentas con lo que esperas ver en producción
(tienen que ser parecidas, porque el respaldo es de hace unas horas).

Si dice `ERROR: Esa base ... es la de PRODUCCIÓN`, pegaste la URL equivocada:
**eso es el seguro funcionando**; busca la del proyecto de pruebas.

**(d) Borra el proyecto de pruebas** en Neon (*Settings* → *Delete project*).

Repite esta prueba una vez al mes, y después de cualquier cambio en el respaldo.

### 11.4 Copiar los respaldos a otro lugar (opcional pero recomendado)

Si el VPS se pierde, los respaldos que están sólo en el VPS se pierden con él
(Neon guarda su propio historial, pero es bueno tener el tuyo). La forma más
simple es **bajarlos a tu Mac**, y no deja ninguna clave guardada en el servidor.
En una terminal de tu Mac:

```bash
mkdir -p ~/respaldos-eli
```

```bash
rsync -av --exclude ultimo.dump --exclude .candado eli@IP_DEL_VPS:/var/backups/eli/ ~/respaldos-eli/
```

Copia sólo lo que falta. Repítelo cuando quieras (por ejemplo cada semana).
Los respaldos tienen **datos de clientes**: guárdalos sólo en discos cifrados
(en Mac: FileVault encendido) y no los subas a servicios públicos sin cifrar.
Otras opciones (si algún día lo quieres automático): `rclone` hacia un
almacenamiento (Backblaze B2, Google Drive...) corriendo desde cron; es
agregar una herramienta nueva, así que hay que aprobarlo antes.

---

## Paso 12. Lista de verificación final

Haz esto **antes** de la mudanza, con el dominio de prueba. Reemplaza
`prueba.eli.example.cl` por tu dominio. En las que dicen "(Mac)" usa la terminal
de tu Mac; en las que dicen "(VPS)", la del servidor.

**12.1 (Mac) HTTPS responde, con candado válido.**

```bash
curl -I https://prueba.eli.example.cl
```

`HTTP/2 200`. Sin errores de certificado.

**12.2 (Mac) Cabeceras de seguridad y CSP presentes.**

```bash
curl -sI https://prueba.eli.example.cl | grep -iE "strict-transport-security|content-security-policy|x-frame-options|x-content-type-options|referrer-policy|permissions-policy"
```

Deben salir las seis: `strict-transport-security: max-age=31536000`,
`content-security-policy: default-src 'self'; script-src 'self' 'nonce-...'`,
`x-frame-options: DENY`, `x-content-type-options: nosniff`,
`referrer-policy: strict-origin-when-cross-origin`, `permissions-policy: ...`.

```bash
curl -sI https://prueba.eli.example.cl | grep -iE "^server:|x-powered-by"
```

No debe imprimir nada (no se anuncia ni Caddy ni Next).

**12.3 (Mac) HTTP salta a HTTPS y el www salta al dominio sin www.**

```bash
curl -I http://prueba.eli.example.cl
```

`308 Permanent Redirect` con `Location: https://prueba.eli.example.cl/` (es la
redirección automática de Caddy).

```bash
curl -I "https://www.prueba.eli.example.cl/ruta?x=1"
```

`301` con `Location: https://prueba.eli.example.cl/ruta?x=1`.

**12.4 (Mac) El puerto 3000 no se ve desde afuera.**

```bash
curl -m 5 http://IP_DEL_VPS:3000
```

Debe fallar (`Connection timed out` o `refused`). Si responde HTML, Eli quedó
expuesto sin Caddy: para y avisa.

**12.5 (VPS) La IP del límite de intentos NO se puede falsificar — prueba con
Caddy de verdad.** Levanta un Caddy de juguete usando el bloque real de tu
`Caddyfile` y verifica lo que le llega a la app:

```bash
/opt/eli/current/deploy/probar-cabeceras.sh
```

Debe terminar con `TODO BIEN: el cliente no puede elegir su IP.` y las cuatro
líneas en `OK`. Si dice `FALLA`, **no pongas Eli en producción**: pega la salida
completa (no tiene secretos) a quien mantiene el código. *(A COMPROBAR: este
script no pudo correrse con un Caddy real al armarlo; es justo la prueba que
confirma que `header_up X-Forwarded-For {remote_host}` reemplaza y no suma.)*

**12.6 (Mac) Lo mismo, de punta a punta, contra el sitio real.** Manda 14
intentos de login seguidos mintiendo una IP distinta en cada uno. El límite es
10 por minuto por IP, así que los últimos tienen que dar `429`:

```bash
for i in $(seq 1 14); do curl -s -o /dev/null -w "%{http_code} " -X POST https://prueba.eli.example.cl/api/auth/callback/credentials -H "X-Vercel-Forwarded-For: 10.0.0.$i" -H "X-Real-IP: 10.0.1.$i" -H "X-Forwarded-For: 10.0.2.$i"; done; echo
```

Debe imprimir algo como `200 200 200 200 200 200 200 200 200 200 429 429 429
429` (los primeros 10 con otro código, pueden ser 200, 302 o 4xx; los últimos
**429**).

- Si salen **todos 429 desde el primero**: Upstash no está bien configurado
  (`UPSTASH_REDIS_REST_URL/TOKEN` mal o vacíos); arréglalo en `eli.env`.
- Si **ninguno** da 429: el rate limit se está saltando con IPs falsas: **grave**,
  no sigas; es justo lo que Caddy debe evitar.
- Tu IP real queda bloqueada para el login ~1 minuto. Es normal. No repitas esta
  prueba seguido.

**12.7 (VPS) Un cron sin el secreto da 401, y con el secreto 200.**

Sin secreto (no dispara nada):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/cron/recordatorios
```

Debe imprimir `401`.

Con el secreto (usa el script, que lo lee del archivo sin mostrarlo):

```bash
/opt/eli/current/deploy/llamar-cron.sh /api/cron/recordatorios
```

Debe imprimir `[eli-cron] /api/cron/recordatorios -> 200 {...}`.

> **Cuidado: ese 200 ejecuta de verdad la corrida diaria contra la base real**
> (manda los recordatorios pendientes de mañana). Es seguro repetirla (cada envío
> tiene su candado y no duplica), pero adelanta correos. Hazlo **después de las
> 13:05 UTC**, cuando la corrida del día ya pasó, y nunca mientras Vercel y el VPS
> tengan sus crons encendidos a la vez.

**12.8 (VPS) El servicio se reinicia solo si muere.** Anota el número de
proceso:

```bash
systemctl show eli -p MainPID --value
```

Mátalo a la fuerza:

```bash
sudo systemctl kill -s KILL eli
```

Espera 6 segundos y mira de nuevo:

```bash
sleep 6; systemctl show eli -p MainPID --value; systemctl is-active eli
```

El número de proceso debe ser **distinto** (y distinto de `0`) y debe decir
`active`.

**12.9 (VPS) Todo vuelve solo tras reiniciar el servidor.**

```bash
sudo reboot
```

Espera 1-2 minutos, entra de nuevo con `ssh eli@IP_DEL_VPS` y:

```bash
systemctl is-active eli caddy fail2ban
```

Debe imprimir tres veces `active`. Y `free -m` debe mostrar el swap.

**12.10 (VPS) Respaldo y hora.**

```bash
ls -lh /var/backups/eli && timedatectl | grep "Time zone"
```

**12.11 Login y flujo real.** En el navegador: abre
`https://prueba.eli.example.cl`, inicia sesión con correo y contraseña, mira la
agenda, y una página pública de reservas. (El login con Google requiere el
paso 13: la URI de prueba hay que agregarla a Google.)

---

## Paso 13. LA MUDANZA (y el plan para volver atrás)

Hazla **fuera del horario de atención** y **lejos de las 13:00 UTC** (entre las
12:30 y las 13:30 UTC no la hagas: ahí corren los crons). Reserva 1-2 horas.

> **Regla que nunca se rompe:** Vercel y el VPS **no pueden tener los crons
> encendidos a la vez** (los correos saldrían duplicados). Por eso: primero se
> apagan los de Vercel, *después* se encienden los del VPS.

### 13.0 Antes (días antes)

- [ ] El paso 12 completo está en verde con el dominio de prueba.
- [ ] TTL de los registros DNS del dominio en **300** desde hace al menos un día
      (paso 7.1), y anotado cómo estaba todo (para volver).
- [ ] **Google:** Google Cloud → *APIs y servicios* → *Credenciales* → tu cliente
      OAuth. En *Orígenes autorizados de JavaScript* agrega
      `https://eli.example.cl` y en *URIs de redireccionamiento autorizados*
      `https://eli.example.cl/api/auth/callback/google`. **Deja también las de
      Vercel** (las necesitas si vuelves atrás). Agrega igual las de
      `prueba.eli.example.cl` si quieres probar el login con Google antes. Los
      cambios de Google pueden tardar unos minutos en aplicarse.
- [ ] **Resend:** el remitente (`RESEND_FROM_EMAIL`) no depende del dominio de la
      web. Sólo si quieres enviar desde tu dominio nuevo: Resend → *Domains* →
      *Add Domain* → agrega en el DNS de Hostinger los registros que te indica
      (SPF y DKIM, tipo TXT/CNAME) **sin tocar los registros de correo que ya
      existan** → espera `Verified` → cambia `RESEND_FROM_EMAIL`.
- [ ] En **Vercel**, `NEXTAUTH_URL` debe ser la dirección con la que entran los
      clientes. Si hoy Eli vive en una dirección `*.vercel.app` y el dominio es
      nuevo, decide primero qué pasará con los enlaces antiguos (reservas ya
      compartidas): para que Vercel pueda atender el dominio nuevo si vuelves
      atrás, hay que agregar el dominio al proyecto de Vercel y poner ahí
      `NEXTAUTH_URL` con el dominio.
- [ ] Haz un respaldo fresco: `/opt/eli/current/deploy/respaldo.sh`.
- [ ] Avisa a los negocios si quieres (habrá unos minutos en que algunos usuarios
      puedan ver el sitio viejo).

### 13.1 Dejar el VPS listo con el dominio FINAL (aún sin tráfico)

En el VPS:

```bash
sudo nano /etc/eli/eli.env
```

Cambia la línea `NEXTAUTH_URL=` a `https://eli.example.cl` (el dominio final, con
tu dominio real). Guarda (`Ctrl+O`, Enter, `Ctrl+X`).

Cambia Caddy al dominio final. Escribe tus dos dominios (el de prueba y el
final; **con los tuyos**):

```bash
DOMINIO=prueba.eli.example.cl; DOMINIO_FINAL=eli.example.cl
```

```bash
sudo sed -i "s/$DOMINIO/$DOMINIO_FINAL/g" /etc/caddy/Caddyfile
```

```bash
grep -n "example\|eli" /etc/caddy/Caddyfile | head
```

Deben aparecer `www.eli.example.cl {` y `eli.example.cl {` (con tu dominio real).

```bash
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

No reinicies Eli ni Caddy todavía: se hace justo antes del cambio de DNS.

### 13.2 Apagar los crons de VERCEL (antes de encender los del VPS)

Elige UNA forma (todas reversibles). **A COMPROBAR:** los nombres exactos de
los menús de Vercel cambian; si no los encuentras, usa la forma 2.

1. Vercel → tu proyecto → *Settings* → *Cron Jobs* → **Disable Cron Jobs**
   (el interruptor/botón para desactivarlos). Para reactivarlos: *Enable*.
2. En el repositorio, quitar la sección `"crons"` de `vercel.json` y desplegar
   (mediante un PR; **no** lo hagas desde el VPS). Para volver, se revierte ese
   cambio. *(Ojo: la prueba automática de `deploy/` compara `deploy/cron-eli`
   con `vercel.json`; si haces esto, quien mantiene el código debe ajustar la
   prueba en el mismo PR.)*
3. Pausar el proyecto entero en Vercel (*Settings* → *General*, si ofrece
   pausar). Esto también deja de servir la web: úsalo sólo si ya no lo
   necesitas de respaldo inmediato.

**Comprueba que quedaron apagados:** Vercel → proyecto → pestaña *Logs* o
*Cron Jobs*; mañana a las 13:00 UTC no debe aparecer ninguna ejecución.

### 13.3 Cambiar el DNS y reiniciar

Reinicia Eli (para que lea el `NEXTAUTH_URL` nuevo) y recarga Caddy:

```bash
sudo systemctl restart eli && sudo systemctl reload caddy
```

hPanel → *Dominios* → *Registros DNS*: cambia el registro **A de `@`** y el de
**`www`** para que apunten a la **IP del VPS** (borra el `CNAME`/`A` que apuntaba
a Vercel; un nombre no puede tener un `CNAME` y un `A` a la vez). TTL 300. Si
tenías `AAAA`, bórralos (el VPS no está configurado para IPv6).

Comprueba desde tu Mac (puede tardar de 1 a 10 minutos):

```bash
dig +short eli.example.cl
```

Debe mostrar la IP del VPS. Ahora Caddy pedirá el certificado del dominio final
(en cuanto el DNS le apunta). Míralo en el VPS:

```bash
sudo journalctl -u caddy -n 40 --no-pager
```

Busca `certificate obtained successfully`. Si no avanza, `sudo systemctl
reload caddy` otra vez.

### 13.4 Comprobar con el dominio final

Repite en la Mac los puntos **12.1, 12.2, 12.3 y 12.6** reemplazando el dominio
de prueba por el final. Y entra al sitio en el navegador: inicia sesión con
correo y **con Google**, mira la agenda, y una página pública de reservas.

Como `NEXTAUTH_SECRET` es el mismo y el dominio es el mismo, las sesiones que ya
estaban abiertas **siguen valiendo** (nadie tiene que volver a entrar).

### 13.5 Encender los crons del VPS (y sólo ahora)

Confirma una vez más que los de Vercel están apagados (13.2). Entonces:

```bash
sudo sed -i 's|^#DESACTIVADO# ||' /etc/cron.d/eli
```

```bash
grep -n llamar-cron /etc/cron.d/eli
```

Ninguna debe empezar con `#`. Al día siguiente, pasadas las 13:00 UTC:

```bash
journalctl -t eli-cron --since today --no-pager
```

Deben aparecer las dos corridas con `-> 200`.

### 13.6 Después

- Deja Vercel **como respaldo** (sin crons) por una o dos semanas.
- Sube el TTL del DNS otra vez a algo normal (p. ej. 3600) cuando estés tranquilo
  (esto hace más lento volver atrás, por eso se hace al final).
- Pon el monitoreo (apéndice).

### PLAN DE VUELTA ATRÁS a Vercel

Si algo sale mal **después** del cambio de DNS y no se arregla rápido, este es
el orden. (Con TTL 300, en ~5-10 minutos el tráfico vuelve.)

1. **Apaga los crons del VPS primero** (así no se duplican al volver a encender
   los de Vercel):

   ```bash
   sudo sed -i -E 's|^(0 13 .*llamar-cron)|#DESACTIVADO# \1|' /etc/cron.d/eli
   ```

2. **Enciende los crons de Vercel** (la forma que usaste en 13.2, al revés).
3. **Devuelve el DNS** a como estaba (lo que anotaste en 7.1): los registros
   `A`/`CNAME` de `@` y `www` que apuntaban a Vercel, TTL 300.
4. Asegúrate de que en Vercel `NEXTAUTH_URL` y las URIs de Google corresponden
   al dominio por el que se entra (si el dominio se mantuvo, ya lo están: por eso
   en 13.0 se **agregaron** las del VPS sin quitar las de Vercel).
5. Comprueba en el navegador y espera a que el DNS propague. El VPS puede
   quedarse encendido sin hacer daño (con los crons apagados).

Un problema *sólo de código* (no de servidor) se arregla sin tocar el DNS con
`volver-atras.sh` (paso 14).

---

## Paso 14. Actualizar Eli y volver a la versión anterior

### 14.1 Actualizar

```bash
cd /opt/eli/repo && git pull --ff-only && ./deploy/actualizar.sh
```

Para instalar una versión concreta (un commit o una rama):

```bash
cd /opt/eli/repo && ./deploy/actualizar.sh <commit-o-rama>
```

Qué hace (el detalle está al principio del propio script):

1. Baja el código y arma una carpeta nueva en `/opt/eli/releases/<commit>`.
2. **Si la versión trae migraciones nuevas, se detiene**: te muestra cuáles,
   consulta la base (sólo lectura) para decirte si ya constan como aplicadas, y
   te pide escribir exactamente `YA APLIQUE LAS MIGRACIONES`. **Nunca las aplica
   él.** Se aplican como siempre, a mano y con respaldo antes (README.md de la
   raíz, sección "Migraciones en producción"), y cada una dice si va antes o
   después de desplegar.
3. `npm ci` + `npm run build`. Si falla algo, la versión que corre no se toca.
4. Cambia el enlace `current`, reinicia el servicio y comprueba que responde
   (hasta 60 segundos). Si no responde, **vuelve solo a la versión anterior**.
5. Conserva las últimas 3 versiones.

Se puede correr dos veces seguidas sin problema: si esa versión ya está activa,
dice que no hay nada que hacer.

### 14.2 Volver a la versión anterior, a mano

```bash
/opt/eli/repo/deploy/volver-atras.sh
```

Cambia a la versión que estaba antes de la última actualización (sigue guardada)
y reinicia. Si la versión de la que sales trae migraciones que la anterior no
conoce, te avisa y pide confirmación: **volver atrás no deshace migraciones**
(las del proyecto son casi siempre aditivas y el código viejo sigue andando; el
README de la raíz lo dice caso por caso). Si lo corres otra vez, vuelves a la
versión que dejaste.

---

## Paso 15. Si se cae: qué mirar

Empieza siempre por aquí, en el VPS (entra con `ssh eli@IP_DEL_VPS`):

| Qué quieres saber | Comando |
|---|---|
| ¿Eli está vivo? | `systemctl status eli --no-pager` |
| ¿Caddy está vivo? | `systemctl status caddy --no-pager` |
| Qué dijo Eli antes de caer | `journalctl -u eli -n 100 --no-pager` |
| Qué dice Caddy (certificados, errores) | `sudo journalctl -u caddy -n 100 --no-pager` |
| Visitas y errores web en vivo | `sudo journalctl -u caddy -f` (salir: `Ctrl+C`) |
| ¿Eli responde por dentro? | `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/` (debe ser `200`) |
| ¿Quién escucha en los puertos? | `ss -tlnp \| grep -E ':(80\|443\|3000)'` |
| Disco | `df -h` (alarma si `/` pasa de 85%) |
| Memoria | `free -m` |
| Carga y tiempo encendido | `uptime` |
| ¿Se acabó la memoria alguna vez? | `sudo dmesg \| grep -i -E "out of memory\|oom"` |
| Cortafuegos | `sudo ufw status` |
| Crons | `journalctl -t eli-cron --since "2 days ago" --no-pager` |
| Respaldos | `journalctl -t eli-respaldo --since "2 days ago" --no-pager` y `ls -lh /var/backups/eli` |
| DNS (desde tu Mac) | `dig +short eli.example.cl` |

Qué buscar según lo que ves:

- **El navegador dice 502 / "Bad Gateway":** Caddy vive pero Eli no. Mira `systemctl
  status eli`. Si está `failed`: `journalctl -u eli -n 100 --no-pager`; casi
  siempre es una variable faltante (revisa 6.3), la base inaccesible, o un
  release roto (`./deploy/volver-atras.sh`). Para volver a intentar:
  `sudo systemctl reset-failed eli && sudo systemctl restart eli`.
- **No abre nada y `ping` no responde:** el VPS está apagado o bloqueado: hPanel →
  VPS → reiniciar. Si `ssh` no entra pero la web sí: `fail2ban` pudo bloquearte;
  desde la terminal del navegador de Hostinger: `sudo fail2ban-client set sshd
  unbanip TU_IP`.
- **Error de certificado / "sitio no seguro":** `sudo journalctl -u caddy -n 100`;
  casi siempre el DNS no apunta al VPS o el 80/443 están cerrados (`sudo ufw
  status`).
- **Todo responde `429`:** Upstash mal configurado o caído (`UPSTASH_*` en
  `eli.env`; falla cerrado a propósito). Tras corregir: `sudo systemctl restart eli`.
- **No salen correos:** `RESEND_API_KEY`/`RESEND_FROM_EMAIL`, o el remitente no
  está verificado en Resend; y mira `journalctl -u eli | grep -i resend`.
- **Los recordatorios no salieron:** `journalctl -t eli-cron --since today`. `401` =
  `CRON_SECRET` distinto entre `eli.env` y lo que espera Eli (reinicia Eli tras
  cambiarlo). `000` = Eli no respondía a las 13:00. Falta el archivo
  `/etc/cron.d/eli` o sus líneas están con `#DESACTIVADO#`.
- **Disco lleno:** `sudo du -xh / --max-depth=2 2>/dev/null | sort -h | tail -15`.
  Candidatos: `/opt/eli/releases` (versiones viejas), `/var/log`, `/var/backups/eli`.
  Para los registros: `sudo journalctl --vacuum-size=200M`.
- **Se reinicia en bucle:** `systemctl status eli` muestra `start-limit-hit`; mira
  `journalctl -u eli -n 100`. Es mejor que un bucle infinito.

---

## Apéndice: Monitoreo con UptimeRobot (avisa si se cae)

Gratis y sin instalar nada en el servidor (los nombres de los menús pueden
cambiar; la idea es la misma):

1. Crea una cuenta en `uptimerobot.com`.
2. *Add New Monitor* → tipo **HTTP(s)**.
3. *Friendly Name*: `Eli`. *URL*: `https://eli.example.cl/` (la tuya).
4. *Monitoring Interval*: **5 minutos** (lo mínimo del plan gratis, a lo que
   recuerdo).
5. *Alert Contacts*: tu correo (y el WhatsApp/Telegram si lo ofrece).
6. Guardar. Debe aparecer en verde ("Up").

Recomendado agregar un segundo monitor a una **página pública de reservas
real** (`https://eli.example.cl/reservar/<el-slug-de-un-negocio>`, tipo *Keyword*
con una palabra de esa página): esa sí toca la base de datos y avisa si Neon está
caído aunque la portada siga viva.

**No** pongas monitores sobre `/api/cron/...` (darían 401 siempre).

Un aviso no arregla nada: cuando llegue, ve al **paso 15**.
