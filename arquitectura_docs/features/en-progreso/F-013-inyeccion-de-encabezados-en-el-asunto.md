---
id: F-013
titulo: Inyección de encabezados en el asunto del correo
estado: en-progreso
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

- [ ] Un nombre con `\r\n` no produce un encabezado nuevo: el asunto llega en una
      sola línea.
- [ ] También se contemplan los caracteres de control y los saltos sueltos
      (`\r` solo, `\n` solo, ` `).
- [ ] **La protección es por defecto:** un asunto nuevo escrito sin acordarse no
      reintroduce el agujero. Mismo criterio que `HtmlSeguro` en F-009 y
      `whereDeAgenda` en F-006.
- [ ] Un asunto normal se ve exactamente igual que hoy, emojis incluidos.
- [ ] Tests con al menos un caso de `\r\n` y uno de salto suelto.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test` y `npm run build` en verde.

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

<!-- El agente completa acá. -->

## Decisiones tomadas

<!-- El agente registra acá las que surjan. -->

## Bitácora
