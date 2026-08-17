---
description: Auditoría de seguridad contra los controles obligatorios
---

Audita el proyecto contra `arquitectura_docs/seguridad/`. Alcance: $ARGUMENTS
(si está vacío, audita todo el proyecto).

No corrijas nada. Solo reporta.

1. Corre `bash arquitectura_docs/seguridad/verificar.sh`.
2. Lee los cinco archivos numerados de `arquitectura_docs/seguridad/`.
3. Verifica manualmente lo que el script no puede detectar:
   - **Base de datos:** toda tabla expuesta con RLS activo; políticas separadas
     por operación; `WITH CHECK` en `INSERT` y `UPDATE`; vistas con
     `security_invoker`; existencia del test de aislamiento entre usuarios.
   - **Llaves:** ninguna secreta alcanzable desde el bundle; servicios pagados
     por llamada detrás del backend.
   - **Rate limiting:** cada endpoint con límite; los de autenticación más
     estrictos; contador compartido entre instancias.
   - **Entornos:** staging con autenticación, `X-Robots-Tag: noindex`, sin datos
     reales, correo saliente capturado.
4. Clasifica cada hallazgo:
   - **CRÍTICO** — datos expuestos o llave filtrada. Se detiene todo.
   - **ALTO** — control obligatorio ausente. Bloquea la entrega.
   - **MEDIO** — control incompleto o frágil.
   - **BAJO** — mejora.

## Reporte

```
CRÍTICOS: n     ALTOS: n     MEDIOS: n     BAJOS: n

Por cada hallazgo:
  [NIVEL] archivo:línea
  QUÉ: el problema en una línea
  RIESGO: qué puede pasar concretamente
  ARREGLO: la corrección puntual
  CONTROL: qué archivo de seguridad/ lo exige

NO VERIFICABLE DESDE EL CÓDIGO: lo que hay que revisar en el panel del
proveedor o en el navegador (indexación, IP abiertas, backups).
```

Si hay un CRÍTICO, ponlo primero y dilo en la primera línea de la respuesta.
