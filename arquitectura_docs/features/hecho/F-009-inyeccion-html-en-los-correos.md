---
id: F-009
titulo: Inyección de HTML en los correos
estado: hecho
prioridad: alta
areas: [backend]
rama: v1
estimacion: chica
max_iteraciones: 3
---

# F-009 — Inyección de HTML en los correos

## Problema

Lo encontró el `revisor` al cerrar F-004. `lib/email.ts` arma el HTML de cada
correo interpolando datos que escribió una persona, **sin escapar nada**:

```ts
intro: `Hola <strong>${datos.nombreTrabajador}</strong>, te invitaron...`
```

Quien invita elige ese nombre. Si escribe `<a href="http://sitio-falso">` o una
etiqueta cualquiera, eso llega **dentro de un correo que la víctima recibe de
parte de Eli**, con nuestro dominio como remitente. Lo mismo aplica al nombre
del cliente, el del negocio y los comentarios de la reserva.

No es sólo el equipo: los comentarios del cliente al reservar
(`Appointment.clientComments`) viajan al correo del profesional, y esos los
escribe cualquiera que entre a la página pública de reservas.

## Alcance

**Incluye:**
- Escapar todo dato de origen humano antes de interpolarlo en el HTML de un
  correo.
- Que sea difícil olvidarse: la plantilla escapa por defecto, en vez de pedirle
  a cada llamador que se acuerde.

**NO incluye:**
- Rediseñar los correos.
- Validar el largo o el contenido de los nombres al guardarlos. Se escapa al
  mostrar, no se restringe al guardar.
- Los enlaces (`enlaceAceptar`, `enlaceRestablecer`): los arma el servidor, no
  vienen de nadie.

## Criterios de aceptación

- [ ] Un nombre con `<script>`, `<a href>` o `"` llega al correo como texto
      literal, no como etiqueta.
- [ ] La protección es por defecto: agregar un correo nuevo sin acordarse de
      escapar **no** reintroduce el agujero. Mismo criterio que `whereDeAgenda`
      en F-006 — una convención que hay que recordar no es una protección.
- [ ] Los comentarios del cliente en `enviarAvisoProfesional` también se escapan.
- [ ] Tests que fijen el escapado de al menos un caso con etiqueta y uno con
      comillas.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test` y `npm run build` en verde.

## Contexto técnico

- `lib/email.ts` — la función `enviar()` arma el HTML; los campos que vienen de
  personas son `nombreCliente`, `nombreNegocio`, `nombreTrabajador`,
  `nombreUsuario`, `servicio`, `comentarios` y los valores de `detalle`.
- Hoy `intro` y `cierre` reciben HTML a propósito (llevan `<strong>`). Hay que
  resolver eso sin volver a abrir la puerta: por ejemplo, que el llamador pase
  las partes variables por separado y la plantilla las escape.
- No hace falta una librería: escapar `& < > " '` alcanza para un atributo o un
  cuerpo de HTML.

## Fuera de alcance detectado

- El `asunto` del correo (subject) también interpola `nombreNegocio` /
  `nombreCliente` sin escapar (ej. `` `✅ Cita confirmada — ${datos.nombreNegocio}` ``).
  No es HTML — es un header de texto plano, no aplica el escapado `& < > " '` de
  esta ficha — pero sí podría admitir inyección de encabezados de correo
  (`\r\n` para agregar headers falsos) si `nombreNegocio` llegara a contener
  saltos de línea. No lo toqué: es un vector distinto (header injection, no
  HTML injection) y no está en el alcance de F-009. Lo dejo anotado por si
  amerita una ficha propia.
- `boton.texto` y `titulo` no se tocaron: siempre son literales fijos escritos
  por nosotros en cada llamador, nunca un dato de persona. Igual quedaron
  cubiertos por `escaparHtml` dentro de `enviar()` para `boton.texto` (no
  cuesta nada y cierra la puerta si algún día alguien lo vuelve dinámico); no
  así `titulo`, que sigue siendo `string` plano porque ningún llamador actual
  lo arma con datos de persona — si eso cambiara, habría que revisitarlo.

