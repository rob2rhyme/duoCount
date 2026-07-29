---
title: Privacidad y manejo de datos
---

# Privacidad y manejo de datos

> **Plantilla — revísala antes de confiar en ella.** Esto describe cómo maneja
> los datos DuoCount tal como está construido, para que puedas adaptarlo al aviso
> de privacidad que tu tienda realmente publique. **No es asesoría legal.** Las
> obligaciones de privacidad dependen de dónde estén tú y tu personal (por
> ejemplo leyes estatales de EE. UU., GDPR/UK GDPR, PIPEDA) y de cómo instales la
> app — pide a un profesional que revise tu política final.

*Read this page in English → [Privacy & Data Handling](/docs/privacy-and-data).*

## Para quién es esto

DuoCount es una herramienta de operaciones que un negocio opera para su **propio**
personal. El **negocio (el dueño de la tienda) es el responsable del
tratamiento** — decide qué se registra y por qué. DuoCount es el software que lo
registra. Si instalas DuoCount para tu tienda, tú eres el operador, y este aviso
es el punto de partida de lo que le explicas a tu personal.

## Qué datos guarda DuoCount

DuoCount solo guarda lo que el negocio y su personal ingresan para llevar los
conteos de turno:

- **Cuentas de tienda y de personal** — nombre y código de la tienda; el nombre
  visible de cada persona, su rol (empleado / gerente / dueño) y su ubicación
  asignada; y un correo electrónico opcional (solo si lo agregas para horarios o
  para el resumen diario).
- **Credenciales de acceso** — el personal entra con un PIN numérico. El PIN
  **nunca se guarda en texto plano**; solo se conserva un hash con sal, y el
  inicio de sesión compara contra ese hash. (`src/lib/hash.js`, subdocumento
  `private/creds`.)
- **Registros operativos** — conteos de caja (ventas, pagos en efectivo,
  esperado contra contado, sobrante/faltante), actividad de paquetes de
  raspaditos (conteos y el censo ocasional de libros en existencia — una lista
  firmada de los números de paquete que están físicamente en el exhibidor),
  conteos de inventario y movimientos de trastienda, lecturas de recolección de
  máquinas de entretenimiento o de juego (si la tienda registra máquinas),
  señales de diferencia y sus códigos de causa, disputas y sus hilos de
  comentarios, y notas de turno. Son un registro **solo de agregado**: cada
  entrada la firma la persona con sesión iniciada y no se puede borrar desde el
  cliente, por diseño, para que el historial siga siendo confiable.
- **Registros laborales** — merecen nombrarse aparte, porque son sobre personas y
  no sobre mercancía:
  - **Marcas del reloj checador** — horas de entrada y salida, firmadas y con
    hora puesta por el servidor.
  - **Horarios y disponibilidad** — turnos asignados, los días que una persona
    indica que no puede trabajar, los horarios publicados, y las ofertas y
    reclamos de cambio de turno.
  - **Solicitudes de tiempo libre** — el tipo de solicitud (**vacaciones,
    enfermedad, personal, cita, otro**), las fechas, y un **motivo de texto libre
    de hasta 500 caracteres** que escribe la persona, además de la decisión del
    gerente y su propio motivo. **Una solicitud por «enfermedad», o cualquier
    cosa que alguien escriba en el motivo, puede constituir información de
    salud.** Trata ese campo como sensible: dile a tu personal que no necesita
    revelar un diagnóstico, limita quién aprueba las solicitudes y revisa tus
    reglas locales — bajo el GDPR/UK GDPR los datos de salud son una categoría
    especial que requiere su propia base legal, y varios estados de EE. UU.
    también los regulan.
  - **Nómina** — las horas se totalizan por empleado, los días se pueden bloquear
    una vez procesados, y se puede exportar un CSV de nómina. Esa exportación
    contiene horas trabajadas y es un registro de compensación.
  - **Reportes de incidentes** — un registro firmado y solo de agregado que
    **nombra a la persona a la que se refiere** y puede llevar una gravedad, una
    categoría, un relato y el acuse de recibo de esa persona. Son **registros
    disciplinarios / de personal**. En muchas jurisdicciones un empleado tiene
    derecho a ver su propio expediente; prepárate para eso en vez de que te tome
    por sorpresa.
