# Eli en un VPS de Hostinger: guía paso a paso

Esta guía lleva Eli de Vercel a tu servidor (VPS) de Hostinger. Está escrita
para alguien que **no es técnico**: cada comando va en su propio recuadro, y
debajo dice qué deberías ver en pantalla. Si lo que ves es distinto, **para y
no sigas**: pega *sólo la salida del comando* (nunca claves ni contraseñas) a
quien te esté ayudando.

> **ESTE VPS YA ALOJA `sistemaone.com` CON nginx (en producción). NO APAGUES
> nginx.** Eli se agrega como un sitio más de ese mismo nginx (paso 9). Nunca
> `systemctl stop`, `restart` ni `disable` de nginx: sólo
> `sudo nginx -t && sudo systemctl reload nginx`. Caddy ya no se usa.

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
| **nginx** | El "recepcionista" de internet: **ya estaba instalado** en el VPS y sirve `sistemaone.com`. Recibe las visitas de `eliagenda.com`, y se las pasa a Eli. También protege el límite de intentos (ver paso 9). **Nunca se apaga ni se reinicia** (ver el aviso de arriba). |
| **Certbot** | El programa (también **ya instalado**) que pide y renueva solo el certificado HTTPS (Let's Encrypt) y lo pone en nginx. |
| **systemd** | Lo que arranca Eli solo al prender el servidor y lo vuelve a levantar si se cae. |
| **cron** | El reloj del servidor: dispara los recordatorios, los correos y los respaldos a su hora. |
| **Deploy key** | Una llave de *sólo lectura* que deja al servidor bajar el código de GitHub (el repositorio es privado). |
| **Release** | Una carpeta con una versión compilada de Eli. Se guardan las últimas 3 para poder volver atrás. |
| **Neon / Upstash / Resend** | Servicios externos que **siguen igual**: la base de datos, el límite de intentos y el correo. El VPS solo se conecta a ellos. |

## Cómo está armado

```
Internet ──► nginx (puertos 80 y 443, HTTPS; ya sirve sistemaone.com) ──► Eli (Next.js, 127.0.0.1:3000, sólo local)
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
| `/etc/sudoers.d/eli` | Los dos únicos comandos de administrador que `eli` puede usar sin contraseña (`deploy/sudoers-eli`). |
| `/etc/nginx/sites-available/eliagenda` | El sitio de Eli en nginx (copia de `deploy/nginx-eliagenda.conf`; Certbot le agrega el HTTPS). |
| `/etc/nginx/sites-enabled/zz-eliagenda` | Enlace que lo activa. Se llama `zz-` para que nginx lo lea **después** de `sistemaone` (si no, Eli sería el sitio por defecto). |
| `/etc/cron.d/eli` | Los relojes (crons y respaldo). |
| `/var/backups/eli` | Los respaldos de la base. |
| `/home/eli/.eli-avisos` | Un archivo por tarea con la fecha del último correo de aviso (para no repetirlos). Está fuera de `/var/backups/eli` a propósito: si esa carpeta falta o no se puede escribir, el aviso tiene que salir igual. |

## Qué se probó y qué NO (honestidad)

Este kit se armó **sin tener el VPS delante**. Lo que se pudo probar en otra
máquina Ubuntu 24.04 está marcado así; lo demás dice **A COMPROBAR EN EL VPS**
y trae el comando exacto.

| Pieza | Estado |
|---|---|
| `respaldo.sh` (contra un Postgres 16 local: dump, verificación, comparación de filas, retención, errores, aviso por correo) | Probado |
| `probar-restauracion.sh` (restaurar en base vacía; se niega a tocar "producción") | Probado |
| `actualizar.sh` / `volver-atras.sh` (releases, migraciones, salud, poda a 3) con un repositorio, un `systemctl`/`sudo` falsos y un servidor de juguete, **incluido** un release que muere al arrancar (queda `start-limit-hit`): `reset-failed` + regreso automático | Probado (con juguetes; **no** con systemd real) |
| `llamar-cron.sh` (401 sin secreto, 200 con secreto, el secreto no aparece en `ps`, espera del candado, aviso por correo con tope diario) | Probado |
| `npm ci --ignore-scripts` + `npx prisma generate` + `npm run build` + `next start` (`/`, una página de reservas con base, crons 401) | Probado en una carpeta limpia: **funciona sin los scripts de las dependencias** |
| `next start` con las variables de producción: arranca, `/` responde 200, cabeceras de seguridad y CSP, crons 401 sin secreto | Probado (compilación incluida) |
| `bash -n` y `shellcheck` de todos los `.sh`; `eli.service` con `systemd-analyze verify`; `deploy/sudoers-eli` con `visudo -cf` | Probado |
| Pruebas automáticas de `deploy/` (`npx vitest run deploy/`) | Probado |
| **`nginx-eliagenda.conf` con un nginx de verdad (1.24.0, la versión de Ubuntu 24.04)**: `nginx -t` lo acepta; borra `X-Vercel-Forwarded-For` (también en minúsculas, repetida y nombrada en `Connection`); `X-Real-IP` y `X-Forwarded-For` quedan sólo con la IP real; `Forwarded`, `True-Client-IP` y `CF-Connecting-IP` no llegan; `/api/cron` da 404 en 13 variantes (mayúsculas, `//`, `%2f`, `%63`, `/../`) sin llegar a la app; HSTS sale también en ese 404; 413 sobre 6 MB; el `www` redirige 301 | Probado aquí (`deploy/probar-cabeceras.sh`, con un eco en Node) |
| **Certbot 2.9.0 (la versión del VPS) reescribiendo ese archivo** en un nginx de pruebas con 80/443 y un sitio parecido a sistemaone: conserva las líneas de IP, HSTS, el 404 de cron y `client_max_body_size`; agrega `listen 443 ssl` y los redirects; HTTP→HTTPS y www→apex; un nombre desconocido (HTTP, HTTPS/SNI y la IP pelada) cae en el otro sitio, no en Eli (con el enlace `zz-eliagenda`; con `eliagenda` Eli pasaba a ser el sitio por defecto). También `nginx-eliagenda-https.conf` | Probado aquí con un certificado autofirmado (**sin** Let's Encrypt real) |
| **Let's Encrypt de verdad** (validación del dominio por el puerto 80 con el `www` redirigido dentro de `location /`, `renew --dry-run`) | **A COMPROBAR EN EL VPS** (9.6) |
| **Que el nginx del VPS no tenga `real_ip`/`proxy_protocol`/otro `default_server`**, y su `nginx.conf` real (aquí no hay acceso a él) | **A COMPROBAR EN EL VPS** (9.2) |
| **IPv6**: que un cliente IPv6 con SNI `eliagenda.com` caiga en sistemaone y no en Eli | Razonado desde cómo elige nginx el sitio (por socket); aquí no hay IPv6. **A COMPROBAR EN EL VPS** (9.7) |
| `eli.service` arrancando de verdad con el endurecimiento (`ProtectSystem`, `InaccessiblePaths`, `SupplementaryGroups`, etc.) | **A COMPROBAR EN EL VPS** (paso 8.5) |
| Que `sudo` acepte las dos reglas de `deploy/sudoers-eli` tal como los scripts las llaman (`sudo -n systemctl reset-failed eli` / `restart eli`) | **A COMPROBAR EN EL VPS** (paso 8.2: `sudo -l` y la prueba como `eli`) |
| Instalación de Node y PGDG desde sus repositorios | **A COMPROBAR EN EL VPS** (paso 3; son los métodos oficiales, pero no se pudieron abrir sus páginas desde aquí para recontrastar los comandos). nginx y Certbot ya estaban instalados: no se instalan |
| `cron.d` con `CRON_TZ=UTC` | **A COMPROBAR EN EL VPS** (paso 10) |
| Tiempo de compilación en el KVM 2 | **A COMPROBAR** (aquí, con 4 CPU: ~40 segundos de `npm run build` y ~16 de `npm ci`) |
| Envío real del correo de aviso con Resend (el remitente `RESEND_FROM_EMAIL` tiene que estar verificado en Resend) | **A COMPROBAR EN EL VPS** (paso 10.5). Aquí se probó contra un Resend de juguete |

## Antes de empezar: lo que tienes que saber de los datos de salud

Eli guarda **datos de salud de personas reales** (fichas clínicas, odontogramas,
evoluciones, citas). Esta guía deja el servidor razonablemente protegido de
ataques desde internet, pero hay riesgos que **no resuelve**, y es mejor que los
conozcas tú que descubrirlos después:

- **El disco del VPS no está cifrado por esta guía.** Quien tenga acceso al
  disco (el proveedor, un técnico, alguien que se lleve una copia) podría leer
  `/etc/eli/eli.env` (las claves) y `/var/backups/eli` (los respaldos son **toda
  la base de datos**, sin cifrar). Los permisos 600/640 protegen de otros
  usuarios *dentro* del servidor, no de quien tiene el disco. Pregúntale a
  Hostinger qué ofrece (cifrado de disco, y qué personal puede acceder).
- **Los snapshots y copias del proveedor** (los que Hostinger hace del disco
  completo, si tienes esa opción) contienen todo lo anterior. Tómalos en cuenta
  igual que a los respaldos.
- **El swap (paso 4)** es un archivo (`/swapfile`) donde el sistema vuelca
  memoria cuando le falta; esa memoria puede contener datos de pacientes y
  claves, y ahí quedan **sin cifrar**. Se vacía al apagar, pero no se borra de
  forma segura.
- **Las copias a tu Mac se acumulan** (paso 11.4: `rsync` no borra nada). En
  pocos meses tendrás decenas de copias completas de la base. Ver la política
  sugerida en 11.4: **FileVault encendido**, una carpeta que *no* esté sincronizada
  con iCloud/Dropbox, y borrar lo viejo.
- **Recomendado, NO implementado** (agrega una herramienta, así que requiere tu
  aprobación antes de hacerlo): **cifrar cada `.dump` con `age` o `gpg`** apenas
  se genera, de modo que ni el VPS ni la Mac guarden la base en claro. También:
  un servicio externo de aviso de caídas (healthchecks.io) y de errores (Sentry).
- **Consulta asesoría legal.** Los datos de salud tienen reglas propias: en Chile,
  la **Ley 20.584** (derechos y deberes de los pacientes; la ficha clínica es
  reservada) y la nueva **Ley 21.719** de protección de datos personales (los
  datos de salud son "sensibles"; exige medidas de seguridad y avisar de las
  brechas; confirma con tu asesor desde cuándo rige y qué te toca a ti como
  responsable y qué a cada clínica). Lo de esta guía son medidas técnicas, **no
  asesoría legal**.

---

## Paso 0. Requisitos y datos a mano

Antes de empezar, ten listo (en un gestor de contraseñas o una nota **que no
sea un chat**):

| Dato | Dónde se saca |
|---|---|
| **IP del VPS** | `187.41.114.36` (la confirmas en hPanel → *VPS* → tu servidor → *Resumen*, "Dirección IP"). En la guía, `IP_DEL_VPS` es ésa. |
| **Contraseña de root** | La que pusiste al crear el VPS (hPanel → VPS → *Configuración* si la quieres cambiar). |
| **Versión de Ubuntu** | `24.04.5` (hPanel → VPS → Resumen). Esta guía vale para **22.04 y 24.04**. |
| **Dominio** | `eliagenda.com`, comprado en Hostinger, con el DNS en hPanel. Todavía no sirve a Eli: hoy Eli vive sólo en su dirección de Vercel (`*.vercel.app`), así que pasar al VPS es un **lanzamiento** (paso 13), no un cambio de dirección. |
| **Variables de Eli** | Vercel → tu proyecto → *Settings* → *Environment Variables*. Son las mismas del paso 6. **`NEXTAUTH_SECRET` tiene que ser EXACTAMENTE el mismo que usa Vercel** (si no, los enlaces de baja y de cancelar/cambiar cita de los correos ya enviados dejan de servir). |
| **Acceso a GitHub** | Que seas administrador del repositorio `AE-ROD/Eli` (para crear la deploy key). |
| **Acceso a Neon** | Para saber la versión de Postgres (paso 3) y crear una base de pruebas (paso 11). |
| **Acceso a Google Cloud, Resend y Vercel** | Para el lanzamiento (paso 13) y para verificar el dominio en Resend (paso 7.4). |
| **Dónde está el DNS de tu dominio** | Ver el aviso al principio del paso 7. Si el dominio no está en Hostinger, los registros DNS se cambian en otro panel. |

**Este kit tiene que estar en la rama `main` de GitHub** (haber pasado por el
PR y el merge) antes del paso 5. Si todavía está en una rama de trabajo, avísale
a quien te ayuda: se puede probar desde esa rama, pero la guía asume `main`.

Dos decisiones que ya vienen tomadas:

- **Dominio sin `www`** (`eliagenda.com`). El `www` redirige a ese. Así hay una
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

**Antes**, genera una contraseña FUERTE y guárdala en tu gestor de contraseñas
(no en un chat, no en una nota suelta):

```bash
openssl rand -base64 24
```

Imprime algo como `q3Vn0b...=` (32 caracteres al azar). **Cópiala al gestor de
contraseñas ahora.** No inventes una "fácil": ver el recuadro de abajo.

```bash
adduser eli
```

Pide la contraseña (pega la que generaste; al pegar no se ve nada, es normal) y
luego datos como nombre y teléfono: déjalos vacíos con Enter. Al final pregunta
`Is the information correct? [Y/n]`: Enter.

> **Esta contraseña equivale a root.** Es como la contraseña de root: el usuario `eli` puede usar `sudo`
> (siguiente paso) y es el que construye y corre Eli; quien la tenga, tiene el
> servidor entero: las claves de `/etc/eli/eli.env` y todos los respaldos. Por
> eso tiene que ser larga y al azar, vivir sólo en tu gestor de contraseñas, y
> **nunca** repetirse en otro servicio. (Cuando apagues el ingreso por
> contraseña en SSH, paso 2.6, ya no sirve para entrar por internet; sigue
> sirviendo en la terminal del navegador de Hostinger y para `sudo`.)

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

> **En este VPS el cortafuegos YA ESTÁ configurado y encendido** (por
> `sistemaone.com`): ya permite `22/tcp`, `80/tcp`, `443/tcp` y `443/udp` (más
> las reglas `OpenSSH` y `Nginx Full` de la plantilla del proveedor). **No
> repitas los comandos de abajo ni apagues/reinicies `ufw`**: sólo
> compruébalo con `sudo ufw status verbose` y sigue con 2.4. No hace falta abrir
> nada más; el 443/udp (HTTP/3) ya está abierto pero Eli **no** lo usa: nginx no
> lo atiende aquí. Lo que sigue queda como referencia para un servidor nuevo.

**Primero se permite SSH y recién después se enciende. Si lo haces al revés te
quedas afuera.**

> **Antes de nada, dos cosas que evitan quedarte afuera:**
>
> 1. **¿En qué puerto escucha SSH de verdad?** Casi siempre es el 22, pero no lo
>    supongas: si estuviera en otro y bloqueas el 22, te cortas solo.
>
>    ```bash
>    sudo ss -tlnp | grep sshd
>    ```
>
>    Debe mostrar `0.0.0.0:22` (y/o `[::]:22`). Si ves **otro número** (por
>    ejemplo `:2222`), usa ESE en `sudo ufw allow NUMERO/tcp` en lugar de 22.
> 2. **El firewall de Hostinger.** En hPanel → VPS → tu servidor puede haber un
>    *Firewall* propio (aparte de `ufw`). Si existe y está activo, debe dejar
>    abiertos **22, 80 y 443**; si no, el sitio no
>    será visible aunque `ufw` esté bien. Y recuerda: si te quedas sin SSH, la
>    **terminal del navegador de hPanel** entra sin pasar por el 22.

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

Debe decir `Status: active` y permitir 22, 80 y 443 (`ALLOW IN`). **En este
VPS verás además** `443/udp` y las reglas `OpenSSH` y `Nginx Full` de la plantilla
del proveedor (y sus versiones `(v6)`): es lo esperado, no las borres (sistemaone
las usa).

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

**Opcional, recomendado si tu IP de casa/oficina es fija:** que fail2ban nunca te
bloquee a ti por equivocarte de clave. Cambia `TU_IP` por tu IP pública (búscala
con `curl -s https://api.ipify.org` en tu Mac):

```bash
printf '[DEFAULT]\nignoreip = 127.0.0.1/8 ::1 TU_IP\n' | sudo tee /etc/fail2ban/jail.d/eli.local
```

```bash
sudo systemctl restart fail2ban
```

(Si tu IP cambia seguido, no lo hagas: una IP vieja aquí sólo deja pasar a otro.)

### 2.5 Actualizaciones de seguridad automáticas

```bash
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' | sudo tee /etc/apt/apt.conf.d/20auto-upgrades
```

Repite las dos líneas. Esto instala solos los parches de seguridad de Ubuntu.
Algunos parches (el kernel, por ejemplo) sólo se aplican al reiniciar, así que
se deja que el servidor se reinicie **solo, cuando haga falta, a las 07:00 UTC**
(04:00 en Chile en verano; después del respaldo de las 06:30 y lejos de los
crons de las 13:00):

```bash
printf 'Unattended-Upgrade::Automatic-Reboot "true";\nUnattended-Upgrade::Automatic-Reboot-Time "07:00";\n' | sudo tee /etc/apt/apt.conf.d/52eli-reinicio
```

```bash
apt-config dump | grep -i Automatic-Reboot
```

Debe mostrar `Automatic-Reboot "true";` y `Automatic-Reboot-Time "07:00";`. Sólo
reinicia si hay un parche que lo pide (existe `/var/run/reboot-required`) y si
no hay nadie conectado por SSH. Un reinicio deja Eli caído 1-2 minutos y vuelve
solo (es lo que se prueba en 12.9).

**Lo que NO se actualiza solo:** Node (NodeSource) y el cliente de Postgres
(PGDG) vienen de repositorios aparte que `unattended-upgrades` no toca. (nginx y
Certbot vienen de Ubuntu: sí se actualizan solos, y el paquete de nginx se
actualiza **en caliente**, sin cortar sistemaone. Tú nunca lo reinicias.)
Una vez al mes, mira los avisos y actualiza a mano:

```bash
sudo apt update && apt list --upgradable
```

```bash
sudo apt upgrade
```

Si actualizó `nodejs`, aplica con `sudo systemctl restart eli` y revisa que Eli
responda (`curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/`
debe decir `200`). *(Alternativa para avanzados, no recomendada para empezar:
agregar esos repositorios a `Unattended-Upgrade::Origins-Pattern` copiando
`origin=` y `archive=` de lo que muestre `apt-cache policy nodejs`. Una
actualización automática de Node puede cambiar el comportamiento sin que lo
veas.)*

### 2.6 Apagar el ingreso por contraseña (SÓLO después de comprobar la llave)

> **CUIDADO: aquí es donde la gente se queda sin poder entrar.** Haz exactamente
> en este orden. Mantén abierta la sesión actual hasta el final.

**(0) Antes de tocar nada, ten UNA SALIDA de emergencia:**

- Guarda una **copia de tu llave privada** (`~/.ssh/id_ed25519`, el archivo SIN
  `.pub`) en tu gestor de contraseñas o en un USB cifrado; ya está protegida por
  la frase que le pusiste. Si pierdes tu Mac y no tienes copia, sólo te queda la
  terminal del navegador de Hostinger.
- Mejor aún: **agrega una segunda llave pública** (la de otro computador, o una
  de respaldo) a `/home/eli/.ssh/authorized_keys`, una línea por llave.
- Y recuerda dónde está el salvavidas: **hPanel → VPS → tu servidor →
  Terminal** (en el navegador). No usa SSH, así que funciona aunque el SSH quede
  mal configurado; entras como `root` con la contraseña de root.

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

Comprueba la configuración que SSH realmente está usando (no la que tú creías
haber escrito):

```bash
sudo sshd -T | grep -E 'passwordauthentication|permitrootlogin|kbdinteractiveauthentication'
```

Debe decir `passwordauthentication no`, `permitrootlogin no` y
`kbdinteractiveauthentication no`. Si alguna dice `yes`, otro archivo la está
pisando (mira `ls /etc/ssh/sshd_config.d/`): no cierres la sesión y avisa.

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

## Paso 3. Instalar Node 22, git y el cliente de Postgres (nginx y Certbot ya están)

### 3.1 Herramientas base

```bash
sudo apt install -y ca-certificates curl gnupg git openssl
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

### 3.3 nginx y Certbot: ya están instalados (no instales nada)

Este VPS ya tiene nginx (sirviendo `sistemaone.com`) y Certbot 2.9.0. **No los
instales ni los actualices a mano.** Sólo comprueba que están:

```bash
nginx -v && certbot --version
```

Debe decir `nginx version: nginx/1.24.0 (Ubuntu)` (o parecido) y `certbot 2.9.0`.
Si falta alguno, **para y avisa**: no instales Caddy ni otro servidor web, y no
reinicies nginx.

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

> **Ojo, datos de salud:** el swap guarda en el disco, **sin cifrar**, trozos de
> la memoria (que pueden incluir datos de pacientes y claves). Es el precio de
> tener colchón al compilar. Ver "Antes de empezar: lo que tienes que saber de
> los datos de salud", al principio.

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

Debe listar `nginx-eliagenda.conf`, `README.md`, `actualizar.sh`, etc. (Si no existe
`deploy`, el kit todavía no está en `main`: ver paso 0.)

### 5.7 Proteger la rama `main` en GitHub (hazlo ahora, una sola vez)

**Por qué:** `actualizar.sh` instala lo que haya en `origin/main` y lo **ejecuta
en tu servidor** (`npm ci`, `npm run build`, y luego la app, con acceso a las
claves). Quien pueda escribir en `main` sin que nadie lo revise puede, en la
práctica, ejecutar código en tu servidor con datos de pacientes. Por eso `main`
sólo debe recibir cambios por *pull request* revisado.

En el navegador, con tu cuenta de administrador de `AE-ROD/Eli`:

1. `github.com/AE-ROD/Eli` → pestaña **Settings** (arriba a la derecha).
2. En el menú de la izquierda: **Branches** (bajo *Code and automation*) →
   **Add branch ruleset** (o *Add classic branch protection rule*, según lo que
   te ofrezca tu cuenta; las dos sirven). Si prefieres, **Rules → Rulesets →
   New ruleset → New branch ruleset**.
3. Nombre: `proteger-main`. *Enforcement status*: **Active**.
4. *Target branches* → **Add target** → *Include default branch* (o escribe el
   patrón `main`).
5. Marca estas reglas:
   - **Require a pull request before merging** con **0** aprobaciones requeridas
     si eres la única persona con cuenta en el repositorio (GitHub no deja que
     apruebes tu propio PR: con "1 aprobación" y sin bypass te quedas sin poder
     entrar a `main` tú mismo). Si hay una segunda cuenta que revisa, ahí sí puede
     ser 1.
   - **Require status checks to pass** y agrega la verificación del CI
     (`build-and-test`).
   - **Block force pushes** (no permitir `git push --force`).
   - **Restrict deletions** (no permitir borrar la rama).
   - En las versiones con "Do not allow bypassing the above settings" /
     "Include administrators": **actívalo**, para que tampoco tú puedas saltártelas
     por descuido.
6. **Create** / **Save changes**.

**Qué ataja esta regla y qué no:** ataja los accidentes (un `git push` a `main`
por descuido, o un cambio sin pasar por PR). **No** protege contra un token o una
cuenta de GitHub comprometidos con permiso de administrador: quien la controla
puede desactivar la regla. Por eso la cuenta de GitHub lleva contraseña fuerte y
verificación en dos pasos.

**Comprueba la regla sin ensuciar `main`. NUNCA pruebes empujando a `main`:** si
la regla no estuviera activa, ese cambio entraría de verdad y `actualizar.sh` lo
instalaría. Dos formas seguras:

- En la interfaz: `github.com/AE-ROD/Eli` → *Settings* → *Rules* → *Rulesets* →
  `proteger-main` debe decir **Active** y listar `main` como destino (con
  clásicas: *Settings* → *Branches* → la regla de `main`).
- O con una rama desechable que **sí** quede cubierta por la regla: crea un
  ruleset de prueba sobre el patrón `prueba-regla-*` con las mismas reglas,
  intenta `git push origin HEAD:prueba-regla-1` desde una copia de trabajo (debe
  ser **rechazado**, `protected branch hook declined` o similar) y borra el ruleset
  de prueba después. Si lo acepta, la regla no quedó activa.

> GitHub puede decirte que esta protección en repositorios **privados** requiere
> un plan de pago (Pro/Team). Si es tu caso, no sigas como si nada: avisa a
> quien te ayuda (alternativas: pagar el plan, o dejar de usar `main` como rama
> de despliegue y desplegar sólo commits que tú revisaste: `./deploy/actualizar.sh <commit>`).

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
| `NEXTAUTH_URL` | **Sí** (en producción, sin ella los correos no salen) | La dirección pública: `https://eliagenda.com` (sin barra final). |
| `NEXTAUTH_SECRET` | **Sí** | Firma las sesiones y los enlaces de baja. **Copiar el mismo de Vercel.** |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | **Sí** (para entrar con Google) | Google Cloud → Credenciales. Los mismos de Vercel. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | **Sí en producción** | Límite de intentos. **Sin ellas, todo endpoint responde 429** (falla cerrado a propósito). |
| `CRON_SECRET` | **Sí** (si falta, los crons responden siempre 401) | Contraseña que protege `/api/cron/*`. **Crea una NUEVA para el servidor** (`openssl rand -hex 32`, y guárdala en tu gestor de contraseñas); no reutilices la de Vercel: así, si una se filtra, la otra sigue sirviendo. Mientras dure la mudanza, Vercel conserva la suya y el VPS la nueva; nadie más las usa. |
| `RESEND_API_KEY` | Recomendada | Correos. Sin ella no sale ningún correo (ni recordatorios), pero nada se rompe. |
| `RESEND_FROM_EMAIL` | Recomendada | Remitente, p. ej. `Eli <no-reply@tu-dominio-verificado.cl>`. Si falta usa un valor por defecto que no es tuyo. |
| `SOPORTE_EMAIL` | **Recomendada** | Casilla que recibe las solicitudes de soporte **y los avisos automáticos de fallo** de los respaldos y los crons (paso 10.5). Sin ella (o sin `RESEND_API_KEY`/`RESEND_FROM_EMAIL`) esos avisos no salen y los fallos quedan sólo en el registro del servidor, donde nadie los ve. |
| `ELI_URL_SALUD_EXTRA` | Opcional (no la lee la app, la leen `actualizar.sh` y `volver-atras.sh`) | Dirección local de una página pública que **toque la base de datos**, p. ej. `http://127.0.0.1:3000/reservar/<slug-de-un-negocio-real>`. Además de la portada, tiene que responder bien para dar por buena una versión nueva (paso 14.1). |

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

> **SÓLO UNA VEZ.** El comando de abajo crea el archivo **vacío**; si ya existía
> uno con tus claves, lo borraría. Por eso está protegido: si el archivo ya
> existe, no hace nada y te avisa.

```bash
[ -e /etc/eli/eli.env ] && echo "YA EXISTE /etc/eli/eli.env: NO lo toques, sigue al siguiente comando (nano)" || sudo install -m 640 -o root -g eli /dev/null /etc/eli/eli.env
```

Ábrelo con el editor `nano`:

```bash
sudo nano /etc/eli/eli.env
```

Pega esto y **reemplaza cada `CAMBIAR`** con el valor real (cópialos desde
Vercel → *Settings* → *Environment Variables* → ojo para mostrar el valor; el
`CRON_SECRET` es la excepción: ese es NUEVO, ver la tabla; y
`RESEND_FROM_EMAIL` lleva el remitente de tu dominio, ver abajo).
Reglas: sin comillas, sin espacios alrededor del `=`, una variable por línea,
sin la palabra `export`:

```
NODE_ENV=production
DATABASE_URL=CAMBIAR
DIRECT_URL=CAMBIAR
NEXTAUTH_URL=https://eliagenda.com
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

(`ELI_URL_SALUD_EXTRA` **no** va en esta plantilla todavía: se agrega en el paso
14.1, cuando ya sepas qué página de reservas usar.)

**Guarda una copia de este archivo en tu gestor de contraseñas** (cada valor,
como nota segura; nunca en un chat). Si el VPS se pierde, sin esas claves no
puedes levantar otro (paso 11.5).

`NEXTAUTH_URL` es `https://eliagenda.com` desde el principio (sin barra final):
Eli no vive todavía en ese dominio, así que no hay una dirección "de prueba"
aparte. `RESEND_FROM_EMAIL` debe ser un remitente del dominio, p. ej.
`Eli <no-reply@eliagenda.com>`; **hasta que Resend verifique el dominio (paso 7.4)
los correos no salen**: ponlo ahora y verifícalo en el paso 7.4. La URI de Google
(`https://eliagenda.com/api/auth/callback/google`) se agrega en el paso 13.0.

### 6.3 Comprobar (sin mostrar los secretos)

```bash
ls -l /etc/eli/eli.env
```

Debe empezar con `-rw-r-----` y decir `root eli`.

```bash
for v in NODE_ENV DATABASE_URL DIRECT_URL NEXTAUTH_URL NEXTAUTH_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN CRON_SECRET RESEND_API_KEY RESEND_FROM_EMAIL SOPORTE_EMAIL; do if grep -q "^$v=." /etc/eli/eli.env && ! grep -q "^$v=CAMBIAR$" /etc/eli/eli.env; then echo "ok      $v"; else echo "FALTA   $v"; fi; done
```

Debe decir `ok` en todas (`FALTA` si está vacía o todavía dice `CAMBIAR`).
No imprime ningún valor.

Y que no quedó ningún valor de ejemplo ni de relleno (`CAMBIAR`, `example`):

```bash
grep -ciE "CAMBIAR|example" /etc/eli/eli.env
```

Debe imprimir `0`. Si imprime otro número, hay una línea sin completar o con un
dominio de ejemplo (por ejemplo un `SOPORTE_EMAIL=...@example.com`): ábrela
(`sudo nano /etc/eli/eli.env`) y corrígela. Y que `NEXTAUTH_URL` es la correcta:

```bash
grep "^NEXTAUTH_URL=" /etc/eli/eli.env
```

Debe imprimir exactamente `NEXTAUTH_URL=https://eliagenda.com`.

Y que `eli` (no root) puede leerlo:

```bash
test -r /etc/eli/eli.env && echo "eli puede leerlo"
```

---

## Paso 7. DNS en Hostinger (el dominio `eliagenda.com`)

El DNS es la libreta que dice "el dominio `eliagenda.com` está en tal IP". El
dominio es nuevo y todavía no lo usa nadie (**caso A**): el DNS se apunta al VPS
desde ya y todas las pruebas se hacen directamente con `eliagenda.com`. Eli
sigue funcionando en su dirección de Vercel mientras tanto; el lanzamiento
(avisar a los clientes, encender los crons del VPS) es el paso 13.

El DNS de `eliagenda.com` está en Hostinger, así que se edita en **hPanel →
*Dominios* → `eliagenda.com` → *DNS / Servidores de nombres* → *Registros DNS***.
Confírmalo (en tu Mac):

```bash
dig +short NS eliagenda.com
```

Debe responder nombres de Hostinger (algo como `ns1.dns-parking.com`). Si
respondiera otros, el DNS está en otro servicio y los registros se cambian
**en el panel de ese servicio** (las instrucciones valen igual).

> **No crees registros `AAAA` (IPv6)** para este dominio: el sitio de Eli en
> nginx escucha sólo en IPv4 a propósito (paso 9.1) y Let's Encrypt usaría el
> `AAAA` para validar y caería en sistemaone (fallaría). Si hPanel ya trajo alguno, **bórralo**.
>
> **Si algún día pones Cloudflare delante**, déjalo en "solo DNS" (nube gris):
> con la nube naranja queda delante de nginx y todo el cálculo de la IP del
> cliente (paso 9.1) dejaría de valer.

### 7.1 Ver y anotar cómo está hoy

Antes de tocar nada, toma una captura de los registros actuales (por si algo
hay que deshacer). Un dominio recién comprado en Hostinger suele traer
registros de "estacionamiento" (*parking*) o de *Website*/*Website Builder*
apuntando a servidores de Hostinger, y a veces un `AAAA`. Esos **chocan** con los
nuevos: un mismo nombre no puede tener un `CNAME` y un `A` a la vez, y si quedan
dos `A` distintos, la mitad de las visitas irían al sitio equivocado.

### 7.2 Crear los registros del VPS

En *Registros DNS*:

1. **Borra** los registros de `@` y `www` de tipo `A`, `AAAA` y `CNAME` que
   pertenezcan al estacionamiento/Website de Hostinger (los que apuntan a sus
   servidores, no a tu VPS), y **todo** `AAAA`. **No borres** los `MX` (correo del
   dominio, si lo usas), los `TXT` (SPF/verificaciones) ni los `NS`.
2. **Agrega** (TTL bajo, 300 = 5 minutos, para poder corregir rápido):

| Tipo | Nombre | Apunta a | TTL |
|---|---|---|---|
| A | `@` | `187.41.114.36` | 300 |
| CNAME | `www` | `eliagenda.com` | 300 |

(Si hPanel no te deja crear el `CNAME` de `www`, usa un registro `A` de `www`
a `187.41.114.36`; funciona igual.) El `www` sólo sirve para que nginx lo
redirija al dominio sin `www`.

### 7.3 Comprobar que el DNS ya apunta (en tu Mac)

```bash
dig +short eliagenda.com @8.8.8.8
```

```bash
dig +short eliagenda.com @1.1.1.1
```

Los dos deben imprimir `187.41.114.36` y nada más. Si no imprime nada, espera unos
minutos y repite (sin `dig`: `nslookup eliagenda.com`). Comprueba también que no
quedó ningún `AAAA` y que el `www` apunta bien:

```bash
dig +short AAAA eliagenda.com
```

(no debe imprimir nada) y

```bash
dig +short www.eliagenda.com
```

(debe mostrar `eliagenda.com.` y/o `187.41.114.36`). **No sigas al paso 9 hasta que
esto esté así**: Certbot (9.6) valida el dominio por el puerto 80 y necesita que
ya apunte al VPS.

### 7.4 Verificar `eliagenda.com` en Resend (para que los correos salgan de tu dominio)

Los correos de Eli (y los avisos de fallo del paso 10.5) salen de
`RESEND_FROM_EMAIL`, que será `Eli <no-reply@eliagenda.com>`. Resend sólo envía
desde un dominio **verificado**, y eso se hace con registros en el DNS que
tú agregas aquí mismo en hPanel:

1. En Resend → *Domains* → *Add Domain* → `eliagenda.com` (región cercana a tus
   clientes).
2. Resend te muestra una lista de registros (SPF y DKIM, tipos `TXT`/`MX`/`CNAME`,
   normalmente con nombres como `send` y `resend._domainkey`). Agrégalos en hPanel
   **tal cual** los muestra Resend (nombre, tipo y valor), **sin tocar los
   registros que ya existan**. Si ya tienes un `TXT` de SPF en `@`
   (`v=spf1 ...`), no crees un segundo: un nombre sólo puede tener uno.
3. Agrega también un **DMARC** (recomendado; avisa si alguien suplanta tu
   dominio). **Primero mira si ya existe uno** (Hostinger a veces trae uno por
   defecto), porque un segundo `TXT` en `_dmarc` invalida el DMARC entero:

   ```bash
   dig +short TXT _dmarc.eliagenda.com
   ```

   Si imprime algo que empieza con `"v=DMARC1;`, **edita ese registro** en hPanel
   en vez de crear otro. Si no imprime nada, crea un `TXT` con nombre `_dmarc` y valor
   `v=DMARC1; p=none; rua=mailto:TU_CORREO` (empieza en `p=none`, que sólo
   observa; cuando veas que todo lo tuyo pasa, se puede endurecer). Si Resend te
   muestra su propio valor de DMARC, usa el de Resend.
4. En Resend pulsa *Verify* y espera a que diga **Verified** (minutos a unas
   horas). `RESEND_FROM_EMAIL` ya está en `eli.env` (paso 6): no hay nada más que
   cambiar.

Hasta que diga *Verified*, Resend rechaza los envíos (y el aviso del paso 10.5
fallará).

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

Los scripts de actualización necesitan reiniciar Eli sin pedir contraseña. Se le
da a `eli` permiso para **dos comandos exactos** (no para "administrar todo"),
escritos en `deploy/sudoers-eli`:

- `systemctl restart eli`: reiniciar Eli.
- `systemctl reset-failed eli`: si una versión nueva se muere al arrancar, systemd
  se rinde tras 10 intentos en 5 minutos y deja Eli en `failed (start-limit-hit)`;
  en ese estado **rechaza** cualquier reinicio hasta un `reset-failed`. Sin esta
  línea, el regreso automático a la versión anterior fallaría justo cuando hace
  falta.

Un archivo `sudoers` con un error puede dejarte **sin `sudo`**. Por eso se
valida ANTES de instalarlo: se copia a un archivo temporal, `visudo -cf` lo
revisa, y sólo si dice `parsed OK` se instala (la cadena de `&&` se corta ante
cualquier error y no instala nada):

```bash
TMP_SUDOERS="$(mktemp)" && cp /opt/eli/repo/deploy/sudoers-eli "$TMP_SUDOERS" && sudo visudo -cf "$TMP_SUDOERS" && sudo install -m 440 -o root -g root "$TMP_SUDOERS" /etc/sudoers.d/eli; rm -f "$TMP_SUDOERS"
```

Debe imprimir `/tmp/tmp.XXXX: parsed OK` y nada de `error`. Si dice `syntax
error`, **no se instaló nada**: avisa (no lo arregles a mano).

Comprueba que quedó bien instalado y que `sudo` lo acepta tal como lo llaman los
scripts (**A COMPROBAR EN EL VPS**; no se pudo probar con un `sudo` real):

```bash
sudo ls -l /etc/sudoers.d/eli
```

Debe empezar con `-r--r-----` y decir `root root`.

```bash
sudo -l | grep -A3 "NOPASSWD"
```

Debe listar exactamente `/usr/bin/systemctl restart eli` y `/usr/bin/systemctl
reset-failed eli`. Y que `systemctl` es el de esa ruta:

```bash
command -v systemctl
```

Debe decir `/usr/bin/systemctl`. Por último, la prueba de verdad (no cambia
nada: limpiar un estado "fallido" que no existe no hace daño):

```bash
sudo -n systemctl reset-failed eli && echo "sudo sin contraseña: OK"
```

Debe imprimir `sudo sin contraseña: OK`. Si pide contraseña o dice `a password
is required`, la regla no coincide con lo que los scripts ejecutan: no sigas.

*(Si en una versión anterior de esta guía creaste `/etc/sudoers.d/eli-reiniciar`,
bórralo: `sudo rm /etc/sudoers.d/eli-reiniciar`.)*

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
   progreso). Se instala con `--ignore-scripts`: npm **no ejecuta** los scripts
   de instalación de las ~500 dependencias (código de terceros que, de otro
   modo, correría como tu usuario `eli`, con acceso a las claves y a los
   respaldos). Se probó que la compilación y el arranque no los necesitan; el
   cliente de Prisma se genera aparte con `npx prisma generate`.
4. `Compilando (prisma generate + npm run build)...` (1-3 minutos aquí; en el
   KVM 2 puede ser más: **A COMPROBAR**). Termina con una lista de rutas
   (`ƒ (Dynamic)`).
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

**A COMPROBAR EN EL VPS: el proceso de Eli no ve los respaldos ni tiene grupos
extra.** `eli.service` trae `InaccessiblePaths=-/var/backups/eli` y
`SupplementaryGroups=` (vacío). Comprueba:

```bash
systemctl show eli -p SupplementaryGroups
```

Debe imprimir `SupplementaryGroups=` (vacío).

```bash
sudo grep -E '^(Uid|Gid|Groups):' /proc/$(systemctl show eli -p MainPID --value)/status
```

Muestra los números de usuario y grupos con los que corre el proceso. Compáralos
con `id eli` (mismos números = el servicio hereda los grupos que `eli` tenga en
`/etc/group`; es esperable, y por eso `eli` **no** debe estar en más grupos de
los necesarios: `sudo`, `systemd-journal` y el suyo). Lo que sí debe cumplirse
es que el servicio no puede abrir los respaldos (cuando exista la carpeta, paso
10.3; esta comprobación se repite ahí):

```bash
sudo nsenter -t $(systemctl show eli -p MainPID --value) -m ls /var/backups/eli
```

Debe fallar o mostrar la carpeta **vacía** (`Permission denied`/sin archivos).
Si lista los `.dump`, avisa. *(Nota: `SupplementaryGroups=` vacío no le quita
al proceso los grupos que `eli` ya tiene en el sistema; lo que protege es
`InaccessiblePaths` y los permisos de los archivos. Quitar esos grupos de verdad
exige separar el usuario del servicio: ver "Mejoras futuras" al final.)*

---

## Paso 9. nginx (HTTPS y la IP del cliente), conviviendo con sistemaone.com

> **ALTO. LEE ESTO ANTES DE TOCAR NADA.** Este VPS **ya sirve `sistemaone.com` en
> producción con este mismo nginx**. Eli se agrega como **un sitio más** de ese
> nginx; no hay otro servidor web (Caddy ya no se usa: no puede compartir los
> puertos 80/443 con nginx).
>
> **NUNCA `systemctl stop`, `restart` ni `disable` de nginx** (ya hubo un corte de
> 5 minutos de `sistemaone.com` por apagarlo por error). **Lo único permitido es
> `sudo nginx -t && sudo systemctl reload nginx`**: `nginx -t` revisa la
> configuración y `reload` la aplica **sin cortar** ninguna conexión, y si la
> configuración está mal, `nginx -t` falla y el `reload` ni se ejecuta.
>
> **No toques `/etc/nginx/sites-enabled/sistemaone`** (ni su archivo en
> `sites-available`, ni `/etc/nginx/nginx.conf`). Este paso sólo **agrega** un
> archivo nuevo.
>
> **Antes y después de CADA cambio** comprueba que sistemaone sigue vivo:
>
> ```bash
> curl -sI https://sistemaone.com | head -1
> ```
>
> Debe decir `200` (`HTTP/1.1 200 OK`, o `HTTP/2 200`). Si deja de decirlo, **ve
> directo a 9.9 (vuelta atrás)**.

### 9.1 Qué hace y por qué es crítico

`deploy/nginx-eliagenda.conf` hace seis cosas: manda el `www` al dominio sin
`www`, **escucha sólo en IPv4**, comprime las respuestas, responde 404 a
`/api/cron` y `/api/cron/*` desde internet (los crons llaman directo a
`127.0.0.1:3000`, sin pasar por nginx), pone HSTS y —lo importante— **decide qué
IP "ve" Eli**. El candado HTTPS lo agrega Certbot en 9.6.

El límite de intentos de login (10 por minuto por IP, etc.) cuenta por IP. El
código (`lib/rate-limit.ts`, `obtenerIp`) confía primero en la cabecera
`x-vercel-forwarded-for`, luego en `x-real-ip` y luego en `x-forwarded-for`.
En Vercel eso era seguro porque Vercel las pisaba. **Aquí las pisa nginx**:

- `proxy_set_header X-Vercel-Forwarded-For "";` — con valor vacío, nginx **no
  pasa** esa cabecera a Eli (la documentación de nginx lo dice así, y se probó con
  un nginx real: tampoco pasa la que mande el cliente, en minúsculas,
  mayúsculas ni repetida).
- `proxy_set_header X-Real-IP $remote_addr;` y `proxy_set_header X-Forwarded-For
  $remote_addr;` — **reemplazan** lo que mande el cliente por la IP de la
  conexión TCP real. **Nunca `$proxy_add_x_forwarded_for`**: ése *suma* a la
  cabecera del cliente y es justo el ataque.

Sin eso, un atacante cambiaría de "IP" en cada pedido y se saltaría el límite de
intentos. Hay una prueba automática (`deploy/deploy.test.ts`) que falla si alguien
quita esas líneas, y una comprobación en vivo con un nginx real
(`deploy/probar-cabeceras.sh`, 9.5 y 12.5).

**Qué se sabe con certeza y qué no (sobre esas cabeceras).** Con certeza (probado
aquí con nginx 1.24.0, la misma versión de Ubuntu 24.04): el valor vacío borra la
cabecera, `$remote_addr` pisa lo del cliente, y un `Connection: X-Real-IP, ...`
inventado por el cliente no sirve (nginx fija su propio `Connection`). Lo que
depende de **cómo esté configurado el nginx del VPS** y por eso se comprueba en
9.2: que no haya `set_real_ip_from`/`real_ip_header` ni PROXY protocol (con
ellos, `$remote_addr` dejaría de ser la IP de la conexión).

> Si algún día pones otro servicio delante de nginx (Cloudflare, otro proxy),
> esto hay que rehacerlo. Avísale a quien mantiene el código.

**Por qué sólo IPv4 (ningún `listen [::]` en el archivo de Eli).** El límite
cuenta por la dirección *completa* de la conexión. En IPv4 cada conexión tiene una
dirección; en IPv6, a cada cliente se le entrega un bloque entero (un `/64`, 18
trillones de direcciones) y un atacante puede usar una distinta en cada pedido,
saltándose el límite como si no existiera. Es una decisión deliberada: **no crees
registros DNS `AAAA`** (paso 7) ni agregues `listen [::]...` al sitio de Eli (hay
una prueba automática que falla si aparece).

**¿Qué pasa con un cliente IPv6 que pide `eliagenda.com`?** `sistemaone` sí
escucha en IPv6 (`listen [::]:443 ssl ipv6only=on;`). nginx elige el sitio sólo
entre los que escuchan en el *socket* que recibió la conexión, y Eli no escucha en
ningún `[::]`. Entonces un cliente que fuerce IPv6 con el nombre `eliagenda.com`
(por ejemplo con `curl -6 --resolve`) cae en el sitio **por defecto de
sistemaone** (su certificado y su contenido; el navegador avisará que el
certificado no es de `eliagenda.com`) y **nunca llega a Eli**. Se comprueba en 9.7.

**El orden de los archivos importa (el enlace se llama `zz-eliagenda`).** El
primer sitio que nginx lee para un puerto es el **sitio por defecto** de ese
puerto: el que contesta a nombres desconocidos, a la IP pelada y a los escáneres.
nginx lee `sites-enabled/` en orden alfabético y `eliagenda` ordena antes que
`sistemaone`: si el enlace se llamara `eliagenda`, Eli pasaría a ser el sitio por
defecto y cambiaría lo que ve cualquiera que no escriba bien el nombre de
sistemaone. Por eso el enlace se llama **`zz-eliagenda`** (queda después) y no se
usa `default_server` en ninguno de los dos archivos. 9.4 lo comprueba.

### 9.2 Inventario previo (sólo mirar, no cambia nada)

Antes de agregar nada, anota cómo está el nginx **hoy**. Ninguno de estos comandos
modifica nada. (VPS.)

```bash
curl -sI https://sistemaone.com | head -1
```

Debe decir `200`. **Anota que lo dijo**: es tu línea base.

```bash
systemctl is-active nginx && nginx -v
```

Debe decir `active` y una versión (en Ubuntu 24.04, `nginx/1.24.0`).

```bash
ls -la /etc/nginx/sites-enabled/
```

Debe listar `sistemaone` (un enlace a `../sites-available/sistemaone`). **No debe
existir todavía** `zz-eliagenda` ni `eliagenda`. Si hay otros sitios que no
conoces, no los toques y avisa.

```bash
sudo ss -tlnp | grep -E ':(80|443) '
```

Debe mostrar sólo `nginx` escuchando en 80 y 443 (`0.0.0.0:80`, `0.0.0.0:443` y
probablemente `[::]:80`/`[::]:443` por sistemaone). Nada de `caddy` ni de `apache`.

```bash
sudo nginx -T 2>/dev/null | grep -nE 'set_real_ip_from|real_ip_header|proxy_protocol|default_server'
```

**No debe imprimir nada**. Si imprime `set_real_ip_from`/`real_ip_header`/
`proxy_protocol`, `$remote_addr` podría no ser la IP real: **para y avisa** (Eli no
puede ir con esa configuración). Si imprime `default_server`, anota en qué sitio
está y avisa (no cambia lo de abajo, pero hay que saberlo).

```bash
sudo certbot --version && systemctl list-timers --no-pager | grep -i certbot
```

Debe decir `certbot 2.9.0` (o parecido) y mostrar el temporizador de Certbot
(`certbot.timer`): es el que renueva los certificados solo.

### 9.3 El DNS tiene que apuntar ya al VPS

Certbot valida el dominio por HTTP (puerto 80) en el paso 9.6: si `eliagenda.com`
todavía no apunta aquí, Let's Encrypt falla y limita los intentos fallidos. El
paso 7.3 tiene que estar en verde **antes**. Compruébalo otra vez (en tu Mac):

```bash
dig +short eliagenda.com @8.8.8.8
```

Debe imprimir `187.41.114.36`. Si no, vuelve al paso 7. Y `dig +short AAAA
eliagenda.com @8.8.8.8` **no** debe imprimir nada.

### 9.4 Instalar el sitio de HTTP (puerto 80) y recargar nginx

Primero la línea base (debe decir `200`):

```bash
curl -sI https://sistemaone.com | head -1
```

Copia el archivo (es **nuevo**; no pisa nada) y actívalo con un enlace **llamado
`zz-eliagenda`**:

```bash
sudo install -m 644 /opt/eli/repo/deploy/nginx-eliagenda.conf /etc/nginx/sites-available/eliagenda
```

```bash
sudo ln -s /etc/nginx/sites-available/eliagenda /etc/nginx/sites-enabled/zz-eliagenda
```

```bash
ls -la /etc/nginx/sites-enabled/
```

Deben verse `sistemaone` y `zz-eliagenda`, y **sólo esos**.

Revisa la configuración **sin aplicarla**:

```bash
sudo nginx -t
```

Debe decir `syntax is ok` y `test is successful`. **Si dice error:** NO recargues.
nginx sigue sirviendo con la configuración anterior mientras no lo hagas. Quita el
enlace (es lo único que hay que deshacer; **no apagues nginx**) y avisa pegando
sólo la salida de `nginx -t`:

```bash
sudo rm /etc/nginx/sites-enabled/zz-eliagenda && sudo nginx -t
```

Si `nginx -t` dijo `test is successful`, aplica (esto **no** corta nada):

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Ahora **comprueba sistemaone otra vez** (debe seguir diciendo `200`):

```bash
curl -sI https://sistemaone.com | head -1
```

Y que Eli responde por el puerto 80 y que sistemaone sigue siendo el sitio por
defecto (VPS):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: eliagenda.com" http://127.0.0.1/
```

Debe imprimir `200` (Eli, a través de nginx).

```bash
curl -sI -H "Host: nombre-que-no-existe.example" http://127.0.0.1/ | head -4
```

Debe ser la respuesta de **sistemaone** (su redirección a `https://nombre-que-no-existe.example/`),
**no** la de Eli. Si en `Location:` aparece `https://eliagenda.com/`, Eli quedó
como sitio por defecto (el enlace no se llama `zz-eliagenda`): quita el enlace y
rehaz 9.4.

### 9.5 Probar las cabeceras con un nginx de prueba (aún sin HTTPS)

(VPS.) Levanta un nginx **de prueba** (otro proceso, en el puerto 38080, con su
propia carpeta temporal: no toca el nginx de producción ni usa `sudo`) con el
bloque real del archivo instalado, un servidor "eco" de juguete y cabeceras
falsificadas:

```bash
/opt/eli/current/deploy/probar-cabeceras.sh /etc/nginx/sites-available/eliagenda
```

Debe empezar con `Probando: /etc/nginx/sites-available/eliagenda` y terminar con
`TODO BIEN: el cliente no puede elegir su IP y /api/cron no se alcanza desde
afuera.`, **sin ninguna línea `FALLA`**. Si dice `FALLA`, no sigas: pega la salida
completa (no tiene secretos) a quien mantiene el código.

### 9.6 El HTTPS con Certbot (el orden exacto)

El orden importa: **primero** el sitio de HTTP con el proxy (9.4: Certbot lo
necesita para validar el dominio por el puerto 80) y **después** Certbot, que
modifica ese archivo. Cada vez, `nginx -t` antes de `reload`. Certbot ya está
instalado (lo usa sistemaone).

**1. Línea base y copia de seguridad** (VPS):

```bash
curl -sI https://sistemaone.com | head -1
```

```bash
sudo cp /etc/nginx/sites-available/eliagenda /etc/nginx/sites-available/eliagenda.antes-de-certbot
```

(Esa copia vive en `sites-available`, que nginx **no** lee: no estorba.)

**2. Ensayo** (pide el certificado a un servidor de pruebas de Let's Encrypt y no
instala nada; si falla, falla sin consecuencias):

```bash
sudo certbot certonly --nginx --dry-run -d eliagenda.com -d www.eliagenda.com
```

Debe terminar con `The dry run was successful`. Si falla con `NXDOMAIN`,
`timeout` o `connection refused`, es el DNS (9.3) o el puerto 80 (2.3). Si
sistemaone dejó de responder `200`, ve a 9.9.

**2b.** Comprueba sistemaone:

```bash
curl -sI https://sistemaone.com | head -1
```

**3. El certificado de verdad.** Sin `--hsts` (el archivo ya manda su HSTS; con
`--hsts` saldría duplicado):

```bash
sudo certbot --nginx -d eliagenda.com -d www.eliagenda.com --redirect
```

Si te pregunta un correo (sólo la primera vez en esta máquina), pon uno real: es
para los avisos de renovación. Debe terminar con `Successfully deployed
certificate for eliagenda.com` (y para `www.eliagenda.com`). Certbot recarga nginx
por su cuenta con un `reload` (nunca lo apaga).

**3b.** Comprueba sistemaone:

```bash
curl -sI https://sistemaone.com | head -1
```

**4. Cómo reescribió Certbot el archivo, y cómo comprobar que no perdió nada.**
Certbot convierte cada bloque de `/etc/nginx/sites-available/eliagenda` en su
versión HTTPS **en su lugar** (cambia `listen 80;` por `listen 443 ssl; # managed
by Certbot` y agrega las líneas `ssl_certificate...`) y **agrega al final** dos
bloques de puerto 80 que redirigen a HTTPS (`if ($host = eliagenda.com) { return
301 https://$host$request_uri; } # managed by Certbot`). Todo lo demás (los
`proxy_set_header`, el HSTS, el 404 de `/api/cron`, `client_max_body_size`,
`server_tokens`) queda **tal cual**: se comprobó con Certbot 2.9.0 y nginx 1.24.0
sobre este mismo archivo. **Pero lo vuelves a comprobar en el servidor**, con la
configuración que de verdad quedó cargada:

```bash
sudo nginx -T 2>/dev/null | awk '/^# configuration file /{p = ($0 ~ /eliagenda/)} p' | grep -vE '^[[:space:]]*#' | grep -nE 'listen|server_name|proxy_pass|proxy_set_header|add_header|client_max_body_size|server_tokens|ssl_certificate|location|return|default_server|real_ip'
```

(Muestra sólo lo que viene del archivo de Eli, sin comentarios.) Debe verse, en
el bloque de `eliagenda.com`:

| Línea | Por qué |
|---|---|
| `listen 443 ssl; # managed by Certbot` | el HTTPS |
| `proxy_set_header X-Vercel-Forwarded-For "";` | borra la cabecera falsificable |
| `proxy_set_header X-Real-IP $remote_addr;` | fija la IP real |
| `proxy_set_header X-Forwarded-For $remote_addr;` | fija la IP real (**sin** `$proxy_add_x_forwarded_for`) |
| `add_header Strict-Transport-Security "max-age=31536000" always;` | HSTS, a nivel de `server` (una sola vez) |
| `location ~* ^/api/cron(/\|$) {` con `return 404;` | los crons no existen desde afuera |
| `client_max_body_size 6m;` | tope del cuerpo |
| `proxy_pass http://127.0.0.1:3000;` | hacia Eli |

Y **no** debe verse ningún `listen [::]`, ni `default_server`, ni
`proxy_add_x_forwarded_for`, ni `real_ip`. Con el nginx de prueba (la prueba real):

```bash
/opt/eli/current/deploy/probar-cabeceras.sh /etc/nginx/sites-available/eliagenda
```

Debe terminar con `TODO BIEN`. **Si falta cualquiera de esas líneas o el script
dice `FALLA`: no sigas con Eli en producción**, y pasa a 9.8 (HTTPS a mano).

**5. La renovación automática** (los certificados duran 90 días; Certbot los
renueva solo con `certbot.timer`). Comprueba que sigue funcionando para el
certificado de Eli (el ensayo no renueva de verdad ni cambia nada):

```bash
sudo certbot renew --dry-run --cert-name eliagenda.com
```

Debe decir `Congratulations, all simulated renewals succeeded`. La renovación usa
el mismo método (`--nginx`), que se apoya en el bloque de puerto 80: **no quites
los bloques `listen 80` que Certbot agregó** ni pongas un `return` a nivel de
`server` en el puerto 80 (taparía el desafío de Let's Encrypt). Al renovar,
Certbot recarga nginx (`reload`), igual que con sistemaone. Y comprueba que
sistemaone sigue en `200`.

### 9.7 Probar desde tu Mac (y el caso IPv6)

```bash
curl -I https://eliagenda.com
```

Debe empezar con `HTTP/1.1 200 OK` (no hay HTTP/2 a propósito: activarlo en este
puerto compartido cambiaría el comportamiento de sistemaone) y llevar, entre
otras, `strict-transport-security` y `content-security-policy`.

Y lo de los crons: desde internet no deben existir (los llama el propio servidor,
sin pasar por nginx):

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://eliagenda.com/api/cron/recordatorios
```

Debe imprimir `404` (si imprimiera `401`, el cierre del `location` de `/api/cron`
no está aplicado: el secreto sigue protegiendo, pero re-aplica el archivo, ver
14.3).

**El caso IPv6** (VPS, sólo si el servidor tiene IPv6: `ip -6 addr show scope
global` imprime algo). Un cliente IPv6 que pida `eliagenda.com` debe caer en
sistemaone, no en Eli. Se compara la respuesta de `eliagenda.com` contra la de un
nombre inventado: tienen que ser **idénticas** (las dos las da el sitio por
defecto de sistemaone). `-k` es necesario aquí porque el certificado que presenta
sistemaone no es de `eliagenda.com`:

```bash
IPV6=$(ip -6 addr show scope global | awk '/inet6/ {sub("/.*","",$2); print $2; exit}'); echo "IPv6: $IPV6"
```

```bash
for n in eliagenda.com nombre-que-no-existe.example; do curl -6 -sk -m 8 -o /dev/null -w "$n -> %{http_code} %{size_download} bytes\n" --resolve "$n:443:[$IPV6]" https://$n/; done
```

Las dos líneas deben mostrar **el mismo código y el mismo tamaño**. Si la de
`eliagenda.com` es distinta (y tiene pinta de Eli), Eli está atendiendo por IPv6:
**no sigas**, el límite de intentos se puede saltar rotando direcciones; revisa
que el archivo no tenga `listen [::]` (`sudo nginx -T | grep -n 'listen \['` sólo
debe mostrar líneas de sistemaone).

### 9.8 Plan B: HTTPS escrito a mano (sólo si 9.6 mostró que Certbot perdió algo)

Si tras Certbot falta alguna de las líneas de la tabla de 9.6, no te quedes con
esa configuración. En vez de depender de cómo la reescriba Certbot, usa
`deploy/nginx-eliagenda-https.conf`: el archivo **final**, con el 80 y el 443 ya
escritos (el bloque `location /` del proxy es idéntico al de HTTP; una prueba
automática lo exige). Se prueba con el mismo script.

```bash
sudo cp /etc/nginx/sites-available/eliagenda.antes-de-certbot /etc/nginx/sites-available/eliagenda
```

(Vuelve al archivo de HTTP de antes de Certbot.) Ahora el certificado: si ya se
emitió en el paso 3 de 9.6, `--keep-until-expiring` lo conserva; si no, lo pide.
En los dos casos **sin reescribir la configuración**. Con `--deploy-hook` para
que nginx tome cada certificado renovado (siempre con `reload`):

```bash
sudo nginx -t && sudo certbot certonly --nginx -d eliagenda.com -d www.eliagenda.com --keep-until-expiring --deploy-hook "systemctl reload nginx"
```

Ahora instala el archivo final y revísalo antes de aplicar:

```bash
sudo install -m 644 /opt/eli/repo/deploy/nginx-eliagenda-https.conf /etc/nginx/sites-available/eliagenda
```

```bash
sudo nginx -t
```

Sólo si dice `test is successful`:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

```bash
curl -sI https://sistemaone.com | head -1
```

Repite la prueba de 9.5 (`probar-cabeceras.sh /etc/nginx/sites-available/eliagenda`),
la de renovación (`sudo certbot renew --dry-run --cert-name eliagenda.com`) y 9.7.

### 9.9 Vuelta atrás (si algo sale mal)

El cambio es **sólo agregar un enlace**: deshacerlo es quitarlo. **No apagues
nginx** (sistemaone sigue sirviéndose todo el tiempo):

```bash
sudo rm /etc/nginx/sites-enabled/zz-eliagenda
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

```bash
curl -sI https://sistemaone.com | head -1
```

Debe volver a decir `200`. `sites-available/eliagenda` y el certificado de Let's
Encrypt pueden quedarse donde están (no estorban: nginx sólo lee `sites-enabled`).
Para volver a ponerlo: `sudo ln -s /etc/nginx/sites-available/eliagenda
/etc/nginx/sites-enabled/zz-eliagenda` y `sudo nginx -t && sudo systemctl reload
nginx`. Si además quieres borrar el certificado: `sudo certbot delete --cert-name
eliagenda.com`.

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
`ps` ni en ningún registro) y anota el resultado. Llama **directo** a
`127.0.0.1:3000` (no al dominio): por eso nginx puede responder 404 a
`/api/cron/*` desde internet.

Si hay una actualización en curso (comparten el candado de `actualizar.sh`),
espera hasta 15 minutos a que termine y llama a Eli ya reiniciado. Aun así,
**no actualices ni vuelvas atrás entre las 12:50 y las 13:20 UTC** (la hora de
los crons diarios).

Si un cron o el respaldo **falla**, además de anotarlo manda **un correo al día**
a `SOPORTE_EMAIL` (paso 10.5). Eso funciona con lo que Eli ya usa (Resend); no
hay servicios nuevos.

### 10.3 Instalar (con los de correo APAGADOS hasta el lanzamiento)

> **NO enciendas los crons de correo mientras Vercel siga con los suyos
> encendidos, ni antes del lanzamiento.** Lo que se
> verificó en el código (`app/api/cron/recordatorios/route.ts`): cada recordatorio
> se "reclama" en la base **antes** de enviarse (se marca `reminderSentAt` sólo si
> estaba vacío), por eso repetir una corrida, o correr dos a la vez, **no duplica**
> un correo. Aun así la regla sigue siendo no encender los dos: (1) un envío que
> falla de forma ambigua queda marcado y no se reintenta (a propósito: "más vale
> un recordatorio perdido que dos"), así que una corrida de más puede gastar el
> único intento, antes de que todo esté listo (Resend sin verificar, por
> ejemplo); y (2) los enlaces del correo llevan el `NEXTAUTH_URL` del servidor que
> los manda (el VPS usa `eliagenda.com`, Vercel usa su propia dirección), y la marca
> ya quedaría puesta (no se puede deshacer). Se encienden en el paso 13. El
> respaldo sí puede quedar encendido desde ya.

```bash
sudo install -d -m 700 -o eli -g eli /var/backups/eli
```

**ANTES del lanzamiento** (el caso de este paso): instala el archivo **y deja
apagadas las dos líneas de correo en un solo comando**. No lo partas en dos:
`install` solo deja las dos líneas `0 13` ENCENDIDAS, y si te olvidas del segundo
paso correrán a la vez que los crons de Vercel (justo lo prohibido arriba).

```bash
sudo install -m 644 -o root -g root /opt/eli/repo/deploy/cron-eli /etc/cron.d/eli && sudo sed -i -E 's|^(0 13 .*llamar-cron)|#DESACTIVADO# \1|' /etc/cron.d/eli
```

(El `sed` sólo toca las líneas que empiezan con `0 13` y llaman a `llamar-cron`;
las deja como comentario, que cron ignora, así que el formato del archivo sigue
siendo válido. El respaldo, `30 6 ...`, no se toca.)

```bash
grep -n -E "llamar-cron|respaldo" /etc/cron.d/eli
```

Las dos de `llamar-cron` deben empezar con `#DESACTIVADO#`; la de `respaldo.sh`,
no. (cron relee el archivo solo, no hay que reiniciar nada.)

**DESPUÉS del lanzamiento** (13.5 ya hecho, los crons del VPS encendidos y los de
Vercel apagados) el archivo se instala sin `sed`, para dejar las dos líneas
encendidas. Es la variante para reinstalarlo más adelante (paso 14.3); no la uses
antes del lanzamiento:

```bash
sudo install -m 644 -o root -g root /opt/eli/repo/deploy/cron-eli /etc/cron.d/eli
```

Ya existe la carpeta de respaldos, así que repite aquí la comprobación de 8.5
(el servicio de Eli no puede abrirla; **A COMPROBAR EN EL VPS**):

```bash
sudo systemctl restart eli && sleep 5 && sudo nsenter -t $(systemctl show eli -p MainPID --value) -m ls /var/backups/eli
```

No debe listar archivos `.dump` (error de permiso o carpeta vacía).

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

### 10.5 Avisos por correo cuando algo falla

`respaldo.sh` y `llamar-cron.sh` mandan **un correo al día** (como máximo, por
tarea) a `SOPORTE_EMAIL` si fallan. Usan la API de Resend con las variables que
ya tiene `eli.env` (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SOPORTE_EMAIL`); la
clave no aparece en `ps` ni en ningún registro, y el correo trae sólo un mensaje
corto de error (nunca datos de clientes). Si falta alguna de las tres variables,
no se manda nada y el fallo queda sólo en el registro. El tope diario se guarda en
`/home/eli/.eli-avisos/` (un archivo con la fecha del último aviso; fuera de
`/var/backups/eli` a propósito, porque justo ese fallo —que la carpeta de respaldos
falte o no se pueda escribir— es de los que hay que avisar).

> **CUIDADO: copia el comando COMPLETO, con el prefijo
> `ELI_URL_LOCAL=http://127.0.0.1:1`.** Ese prefijo apunta la llamada a un
> puerto donde no hay nadie, y por eso la prueba no ejecuta nada real. Sin el
> prefijo, `llamar-cron.sh` llama de verdad al Eli del servidor y **manda los
> recordatorios reales a los clientes** (y, antes del lanzamiento, repite lo que
> hacen los crons de Vercel). Esto vale para todas las pruebas de este paso: sólo
> el 13.5 llama a `llamar-cron.sh` sin prefijo, a propósito.

**Pruébalo una vez** (**A COMPROBAR EN EL VPS**: el remitente de `RESEND_FROM_EMAIL`
tiene que estar verificado en Resend, o Resend lo rechaza). Esta prueba provoca un
fallo *a propósito* sin tocar nada real: apunta el cron a un puerto donde no hay
nadie, así que **no ejecuta ningún cron de verdad**:

```bash
ELI_URL_LOCAL=http://127.0.0.1:1 /opt/eli/current/deploy/llamar-cron.sh /api/cron/recordatorios
```

Debe terminar con `FALLÓ con código 000` y `Aviso por correo enviado`, y debe
llegar un correo a `SOPORTE_EMAIL` ("Eli: falló el cron /api/cron/recordatorios").
Si dice `No pude mandar el aviso por correo`, revisa las tres variables y que
el remitente esté verificado en Resend. Esa prueba gasta el aviso de hoy para ese
cron; para volver a armarlo: `rm ~/.eli-avisos/cron-recordatorios`.

Lo mismo con el respaldo (falla de inmediato por un valor inválido, sin tocar la
base):

```bash
ELI_RETENCION_DIAS=0 /opt/eli/current/deploy/respaldo.sh
```

Debe decir `ELI_RETENCION_DIAS debe ser un número...` y llegar el correo "FALLÓ el
respaldo". Rearmar: `rm ~/.eli-avisos/respaldo`.

**Lo que este aviso NO cubre:** avisa cuando algo *falla*, no cuando algo *no
corre* (si `cron` se detuviera, o el servidor estuviera apagado, no habría
quién avisar). Por eso existen el monitor externo (apéndice) y el chequeo mensual
del paso 11.6.

---

## Paso 11. Respaldos: cómo se hacen, cuánto duran, y CÓMO PROBAR QUE SIRVEN

Un respaldo que nunca se probó restaurar **no es un respaldo**.

### 11.1 Qué hace `respaldo.sh`

- Se conecta a `DIRECT_URL` (leída del archivo de variables; la contraseña **no**
  pasa por la línea de comandos ni sale por pantalla).
- Hace un `pg_dump` en formato *custom* comprimido, a
  `/var/backups/eli/eli-AAAA-MM-DD_HHMMSS.dump` con permiso 600 (sólo `eli`), y un
  enlace `ultimo.dump`.
- Lo **verifica**: no vacío, `pg_restore --list` lo lee sin errores, trae tablas
  con datos, y **compara las filas** de `usuarios`, `negocios` y `citas` del
  respaldo contra las de la base en ese momento (como la base sigue en uso, no
  exige que sean idénticas; falla si el respaldo trae menos del 95 % o 0 filas
  cuando la base tiene). Si algo falla, sale con error, lo anota en el registro
  y **te manda un correo** (paso 10.5).
- Borra los respaldos de más de **14 días** (336 horas; recién cuando el nuevo
  quedó bien). En la práctica quedan 14 o 15 archivos.

### 11.2 Primer respaldo, a mano

```bash
/opt/eli/current/deploy/respaldo.sh
```

Debe mostrar tres líneas `Filas de 'usuarios'/'negocios'/'citas': N en el
respaldo, N en la base` y terminar con `Respaldo listo y verificado:
/var/backups/eli/eli-...dump (... MB, NN tablas con datos)`.

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
(`probar-restauracion.sh` sólo **prueba** que el respaldo sirve. Para
**recuperar** de verdad después de un desastre, usa el procedimiento de 11.5.)

### 11.4 Copiar los respaldos a otro lugar (opcional pero recomendado)

Si el VPS se pierde, los respaldos que están sólo en el VPS se pierden con él
(Neon guarda su propio historial, pero es bueno tener el tuyo). La forma más
simple es **bajarlos a tu Mac**, y no deja ninguna clave guardada en el servidor.

**Antes: FileVault.** En la Mac: Ajustes del Sistema → Privacidad y seguridad →
**FileVault** → *Activar*. Sin eso, quien robe tu Mac se lleva toda la base de
pacientes. Y guarda la carpeta **fuera** de iCloud Drive, Dropbox o cualquier
carpeta que se sincronice.

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

**Esas copias se acumulan** (el servidor borra las suyas a los 14 días, pero
`rsync` así usado **nunca borra nada en tu Mac**): cada una es la base completa
de ese día. Política sugerida: quédate con las de los últimos 30 días y una por
mes de ahí hacia atrás, y borra el resto. Ver cuáles pasan de 30 días (no borra
nada):

```bash
find ~/respaldos-eli -name 'eli-*.dump' -mtime +30
```

Revisa la lista y, si está bien, bórralas (`-delete` al final del mismo
comando). Cuantas menos copias de datos de salud existan, menos que proteger.
Pendiente recomendado (no implementado, necesita tu aprobación): **cifrar cada
`.dump` con `age` o `gpg`** antes de guardarlo; ver el recuadro de datos de salud
al principio.

Otras opciones (si algún día lo quieres automático): `rclone` hacia un
almacenamiento (Backblaze B2, Google Drive...) corriendo desde cron; es
agregar una herramienta nueva, así que hay que aprobarlo antes.

### 11.5 Recuperarse de un desastre: restaurar la base de verdad

Esto es **distinto** de `probar-restauracion.sh` (que sólo prueba que un
respaldo sirve): aquí se **reemplaza** la base que usa Eli. Léelo completo antes
de empezar; tómate el tiempo, no es una carrera.

**Cuándo:** la base de Neon se borró, se corrompió o quedó con datos malos, y
no se arregla con las herramientas de Neon.

**Antes de nada, mira si Neon puede deshacerlo solo.** En la consola de Neon →
tu proyecto → *Backup & Restore* (o *Branches* → *Restore*) puedes volver a un
instante anterior (cuánto atrás depende de tu plan). Si el problema es de hace
unas horas, eso es más rápido y pierde menos datos que un respaldo de anoche. Si
no sirve, sigue:

1. **Detén Eli** para que nadie escriba datos nuevos en una base mala (verán una
   página de error; es mejor que seguir mezclando datos):

   ```bash
   sudo systemctl stop eli
   ```

   (Mientras esté detenido, los crons de las 13:00 fallarán y te llegará un correo de
   aviso: es esperable.)

2. **Elige el respaldo.** El más nuevo es `ultimo.dump`; mira sus fechas:

   ```bash
   ls -lht /var/backups/eli | head
   ```

   Si el último pesa 0 o mucho menos que los otros, usa uno anterior. Si el VPS
   también se perdió, usa una copia de tu Mac (paso 11.4) y súbela con `scp`.
   **Pierdes todo lo escrito después de ese respaldo** (hasta ~24 horas): díselo
   a las clínicas afectadas.

3. **Crea una base NUEVA y vacía en Neon**, sin tocar la vieja: consola de Neon →
   *New Project* → nombre `eli-restaurada`, **misma versión de Postgres** que
   producción. Copia **dos** cadenas desde *Connect*: la **directa** (desactiva
   "Connection pooling") y la **con pooler** (activado, el host trae `-pooler`).
   No las pegues en ningún chat.

4. **Restaura el respaldo en la base nueva**, con el script (que se niega a
   tocar la base que hoy usa `eli.env` y a escribir sobre una base con tablas;
   cuando pida la URL, pega la **directa** de la base nueva):

   ```bash
   /opt/eli/current/deploy/probar-restauracion.sh /var/backups/eli/ultimo.dump
   ```

   (Ignora su última línea que dice "puedes BORRAR la base de prueba": esta vez es
   la buena.) Equivale a este comando de `pg_restore`, que es lo que hace por dentro:

   ```bash
   pg_restore --no-owner --no-privileges --exit-on-error --dbname=NOMBRE_DE_LA_BASE /var/backups/eli/ultimo.dump
   ```

   (con el servidor, usuario y clave de la URL en las variables `PG*`; por eso se
   usa el script, que las arma sin dejar la clave en la pantalla).

   **A COMPROBAR en la prueba mensual (11.3):** `--exit-on-error` hace que
   `pg_restore` aborte con el primer error, y hacia Neon puede abortar por errores
   inocuos (por ejemplo `COMMENT ON EXTENSION` sin permiso para comentar una
   extensión que Neon ya instaló). Si pasa: la base nueva quedó a medias, así que
   bórrala y crea otra vacía (paso 3), y vuelve a restaurar **sin** esa opción:
   `pg_restore --no-owner --no-privileges --dbname=NOMBRE_DE_LA_BASE ...`. Esa
   corrida no se detiene sola, así que **lee los errores uno por uno** al final:
   los de extensiones o comentarios son ignorables; uno que mencione una tabla, un
   dato (`COPY`) o una restricción, no (usa otro respaldo). Anota en tu cuaderno
   qué errores inocuos salen en tu Neon, para reconocerlos el día de verdad.

5. **Comprueba** lo que muestra al final: debe decir `Restauración terminada`,
   un número de tablas parecido al de antes (~40) y cuentas de filas razonables
   en `negocios`, `usuarios`, `clientes` y `citas`. Si algo no cuadra, **no sigas**:
   prueba con el respaldo anterior.

6. **Apunta Eli a la base nueva.** Edita las dos líneas con las cadenas del
   paso 3 (`DATABASE_URL` la **con pooler**, `DIRECT_URL` la **directa**):

   ```bash
   sudo nano /etc/eli/eli.env
   ```

7. **Si desde ese respaldo se aplicaron migraciones nuevas**, la base restaurada
   no las tiene: el script de actualización te lo dice ("La base NO tiene
   registradas como aplicadas"). Aplícalas con el procedimiento de siempre
   (README de la raíz, "Migraciones en producción"), con un respaldo antes.

8. **Arranca y comprueba:**

   ```bash
   sudo systemctl restart eli
   ```

   ```bash
   journalctl -u eli -n 30 --no-pager
   ```

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/reservar/EL-SLUG-DE-UN-NEGOCIO-REAL
   ```

   Debe decir `200`. Luego, en el navegador: entra con una cuenta real, mira la
   agenda y una ficha. Las sesiones abiertas siguen valiendo (no dependen de la
   base).

   **Si Vercel quedó de respaldo** (plan de vuelta atrás, paso 13), su
   `DATABASE_URL` también apunta a la base vieja, y el paso 6 sólo cambió la del
   VPS. Cámbiala también en Vercel (*Settings* → *Environment Variables*, y
   redespliega) o deja Vercel apagado: una web de respaldo conectada a la base
   mala escribiría datos en ella.

9. **Confirma que los respaldos siguen funcionando contra la base nueva:**

   ```bash
   /opt/eli/current/deploy/respaldo.sh
   ```

10. **Guarda la base vieja** (no la borres) hasta estar seguro, por si hace falta
    sacar algo de ahí. Después de unas semanas, bórrala.

**Si lo que se perdió es el VPS (y Neon está bien):** crea un VPS nuevo, sigue esta
guía desde el paso 1, y en el paso 6 pega las claves que guardaste en tu gestor
de contraseñas. No hay nada que restaurar en la base.

Si hubo pérdida o filtración de datos de pacientes, consulta de inmediato con tu
asesor legal (ver el recuadro del principio): puede haber obligaciones de
avisar.

### 11.6 Chequeo mensual: ¿hay respaldos recientes?

Cada mes (ponlo en tu calendario), en el VPS:

```bash
find /var/backups/eli -maxdepth 1 -name 'eli-*.dump' -mtime -2 | grep -q . && echo "OK: hay un respaldo de menos de 2 días" || echo "ALERTA: el respaldo más nuevo tiene 2 días o más"
```

Debe decir `OK`. Si dice `ALERTA`: `journalctl -t eli-respaldo --since "3 days ago"
--no-pager` y el paso 15. Un correo de fallo sólo llega si el respaldo *falla*;
si `cron` no corrió, este chequeo es lo único que lo nota. (El mismo mes, repite
la prueba de restauración, 11.3.)

---

## Paso 12. Lista de verificación final

Haz esto **antes** del lanzamiento, con `eliagenda.com` (que ya apunta al VPS
desde el paso 7 pero todavía no lo usa nadie). En las que dicen "(Mac)" usa la terminal
de tu Mac; en las que dicen "(VPS)", la del servidor.

**12.1 (Mac) HTTPS responde, con candado válido.**

```bash
curl -I https://eliagenda.com
```

`HTTP/1.1 200 OK` (no hay HTTP/2 a propósito: ver 9.7). Sin errores de certificado.

**12.2 (Mac) Cabeceras de seguridad y CSP presentes.**

```bash
curl -sI https://eliagenda.com | grep -iE "strict-transport-security|content-security-policy|x-frame-options|x-content-type-options|referrer-policy|permissions-policy"
```

Deben salir las seis: `strict-transport-security: max-age=31536000`,
`content-security-policy: default-src 'self'; script-src 'self' 'nonce-...'`,
`x-frame-options: DENY`, `x-content-type-options: nosniff`,
`referrer-policy: strict-origin-when-cross-origin`, `permissions-policy: ...`.

```bash
curl -sI https://eliagenda.com | grep -iE "^server:|x-powered-by"
```

No debe imprimir `x-powered-by` (Next no se anuncia) y el `server:` debe decir
sólo `nginx`, **sin número de versión** (`server_tokens off`; quitar la palabra
`nginx` del todo necesita un módulo que Ubuntu no trae).

**12.3 (Mac) HTTP salta a HTTPS y el www salta al dominio sin www.**

```bash
curl -I http://eliagenda.com
```

`301 Moved Permanently` con `Location: https://eliagenda.com/` (es el redirect
que agregó Certbot).

```bash
curl -I "https://www.eliagenda.com/ruta?x=1"
```

`301` con `Location: https://eliagenda.com/ruta?x=1`. (Si pides
`http://www.eliagenda.com/ruta?x=1` hay dos saltos: primero a `https://www...` y
de ahí al dominio sin `www`; es normal.)

**12.4 (Mac) El puerto 3000 no se ve desde afuera.**

```bash
curl -m 5 http://IP_DEL_VPS:3000
```

Debe fallar (`Connection timed out` o `refused`). Si responde HTML, Eli quedó
expuesto sin nginx: para y avisa.

**12.4b (Mac) `/api/cron/*` no existe desde internet.** Debe dar `404` las siete
veces (también con mayúsculas, doble barra, la barra codificada `%2f`, una letra
codificada `%63`, y la carpeta sola con y sin barra final, por si nginx y Next
interpretan la ruta distinto; **A COMPROBAR**). nginx compara contra la ruta ya
**normalizada**: decodifica `%2f` y `%63`, junta `//` y resuelve `/../`, así que
todas esas variantes dan 404 desde nginx (se probó con nginx 1.24.0 aquí); lo que
no se puede asegurar desde acá son rarezas que Next interprete distinto (por
ejemplo `;` o `\`), y para eso está el secreto del cron como defensa de fondo:

```bash
for r in /api/cron/recordatorios /API/CRON/recordatorios //api/cron/recordatorios /api/cron%2frecordatorios /api/%63ron/recordatorios /api/cron /api/cron/; do curl -s -o /dev/null -w "%{http_code} " "https://eliagenda.com$r"; done; echo
```

Debe imprimir `404 404 404 404 404 404 404`. (Si alguna da `401`, esa variante
llegó hasta la app: el secreto igual la protege, pero avisa para ajustar el
`location` de `/api/cron` en el archivo de nginx.)

**12.5 (VPS) La IP del límite de intentos NO se puede falsificar — prueba con
un nginx de verdad.** Levanta un nginx **de prueba** (otro proceso en el puerto
38080, con su carpeta temporal; no toca el nginx de producción ni hace falta
`sudo`) usando el bloque real del archivo **instalado** (el que de verdad
atiende, ya con el HTTPS que puso Certbot, no el del repositorio) y verifica lo
que le llega a un servidor "eco":

```bash
/opt/eli/current/deploy/probar-cabeceras.sh /etc/nginx/sites-available/eliagenda
```

Debe empezar con `Probando: /etc/nginx/sites-available/eliagenda` y terminar con
`TODO BIEN: el cliente no puede elegir su IP y /api/cron no se alcanza desde
afuera.`, **sin ninguna línea `FALLA`** (revisa el texto del archivo, las 13
variantes de `/api/cron`, las cabeceras falsificadas —`X-Vercel-Forwarded-For`,
`X-Real-IP`, `X-Forwarded-For`, `Forwarded`, `True-Client-IP`, `CF-Connecting-IP`—,
HSTS, el tope de 6 MB y que `/api/cronista` no se bloquea). Si dice `FALLA`, **no
pongas Eli en producción**: pega la salida completa (no tiene secretos) a quien
mantiene el código. *(Se probó aquí con nginx 1.24.0 real y con el archivo
reescrito por Certbot 2.9.0; **A COMPROBAR** que en el VPS da lo mismo.)*

**12.5b (VPS, sólo si tiene IPv6) Un cliente IPv6 no llega a Eli.** Si en 9.1
viste que el servidor tiene IPv6 (`ip -6 addr show scope global` imprime algo),
repite la comprobación de 9.7: el pedido por IPv6 a `eliagenda.com` tiene que dar
**lo mismo** (código y tamaño) que el de un nombre inventado, porque las dos las
atiende el sitio por defecto de sistemaone. Si no, Eli atiende por IPv6 y el
límite de intentos se puede saltar rotando direcciones: **no sigas**, mira 9.7.
Y comprueba que el sitio de Eli no declara ningún `listen [::]`:

```bash
sudo nginx -T 2>/dev/null | awk '/^# configuration file /{p = ($0 ~ /eliagenda/)} p' | grep -vE '^[[:space:]]*#' | grep -c 'listen \['
```

Debe imprimir `0`.

**12.6 (Mac) Lo mismo, de punta a punta, contra el sitio real.** Manda 14
intentos de login seguidos mintiendo una IP distinta en cada uno. El límite es
10 por minuto por IP, así que los últimos tienen que dar `429`:

```bash
for i in $(seq 1 14); do curl -s -o /dev/null -w "%{http_code} " -X POST https://eliagenda.com/api/auth/callback/credentials -H "X-Vercel-Forwarded-For: 10.0.0.$i" -H "X-Real-IP: 10.0.1.$i" -H "X-Forwarded-For: 10.0.2.$i"; done; echo
```

Debe imprimir algo como `200 200 200 200 200 200 200 200 200 200 429 429 429
429` (los primeros 10 con otro código, pueden ser 200, 302 o 4xx; los últimos
**429**).

- Si salen **todos 429 desde el primero**: Upstash no está bien configurado
  (`UPSTASH_REDIS_REST_URL/TOKEN` mal o vacíos); arréglalo en `eli.env`.
- Si **ninguno** da 429: el rate limit se está saltando con IPs falsas: **grave**,
  no sigas; es justo lo que nginx debe evitar.
- Tu IP real queda bloqueada para el login ~1 minuto. Es normal. No repitas esta
  prueba seguido.

**12.7 (VPS) Un cron sin el secreto da 401 (nada más).**

Sin secreto no dispara nada. Se prueba contra la app **directo** (no contra el
dominio, que responde 404 a `/api/cron/*`):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/cron/recordatorios
```

Debe imprimir `401`.

> **NO pruebes aquí el 200 con secreto.** Ese 200 ejecuta de verdad la corrida
> diaria contra la base **real**: manda los recordatorios pendientes de mañana
> con enlaces a `eliagenda.com`, y deja marcado `reminderSentAt` en esas citas
> (no se puede deshacer: no se reenvían) cuando todavía no se avisó a los
> negocios ni Resend está verificado, y mientras Vercel sigue mandando los suyos.
> La prueba con secreto va **después del lanzamiento**, en 13.5. Que el secreto del servidor coincide con el de la
> app ya lo prueba el arranque: si estuviera mal, el primer cron real daría `401`
> y te llegaría el correo de aviso (10.5).

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

> **Ojo: reiniciar el servidor corta `sistemaone.com` también** (1-2 minutos: es
> el mismo VPS). Hazlo sólo con el visto bueno del dueño, **fuera del horario de
> sistemaone**, y avisa antes. Esto es un reinicio del *servidor*; sigue sin
> estar permitido reiniciar *sólo nginx*.

```bash
sudo reboot
```

Espera 1-2 minutos, entra de nuevo con `ssh eli@IP_DEL_VPS` y:

```bash
systemctl is-active eli nginx fail2ban
```

Debe imprimir tres veces `active`. Y `free -m` debe mostrar el swap. Comprueba
también que **sistemaone volvió**: `curl -sI https://sistemaone.com | head -1`
debe decir `200`.

**12.10 (VPS) Respaldo y hora.**

```bash
ls -lh /var/backups/eli && timedatectl | grep "Time zone"
```

**12.11 Login y flujo real.** En el navegador: abre
`https://eliagenda.com`, inicia sesión con correo y contraseña, mira la
agenda, y una página pública de reservas. (El login con Google requiere el
paso 13.0: la URI de `eliagenda.com` hay que agregarla a Google antes.) Cierra sesión y vuelve a
entrar; crea y borra una cita de prueba **en un negocio de pruebas** (no en el de
una clínica real).

**12.12 (Mac) Las rutas privadas redirigen al login de TU dominio.**

```bash
curl -I https://eliagenda.com/dashboard
```

Debe responder `307` con `location: /iniciar-sesion` (así lo hace la app al
probarla en local) o con `https://eliagenda.com/iniciar-sesion`; puede
llevar `?callbackUrl=...` al final. **No** debe apuntar a `http://127.0.0.1:3000/...`
ni a `localhost`: eso significaría que la app arma las direcciones con el host
interno y que `NEXTAUTH_URL` o las cabeceras están mal (revisa 6.3 y reinicia
Eli).

**12.13 (VPS) La comprobación de salud usa una página que toque la base.** Elige
el *slug* de un negocio real (lo que sigue a `/reservar/` en su página pública)
y comprueba:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/reservar/EL-SLUG-DE-UN-NEGOCIO-REAL
```

Debe decir `200`. Esa dirección es la que se pone en `ELI_URL_SALUD_EXTRA` (paso
14.1) para que una versión nueva que arranca pero **no puede hablar con la base**
se detecte y se revierta sola.

---

## Paso 13. EL LANZAMIENTO en `eliagenda.com` (y el plan para volver atrás)

`eliagenda.com` es un dominio nuevo: hoy Eli sólo vive en su dirección de
Vercel. Al terminar el paso 12 el VPS ya atiende `https://eliagenda.com` (DNS en
el paso 7, nginx en el 9) **con la misma base de datos real** que Vercel, pero
nadie lo conoce todavía y sus crons están apagados. "Lanzar" es: apagar los crons
de Vercel, encender los del VPS, y empezar a usar `eliagenda.com` como la
dirección oficial. Como no hay un dominio viejo que redirigir, **no hay un
cambio de DNS en el día del lanzamiento** (eso se hizo, sin riesgo, en el paso 7).

Hazlo **fuera del horario de atención** y **lejos de las 13:00 UTC** (entre las
12:30 y las 13:30 UTC no lo hagas: ahí corren los crons). Reserva 1-2 horas.

> **Regla que nunca se rompe:** Vercel y el VPS **no pueden tener los crons
> encendidos a la vez**. Por eso: primero se apagan los de Vercel, *después*
> se encienden los del VPS.

### 13.0 Antes (días antes)

- [ ] El paso 12 completo está en verde con `eliagenda.com`.
- [ ] **Resend verificado** (paso 7.4: `eliagenda.com` en *Verified*, con SPF,
      DKIM y DMARC) y la prueba de aviso del paso 10.5 llegó a tu correo. Sin esto,
      los correos de Eli (recordatorios, bienvenida, recuperar contraseña) no salen.
- [ ] **Google:** Google Cloud → *APIs y servicios* → *Credenciales* → tu cliente
      OAuth. En *Orígenes autorizados de JavaScript* agrega
      `https://eliagenda.com` y en *URIs de redireccionamiento autorizados*
      `https://eliagenda.com/api/auth/callback/google`. **Deja también las de
      Vercel** (las necesitas mientras Vercel siga sirviendo y si vuelves atrás).
      Los cambios de Google pueden tardar unos minutos en aplicarse.
- [ ] **Vercel sigue como está** (con su propio `NEXTAUTH_URL`, la de `*.vercel.app`):
      es tu plan de vuelta atrás. No lo cambies.
- [ ] Piensa qué pasa con los enlaces que ya se compartieron con la dirección de
      Vercel (páginas de reservas, correos viejos): **seguirán funcionando mientras
      Vercel siga encendido** (los enlaces de cancelar/cambiar cita sirven en
      cualquiera de los dos porque comparten base y `NEXTAUTH_SECRET`). El día que
      apagues Vercel dejarán de servir: decide antes cómo avisar a los negocios
      (o configurar una redirección en Vercel hacia `eliagenda.com`).
- [ ] **Las sesiones abiertas en la dirección de Vercel no pasan a `eliagenda.com`**
      (una cookie sólo vale para su propio dominio): cada persona tendrá que iniciar
      sesión de nuevo la primera vez. Avísales.
- [ ] Haz un respaldo fresco: `/opt/eli/current/deploy/respaldo.sh`.
- [ ] Avisa a los negocios la dirección nueva y el horario del lanzamiento.

### 13.1 Dejar el VPS listo

En el VPS, confirma que `eli.env` tiene la dirección oficial (6.3 lo comprueba):

```bash
grep "^NEXTAUTH_URL=" /etc/eli/eli.env
```

Debe imprimir exactamente `NEXTAUTH_URL=https://eliagenda.com`. Y que el
sitio de nginx instalado es el del repositorio (14.3). Como Certbot lo reescribió
(le agregó el HTTPS), **no** se compara archivo contra archivo: se comprueba con la
prueba de 12.5 y la tabla de 9.6:

```bash
/opt/eli/current/deploy/probar-cabeceras.sh /etc/nginx/sites-available/eliagenda
```

### 13.2 Apagar los crons de VERCEL (antes de encender los del VPS)

Elige UNA forma (todas reversibles). **A COMPROBAR:** los nombres exactos de
los menús de Vercel cambian; si no los encuentras, usa la forma 2.

1. Vercel → tu proyecto → *Settings* → *Cron Jobs* → **Disable Cron Jobs**
   (el interruptor/botón para desactivarlos). Para reactivarlos: *Enable*.
   **A COMPROBAR:** según la versión de Vercel, el interruptor puede surtir efecto
   sólo con un **nuevo despliegue** del proyecto; si al apagarlo te ofrece
   *Redeploy*, hazlo, y no des los crons por apagados hasta ver el estado
   *Disabled* y, mañana, ninguna ejecución en *Logs*.
2. En el repositorio, quitar la sección `"crons"` de `vercel.json` y desplegar
   (mediante un PR; **no** lo hagas desde el VPS). Para volver, se revierte ese
   cambio. *(Ojo: la prueba automática de `deploy/` compara `deploy/cron-eli`
   con `vercel.json`; si haces esto, quien mantiene el código debe ajustar la
   prueba en el mismo PR.)*
3. Pausar el proyecto entero en Vercel (*Settings* → *General*, si ofrece
   pausar). Esto también deja de servir la web de Vercel: úsalo sólo si ya no
   la necesitas de respaldo inmediato.

**Comprueba que quedaron apagados, AHORA:** en la pantalla de Vercel debe verse
que los cron jobs están **desactivados** (*Disabled*; si eliminaste la sección de
`vercel.json`, que el último despliegue ya no los lista). No hace falta esperar
a mañana para seguir: la confirmación definitiva llega después (13.5, "Al día
siguiente"). Por qué no es peligroso seguir con esa confirmación pendiente: aun si
un cron de Vercel se disparara una vez más, cada recordatorio se reclama en la
base antes de enviarse, así que no sale duplicado (ver 10.3).

### 13.3 Empezar a usar `eliagenda.com`

No hay nada que cambiar en el DNS ni en nginx (ya están). Lo que cambia es que
desde ahora **esta es la dirección oficial**: compártela, ponla en tus materiales
y en el monitoreo (apéndice).

> **Ojo con HSTS:** desde que los navegadores visitan `eliagenda.com`, recuerdan
> durante un año ("Strict-Transport-Security") que sólo se entra por HTTPS
> válido, y **no dejan "continuar de todos modos"** si el certificado falla. Si
> algo va mal con el certificado, la salida no es pedirle a la gente que ignore la
> advertencia, sino arreglarlo: `sudo tail -n 50 /var/log/letsencrypt/letsencrypt.log` y `sudo
> certbot certificates` (casi siempre el DNS dejó de apuntar al VPS o el 80/443 se
> cerró). Certbot renueva el certificado solo (`certbot.timer`), unos 30 días antes
> de que venza, y recarga nginx con `reload`; **nunca con restart**.

### 13.4 Comprobar de punta a punta

Repite en la Mac los puntos **12.1, 12.2, 12.3, 12.4b, 12.6 y 12.12**, y en el
VPS `/opt/eli/current/deploy/probar-cabeceras.sh /etc/nginx/sites-available/eliagenda`
(12.5) y el chequeo IPv6 de 9.7. Y comprueba, antes y después,
`curl -sI https://sistemaone.com | head -1` (`200`). Y entra al sitio en
el navegador: inicia sesión con correo y **con Google**, mira la agenda, y una
página pública de reservas. Pide a una clínica amiga que pruebe también.

### 13.5 Encender los crons del VPS (y sólo ahora)

Confirma una vez más, **en la pantalla de Vercel**, que los cron jobs siguen
desactivados (13.2). Y que hoy **no** estás entre las 12:50 y las 13:20 UTC.
Entonces:

```bash
sudo sed -i 's|^#DESACTIVADO# ||' /etc/cron.d/eli
```

```bash
grep -n llamar-cron /etc/cron.d/eli
```

Ninguna debe empezar con `#`.

**Prueba única del cron con secreto (ahora sí es seguro):** el dominio es el
oficial, así que los enlaces de los correos serán los definitivos. Hazla **después
de las 13:05 UTC**, cuando la corrida del día ya pasó (o mañana, sin hacer nada:
el cron lo hará solo):

```bash
/opt/eli/current/deploy/llamar-cron.sh /api/cron/recordatorios
```

Debe imprimir `[eli-cron] /api/cron/recordatorios -> 200 {...}`. Esta llamada
SÍ ejecuta el cron de verdad: manda ahora los recordatorios de las citas de
mañana que todavía no habían salido (los que ya salieron no se repiten, porque
cada recordatorio se reclama en la base antes de enviarse). Es seguro repetirla;
lo único que cambia es que esos correos salen ahora y no a las 13:00 UTC.

**Al día siguiente**, pasadas las 13:00 UTC, la confirmación definitiva:

```bash
journalctl -t eli-cron --since today --no-pager
```

Deben aparecer las dos corridas con `-> 200`. Y en Vercel (*Logs* / *Cron Jobs*)
**no** debe aparecer ninguna ejecución de esa hora. Si apareció una, apágalos de
verdad (13.2) y avisa: los envíos no se duplicaron, pero revisa que ningún
recordatorio quedara marcado sin enviarse (`journalctl -u eli | grep -i recordatorio`).

### 13.6 Después

- Deja Vercel **como respaldo** (sin crons) por una o dos semanas.
- Sube el TTL del DNS a algo normal (p. ej. 3600) cuando estés tranquilo.
- Pon el monitoreo (apéndice).

### PLAN DE VUELTA ATRÁS a Vercel

Si algo sale mal **después** del lanzamiento y no se arregla rápido, este es el
orden. Como Vercel sigue sirviendo en su propia dirección y el DNS de
`eliagenda.com` no es lo que sostiene a Vercel, **no hay que tocar el DNS**:

1. **Apaga los crons del VPS primero** (así no se duplican al volver a encender
   los de Vercel):

   ```bash
   sudo sed -i -E 's|^(0 13 .*llamar-cron)|#DESACTIVADO# \1|' /etc/cron.d/eli
   ```

2. **Enciende los crons de Vercel** (la forma que usaste en 13.2, al revés).
3. **Avisa a los negocios** que vuelvan a usar la dirección de Vercel (y, si ya
   habías compartido enlaces de `eliagenda.com`, que esos quedan sin servicio
   hasta arreglar el VPS). Las URIs de Google de Vercel siguen en su sitio
   (por eso en 13.0 se **agregaron** las nuevas sin quitar las viejas).
4. Si hace falta que `eliagenda.com` deje de recibir visitas del todo, **no
   apagues nginx** (sirve `sistemaone.com`): quita el enlace del sitio de Eli y
   recarga: `sudo rm /etc/nginx/sites-enabled/zz-eliagenda && sudo nginx -t &&
   sudo systemctl reload nginx` (9.9), y comprueba
   `curl -sI https://sistemaone.com | head -1`. El VPS puede quedarse encendido
   sin hacer daño (con los crons apagados).

Un problema *sólo de código* (no de servidor) se arregla sin tocar nada de esto
con `volver-atras.sh` (paso 14).

---

## Paso 14. Actualizar Eli y volver a la versión anterior

### 14.1 Actualizar

> **No actualices ni vuelvas atrás entre las 12:50 y las 13:20 UTC.** A las 13:00
> corren los crons diarios (recordatorios y correos). Si coinciden, los crons
> esperan a que termines (comparten el candado, hasta 15 minutos) y salen tarde,
> con Eli ya reiniciado; no se pierden, pero es innecesario correr ese riesgo.
> Tampoco a las 06:30 UTC (respaldo), ni cerca de las 07:00 UTC (el servidor puede
> reiniciarse solo si hay parches, paso 2.5), ni con Eli en horario de más uso.

**Una vez, antes de la primera actualización: la página de salud.** Por defecto
el script da por sana una versión si la portada (`/`) responde. Pero `/` no
consulta la base de datos: una versión que arranca y **no puede hablar con Neon**
también la serviría. Para que eso se detecte (y se vuelva sola a la versión
anterior), elige el *slug* de un negocio real y escribe esta línea en
`eli.env` (cambia el slug; 12.13 la prueba):

```bash
echo 'ELI_URL_SALUD_EXTRA=http://127.0.0.1:3000/reservar/EL-SLUG-DE-UN-NEGOCIO-REAL' | sudo tee -a /etc/eli/eli.env
```

(La app ignora esa variable; sólo la leen `actualizar.sh` y `volver-atras.sh`.
Si algún día ese negocio se borra o cambia de slug, esa página dará 404 y las
actualizaciones se revertirán solas: actualiza la línea. Si hace falta, también
se puede dar una sola vez: `ELI_URL_SALUD_EXTRA=http://... ./deploy/actualizar.sh`.)

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
3. `npm ci --ignore-scripts` + `prisma generate` + `npm run build`. Si falla
   algo, la versión que corre no se toca.
4. Cambia el enlace `current`, limpia el estado "fallido" de systemd si lo
   hubiera (`reset-failed`), reinicia el servicio y comprueba que responde
   (hasta 60 segundos; la portada y, si la configuraste, la página de
   `ELI_URL_SALUD_EXTRA`). Si no responde, **vuelve solo a la versión anterior**
   (con otro `reset-failed` + reinicio, para que funcione aunque la versión nueva
   haya agotado el límite de arranques).
5. Conserva las últimas 3 versiones.

Se puede correr dos veces seguidas sin problema: si esa versión ya está activa,
dice que no hay nada que hacer.

### 14.2 Volver a la versión anterior, a mano

```bash
/opt/eli/repo/deploy/volver-atras.sh
```

Cambia a la versión que estaba antes de la última actualización (sigue guardada)
y reinicia (con la misma comprobación de salud de 14.1). Si la versión de la que sales trae migraciones que la anterior no
conoce, te avisa y pide confirmación: **volver atrás no deshace migraciones**
(las del proyecto son casi siempre aditivas y el código viejo sigue andando; el
README de la raíz lo dice caso por caso). Si lo corres otra vez, vuelves a la
versión que dejaste.

### 14.3 Cuando cambian `eli.service`, `nginx-eliagenda.conf`, `cron-eli` o `sudoers-eli`

**Estos cuatro archivos se instalaron por COPIA** (pasos 8, 9, 10): `git pull` y
`actualizar.sh` actualizan el código de Eli, pero **no** tocan las copias de
`/etc`. Si alguien cambia uno en el repositorio (por ejemplo, una mejora de
seguridad en el archivo de nginx), el servidor sigue con el viejo hasta que lo
**re-apliques**. Primero mira cuáles difieren (no cambia nada; un archivo igual
no imprime nada):

```bash
cd /opt/eli/repo && git pull --ff-only
```

```bash
diff -q /opt/eli/repo/deploy/eli.service /etc/systemd/system/eli.service; sudo diff -q /opt/eli/repo/deploy/sudoers-eli /etc/sudoers.d/eli; diff -q /opt/eli/repo/deploy/cron-eli /etc/cron.d/eli
```

(`cron-eli` aparecerá distinto mientras tengas líneas `#DESACTIVADO#`, antes de
el lanzamiento: es normal.) Para cada uno que difiera:

**`eli.service`** (reinicia Eli; fuera de horario). Antes de instalarlo,
verifica el archivo nuevo; si imprime algún error, no sigas:

```bash
systemd-analyze verify /opt/eli/repo/deploy/eli.service
```

(Puede avisar de que `/opt/eli/current/...` o `/etc/eli/eli.env` no existen si lo
corres en otra máquina; en el VPS no debe decir nada.) Si no imprime errores:

```bash
sudo install -m 644 /opt/eli/repo/deploy/eli.service /etc/systemd/system/eli.service && sudo systemctl daemon-reload && sudo systemctl restart eli
```

y repite las comprobaciones de 8.5.

**`sudoers-eli`:** repite el comando de validar-e-instalar del paso 8.2.

**`nginx-eliagenda.conf`** (el sitio de Eli en nginx). **Ojo: este NO se copia
encima.** El archivo instalado (`/etc/nginx/sites-available/eliagenda`) ya no es
igual al del repositorio, porque Certbot le agregó el HTTPS (9.6); copiarlo tal
cual **borraría el HTTPS**. Mira primero qué cambió en el repositorio:

```bash
cd /opt/eli/repo && git log -p -n 3 --stat -- deploy/nginx-eliagenda.conf deploy/nginx-eliagenda-https.conf
```

Y qué difiere hoy (Certbot siempre aparecerá en el diff: `listen 443 ssl`, las
líneas `ssl_*` y los bloques `managed by Certbot`; lo que importa es lo demás):

```bash
diff /opt/eli/repo/deploy/nginx-eliagenda.conf /etc/nginx/sites-available/eliagenda
```

Si lo que cambió son **líneas de la configuración** (no comentarios), lo más
seguro es aplicarlas **a mano en el archivo instalado**, o reinstalar con el
archivo con HTTPS escrito a mano (9.8) y probar. Siempre en este orden y **sin
tocar sistemaone**:

```bash
sudo cp /etc/nginx/sites-available/eliagenda /etc/nginx/sites-available/eliagenda.antes-del-cambio
```

(edita o instala el archivo nuevo, y entonces:)

```bash
sudo nginx -t && sudo systemctl reload nginx
```

```bash
curl -sI https://sistemaone.com | head -1
```

y vuelve a probar: `/opt/eli/current/deploy/probar-cabeceras.sh /etc/nginx/sites-available/eliagenda`
y la tabla de 9.6. Si `nginx -t` falla, **no recargues**: vuelve a poner
`eliagenda.antes-del-cambio`. **Nunca** `systemctl restart nginx`.

**`cron-eli`:** ojo, copiarlo **vuelve a encender** las líneas de correo. Antes
del lanzamiento (13.5) usa SIEMPRE este comando, que instala y las vuelve a
apagar en un solo paso:

```bash
sudo install -m 644 -o root -g root /opt/eli/repo/deploy/cron-eli /etc/cron.d/eli && sudo sed -i -E 's|^(0 13 .*llamar-cron)|#DESACTIVADO# \1|' /etc/cron.d/eli
```

Y comprueba que quedaron apagadas: `grep -n llamar-cron /etc/cron.d/eli` (las dos
deben empezar con `#DESACTIVADO#`).

DESPUÉS del lanzamiento (13.5 ya hecho) las líneas deben quedar encendidas, así
que se instala sin `sed`:

```bash
sudo install -m 644 -o root -g root /opt/eli/repo/deploy/cron-eli /etc/cron.d/eli
```

---

## Paso 15. Si se cae: qué mirar

Empieza siempre por aquí, en el VPS (entra con `ssh eli@IP_DEL_VPS`):

| Qué quieres saber | Comando |
|---|---|
| ¿Eli está vivo? | `systemctl status eli --no-pager` |
| ¿nginx está vivo? (**sólo mirar**) | `systemctl status nginx --no-pager` |
| ¿Responde sistemaone? | `curl -sI https://sistemaone.com \| head -1` (`200`) |
| ¿La configuración de nginx está bien? | `sudo nginx -t` (si falla, no recargues; **nunca** restart/stop de nginx) |
| Qué dijo Eli antes de caer | `journalctl -u eli -n 100 --no-pager` |
| Qué dice nginx (errores) | `sudo tail -n 100 /var/log/nginx/error.log` |
| Qué dice Certbot (certificados) | `sudo tail -n 100 /var/log/letsencrypt/letsencrypt.log` y `sudo certbot certificates` |
| Visitas web en vivo | `sudo tail -f /var/log/nginx/access.log` (salir: `Ctrl+C`; aquí también salen las de sistemaone) |
| ¿Eli responde por dentro? | `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/` (debe ser `200`) |
| ¿Quién escucha en los puertos? | `ss -tlnp \| grep -E ':(80\|443\|3000)'` |
| Disco | `df -h` (alarma si `/` pasa de 85%) |
| Memoria | `free -m` |
| Carga y tiempo encendido | `uptime` |
| ¿Se acabó la memoria alguna vez? | `sudo dmesg \| grep -i -E "out of memory\|oom"` |
| Cortafuegos | `sudo ufw status` |
| Crons | `journalctl -t eli-cron --since "2 days ago" --no-pager` |
| Respaldos | `journalctl -t eli-respaldo --since "2 days ago" --no-pager` y `ls -lh /var/backups/eli` |
| ¿Se mandaron avisos por correo? | `journalctl -t eli-aviso --since "2 days ago" --no-pager` (y `ls ~/.eli-avisos`) |
| DNS (desde tu Mac) | `dig +short eliagenda.com` |

Qué buscar según lo que ves:

- **El navegador dice 502 / "Bad Gateway":** nginx vive pero Eli no. Mira `systemctl
  status eli`. Si está `failed`: `journalctl -u eli -n 100 --no-pager`; casi
  siempre es una variable faltante (revisa 6.3), la base inaccesible, o un
  release roto (`./deploy/volver-atras.sh`, que también limpia el estado
  fallido). Para volver a intentar a mano:
  `sudo systemctl reset-failed eli && sudo systemctl restart eli`.
- **No abre nada y `ping` no responde:** el VPS está apagado o bloqueado: hPanel →
  VPS → reiniciar. Si `ssh` no entra pero la web sí: `fail2ban` pudo bloquearte;
  desde la terminal del navegador de Hostinger: `sudo fail2ban-client set sshd
  unbanip TU_IP`.
- **Error de certificado / "sitio no seguro":** `sudo certbot certificates` y
  `sudo tail -n 100 /var/log/letsencrypt/letsencrypt.log`; casi siempre el DNS no
  apunta al VPS o el 80/443 están cerrados (`sudo ufw status`). Para renovar a
  mano: `sudo certbot renew --cert-name eliagenda.com` (recarga nginx con
  `reload`; nunca lo reinicies).
- **`sistemaone.com` dejó de responder tras tocar nginx:** quita el enlace de Eli
  y recarga (9.9): `sudo rm /etc/nginx/sites-enabled/zz-eliagenda && sudo nginx -t
  && sudo systemctl reload nginx`. **No** reinicies ni apagues nginx.
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

## Limitaciones conocidas y mejoras futuras

Cosas que esta guía **no** resuelve, dichas con franqueza. Ninguna es urgente para
arrancar, pero conviene tenerlas en el radar; cada una merece su propio issue.

1. **Un solo usuario (`eli`) hace de administrador, de compilador y de servidor
   de cron.** Es cómodo, pero significa que todo el código que corre al
   construir (`npm run build`, y las ~500 dependencias) corre con el mismo
   usuario que puede leer `/etc/eli/eli.env`, `~/.ssh` y los respaldos, y que
   tiene `sudo`. Lo que sí se hizo: `npm ci --ignore-scripts` (los scripts de
   instalación de las dependencias, la vía más común de ataque a la cadena de
   suministro, **no** corren), `main` protegida en GitHub (5.7), contraseña fuerte
   (1.3) y un `sudoers` mínimo. Lo que **queda**: el código de las dependencias
   sigue ejecutándose al compilar y al correr, como `eli`. **Mejora futura:**
   dos usuarios, `eli` (administrador: ssh, sudo, actualizar) y `eli-app`
   (sólo corre el servicio, sin shell, sin `sudo`, sin grupos extra, sin acceso a
   `~/.ssh` ni a los respaldos), y que las compilaciones se hagan en un usuario
   sin acceso a las claves. Se deja sin hacer porque cambia permisos de todo el
   kit y no se puede probar sin el servidor.
2. **`ReadWritePaths=/opt/eli/releases` es amplio.** El servicio puede escribir en
   TODAS las versiones guardadas (hace falta para el caché de Next), lo que
   permitiría a código comprometido modificar su propio código y el de la versión
   anterior. **Mejora futura (a probar en el VPS, no aquí):** `ReadOnlyPaths=` sobre
   el código y un caché de Next en una carpeta aparte, con escritura sólo ahí.
   No se cambió ahora porque un error rompería el arranque y no se pudo probar
   con systemd real.
3. **Datos de salud sin cifrar en reposo** (disco, swap, snapshots, copias en la
   Mac): ver el recuadro del principio. **Mejora futura:** cifrar los `.dump`
   con `age`/`gpg` y, si el proveedor lo permite, cifrado de disco.
4. **Sin monitoreo externo propio:** sólo UptimeRobot (apéndice). Opciones a
   evaluar (servicios nuevos, requieren aprobación): healthchecks.io para saber
   si los crons *dejaron de correr* y Sentry para errores de la app.
5. **El aviso por correo** (10.5) cubre fallos, no ausencias; y depende de que
   Resend funcione (si Resend estuviera caído justo esa noche, el aviso no sale
   y queda en el registro).
6. **Copias de respaldo sólo en el mismo VPS y en tu Mac.** No hay copia
   automática fuera del servidor.

---

## Apéndice: Monitoreo con UptimeRobot (avisa si se cae)

Gratis y sin instalar nada en el servidor (los nombres de los menús pueden
cambiar; la idea es la misma):

1. Crea una cuenta en `uptimerobot.com`.
2. *Add New Monitor* → tipo **HTTP(s)**.
3. *Friendly Name*: `Eli`. *URL*: `https://eliagenda.com/` (la tuya).
4. *Monitoring Interval*: **5 minutos** (lo mínimo del plan gratis, a lo que
   recuerdo).
5. *Alert Contacts*: tu correo (y el WhatsApp/Telegram si lo ofrece).
6. Guardar. Debe aparecer en verde ("Up").

Recomendado agregar un segundo monitor a una **página pública de reservas
real** (`https://eliagenda.com/reservar/<el-slug-de-un-negocio>`, tipo *Keyword*
con una palabra de esa página): esa sí toca la base de datos y avisa si Neon está
caído aunque la portada siga viva.

**No** pongas monitores sobre `/api/cron/...` (darían 401 siempre).

Un aviso no arregla nada: cuando llegue, ve al **paso 15**.
