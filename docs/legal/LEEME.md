# Documentos legales de Eli: léeme primero

> **BORRADOR — no publicar sin revisión de un abogado.**
> Nada de lo que hay en esta carpeta es asesoría legal. Son borradores escritos
> a partir de cómo funciona el producto hoy (revisado el 2026-11-22), para que
> un abogado los corrija y los complete.

## Qué hay en esta carpeta

| Archivo | Qué es | Entre quiénes |
|---|---|---|
| `terminos-y-condiciones.md` | El contrato de uso | Eli y el negocio que crea la cuenta |
| `politica-de-privacidad.md` | Qué datos se guardan y para qué | Parte A: quien tiene cuenta. Parte B: quien reserva en un negocio |
| `anexo-clinicas-dentales.md` | Reglas extra para datos de salud | Eli y cada clínica dental |
| `LEEME.md` | Este archivo | Para el dueño y su abogado |

En los textos hay dos tipos de marcas:

- Un texto entre dobles corchetes: un dato que falta. Se busca con `grep -rn "\[\[" docs/legal`.
- `> POR CONFIRMAR:`: algo que no se pudo verificar, o una decisión abierta.
  Se busca con `grep -rn "POR CONFIRMAR" docs/legal`. **Hay que borrar todas
  estas notas antes de publicar**: son para el abogado, no para el público.

---

## 1. Datos que faltan

### Los entrega el dueño

| Marcador | Qué es |
|---|---|
| `[[RAZÓN SOCIAL]]` | Nombre legal de la empresa dueña de Eli. El pie de la web dice "Sistema One", sin "SpA", porque la sociedad no está confirmada. Si todavía no hay sociedad, el contrato sería con una persona natural: avisar al abogado |
| `[[RUT]]` | RUT de esa empresa |
| `[[DOMICILIO]]` | Dirección legal (calle, número, comuna, ciudad) |
| `[[REPRESENTANTE LEGAL]]` | Nombre de quien representa a la empresa |
| `[[CORREO DE CONTACTO]]` | Correo para temas del contrato y la cuenta |
| `[[CORREO DE PRIVACIDAD]]` | Correo para solicitudes sobre datos personales (puede ser el mismo, pero debe leerse todos los días) |
| `[[FECHA DE VIGENCIA]]` | Día en que se publican los textos |

### Los revisa el dueño en el panel de cada proveedor

| Marcador | Dónde mirar |
|---|---|
| `[[UBICACIÓN DEL SERVIDOR]]` | Hostinger: país del centro de datos del VPS |
| `[[REGIÓN DE LA BASE DE DATOS]]` | Neon: región del proyecto |
| `[[REGIÓN DE UPSTASH]]` | Upstash: región de la base Redis |
| `[[REGIÓN DE R2]]` | Cloudflare R2: ubicación del bucket de fotos |

### Los decide el abogado junto con el dueño

| Marcador | Qué es |
|---|---|
| `[[DÍAS DE AVISO ANTES DE COBRAR]]` | Con cuánta anticipación se avisa que Eli empieza a cobrar |
| `[[DÍAS DE AVISO DE CAMBIOS]]` | Anticipación para cambios de términos, de precios y de la política |
| `[[DÍAS PARA CORREGIR]]` | Plazo que se le da a un negocio antes de suspenderlo |
| `[[DÍAS DE AVISO DE CIERRE DEL SERVICIO]]` | Anticipación si Eli deja de existir |
| `[[PLAZO TRAS CIERRE]]` | Días que se guardan los datos después de cerrar una cuenta |
| `[[PLAZO DE RESPUESTA A DERECHOS]]` | En cuánto se responde una solicitud de acceso, corrección o eliminación |
| `[[TOPE DE RESPONSABILIDAD]]` | Monto o fórmula del límite de responsabilidad |
| `[[COMUNA DE JURISDICCIÓN]]` | Comuna cuyos tribunales conocen los conflictos |

---

## 2. Decisiones que debe tomar el abogado

Las cinco primeras son las que más pesan.

1. **Ficha clínica contra derecho a eliminación.** Hoy, al eliminar un paciente
   se borran sus datos de contacto, pero la ficha, el odontograma, las
   evoluciones, el plan y las prótesis quedan guardados y ocultos: nadie los ve
   y nadie los puede descargar. La Ley 20.584 obliga a la clínica a conservar la
   ficha al menos 15 años. Hay que decidir si en una clínica "eliminar" se
   bloquea, se advierte o se reemplaza por "archivar", y cómo la clínica vuelve
   a acceder a una ficha conservada. (`docs/PRODUCTO.md`, sección 10.)
2. **Qué pasa con los datos al cerrar una cuenta, y en qué plazo.** En general
   y, sobre todo, en clínicas: ¿puede Eli borrar fichas clínicas al cerrar la
   cuenta?, ¿debe entregarlas antes?, ¿qué pasa si la clínica desaparece?