- **Alertas de patrones (marcado automático)** — la app calcula señales como
  faltantes repetidos, cajas problemáticas, conteos fuera de turno y huecos en
  los paquetes de raspaditos, y algunas **nombran a un empleado concreto**. Son
  avisos orientativos para que una persona revise, nunca decisiones automáticas:
  nada en DuoCount sanciona, paga, programa horarios ni despide a nadie por su
  cuenta. Si las usas como insumo para una decisión laboral, esa decisión es tuya
  y debe tomarla una persona que haya mirado los registros de origen. (Donde
  aplica el GDPR esto importa: el art. 22 restringe las decisiones basadas
  únicamente en tratamiento automatizado.)
- **Solicitudes de soporte (solo si alguien contacta a soporte)** — un ticket
  lleva el asunto y el cuerpo que escribe tu personal, la categoría y prioridad,
  **cualquier captura de pantalla adjunta**, el nombre de la tienda y el nombre
  de quien lo escribió. Los tickets los puede leer el operador de esta
  instalación — para eso existe un canal de soporte — así que dile a tu personal
  que no pegue en un ticket nada que no quiera que el operador lea, y recuerda
  que una captura de pantalla puede mostrar todo lo demás que había en pantalla.
- **Registros de facturación (solo donde la instalación cobra por el servicio)** —
  el plan de la tienda, el estado de la suscripción (prueba / activa / vencida /
  cancelada), el ciclo de facturación y el precio. **No se guardan números de
  tarjeta, datos bancarios ni credenciales de pago** en DuoCount; si una
  instalación cobra, eso pasa por un proveedor de pagos aparte, bajo sus propios
  términos.
- **Datos importados (solo si el dueño hace una importación)** — la importación
  CSV, exclusiva del dueño, puede traer artículos rastreados, una lista de
  personal (nombres, roles, ubicaciones, correos opcionales), conteos iniciales
  de estante, niveles de existencia del POS o clientes de recompensas. Los datos
  importados se vuelven el mismo tipo de registro que cualquier cosa capturada a
  mano, y eres responsable de tener derecho a importarlos — una lista de clientes
  exportada de otro sistema arrastra el consentimiento con el que se recabó.
- **Preferencias del dispositivo** — un puñado de ajustes pequeños se guarda
  **localmente en tu navegador** (localStorage) y nunca se envía a un servidor:
  tu tema claro/oscuro (`duocount-theme`), el botón de volver arriba
  (`duocount-fab`), tu idioma (`duocount-lang`), la pestaña en la que estabas
  (`duocount-tab`) y qué secciones imprimes (`duocount-print-sections`). Ninguno
  te identifica; borrar los datos del navegador los elimina. DuoCount no usa
  cookies de publicidad ni de analítica. Iniciar sesión sí guarda una sesión de
  autenticación de Firebase en el dispositivo para que sigas dentro — cerrar
  sesión la borra.
- **Cámara (solo mientras escaneas)** — el escáner de códigos de barras le pide
  acceso a la cámara a tu navegador cuando lo abres. El video se decodifica **en
  tu dispositivo, en el navegador**; DuoCount **no** graba, guarda, sube ni
  transmite ninguna imagen ni video, y la cámara se apaga al cerrar el escáner.
  Puedes rechazar el permiso y escribir los números a mano — toda pantalla con
  escaneo tiene una ruta manual.
- **Clientes de recompensas (solo si el dueño activa las recompensas)** — el
  número de teléfono de un cliente, un nombre de pila opcional y su historial de
  puntos (líneas de acumulación/canje firmadas por quien las registró). El número
  se usa **solo** para buscar al cliente en el mostrador; la app lo muestra
  enmascarado (últimos 4 dígitos) después de capturarlo. DuoCount **no envía
  publicidad** a los clientes — ni textos ni correos — y sus datos **nunca se
  venden, comparten ni juntan** entre negocios (no hay red entre comercios). El
  historial de puntos es solo de agregado como todo lo demás; las correcciones
  son líneas firmadas nuevas.

DuoCount **no** recopila analítica, identificadores publicitarios, datos de
ubicación ni rastreo de terceros. No hay red publicitaria ni SDK de analítica en
la app.

## Dónde se guardan los datos y quién los procesa

- **Google Firebase (Firestore + Authentication)** — los registros operativos y
  las cuentas viven en el proyecto de Firebase de la propia tienda. El acceso se
  aplica por tienda mediante las reglas de seguridad de Firestore
  (`firestore.rules`): una tienda no puede leer ni escribir los datos de otra, y
  las reglas de rol limitan lo que ve cada persona.
