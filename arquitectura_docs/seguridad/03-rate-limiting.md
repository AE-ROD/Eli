# 03 — Rate limiting

## Por qué es obligatorio

Sin límites, un script de veinte líneas te prueba contraseñas toda la noche, te
descarga la base fila por fila o te quema el presupuesto de SMS antes del
mediodía. No hace falta un atacante sofisticado: basta un bucle mal escrito de un
integrador.

**Todo endpoint tiene límite. Sin excepción.**

## Capas

```
1. CDN / WAF        →  frena volumen bruto y ataques distribuidos
2. App (middleware) →  límite por usuario y por endpoint  ← el importante
3. Base de datos    →  tope de conexiones y timeout de consulta
```

La capa 2 es la que no se puede omitir. Las otras dos ayudan, pero no distinguen
a un usuario legítimo de uno abusivo.

## Por qué clave se cuenta

Prioridad: **ID de usuario > llave de API > IP**.

La IP sola es mala clave: muchos usuarios comparten IP (oficina, móvil, NAT) y un
atacante las rota. Úsala solo cuando no hay sesión, como en login o registro.

Si estás detrás de un proxy, la IP real viene en `X-Forwarded-For` — y **solo
confías en esa cabecera si viene de tu propio proxy**. Si la lees a ciegas,
cualquiera la falsifica y tu rate limiting deja de existir.

## Límites por defecto

Punto de partida; se ajusta con datos reales de uso.

| Endpoint | Límite | Clave |
|---|---|---|
| Login | 5 / 15 min | cuenta + IP |
| Recuperar contraseña | 3 / hora | cuenta |
| Registro | 3 / hora | IP |
| Envío de OTP, SMS o correo | 3 / hora | destinatario |
| Lectura autenticada | 100 / min | usuario |
| Escritura autenticada | 20 / min | usuario |
| Búsqueda / listados | 30 / min | usuario |
| Reportes y exportaciones | 5 / hora | usuario |
| Subida de archivos | 10 / hora | usuario |
| Webhooks entrantes | por firma válida | origen |

Todo lo que cuesta dinero por llamada (SMS, correo, IA, pasarela de pago) va con
límite estricto **y con tope de gasto diario aparte**. El rate limit protege el
sistema; el tope de gasto protege el bolsillo.

## Cómo se responde

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
```

- Nunca reveles si el correo existe o no. El mensaje de login fallido es idéntico
  en ambos casos, y el límite se aplica igual.
- El contador de login se reinicia con un ingreso exitoso, no con el tiempo solo.
- Ante abuso sostenido: espera creciente, no bloqueo permanente. Bloquear para
  siempre por IP deja afuera a usuarios legítimos y no detiene a nadie.

## Qué NO es rate limiting

- Un `setTimeout` en el frontend. El atacante no usa tu frontend.
- Deshabilitar el botón mientras carga. Mismo motivo.
- Un contador en memoria si corres varias instancias: cada una cuenta aparte y el
  límite real se multiplica. Usa almacenamiento compartido.

## Definición de terminado

- [ ] Todo endpoint nuevo tiene límite declarado
- [ ] Los de autenticación, más estrictos que el resto
- [ ] Todo lo que cuesta por llamada tiene límite **y** tope de gasto
- [ ] Devuelve 429 con `Retry-After`
- [ ] El contador es compartido entre instancias
- [ ] Un test que supera el límite y verifica el 429