3. **¿Contrato de encargo de tratamiento separado con cada clínica?** O si basta
   el anexo aceptado al crear la cuenta. Y si hace falta algo equivalente para
   los demás rubros.
4. **Vigencia de la Ley 21.719 y qué exige desde el primer día.** Según lo que
   sabemos rige desde el 1 de diciembre de 2026 (a confirmar). Revisar: bases de
   licitud, plazos de respuesta, deber de avisar brechas, datos de menores,
   transferencias internacionales, y si Eli debe o le conviene nombrar un
   **delegado de protección de datos**.
5. **Seguridad suficiente para datos de salud.** La guía de despliegue reconoce
   que el disco del servidor y los respaldos no están cifrados y que no hay
   aislamiento a nivel de base de datos (es de capa de aplicación). El abogado
   debe decir qué es condición para ofrecer Eli a clínicas y qué se puede
   prometer en el texto.

Además:

6. **Límite de responsabilidad** que no sea abusivo (art. 16 de la Ley 19.496),
   considerando que hoy no se cobra y que muchos clientes son micro o pequeñas
   empresas con protección de consumidor (Ley 20.416).
7. **Cláusula de jurisdicción.** El texto fija una comuna, pero deja a salvo el
   derecho del consumidor a demandar en su domicilio. Confirmar que así vale.
8. **Cambios unilaterales.** El texto pide aceptación para cambios relevantes.
   Confirmar el mecanismo (¿correo y seguir usando?, ¿casilla en el panel?).
9. **Derecho a retracto** de la Ley 19.496 para servicios contratados por
   internet: definir si se excluye expresamente o se ofrece, antes de cobrar.
10. **Transferencia internacional.** Si las condiciones estándar de Neon,
    Resend, Upstash, Cloudflare, Hostinger y Google bastan, y si hay que firmar
    algo con ellos. Hoy no hay constancia de contratos de tratamiento firmados.
11. **El "motivo" de una hora dental en los correos** (por ejemplo,
    "Endodoncia"): ¿es dato de salud que viaja por el proveedor de correo?
12. **Consentimiento de pacientes y menores de edad.** El producto no pregunta
    la edad ni registra quién autoriza por un menor, y no guarda
    consentimientos informados.
13. **Datos del equipo.** Los profesionales tienen cuenta propia en Eli, pero
    sus comisiones y liquidaciones las carga el negocio. El texto dice que por
    esos datos responde el negocio. Confirmar.
14. **Registro de lectura de fichas.** El producto registra quién escribió, no
    quién leyó. ¿Lo exige la normativa?
15. **Todos los odontólogos ven todas las fichas de la clínica.** ¿Es aceptable
    o debe poder limitarse?
16. **Correos promocionales.** Revisar que el consentimiento por casilla y la
    baja en un clic cumplan la Ley 19.496 (art. 28 B) y la Ley 21.719. Los
    correos del período de prueba al dueño no piden consentimiento previo.
17. **Estadísticas agregadas** (Términos, sección 7): conservar o quitar.
18. **Programa de referidos** (7 días extra de prueba): si necesita bases
    propias.
19. **Clientes importados.** El negocio puede subir contactos desde un archivo o
    desde la agenda de su teléfono. El texto lo hace responsable de tener
    derecho a esos datos. Confirmar que basta.

---

## 3. Diferencias entre lo que el texto dice y lo que el producto hace hoy

Donde el producto se queda corto, el texto lo dice con una nota
`POR CONFIRMAR` en vez de prometerlo. Esta es la lista completa.