- **Resend** — se usa **solo si** activas el resumen diario por correo o las
  notificaciones de horario, para entregar esos correos a los destinatarios que
  configures. Si no configuras el correo, no va ningún dato a Resend.
- **Anthropic (API de Claude)** — se usa **solo si** un dueño activa una de tres
  configuraciones opcionales de IA (todas desactivadas por defecto e
  independientes). En todos los casos el resultado de la IA es solo orientativo
  —nunca cambia tus conteos registrados— y con la configuración apagada, o sin
  clave de IA en el servidor, no se envía nada a Anthropic. Usa un encargado
  cuya política de retención de datos coincida con lo que prometes (los niveles
  Haiku/Sonnet de Claude admiten retención cero).
  - **«Resumen de IA en el resumen diario»** — envía las cifras ya totalizadas
    del día (números de caja/raspaditos/inventario por ubicación y las señales de
    alerta) para escribir el resumen de dos o tres frases al inicio de ese
    correo. **Los nombres de los empleados se reemplazan por seudónimos
    («Empleado A», …) antes de enviar nada**; solo salen agregados de la app,
    nunca registros de conteo en bruto.
  - **«Búsqueda del registro en lenguaje natural»** — cuando un gerente usa el
    cuadro «Preguntar» de la pestaña Registro, se envían la **pregunta escrita** y
    la **lista de nombres / cajas / artículos / juegos que están a la vista** para
    que el modelo convierta la pregunta en un filtro de búsqueda; el filtrado
    ocurre después en el navegador. **Nunca se envían montos ni registros de
    conteo.** Ojo con la única diferencia respecto al resumen: la pregunta la
    escribe el gerente y se envía tal cual, así que si escribe el nombre de una
    persona para buscarla, ese nombre va incluido.
  - **«Explicación de IA en el Panel»** — cuando un gerente pulsa «Explicar estas
    señales» en la tarjeta de alertas, se envían **las señales mostradas en esa
    tarjeta** (sus títulos y totales) para que el modelo las resuma. **Los nombres
    de los empleados se reemplazan primero por seudónimos**, no se envían
    registros de conteo, el resumen es solo para mostrarse, y no se envía nada
    hasta que el gerente pulsa.
- **Tu alojamiento** — la app misma (por ejemplo en Vercel). El tráfico va por
  HTTPS.

Cada uno de estos es un encargado externo con sus propios términos; enumera en tu
aviso publicado los que realmente uses.

**En qué parte del mundo.** Firebase, Resend, Anthropic y la mayoría de los
proveedores de alojamiento están en EE. UU., y un proyecto de Firebase queda
fijado a la región que elijas al crearlo. Si tu personal o tus clientes están en
el Reino Unido, la UE u otra región con reglas de transferencia, eso es una
**transferencia internacional** y necesitas una base legal para ella (para la
UE/RU hoy eso normalmente significa Cláusulas Contractuales Tipo, que cada uno de
estos proveedores ofrece). Elige tu región de Firebase con cuidado — no se puede
cambiar después sin migrar los datos.

## Cómo se protegen los datos

- Aislamiento por tienda y acceso según el rol, aplicados en las reglas de
  seguridad y comprobados por una suite ejecutable de pruebas
  (`tests/rules.test.mjs`).
- Los PIN se guardan solo como hashes con sal; el inicio de sesión tiene límite
  de intentos por IP y por tienda.
- Desactivar o degradar a una persona revoca su sesión, así que el acceso termina
  pronto.
- Los registros son solo de agregado y firmados, así que el historial no se puede
  alterar en silencio.
- **El personal ve su propio trabajo por defecto.** Los gerentes y dueños leen
  toda la tienda; el Panel, el Registro, el historial de Trastienda y el
  historial de Raspaditos de un empleado muestran solo los conteos que él firmó, y
  un compañero que aparezca al otro extremo de un turno se muestra como «otro
  miembro del personal» y no por su nombre. El dueño puede volver a activar la
  vista compartida (**Configuración del negocio → Lo que ve el personal**). Ojo:
  esta es una regla de *presentación* aplicada en la app, no en las reglas de
  seguridad: los conteos siguen siendo legibles en toda la tienda porque la
  aritmética depende de ello (el número de apertura de un paquete se encadena con
  quien tomó la lectura anterior). Trátalo como un límite de cortesía entre
  compañeros, no como un control de seguridad frente a un empleado decidido.

## Quién es dueño de los datos de los clientes de recompensas

