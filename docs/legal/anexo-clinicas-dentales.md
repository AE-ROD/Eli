# Anexo para clínicas dentales: tratamiento de datos de salud

> **BORRADOR — no publicar sin revisión de un abogado.**
> Este texto no es asesoría legal. Describe lo que Eli hace hoy según el
> repositorio (ver `docs/legal/LEEME.md`). Complementa los Términos y la
> Política de privacidad; si se contradicen en materia de datos de salud, manda
> este anexo.

**Vigencia:** desde el [[FECHA DE VIGENCIA]].

---

## 1. A quién aplica

A todo negocio que crea su cuenta en Eli con el rubro "clínica dental" ("la
clínica"). Sólo ese rubro tiene ficha clínica; en los demás, estas funciones no
existen.

## 2. Roles: la clínica decide, Eli almacena

- **La clínica es el prestador de salud y la responsable de la ficha clínica**
  de sus pacientes, en los términos de la Ley N.º 20.584 y de la legislación de
  protección de datos. Decide qué se registra, quién de su equipo accede y
  cuánto se conserva.
- **Eli es encargado (mandatario) del tratamiento.** Almacena y procesa esos
  datos sólo para prestarle el servicio a la clínica y según sus instrucciones,
  que son las que da al usar el programa. Eli no usa los datos de salud para
  fines propios, no los vende, no los cede y no los usa para publicidad ni para
  estadísticas.
- Eli no es prestador de salud, no interviene en decisiones clínicas y no
  revisa el contenido de las fichas.

> POR CONFIRMAR por el abogado: si este anexo, aceptado al crear la cuenta,
> basta como contrato de encargo de tratamiento, o si hace falta un contrato
> separado y firmado con cada clínica (LEEME, "Decisiones").

## 3. Qué datos de salud se guardan

Por cada paciente, lo que la clínica registre:

- **Antecedentes:** fecha de nacimiento, previsión (Fonasa, Isapre, particular
  u otra), alergias, enfermedades y medicamentos.
- **Odontograma:** estado de cada pieza y de sus caras, con quién lo actualizó
  por última vez y cuándo.
- **Evoluciones:** lo realizado en cada atención, con fecha y autor.
- **Plan de tratamiento y presupuesto:** prestaciones por pieza, etapas,
  valores, y cuándo se presentó y aprobó cada etapa.
- **Prótesis:** diseño, material, laboratorio, tono, seguimiento y abonos.

Además, la cita guarda el motivo de consulta y si es la primera vez.

**Eli no almacena hoy** radiografías, documentos ni consentimientos informados
firmados. La clínica debe guardarlos por sus propios medios.

## 4. Quién ve qué dentro de la clínica

Los permisos los aplica el programa según el rol que la clínica le dio a cada
persona:

| | Dueña o dueño | Odontólogo (rol profesional) | Recepción (rol encargado) |
|---|---|---|---|
| Antecedentes, odontograma y evoluciones | Ve y escribe, de todos los pacientes | Ve y escribe, de todos los pacientes | No los ve |
| Alerta de alergias | Sí | Sí | Sí |
| Plan de tratamiento | Ve y edita | Ve y edita | Lo ve, sin editar |
| Prótesis del paciente | Ve y gestiona | Ve y gestiona | No ve la pestaña; sólo cobra los abonos |

- **Todos los odontólogos de la clínica ven la ficha de todos los pacientes**,
  no sólo la de los suyos. Es una decisión de diseño del producto; la clínica
  debe tenerla en cuenta al invitar personas con ese rol.
- La página pública de reservas no muestra ni recibe nada de la ficha.
- Los laboratorios dentales son externos: no tienen cuenta en Eli y Eli no les
  envía nada.
- **Personal de Eli.** Eli no tiene una pantalla de administración para mirar
  fichas. Quien administra la infraestructura tiene acceso técnico a la base de
  datos y a las copias de seguridad, y sólo debe usarlo para mantener el
  servicio o a pedido de la clínica.

  > POR CONFIRMAR: quiénes son esas personas hoy y si firmaron un compromiso de
  > confidencialidad.

- **Registro de accesos.** El programa registra quién **escribió** (autor y
  fecha de cada evolución, del odontograma y de los antecedentes).

  > POR CONFIRMAR: el producto no tiene un registro de quién **leyó** una
  > ficha (se buscó en el esquema de la base y no existe). El abogado debe decir si la normativa de ficha clínica lo exige.

## 5. Integridad de la ficha

- Las evoluciones **sólo se agregan**: no se editan ni se borran, ni siquiera
  por quien las escribió. La base de datos lo impide.
- El odontograma guarda la última versión y quién la guardó; **no tiene
  historial de versiones**. Si dos personas lo editan a la vez, queda lo del
  último que guarda.
- Si un odontólogo deja el equipo, su perfil se archiva y sigue figurando como
  autor de lo que escribió.

## 6. Conservación

- La obligación legal de conservar la ficha clínica por al menos 15 años recae
  en **la clínica**, como prestador.
- Mientras la cuenta de la clínica esté activa, Eli conserva las fichas sin
  límite de tiempo. Eli no borra fichas por antigüedad.
- **Eli no es un archivo legal de fichas.** La clínica debe asegurarse de poder
  cumplir su deber de conservación también si deja de usar Eli (sección 8).

## 7. Qué pasa al eliminar un paciente

Cuando la dueña o la recepción elimina un paciente:

- Sus datos de contacto se anonimizan sin vuelta atrás: el nombre pasa a
  "Cliente eliminado" y se borran apellido, correo, teléfono, cédula, notas y
  consentimientos (el detalle está en la Política de privacidad, B.5).
- **Lo clínico no se borra:** la ficha, el odontograma, las evoluciones, el plan
  y las prótesis quedan guardados en la base de datos, pero **desde ese momento
  ninguna pantalla los muestra** a nadie de la clínica.

Consecuencias que la clínica debe conocer:

- Los datos clínicos siguen existiendo, y pueden contener texto que identifique
  al paciente (por ejemplo, dentro de una evolución). No es una supresión
  completa.
- A la vez, la clínica **pierde el acceso** a esa ficha desde el panel, y hoy no
  hay forma de volver a verla ni de descargarla.

> POR CONFIRMAR por el abogado (decisión abierta en `docs/PRODUCTO.md`, sección
> 10, "Clínica dental: conservar la ficha"): cómo convive el derecho de
> supresión del paciente con el deber de conservar la ficha 15 años; si
> "eliminar" debería estar bloqueado o advertido en una clínica; y cómo accede
> la clínica a una ficha conservada si una autoridad o el propio paciente la
> pide. Mientras no se decida, **recomendamos a las clínicas no eliminar
> pacientes con ficha**.

## 8. Qué pasa al cerrar la cuenta de la clínica

- Antes de cerrar, la clínica debe obtener copia de las fichas para cumplir su
  deber de conservación.

  > POR CONFIRMAR: **hoy el producto no exporta la ficha clínica.** Sólo se
  > descargan en CSV los pacientes (contacto) y las atenciones. Una entrega de
  > fichas tendría que hacerla Eli a mano, a pedido. Hay que construir la
  > exportación o definir el procedimiento manual antes de ofrecer Eli a
  > clínicas con este texto.

- Cerrada la cuenta, los datos se eliminan pasado el plazo de
  [[PLAZO TRAS CIERRE]] días que fijan los Términos; las copias de seguridad que
  los contengan se borran dentro de los 14 días siguientes.

  > POR CONFIRMAR por el abogado: si Eli puede eliminar fichas al cerrar la
  > cuenta, o si debe ofrecer (o exigir) una entrega formal previa a la clínica,
  > y qué pasa si la clínica desaparece sin retirar sus fichas.

## 9. Seguridad y proveedores

- Las fichas se guardan en la misma base de datos que el resto de Eli, separadas
  por clínica, con las medidas de la Política de privacidad (parte G).
- Los proveedores que alojan esos datos son los de la Política (parte C):
  Hostinger (servidor y copias de seguridad) y Neon (base de datos). Algunos
  están fuera de Chile.
- Los correos a pacientes (confirmación, recordatorio, "Control") no incluyen
  la ficha. Sí dicen el motivo de la hora.

> POR CONFIRMAR / no prometer: la guía de despliegue advierte que el disco del
> servidor y las copias de seguridad no están cifrados. El abogado debe evaluar
> si esas medidas son suficientes para datos sensibles de salud y qué mejoras
> son condición para ofrecer el servicio a clínicas.

## 10. Incidentes

Si Eli detecta un incidente de seguridad que afecte fichas clínicas, avisará a
la clínica sin demora indebida, con lo que sepa del alcance, para que la clínica
pueda cumplir sus propias obligaciones de aviso.

> POR CONFIRMAR: plazo máximo de aviso y procedimiento. Hoy no está escrito.

## 11. Obligaciones de la clínica

- Informar a sus pacientes que usa Eli para llevar la ficha y obtener los
  consentimientos que la ley exija.
- Dar acceso sólo a personal que deba tenerlo, con el rol correcto, y sacar del
  equipo a quien deja la clínica.
- No compartir cuentas entre personas: el autor de cada registro es la cuenta
  que lo escribió.
- Responder las solicitudes de sus pacientes sobre su ficha.
- Mantener por su cuenta lo que Eli no almacena (radiografías, consentimientos
  firmados, documentos).
