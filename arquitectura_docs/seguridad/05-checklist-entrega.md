# 05 — Checklist antes de entregar a un cliente

Esto se corre completo antes de la primera entrega y antes de cada despliegue a
producción. Lo firma una persona, no un agente.

## Base de datos
- [ ] RLS activo (`ENABLE` + `FORCE`) en toda tabla expuesta
- [ ] Sin políticas `USING (true)` ni `FOR ALL`
- [ ] `WITH CHECK` en todo `INSERT` y `UPDATE`
- [ ] Vistas con `security_invoker`; funciones `SECURITY DEFINER` justificadas
- [ ] Test de aislamiento: usuario A no ve datos de usuario B
- [ ] Sin IP pública abierta a `0.0.0.0/0`
- [ ] Backup automático **y restauración probada al menos una vez**

## Llaves y secretos
- [ ] `verificar.sh` en verde
- [ ] Ninguna llave secreta en el bundle del frontend
- [ ] Ninguna variable secreta con prefijo `NEXT_PUBLIC_` / `VITE_` / `REACT_APP_`
- [ ] Servicios pagados por llamada, detrás del backend
- [ ] `.env` fuera de git; `.env.example` al día
- [ ] Llaves de producción distintas de las de staging y local

## Rate limiting
- [ ] Todo endpoint con límite
- [ ] Login, registro y recuperación de contraseña, más estrictos
- [ ] Tope de gasto en servicios que cobran por uso
- [ ] 429 con `Retry-After`
- [ ] Contador compartido entre instancias

## Entornos
- [ ] Staging con autenticación de plataforma
- [ ] `X-Robots-Tag: noindex` en staging
- [ ] Staging sin datos reales
- [ ] Correo saliente de staging capturado
- [ ] Búsqueda `site:` sin resultados indexados
- [ ] Modo depuración apagado en producción
- [ ] Sin `.git`, `.env` ni backups accesibles por URL

## Aplicación
- [ ] Autorización verificada por recurso, no solo por endpoint
- [ ] Toda entrada externa validada en el borde
- [ ] Consultas parametrizadas en todos lados
- [ ] Sesiones con expiración y cierre real
- [ ] Contraseñas con hash moderno y salt
- [ ] Datos personales enmascarados en los logs
- [ ] Dependencias sin vulnerabilidades conocidas de severidad alta

## Cierre
- [ ] `contexto/entornos.md` refleja la realidad
- [ ] El cliente sabe quién tiene acceso a producción
- [ ] Hay un plan de rotación de llaves cuando alguien deja el proyecto

---

**Firma:** _______________  **Fecha:** _______  **Versión entregada:** _______