Las plataformas de lealtad se dividen en dos campos. Las **plataformas de red**
(por ejemplo Loyalzoo, Fivestars) comparten la identidad de un cliente entre
todos los comercios de su red y pueden hacerles publicidad directamente — la
«lista» del comerciante en realidad es de la red. Las **plataformas proveedoras
de servicio** (por ejemplo Square Loyalty, Smile.io) procesan la lista de cada
comerciante solo por cuenta de ese comerciante.

DuoCount está deliberadamente en el segundo campo:

- **La tienda es dueña de su lista de clientes y de su historial de puntos.**
  DuoCount los procesa como proveedor de servicio y para ningún otro fin.
- **Sin mezcla entre tiendas** — un cliente inscrito en una tienda no existe en
  ninguna otra, aunque compartan instalación.
- **Sin publicidad de la plataforma** — DuoCount nunca contacta a los clientes de
  una tienda, y no envía ningún SMS (lo que además mantiene a las tiendas fuera
  de la responsabilidad por mensajes de texto de la TCPA; si más adelante una
  tienda hace sus propias campañas de texto fuera de DuoCount, debe recabar el
  consentimiento expreso por escrito que exige la ley de EE. UU.).
- **Identidad mínima** — un número de teléfono y un nombre de pila opcional; la
  app muestra el número enmascarado (últimos 4) después de capturarlo.

## Aviso de incentivo financiero para recompensas (plantilla)

Varias leyes de privacidad de estados de EE. UU. — sobre todo la CCPA/CPRA de
California — tratan un programa de puntos como un **incentivo financiero** y
exigen que el negocio describa sus términos materiales antes de que un cliente se
inscriba (el Fiscal General de California ha aplicado esto activamente a
programas de lealtad desde 2022). Adapta lo siguiente, imprímelo o enlázalo junto
al cartel del mostrador, y completa tus números desde Admin → Configuración de
recompensas:

> **Recompensas de [nombre de la tienda] — términos del programa.** Al
> inscribirte recopilamos tu número de teléfono (y, si lo compartes, tu nombre de
> pila) para llevarte un saldo de puntos. Acumulas **[X] punto(s) por cada $1**
> de compras que califican (el tabaco, los vapeadores, el alcohol, la lotería,
> las tarjetas de regalo y el combustible quedan excluidos por ley), y **[Y]
> puntos valen [$Z]** en recompensas. Estimamos que el valor de tu participación
> equivale aproximadamente a las recompensas que puedes ganar — cerca del
> **[% efectivo]** de lo que gastas en compras que califican (mostrado como
> «devolución efectiva» en nuestra configuración), que es lo que nos cuesta
> ofrecer el programa. No vendemos tu información ni la compartimos con otros
> negocios, y no te enviaremos textos ni correos. Inscribirte es opcional y
> puedes salirte cuando quieras avisándonos en el mostrador — dejaremos de usar
> tu número y borraremos tu registro si lo pides.

## Conservación y eliminación

Los registros operativos son **solo de agregado** y se conservan para los propios
archivos del negocio (contabilidad, franquicia, impuestos, auditoría). Como son
el historial confiable de la tienda, el personal no puede borrarlos desde la app;
el dueño controla los datos subyacentes en Firebase y cualquier conservación o
eliminación fuera de la app. Los datos de demostración son aparte y el dueño
puede borrarlos cuando quiera.

Para los **clientes de recompensas**: la inscripción dura hasta que el cliente
pida salirse. A petición, la tienda deja de usar el número y hace que se elimine
el registro (hoy esa eliminación la realiza el operador de la instalación a
solicitud del dueño; el historial firmado de puntos conserva su historia, como
registro financiero, sin el perfil vivo). Si la tienda cierra su cuenta, su lista
de clientes se elimina junto con el resto de los datos de la tienda en un plazo
de 90 días (ver los Términos de uso).

Si el dueño activa el **vencimiento de puntos**, los puntos caducan tras los
meses de inactividad que él fije, escrito como una línea `expire` firmada en el
historial y no borrando la historia. El vencimiento de puntos está regulado en
algunos estados y provincias — revisa el tuyo antes de activarlo, y dile a los
clientes la regla en los términos de tu programa.

Para los **registros laborales** (marcas de reloj, horarios, tiempo libre,
exportaciones de nómina, incidentes), la conservación normalmente la fija la ley
laboral y fiscal, no una preferencia — varios años es lo común, y algunas
jurisdicciones fijan un mínimo. Decide tu periodo de conservación
deliberadamente, ponlo por escrito, y ten en cuenta que el diseño solo de
agregado implica que acortarlo es una acción sobre los datos subyacentes de
Firebase que hace el dueño o el operador, no algo que el personal pueda hacer en
la app.