| # | Tema | Lo que un texto "ideal" diría | Lo que el producto hace hoy |
|---|---|---|---|
| 1 | Cerrar la cuenta | "Puedes cerrar tu cuenta desde el panel" | No existe cierre ni borrado de cuenta. Habría que hacerlo a mano en la base. `docs/PRODUCTO.md` lo confirma ("No existe borrado de cuenta") |
| 2 | Llevarse los datos | "Puedes exportar todos tus datos" | Sólo se descargan en CSV los clientes, las atenciones de un rango (hasta un año) y el comprobante de cada liquidación. No se exportan la agenda, los servicios ni **la ficha clínica** |
| 3 | Eliminar un paciente dental | "Se elimina" o "se conserva accesible 15 años" | Ni lo uno ni lo otro: lo clínico queda guardado y oculto, sin forma de verlo ni descargarlo |
| 4 | Anonimizar un cliente | "No queda ningún dato personal" | Casi: una cita sin servicio del catálogo conserva su título escrito a mano; los chats (función apagada) guardan nombre y teléfono sin enlace al cliente; una inscripción en la fila virtual (nombre y correo) no está unida a la ficha |
| 5 | Copias de seguridad | "Se borran a los 14 días" | Cierto para las copias del servidor. Pero Neon guarda su propio historial (plazo según el plan), la guía sugiere copiar respaldos al computador del dueño (se acumulan) y Hostinger puede tener copias del disco |
| 6 | Cifrado | "Tus datos están cifrados" | Sólo en tránsito (HTTPS) y las contraseñas. El disco y los respaldos no están cifrados (`deploy/README.md`). El texto no promete cifrado en reposo |
| 7 | Medición de visitas | "No usamos analítica" | El código carga Vercel Analytics en producción (`app/layout.tsx`, `components/analitica.tsx`), aunque Eli ya no corre en Vercel. Probablemente no envía nada, pero hay que comprobarlo y decidir: quitarlo o declararlo |
| 8 | Correos enviados | "Al eliminarte se borra todo" | Los correos ya enviados quedan en el historial de Resend |
| 9 | Fin de la prueba | "Al terminar la prueba pasa X" | No está definido. No hay cobro ni bloqueo: la cuenta sigue funcionando |
| 10 | Aceptación de los términos | "Al crear la cuenta aceptas…" | El registro no muestra esa línea ni guarda que alguien aceptó, ni qué versión |
| 11 | Verificar el correo | "Verificamos tu correo" | Según `docs/PRODUCTO.md` no se verifica. Hay trabajo en curso sin publicar que lo agrega. Los textos no afirman nada al respecto |
| 12 | Derechos de quien reserva | "Puedes ver y descargar tus datos" | Quien reserva no tiene cuenta. Sólo puede cancelar o cambiar su hora, darse de baja y salir de la lista. El resto lo pide al negocio |
| 13 | Solicitudes de soporte | "Se borran pasado un tiempo" | Se guardan sin plazo, con el tipo de navegador |
| 14 | Fila virtual | "Los datos de la fila se borran al terminar el día" | No se encontró un borrado: el nombre y el correo quedan en la atención. A confirmar |
| 15 | Registro de accesos a la ficha | "Queda registro de cada acceso" | Sólo queda registro de quién escribió |
| 16 | Aviso de brechas | "Te avisaremos en X horas" | No hay procedimiento escrito ni monitoreo de errores o caídas |
| 17 | Verificación en dos pasos | "Protegemos tu cuenta con doble factor" | No existe |
| 18 | Contratos con proveedores | "Nuestros proveedores firmaron acuerdos de tratamiento" | No hay constancia en el repositorio |

---

## 4. Qué habría que construir después en la app

Nada de esto está hecho. Es lo que viene una vez que el abogado apruebe los
textos.

**Para poder publicar**

1. Páginas públicas `/terminos` y `/privacidad` (y el anexo dental, por ejemplo
   en `/terminos/clinicas-dentales`), con la fecha de vigencia, enlazadas desde
   el pie de la landing.
2. Volver a mostrar en "Crear cuenta" la línea "Al crear tu cuenta aceptas los
   Términos y la Política de privacidad", también al entrar con Google y al
   aceptar una invitación al equipo. Se quitó porque enlazaba a páginas que no
   existían (`docs/PRODUCTO.md`, sección 10, "No funcionales").
3. Guardar **cuándo** aceptó cada cuenta y **qué versión**, y poder pedir una
   nueva aceptación cuando cambien los términos.
4. En la página pública de reservas, la lista de espera y la fila virtual: un
   enlace a la política de privacidad, diciendo que el responsable es el
   negocio.
5. En una clínica dental: mostrar y hacer aceptar el anexo al crear la cuenta.
6. Decidir qué se hace con Vercel Analytics (quitarlo o declararlo).

**Para que el texto sea verdad**

7. Cerrar la cuenta desde el panel, con borrado real pasado el plazo (incluidas
   las fotos del almacén).
8. Exportación completa de los datos del negocio y, en clínicas, de la ficha
   clínica por paciente.
9. Resolver "eliminar paciente" en clínicas (decisión 1).
10. Cerrar los huecos de la anonimización (fila 4 de la tabla).
11. Plazo de borrado para solicitudes de soporte y datos de la fila virtual.
12. Cifrar los respaldos y definir qué copias existen fuera del servidor.
13. Un procedimiento escrito para incidentes de seguridad y para responder
    solicitudes de derechos.

---

## De dónde salió cada afirmación

| Tema | Archivo del repositorio |
|---|---|
| Funciones, roles, correos, eliminación, clínica | `docs/PRODUCTO.md` |
| Precios y días de prueba | `lib/precios.ts` |
| Qué datos existen | `prisma/schema.prisma` |
| Sesiones de 7 días, contraseñas, Google | `lib/auth.ts` |
| Correos y bajas | `lib/email.ts` |
| Proveedores y variables | `README.md` |
| Servidor, respaldos (diarios, 14 días), advertencias sobre datos de salud | `deploy/README.md`, `deploy/respaldo.sh`, `deploy/cron-eli` |
| Límites de uso | `lib/rate-limit.ts` |
| Medición de visitas | `components/analitica.tsx`, `lib/analitica.ts`, `app/layout.tsx` |

Las citas a leyes (19.628, 21.719, 20.584, 19.496, 20.416) son orientativas y
salen del conocimiento general de quien redactó, no de una revisión jurídica.
