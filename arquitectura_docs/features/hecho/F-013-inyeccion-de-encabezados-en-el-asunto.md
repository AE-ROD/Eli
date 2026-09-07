---
id: F-013
titulo: Inyección de encabezados en el asunto del correo
estado: hecho
prioridad: media
areas: [backend]
rama: v1
estimacion: chica
max_iteraciones: 3
---

# F-013 — Inyección de encabezados en el asunto del correo

## Problema

Lo dejó anotado el agente que cerró F-009. Esa ficha blindó el **cuerpo** HTML de
los correos con el tipo `HtmlSeguro`, pero el **asunto** sigue interpolando datos
de personas sin tratar:

```ts
asunto: `✅ Cita confirmada — ${datos.nombreNegocio}`
asunto: `📅 Nueva reserva — ${datos.nombreCliente}`
```

El asunto no es HTML, así que el escapado de F-009 no aplica: es un **encabezado
de correo**. Si el nombre del negocio o del cliente llegara a contener un salto
de línea (`\r` o `\n`), se pueden agregar encabezados falsos —un `Bcc:`, por
ejemplo— al mensaje que sale desde nuestro dominio.

El nombre del cliente lo escribe cualquiera que entre a la página pública de
reservas.

## Alcance

**Incluye:**
- Que ningún dato de origen humano pueda meter saltos de línea ni caracteres de
  control en el asunto de un correo.
- Que la protección sea por defecto, no un cuidado a recordar en cada asunto
  nuevo.

**NO incluye:**
- El cuerpo del correo: ya lo cubre `HtmlSeguro` (F-009).
- Validar los nombres al guardarlos. Se limpia al usar, no se restringe al
  guardar — mismo criterio que F-009.
- Cambiar los textos de los asuntos.

## Criterios de aceptación

- [x] Un nombre con `\r\n` no produce un encabezado nuevo: el asunto llega en una
      sola línea.
- [x] También se contemplan los caracteres de control y los saltos sueltos
      (`\r` solo, `\n` solo, ` `).
- [x] **La protección es por defecto:** un asunto nuevo escrito sin acordarse no
      reintroduce el agujero. Mismo criterio que `HtmlSeguro` en F-009 y
      `whereDeAgenda` en F-006.
- [x] Un asunto normal se ve exactamente igual que hoy, emojis incluidos.
- [x] Tests con al menos un caso de `\r\n` y uno de salto suelto.
- [x] `npm run lint`, `npx tsc --noEmit`, `npm test` y `npm run build` en verde.

## Contexto técnico

- `lib/email.ts` — el campo `asunto` de la interfaz `Correo` y los cinco
  llamadores que lo arman.
- F-009 resolvió el problema equivalente en el cuerpo con un tipo opaco
  (`HtmlSeguro`) producido por un tagged template. **Mirá cómo quedó y seguí ese
  camino**: es el patrón del proyecto y ya está probado.
- Resend recibe el asunto por API, no por SMTP crudo, así que puede que la
  librería ya lo trate. **Averigualo antes de escribir código**: si Resend lo
  sanea, la ficha se cierra documentando eso en vez de agregar código que no
  hace falta. Documentar que no hacía falta también es cerrar la ficha.

## Fuera de alcance detectado

Ninguno adicional al ya declarado como NO incluido en la ficha.

## Decisiones tomadas

- **Sí hacía falta arreglarlo.** Se descartó cerrar la ficha sin código.
  Verificación hecha (sin adivinar): se inspeccionó `node_modules/resend`
  (v6.12.2) — el archivo `dist/index.mjs`, función
  `parseEmailToApiOptions`, mapea `subject: email.subject` sin ningún
  escapado, recorte ni validación de saltos de línea o caracteres de
  control; tampoco hay lógica de ese tipo en ningún otro punto del paquete
  (se buscó `subject`, `header`, `sanitiz`, `validat`, `newline` en el
  `.d.mts` y el `.mjs`, sin resultados relevantes). El propio tipado
  (`subject: string`) no impone ninguna restricción. La librería solo arma
  el payload JSON y lo manda por `fetch` a la API HTTPS de Resend: el
  transporte JSON en sí evita que un `\r\n` cree un header HTTP nuevo, pero
  eso no dice nada sobre qué hace el backend de Resend con ese valor al
  componer el mensaje de correo final (código cerrado, no accesible desde
  este repo). Esta sesión no tiene permiso para hacer llamadas HTTPS
  salientes (bloqueado por el sistema de permisos) ni para configurar
  `RESEND_API_KEY`, así que tampoco se pudo probar el comportamiento real
  contra la API. Ante la duda y sin evidencia de que Resend sanee el
  asunto, no se puede asumir que la protección ya existe aguas abajo — se
  implementó en nuestra capa.
- **Patrón elegido:** mismo enfoque que `HtmlSeguro` de F-009. Se agregó un
  tipo opaco `AsuntoSeguro` y un tagged template `asunto` en `lib/email.ts`
  que limpia cada valor interpolado con una función `limpiarAsunto` antes
  de insertarlo. El campo `Correo.asunto` pasó de `string` a `AsuntoSeguro`,
  así que un asunto nuevo escrito con un template literal común no compila:
  la protección es estructural, no un recordatorio.
- **Qué se quita:** `\r`, `\n`, los separadores Unicode de línea/párrafo
  `U+2028` y `U+2029` (algunos consumidores los tratan como salto de línea
  aunque no sean `\r`/`\n`; la propia ficha traía uno de éstos incrustado en
  el criterio de aceptación, lo cual se tomó como pista deliberada) y el
  resto de los caracteres de control ASCII (`\x00`–`\x1f`, `\x7f`). Se
  eliminan (no se reemplazan por espacio) para no complicar el criterio de
  "un asunto normal se ve exactamente igual que hoy".
- No se tocó el cuerpo del correo (`HtmlSeguro` no se modificó) ni los
  textos de los asuntos.

## Bitácora

- Se agregaron `AsuntoSeguro`, `limpiarAsunto` y el tagged template
  `asunto` en `lib/email.ts`; se cambió `Correo.asunto` a `AsuntoSeguro` y
  se actualizaron los 5 llamadores (`enviarConfirmacionCliente`,
  `enviarAvisoProfesional`, `enviarRecordatorio`,
  `enviarRecuperacionPassword`, `enviarInvitacionTrabajador`) para armar el
  asunto con el tagged template en vez de un template literal común.
- Se agregaron 6 tests nuevos en `lib/email.test.ts` (`\r\n`, `\r` suelto,
  `\n` suelto, `U+2028`/`U+2029`, un carácter de control `BEL`, y un caso
  de asunto normal con emojis para confirmar que no cambió nada visible).
- Verificado en verde: `npm run lint`, `npx tsc --noEmit`,
  `npx vitest run` (141/141) y `npm run build` (sin `RESEND_API_KEY`
  configurada, confirmando que no se reintrodujo el bug de construir el
  cliente de Resend al importar el módulo).


### Cierre — verificación del orquestador

Comprobado que la barrera es del tipo y no una convención: se sacó el tag de una
llamada y `tsc` corta con
`Type 'string' is not assignable to type 'AsuntoSeguro'`. Restaurado, 141 tests
en verde.

La decisión de implementarlo en vez de confiar en Resend está bien fundada: el
SDK mapea `subject` sin tocarlo y no hay forma de verificar qué hace el backend
cerrado de Resend al componer el mensaje, porque esta sesión no tiene salida
HTTPS ni una clave real. Ante la duda, veinte líneas propias cuestan menos que
suponer.