## Decisiones tomadas

- **La protección es del tipo, no de la memoria.** Se creó un tipo opaco
  `HtmlSeguro` (no es un `string`) que sólo puede producirse con la función
  `html\`...\`` (tagged template). Esa función preserva el texto literal de la
  plantilla (donde nosotros escribimos `<strong>`) y escapa automáticamente
  cada valor interpolado. `intro` y `cierre` en `Correo` ahora piden
  `HtmlSeguro`, no `string`: si alguien agrega un correo nuevo y arma `intro`
  con un template literal común (`` `Hola ${datos.x}` ``), **no compila**
  (`Type 'string' is not assignable to type 'HtmlSeguro'`), lo verifiqué
  rompiendo una línea a propósito y corriendo `tsc`. Mismo espíritu que
  `whereDeAgenda` en F-006: la barrera es estructural, no una convención a
  recordar.
- `detalle` (pares etiqueta/valor) se escapa **dentro de `enviar()`**, no en
  cada llamador: cualquier campo que se agregue a un array `detalle` en el
  futuro queda escapado sin que el autor tenga que acordarse.
- `titulo` y `boton.enlace` no cambiaron de tipo porque nunca reciben datos de
  persona hoy (son literales fijos o enlaces armados por el servidor). Si algún
  día un llamador quisiera poner un dato de persona ahí, tendría que forzar el
  tipo (`string` sigue siendo `string`), así que **no** es una protección por
  defecto para esos dos campos — quedó anotado en "Fuera de alcance" como
  advertencia, no lo resolví porque la ficha no los lista entre los campos a
  cubrir.

## Bitácora

- `lib/email.ts`: se agregó el tipo opaco `HtmlSeguro`, la función interna
  `escaparHtml` (escapa `& < > " '`) y el tagged template `html` como única
  forma de producir `HtmlSeguro`. `Correo.intro` y `Correo.cierre` pasaron de
  `string` a `HtmlSeguro`. Los cinco `intro`/`cierre` de las funciones
  exportadas (`enviarConfirmacionCliente`, `enviarAvisoProfesional`,
  `enviarRecordatorio`, `enviarRecuperacionPassword`,
  `enviarInvitacionTrabajador`) se reescribieron con el tag `html` en vez de
  template literals comunes — el HTML resultante para un nombre normal es
  idéntico al de antes (mismo `<strong>`, mismo texto). Dentro de `enviar()`
  se agregó `escaparHtml` a cada valor de `detalle` (etiqueta y valor) y a
  `boton.texto`.
- `lib/email.test.ts` (nuevo): 6 tests. Cubren `<script>` y comillas en
  `nombreCliente` y `nombreNegocio` (`enviarConfirmacionCliente`), un
  `<a href="http://sitio-falso">` en `nombreTrabajador`
  (`enviarInvitacionTrabajador`), un `<img onerror>` con comillas simples en
  `comentarios` (`enviarAvisoProfesional`), y un intento de cierre de atributo
  + `<script>` en `nombreUsuario` (`enviarRecuperacionPassword`). También hay
  un test con nombre normal que verifica que `<strong>` sigue apareciendo tal
  cual (no se rediseñó el correo). El mock de `resend` sigue el mismo patrón
  que `lib/rate-limit.test.ts` (`vi.mock` + `vi.stubEnv` + `vi.resetModules`).
- Campos cubiertos, tal como pide la ficha: `nombreCliente`, `nombreNegocio`,
  `nombreTrabajador`, `nombreUsuario`, `servicio`, `comentarios` y los valores
  (y etiquetas) de `detalle`. `enlaceAceptar` / `enlaceRestablecer` no se
  tocaron: los arma el servidor.
- Verificado que el bug histórico no se reintrodujo: `RESEND_API_KEY= npm run
  build` compila y genera todas las rutas sin fallar (el cliente de Resend se
  sigue creando en el primer envío, no al importar el módulo).
- `npm run lint`, `npx tsc --noEmit`, `npx vitest run` (101 tests, 10 archivos)
  y `npm run build` (sin `RESEND_API_KEY`) — los cuatro en verde.