**Eliminar a una persona.** Desactivar a un miembro del personal termina su
acceso, pero **no** borra los conteos que firmó — ese es justamente el punto de
un registro a prueba de alteraciones, y normalmente es la respuesta correcta para
un registro financiero y laboral. Donde aplica un derecho de supresión (por
ejemplo el art. 17 del GDPR), no es absoluto: los registros conservados por
obligaciones legales, o para formular o defender reclamaciones legales,
normalmente pueden mantenerse. Busca asesoría antes de borrar historial firmado, y
prefiere restringir el acceso a destruir una pista de auditoría.

## Derechos y solicitudes del personal

Los datos del personal los controla la tienda. Quien quiera ver, corregir o
preguntar por sus datos debe contactar al **dueño/operador de la tienda**, que
administra el proyecto de Firebase.

> **Completa esto antes de publicar.** Nombra a una persona o un puesto real y
> una vía de contacto real — por ejemplo: *«Escribe a privacidad@[tutienda].com o
> habla con [nombre] en persona. Responderemos en un plazo de 30 días.»* Un aviso
> de privacidad sin un contacto que funcione falla en lo único para lo que
> existe. Si operas en la UE/RU, considera si necesitas un representante o un
> delegado de protección de datos; si operas en California, publica las vías de
> solicitud que exige la CCPA.

## Avisa a tu personal antes de encenderlo

Casi todo lo que DuoCount registra sobre el personal es llevar registros
laborales de forma ordinaria, pero tres cosas merecen una conversación explícita
en vez de un descubrimiento:

1. **Cada conteo lleva tu nombre y una hora del servidor**, y no se puede editar
   ni borrar después. Eso protege al personal tanto como al dueño — es por lo que
   «yo conté eso bien» deja de ser la palabra de una sola persona — pero nadie
   debería enterarse por una señal de diferencia.
2. **La app calcula patrones que pueden nombrar a una persona.** Di claramente
   que son avisos para conversar, que un gerente lee los conteos de origen antes
   de actuar, y que el software no decide nada por sí solo.
3. **Los motivos de tiempo libre se guardan.** Dile a tu personal que no necesita
   escribir un diagnóstico, y di quién puede leer ese campo.

Las obligaciones de aviso y consentimiento para el monitoreo laboral varían
mucho — algunos estados de EE. UU. exigen aviso por escrito, algunos lo exigen
antes de que empiece el monitoreo, y los empleadores de la UE/RU generalmente
necesitan una base legal más una evaluación de proporcionalidad. Esta es una
obligación del dueño de la tienda como empleador, no del software.

## Si algo sale mal

DuoCount no trae maquinaria de notificación de brechas, así que esto es un
procedimiento que necesitas, no una función que recibes. Decide de antemano:

- **A quién avisar y con qué rapidez.** La mayoría de los estados de EE. UU.
  fijan un plazo una vez confirmada una brecha que afecta a residentes; el
  GDPR/UK GDPR fijan 72 horas ante el regulador para las brechas que califican.
  Conoce tu reloj antes de necesitarlo.
- **Qué harías realmente.** Rotar la clave de la cuenta de servicio de Firebase y
  el `CRON_SECRET`, forzar el restablecimiento de PIN, revisar los registros de
  inicio de sesión de Firebase Auth y el registro de auditoría del operador, y
  exportar los registros afectados antes de que nada cambie.
- **De quién es la responsabilidad.** Si operas tu propia instalación, tú eres el
  responsable del tratamiento y quien notifica. Si usas una instalación alojada,
  tu operador debería avisarte con prontitud — deja esa expectativa por escrito
  con él.

## Menores

DuoCount es una herramienta de trabajo y no está dirigida a menores. No inscribas
a un menor en el programa de recompensas sin el consentimiento que exija la ley
local — la COPPA de EE. UU. cubre a menores de 13 años, y varias leyes estatales
y el GDPR fijan sus propias edades para los datos de un menor. Si tu tienda
emplea menores, sus registros laborales están sujetos a las mismas reglas de
empleo de menores que todo lo demás que conservas.

## Cambios

Actualiza este aviso cada vez que cambie el manejo de datos de la app; la copia
que se muestra dentro de la app se sirve desde `docs/`, así que viaja junto con
el código.
