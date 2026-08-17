# 02 — Secretos y llaves de API

## La regla

**Todo lo que llega al navegador es público.** No importa que esté en una
variable de entorno, ofuscado o dentro de un archivo que "nadie va a mirar". El
bundle se descarga, se abre y se lee. Cualquiera con DevTools lo tiene.

## Qué va dónde

| Va al cliente (público) | Solo en el servidor (secreto) |
|---|---|
| Llave publicable de Supabase (`sb_publishable_…`) | Llave secreta de Supabase (`sb_secret_…`) |
| Llave publicable de Stripe (`pk_…`) | Llave de Stripe (`sk_live_…`), secreto del webhook |
| URL pública de la API | Credenciales de base de datos |
| ID de proyecto, dominio | Cualquier llave de OpenAI, correo, SMS, Google |

La llave publicable **es segura de exponer** — pero solo porque RLS está detrás
haciendo el trabajo (ver `01-base-de-datos.md`). La llave secreta bypassea RLS
por completo: en el navegador equivale a entregar la base de datos entera.

> Nota: `anon` y `service_role` son la nomenclatura antigua de Supabase, deprecada
> hacia fines de 2026. `publishable` reemplaza a `anon`; `secret` a `service_role`.
> Mismas reglas, nombres más claros.

## Los prefijos que exponen sin avisar

En Next.js, Vite y similares, ciertos prefijos **inyectan la variable en el
bundle en tiempo de compilación**:

```
NEXT_PUBLIC_*      →  público
VITE_*             →  público
REACT_APP_*        →  público
EXPO_PUBLIC_*      →  público
```

Regla dura: **si el nombre lleva uno de esos prefijos, asume que está publicado.**
Un `NEXT_PUBLIC_SUPABASE_SECRET_KEY` no es un descuido menor, es una filtración
en el momento del build.

## Cuando el frontend necesita un servicio de terceros

No le entregues la llave. Ponle un intermediario:

```
Navegador  →  tu backend  →  servicio externo
              (guarda la llave,
               verifica sesión,
               aplica rate limit,
               registra el uso)
```

El backend es el único que conoce la llave. Además te da control de costo: sin
ese intermediario, cualquiera puede extraer tu llave de un servicio pagado por
llamada y facturarte lo que quiera.

## Manejo

- `.env` **nunca** se commitea. Sí se commitea `.env.example` con los nombres y
  sin valores.
- Rotación: al salir alguien del proyecto, al terminar un contrato, y ante
  cualquier sospecha.
- Una llave por entorno. Las de producción no se usan jamás en local.
- Una llave secreta por componente cuando el proveedor lo permita, para poder
  rotar una sin bajar todo.
- Nunca en logs, mensajes de error, capturas, tickets ni chats.

## Al escribir código

- Ningún literal que parezca llave. Siempre desde configuración.
- Antes de commitear, corre `seguridad/verificar.sh`.
- Si necesitas una llave nueva: la pides, alguien la crea, tú la consumes.
  El agente no crea ni almacena credenciales.

## Definición de terminado

- [ ] Ninguna llave secreta en código, bundle ni variables con prefijo público
- [ ] Todo servicio externo pagado pasa por el backend
- [ ] `.env` en `.gitignore`, `.env.example` al día
- [ ] `verificar.sh` en verde
