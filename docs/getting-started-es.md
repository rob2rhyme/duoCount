---
title: Guía de inicio
---

# Primeros pasos con DuoCount

Una guía en lenguaje sencillo para usuarios reales — no se necesita ningún
conocimiento técnico. Si diriges la tienda, empieza por
**[Para dueños y gerentes](#para-dueos-y-gerentes)**. Si trabajas un turno y
solo necesitas registrar tus conteos, salta a
**[Para empleados](#para-empleados)**.

> **Qué es DuoCount, en una frase:** una app pensada para el teléfono donde el
> personal registra sus conteos de caja, raspaditos e inventario, para que
> todos puedan confiar en los números — cada conteo queda firmado con un nombre
> y una hora, y nada puede editarse ni borrarse después de guardarse.

*Read this guide in English → [Getting started](getting-started.md).*

> **¿Tu primer turno? Empieza aquí.**
> 1. [Inicia sesión](#iniciar-sesin) con el código de tienda + tu PIN.
> 2. [Marca tu entrada](#marcar-entradasalida-y-ver-tu-horario) en la pestaña
>    **Horario**.
> 3. Registra tus conteos de apertura — [caja](#registrar-un-conteo-de-caja) y
>    [raspaditos](#registrar-un-conteo-de-raspaditos).
> 4. Al final del turno, registra los conteos de cierre igual.
> 5. [Marca tu salida](#marcar-entradasalida-y-ver-tu-horario). Listo — todo lo
>    que registraste queda firmado con tu nombre.

---

## La foto en 60 segundos

- Inicias sesión con un **código de tienda** (como `acme-market`) y tu propio
  **PIN** — sin correo, sin contraseña.
- La app **abre en el Panel** — primero los números del día. Te mueves con la
  **navegación**: en un teléfono, una **barra inferior** agrupa las pantallas
  en **Contar** (Caja / Raspaditos / Almacén, más **Recompensas** cuando la
  tienda lo activa), **Equipo** (Horario / Incidentes / Notas), **Análisis**
  (Panel / Reporte de raspaditos / Portafolio / Registro) y **Admin** (solo
  gerentes) — toca un grupo para elegir una pantalla. En una pantalla más
  ancha, las mismas pantallas se alinean como una **fila de pestañas** arriba.
  (**Portafolio** y **Reporte de raspaditos** aparecen solo para dueños.)
- Los empleados **registran conteos**. Los gerentes los **verifican** (un
  segundo par de ojos), atienden lo que quede marcado y sacan **reportes**.
- La app hace la aritmética y muestra el **sobra/falta** en verde (sobra) o
  rojo (falta), para que no sumes nada a mano.

![El flujo diario: un empleado registra un conteo firmado; un gerente lo verifica (nunca el propio); lo que se desvía más del umbral queda marcado o en disputa; y todo se consolida en el panel y los reportes.](/diagrams/daily-flow.svg)

*Cómo viaja un conteo desde el piso del turno hasta tus registros. (Los
diagramas están en inglés.)*

---

## Para dueños y gerentes

### 1. Crea tu tienda (solo dueños, una sola vez)

1. Abre la app y toca **¿Negocio nuevo? Registra tu tienda** (el enlace de
   registro bajo el botón de iniciar sesión), luego **Crear negocio e iniciar
   sesión**.
2. Ingresa el **nombre del negocio**, **tu nombre** y un **PIN de 6 dígitos**
   que recuerdes. (La URL de un logo es opcional.)
3. La app te da un **código de tienda** — anótalo. Es lo que tú y cada empleado
   escriben para iniciar sesión. Ahora eres el **dueño**.

### 2. Configura la tienda (pestaña Admin)

> **Te iremos guiando.** La primera vez que entres a una tienda recién creada,
> una lista **"Bienvenido — configuremos tu tienda"** aparece arriba y sigue
> los dos esenciales — **una ubicación** y **una caja registradora** — más un
> paso opcional de **artículos de inventario**. Cada botón **Configurar en
> Admin →** te lleva directo al lugar correcto. Mientras falten los esenciales,
> las pestañas de Caja, Raspaditos y Almacén muestran una tarjeta corta de
> "esto es lo que falta" en vez de un formulario vacío, así siempre sabes el
> siguiente paso. Cuando los dos esenciales existen, la lista se quita de en
> medio (puedes descartar el recordatorio de inventario si solo manejas
> efectivo).

Abre **Admin** y agrega las piezas que tu equipo elegirá al contar:

- **Ubicaciones** — cada tienda física (sáltalo si tienes una sola).
- **Cajas registradoras** — las cajas de efectivo con nombre en cada ubicación:
  *Caja del POS*, *Caja de lotería*, *Caja fuerte*, etcétera.
- **Artículos del almacén** — el inventario de alta merma que quieres contar
  (cartones de cigarros, vapes, etc.). Solo se cuenta lo que está en esta
  lista — mantenla corta.
- **Personal y roles** — agrega a cada empleado con su **nombre**, **rol**
  (empleado o gerente) y un **PIN**. Compárteles el código de tienda.

> Los paquetes de raspaditos no necesitan ningún registro previo: un paquete
> existe en DuoCount desde la primera vez que alguien lo cuenta, y desde
> entonces sus números de boleto se encadenan de conteo en conteo. El papeleo
> de liquidación se queda con la lotería.

> **Ingresa tus juegos de raspadito (opcional).** En **Admin → Juegos de
> raspadito**, el dueño puede escribir cada juego que vende la tienda — **número
> de juego**, **nombre del juego**, **precio del boleto** y, opcionalmente,
> **boletos por paquete** — o **escanea/pega un boleto** y el número, el nombre y
> el precio de un juego reconocido se completan por ti (edita lo que quieras y
> luego **Agregar juego**). Después de eso, un escaneo o un paquete escrito
> completa el nombre y el precio del juego por sí solo, así que registrar es más
> rápido y los datos coinciden siempre. DuoCount ya incluye la lista estatal
> actual de juegos, así que solo necesitas esto para un juego que aún no conoce
> (o los juegos de otro estado). Es pura información de referencia — ingresar un
> juego nunca fija un conteo ni un número de boleto, y editar uno nunca toca un
> conteo firmado anterior. Un juego que ya no vendes se puede quitar; los
> escaneos simplemente vuelven a la lista incorporada.

> **¿Vienes de una hoja de cálculo?** Los dueños tienen una tarjeta
> **Importar / migrar** en **Admin** que trae tus **artículos rastreados**, tu
> **lista de personal**, tus **conteos de apertura de estantes**, tus
> **niveles de existencia** (cantidad en existencia, precio y fecha de
> caducidad — exportados de tu POS) o tus **clientes de recompensas**
> (teléfono, nombre y saldo de puntos opcionales) desde un
> **CSV** (de Excel, tu POS anterior, una hoja de cálculo). Elige el tipo, sube
> el archivo, empareja tus columnas con los campos de DuoCount — adivina la
> mayoría por ti — y revisa una **vista previa fila por fila** antes de que se
> escriba nada. Reintentar es seguro: un registro que ya está en tu tienda se
> empareja y se actualiza u omite, nunca se duplica. Dos cosas que conviene
> saber: **los PIN del personal son opcionales** (importa nombres/roles/
> ubicaciones ahora y configura los PIN en Admin después — el PIN de una
> persona existente nunca se cambia por importación, y las filas de dueño
> nunca se importan), y **los conteos de apertura son permanentes** — importa
> los artículos primero, cada artículo recibe a lo más un conteo de apertura, y
> un número equivocado se corrige con un conteo nuevo, nunca con una edición.

> **¿Solo explorando?** En **Admin**, bajo **Datos de demostración**, el dueño
> ve un botón **Cargar datos de muestra**. Llena la app con conteos, personal e
> historial de muestra realistas para que pruebes cada pantalla — y **Borrar
> datos de muestra** quita exactamente lo que se agregó.

### 3. Decide cuánto ve cada ubicación (Configuración)

En **Admin → Configuración del negocio**, el dueño define **Compartir datos**:
o cada ubicación ve todos los conteos, o cada una ve solo los suyos. Los
gerentes y dueños siempre ven todo. La misma tarjeta también controla el
**nombre/logo** del negocio, un **resumen diario por correo** opcional
(desactivado por defecto), las **recompensas para clientes** (desactivadas por
defecto — mira el paso 6) y las **funciones de IA** opcionales (todas
desactivadas por defecto — mira el paso 7).

> Los cambios de configuración se aplican **en vivo**: en cuanto guardas, cada
> dispositivo con sesión iniciada los recibe — nadie necesita cerrar sesión ni
> reiniciar la app.

### 4. Tu ritmo diario

- **Mira las insignias.** Como gerente, aparecen pequeños contadores ámbar en
  la navegación junto a **Registro** (conteos con una variación o disputa sin
  resolver), **Incidentes** (reportes abiertos) y **Horario** (intercambios de
  turno y solicitudes de tiempo libre esperando tu aprobación) — un empujón
  silencioso hacia lo que necesita una segunda mirada, para que nada espere sin
  ser visto. Se limpian solos conforme resuelves cada punto.
- **¿Tienes más de una tienda? Abre Portafolio.** Los dueños con dos o más
  ubicaciones tienen una pestaña **Portafolio**: elige cualquier período y ve
  cada tienda lado a lado — sobra/falta total, ventas, dólares de raspaditos y
  merma arriba, y luego una **tabla de posiciones** ordenada por cuál tienda
  necesita tu atención (peor verificación y mayor sobra/falta primero). La
  columna de **tasa S/F** muestra el sobra/falta por dólar vendido, para que
  una tienda grande y una chica se comparen con justicia. Toca cualquier
  tienda para abrir su reporte completo del mismo período. Debajo, **Personas
  entre tiendas** lista a todos los que registraron conteos en el período, con
  más faltante primero — un punto dorado marca a quien trabajó en más de una
  tienda, y al expandir se ve su historial tienda por tienda (alguien que
  cuadra en una tienda pero falta en otra es una conversación de capacitación,
  no un veredicto). **Descargar PDF / CSV** exporta toda la vista del
  portafolio para tus registros. Todo es de solo lectura — una forma de *mirar*
  tus conteos, nunca de cambiarlos.
- **Verifica conteos.** En el **Registro** (o en la propia entrada), marca un
  conteo como **verificado**. No puedes verificar el tuyo — de eso se trata.
- **Mira el Panel.** Sobra/falta neto, conteos con faltante, gráficas por día,
  empleado, caja y artículo, más **alertas de patrones** discretas (p. ej. "la
  misma caja con faltante bajo tres personas" — un arranque de conversación,
  nunca un veredicto). Si activas el análisis de IA (paso 7), un botón
  **"Explicar estas señales"** resume las alertas y dice qué mirar primero.
- **Abre el reporte de Raspaditos (dueños).** Todo lo de raspaditos vive en la
  pestaña **Reporte de raspaditos**, solo para el dueño: ventas y boletos por
  día, juego y personal, con gráficas, CSV e impresión con tu marca — más la
  vista antirrobo:
  - **Boletos sin justificar** — cada corte en la secuencia de boletos de un
    paquete: en qué número cerró, en qué número reabrió, quién firmó cada lado
    y cuándo. La hora es el reloj del servidor, así que no se puede antedatar.
    Un botón **Refrendar** deja que un segundo gerente firme la lectura
    riesgosa.
  - **Dejaron de contarse** — paquetes que salieron de la rutina, con su último
    boleto, quién lo firmó y la hora exacta.
  - **Libros disponibles** — el censo del estante comparado contra los conteos.
    Un libro que desapareció, o uno que nunca se contó, queda señalado.

  Los boletos faltantes se atrapan en el cambio de turno, no meses después. Las
  alertas del Panel te siguen avisando: varios paquetes saltando juntos en una
  misma ventana (una sola sesión fuera de horario), un conteo registrado sin
  nadie fichado, o conteos riesgosos que aún esperan una segunda firma.
- **Revisa la Atención de existencias.** Si sincronizas los niveles de
  existencia desde tu POS (la importación de **Niveles de existencia**), el
  Panel lista lo que está **por caducar** (por defecto dentro de 30 días) y lo
  que **hay que pedir** (por defecto menos de 5 unidades) — ambos umbrales se
  ajustan, solo por el dueño, en **Configuración del negocio → Alertas de
  existencias**, y ambas listas viajan también en el resumen diario por
  correo. Los artículos sin cantidad sincronizada o sin fecha de caducidad
  simplemente no alertan.
- **Atiende lo marcado.** Cualquier conteo de efectivo desviado más de tu
  umbral (por defecto $5) queda marcado; ciérralo registrando *por qué* (Error
  humano, Error de la registradora, Falta de capacitación, etc.). También
  puedes definir un umbral de **inventario** en unidades (Configuración del
  negocio) para marcar igual los conteos de mercancía — está apagado hasta que
  lo definas.
- **Disputas y notas.** Si un empleado no está de acuerdo, abre una **disputa**
  sobre la entrada; tú la resuelves. **Notas** es tu bitácora de turno para los
  relevos.
- **Incidentes.** Levanta un reporte firmado cuando pase algo que no es un
  número (una caja abierta, una ausencia sin avisar). El empleado al que concierne puede
  reconocerlo y agregar su versión.
- **Solicitudes de tiempo libre.** El personal pide días libres — o avisa de un
  evento futuro previsible para el que necesitará faltar (una boda, una clase) —
  desde la pestaña **Horario**. Tú **apruebas o rechazas cada una con una razón
  corta**, y el empleado ve tu decisión y esa razón en el momento en que la
  tomas. Las solicitudes que se traslapan muestran un aviso para que no dejes un
  turno sin cubrir por accidente.
- **Ayuda y soporte.** ¿Un tropiezo o crees que algo se rompió? En **Admin**, la
  tarjeta **Ayuda y soporte** te deja reportar un problema de la app — adjunta
  una captura de pantalla si ayuda — y seguirlo de *abierto* a *resuelto*;
  cualquier respuesta llega directo al hilo, para que nunca te quedes con la
  duda.

### 5. Saca un reporte para tus registros

Así guardas los números para el contador, la franquicia o los impuestos.

![Sacar un reporte: elige un período (de Día a Año, o fechas personalizadas), elige una ubicación, revisa la vista previa de lo que incluye y expórtalo como PDF, CSV o impresión.](/diagrams/report-flow.svg)

*Cuatro pasos hacia un registro que puedes conservar — nada de los conteos
guardados cambia.*

1. Ve a la pestaña **Panel** y toca **📄 Reportes y exportar**.
2. Elige un **período** — Día, Semana, Mes, Trimestre, Semestre, Año o fechas
   **personalizadas** — y usa las flechas **◀ ▶** para llegar al que quieres.
3. Elige una **ubicación** (o *Todas las ubicaciones*).
4. El cuadro **"Incluirá"** adelanta lo que hay en ese período — sobra/falta de
   efectivo, merma de inventario, conteos marcados y cuánto está verificado.
   (El detalle de raspaditos tiene su propia casa: la pestaña **Reporte de
   raspaditos** del dueño, con su propio CSV e impresión. El ingreso de lotería
   sigue viajando en el diario del contador, abajo.)
5. Expórtalo:
   - **Descargar PDF** — un resumen ordenado para el archivo: totales por
     ubicación y caja, merma por artículo, la tendencia de sobra/falta y el
     acumulado de horas del personal, con líneas de firma.
   - **Descargar CSV** — las filas crudas para una hoja de cálculo.
   - **Imprimir** — un listado línea por línea (o imprime a PDF desde tu
     navegador).

Los archivos se nombran para ordenarse solos, p. ej.
`duocount-report-all-2026-Q3.pdf`.

> **¿Llevas la contabilidad?** La misma pantalla de Reportes tiene una sección
> **"Para el contador"** con dos archivos de un toque:
> - **PDF de cierre de día** — una hoja de conciliación de un solo día (ventas
>   en efectivo, pagos, esperado vs contado, sobra/falta) con la vista previa
>   del asiento contable exacto que exporta el CSV, más líneas de firma — para
>   que el papel que firmas y el archivo que importas siempre coincidan.
> - **CSV de diario para QuickBooks** — un diario de partida doble balanceado
>   (ventas en efectivo, lotería, pagos, sobra/falta y el efectivo a depositar),
>   un asiento por día por ubicación, listo para importar en vez de recapturar
>   el día a mano.
>
> Ambos son **borradores** para que tu contador revise y registre — DuoCount
> lleva los conteos; tu software contable sigue siendo el libro mayor.
>
> **¿Franquiciatario?** La misma sección tiene un menú opcional de **formato de
> franquicia** (apagado por defecto): elígelo para descargar un reporte diario
> de columnas fijas (n.º de tienda, ventas brutas/efectivo/lotería, pagos,
> sobra/falta, % verificado), una fila por día. Es un formato genérico —
> compáralo con la plantilla real de tu franquiciante antes de entregarlo.

### 6. Recompensas para clientes (opcional, desactivado por defecto)

Un programa de puntos por número de teléfono en el mostrador — sin tarjeta,
sin app, sin hardware. El dueño lo activa en **Configuración del negocio →
Recompensas para clientes** y define la economía (por defecto: **$1 = 1
punto, 100 puntos = $5 de descuento**). La tarjeta de configuración muestra
en vivo el **% efectivo de devolución** mientras editas — los valores por
defecto devuelven el 5% del gasto que califica, unas cinco veces lo de las
grandes cadenas, así que asegúrate de que tus márgenes lo aguanten.

- **En el mostrador:** el personal abre la pestaña **Recompensas**, escribe el
  teléfono del cliente y lo inscribe (nombre opcional) o consulta su saldo.
  Los puntos se suman sobre el **total de la venta que califica** — sin
  tabaco, vape, alcohol, lotería, tarjetas de regalo ni gasolina (aplican
  prohibiciones de descuento, leyes de precio mínimo y las reglas de valor
  nominal de la lotería). Cuando el saldo llega a la meta, un toque registra
  el canje y el descuento se aplica en tu registradora.
- **Para agregar clientes:** uno a la vez en el mostrador — el número de
  teléfono es todo el registro — o todos de una vez: **Admin → Importar /
  migrar → Clientes de recompensas** acepta un CSV con un teléfono por línea
  (nombre y saldo de puntos opcionales) y omite a quien ya esté inscrito.
  ¿Vienes de otra app de recompensas? Asigna la columna de puntos de tu
  exportación y cada cliente empieza con su saldo anterior, registrado como un
  ajuste firmado del dueño en el libro. Esa carga inicial aplica a clientes nuevos y
  a inscritos que aún no tengan actividad de puntos (así re-importar con
  puntos corrige una importación anterior sin ellos) — en cuanto un cliente
  tiene actividad real, una importación jamás puede cambiar sus puntos. La
  propia pestaña Recompensas guía al personal con una tarjeta numerada de
  "Cómo funciona".
- **Confiable por construcción:** cada suma y cada canje es una **línea
  firmada y permanente** en el libro de recompensas — nada se edita ni se
  borra, las correcciones son líneas nuevas firmadas por el dueño, y las
  alertas de patrones del Panel vigilan los abusos clásicos (puntos que
  superan tus ventas contadas, una cuenta que suma varias veces al día,
  rachas de canjes bajo un solo empleado). El Panel también muestra el
  **pasivo en puntos pendiente** en dólares.
- **Para los clientes:** pueden consultar su propio saldo cuando quieran en
  **/rewards** con solo el código de tienda y su teléfono (nunca se muestra
  ningún nombre), y desde Admin se imprime un **letrero bilingüe de
  mostrador** listo, con tu programa y esa dirección.

### 7. Funciones de IA opcionales (desactivadas por defecto)

DuoCount tiene tres funciones de IA pequeñas y opcionales. Cada una está
**apagada hasta que la actives** en la **Configuración del negocio**, cada una
necesita una clave de IA configurada en el servidor, y ninguna cambia jamás tus
conteos guardados — solo resumen o buscan. Antes de enviar nada, **los nombres
de los empleados se reemplazan por "Empleado A / B"**, y tus montos de conteo
se quedan en la app. Mira **Privacidad y datos** para saber exactamente qué
envía cada una.

- **Resumen de IA en el correo diario** — agrega un par de frases en lenguaje
  sencillo y una lista de "qué vigilar mañana" al inicio del correo.
- **Búsqueda del registro en lenguaje natural** — un botón **"Preguntar"** en el
  Registro para escribir una pregunta como *"faltantes de Eve la semana
  pasada"* y convertirla en filtros (siempre vuelve a la búsqueda normal por
  palabras).
- **Análisis de IA en el Panel** — un botón **"Explicar estas señales"** en la
  tarjeta de alertas de patrones que las resume y señala qué mirar primero.

Activa una para una ubicación, pruébala y apágala cuando quieras — dejarla
apagada no cambia nada de cómo funciona DuoCount.

---

## Para empleados

### Iniciar sesión

Escribe el **código de tienda** que te dio tu gerente y **tu propio PIN**, y
toca **Iniciar sesión**. Eso es todo — tu nombre queda unido a todo lo que
registres.

> **¿Ves "tu gerente todavía está configurando esta tienda"?** Solo significa
> que tu gerente aún no agrega una ubicación, una caja o los artículos — no hay
> nada que debas arreglar. El conteo se habilita en cuanto lo haga.

### Registrar un conteo de caja

1. Toca la pestaña **Caja**.
2. Elige tu **ubicación**, tu **caja** y si es un conteo de **apertura** o de
   **cierre**.
3. Ingresa el **fondo inicial** — y, en un conteo de **cierre**, también las
   **ventas** y los **pagos/retiros**. (Un conteo de apertura solo pide el
   fondo inicial; las casillas de ventas y pagos se ocultan porque todavía no
   hay.)
4. Cuenta la caja. Dos maneras:
   - Escribe el total **contado**, o
   - Activa el **conteo por denominación** e ingresa cuántos billetes de $100,
     $50, $20, $10, $5 y $1 hay, más las monedas — se suma solo, en vivo.
5. **Guarda.** La app muestra el **sobra/falta** — verde si la caja tiene de
   más, rojo si falta. Una vez guardado, el conteo queda sellado.

> **Conteo ciego:** si tu tienda lo usa, no verás el número "esperado" hasta
> *después* de guardar — así cuentas la caja real, no cuentas *hacia* una meta.

### Registrar un conteo de raspaditos

1. Toca **Raspaditos** y luego **escanea** un boleto con la cámara del
   teléfono — o escribe el **juego** y el **n.º de paquete** a mano.
2. Revisa los números de boleto **inicial** y **final**. Boletos vendidos =
   final − inicial, y la app multiplica por el precio del boleto para obtener
   los dólares que deberían estar en la caja.
3. **Guarda.**

> El escaneo escribe casi todo por ti: llena el paquete y el n.º de boleto en
> el que va (tu lectura final), y un paquete que la tienda ya contó también
> llena su juego, su precio y su n.º inicial desde el último conteo — así una
> apertura o un cierre de todos los días es escanear → revisar → guardar.

> **Sin doble conteo, sin cambios perdidos.** Si escaneas el mismo paquete dos
> veces en un mismo turno, la app bloquea la repetición con un aviso — la
> apertura y el cierre cuentan por separado, así que igual escaneas cada paquete
> en ambos. Cuando un paquete se agota, toca **Final — agotado** en su fila; el
> siguiente libro de ese mismo juego abre como un libro **Nuevo** en **#0**, para
> que sus primeras ventas se cuenten, hasta el día siguiente.

> **Dos vistas más en la misma pestaña.** **Historial** muestra tus propios
> números de raspaditos por turno (los gerentes ven los de todos), para revisar
> tu día sin preguntar. **Censo** es un recorrido ocasional del estante: escanea
> **cada libro físicamente en exhibición** — incluso los que nadie ha contado
> todavía — y guarda una sola instantánea firmada. El reporte del dueño compara
> los censos en el tiempo, así que un libro que desaparece entre dos recorridos
> (aunque nunca se haya contado por boletos) queda señalado.

### Registrar un conteo de almacén

1. Toca **Almacén** y elige el **artículo**.
2. Ingresa **Contado en existencia** — lo que hay en el estante ahora mismo (o
   **escanea** el código de barras para elegir el artículo). Es todo lo que
   necesita un reconteo rápido; la app lo compara contra el último conteo.
3. ¿Hubo entregas o ventas? Abre **Detalles de movimiento** para agregar
   **cantidad inicial**, **recibido**, **vendido** y **retirado** — es opcional
   y está guardado aparte para que el conteo de todos los días sea un solo
   campo.
4. **Guarda.** Un resultado rojo (negativo) significa mercancía faltante. Si tu
   tienda definió un **umbral de variación de inventario**, un conteo desviado
   por esas unidades o más queda marcado para que un gerente lo revise — igual
   que un faltante de efectivo. (El modo ciego también aplica aquí, si está
   activado.)

### Mover existencias de trastienda (surtir al frente, resurtir)

Arriba del formulario de conteo, en la pestaña **Almacén**, está tu
**existencia de trastienda en vivo** — cada artículo rastreado con cuántos hay
en existencia y un botón **−** y **+**. Toca **−** cuando surtas uno al frente
(o se venda) y **+** cuando una entrega lo resurta. Cada toque es su propia
**línea de movimiento firmada**, así el número en existencia y el historial de
quién/cuándo se mantienen honestos — un gerente puede ver cada retiro. Los
artículos con poca existencia o cerca de caducar suben al principio. Este es el
conteo rápido de todo el día que mantiene vivo el número del estante; el
**conteo firmado** de arriba es el reconteo completo y periódico que queda en el
registro.

### Registrar una recaudación de máquina de juego (si tu tienda aloja máquinas)

Si empresas externas operan máquinas tragamonedas, cajeros o de entretenimiento
en tu tienda, el dueño las registra en **Admin → Máquinas de juego**. El día que se
recauda una máquina:

1. Toca **Juegos**, elige la **máquina** y fija la **fecha de recaudación**.
2. Ingresa la **recaudación total** y los **pagos totales** de la máquina del período.
3. **Enviar** — tu entrada queda registrada para el dueño.

No verás el reparto ni la parte de la tienda: la tienda y la empresa de la
máquina reparten el resto (recaudación − pagos) por contrato, y esos totales son
**solo para el dueño**. Si una máquina pagó más de lo que recaudó, la parte de la
tienda es simplemente **$0** — nunca negativa.

> **Vista del dueño.** En la misma pestaña **Juegos** — y solo para el dueño —
> ves los totales de cualquier período (recaudación, pagos, neto, tu parte y la
> de la empresa), desglosados por máquina y por empresa, con una gráfica de la
> parte de la tienda y una **exportación CSV** para las fechas que elijas. Cada
> recaudación es una línea firmada que solo se agrega — nunca se edita —, así que el registro de quién
> ingresó qué se mantiene honesto.

### Recompensas en el mostrador (si tu tienda las activó)

En la pestaña **Recompensas**, escribe el teléfono del cliente y toca
**Buscar**. ¿Aún no está inscrito? Agrégalo solo con el número (el nombre es
opcional). Luego ingresa el **total de la venta que califica** — sin tabaco,
vape, alcohol, lotería, tarjetas de regalo ni gasolina — y toca **Sumar
puntos**. Cuando su saldo llegue a la meta, el botón de **Canjear** se
enciende: tócalo y aplica el descuento en la registradora. Cada suma y cada
canje queda firmado con tu nombre y es permanente, como un conteo. Los
clientes pueden consultar su propio saldo en **/rewards**.

### Marcar entrada/salida y ver tu horario

Para marcar tu entrada al empezar el turno:

1. Toca la pestaña **Horario**. Abre en el **Reloj checador**.
2. Toca **Marcar entrada**. Listo — ya estás en el reloj.
3. Al final de tu turno, vuelve y toca **Marcar salida**.

Una marca equivocada se corrige marcando de nuevo (o pídeselo a un gerente) —
las marcas nunca se editan, así tu registro de horas se mantiene honesto.

La misma pestaña tiene dos vistas más. **Horario** muestra tus próximos
turnos — marca los días que no puedes trabajar, reclama turnos abiertos u
ofrece un intercambio a un compañero. **Permisos** es donde pides días libres
con una razón; el visto bueno o el rechazo de tu gerente (con su razón)
aparece en la propia solicitud. También puedes registrar un evento futuro
previsible para el que necesitarás faltar, para que esté en su radar temprano.

### Dejar una nota de turno

Usa **Notas** para los mensajes de relevo — "el cajón de la registradora 2 se
atora", "el contenedor 4 de lotería anda bajo". Los gerentes pueden fijar las
importantes.

---

## Leer los números

- **Sobra/falta** = contado − esperado. **Verde** significa más de lo esperado
  (sobra), **rojo** significa menos (falta), y cerca de cero es una caja
  cuadrada.
- **Efectivo esperado** = fondo + ventas − pagos *(en un conteo de **cierre**)*.
  En un conteo de **apertura**, lo esperado es solo el **fondo inicial** —
  todavía no hay ventas ni pagos. **Existencia esperada** = inicial + recibido −
  vendido − retirado. La app lo calcula por ti.
- **Verificado** significa que un gerente lo revisó. **Marcado** significa que
  se desvió más del umbral de la tienda y necesita una razón. **En disputa**
  significa que alguien no estuvo de acuerdo, formalmente — y toda la
  conversación se conserva.

![Cómo suma un conteo de caja: lo esperado es el fondo inicial más las ventas menos los pagos; el sobra/falta es el contado menos lo esperado; si el sobra/falta llega al umbral de la tienda, el conteo queda marcado para revisión.](/diagrams/cash-count-math.svg)

*La aritmética que la app hace en cada conteo de cierre.*

---

## Consejos útiles

- **Recuerda tu lugar.** Cada formulario de conteo abre en la **ubicación y la
  caja que usaste la última vez** y adivina **apertura vs cierre** por la hora
  del día (apertura en la mañana, cierre desde media tarde) — así la mayoría de
  los conteos llegan pre-llenados y solo ingresas el número. Cambia lo que
  necesites cuando quieras.
- **Tus guardados están a salvo.** El botón **Guardar** permanece apagado hasta
  que el conteo esté realmente lleno (para que no guardes una caja vacía por
  accidente), y si un guardado falla — una zona sin señal, una conexión caída —
  una barra roja de **"No se pudo guardar"** se queda en pantalla con un botón
  de **Reintentar**, en vez de un mensaje que parpadea y desaparece. Tu entrada
  no queda registrada hasta que veas la confirmación.
- **Instálala como app.** DuoCount es una PWA — tu teléfono/navegador puede
  "Agregar a la pantalla de inicio", y abre a pantalla completa y funciona sin
  conexión para lo básico. Reabre en la **pestaña que usaste por última vez** y
  muestra tus datos recientes de inmediato, así una recarga te deja donde
  estabas.
- **Prefer English?** Toda la app habla inglés y español: elige el idioma en la
  pantalla de inicio de sesión (junto al sol/la luna) o en el **engrane
  (Configuración) → Idioma** del encabezado. Es una elección por dispositivo,
  como el tema — la pantalla de tu compañero nunca cambia. Lo que se escribe en
  el registro permanente (notas, comentarios, exportaciones) se queda en el
  idioma en que se escribió.
- **Claro u oscuro.** En la pantalla de inicio de sesión, toca el sol/la luna.
  Ya dentro, abre el **engrane (Configuración) → Apariencia** para cambiar — la
  elección se recuerda por dispositivo.
- **Atajos de teclado** (en una computadora): pulsa **?** para verlos — los
  números saltan entre pestañas y **⌘/Ctrl + Enter** guarda el formulario
  actual.
- **Exporta cuando quieras.** El **Exportar CSV** de la pestaña **Registro**
  cubre el historial de conteos de caja y almacén; el **Reporte de raspaditos**
  del dueño exporta el detalle de raspaditos; el centro de **Reportes** exporta
  un período específico.

---

## Preguntas frecuentes: tus datos y los de tus clientes

**¿De quién son los datos de mi tienda?**
Tuyos — conteos, notas, marcajes, configuración y (si usas recompensas) tu
lista de clientes con su libro de puntos. DuoCount es el servicio que los
registra por ti, nada más. Detalles completos: [Términos de uso](/docs/terms-of-use)
y [Privacidad y manejo de datos](/docs/privacy-and-data).

**¿Otras tiendas pueden ver mis datos o mis clientes?**
No. Cada tienda está aislada por reglas de seguridad aplicadas en la base de
datos. A diferencia de las "redes" de lealtad que comparten la identidad de los
clientes entre comercios, DuoCount nunca junta clientes entre tiendas y nunca
les envía publicidad.

**¿Qué les debo a mis clientes de recompensas?**
Tres cosas: infórmales el trato (imprime el letrero del mostrador desde Admin →
Configuración de recompensas y ten disponible el aviso de términos del programa
de la página de privacidad — algunos estados lo exigen); usa su número de
teléfono solo para los puntos; y respeta sus solicitudes — si alguien quiere
salirse, deja de usar su número y pide que se elimine su registro.

**¿Puedo enviarles mensajes de texto?**
No a través de DuoCount — a propósito no envía SMS. Si haces campañas de texto
con otra herramienta, la ley de EE. UU. (TCPA) exige el consentimiento expreso
por escrito de cada persona; inscribirse en recompensas no cuenta como ese
consentimiento.

**¿Cómo saco mis datos o me voy?**
Exporta CSV cuando quieras (pestaña Registro, centro de Reportes). Si cierras
tu tienda, pide a tu operador una exportación final; los datos de la tienda se
eliminan dentro de los 90 días después de la solicitud de cierre.

---

## Palabras que verás

| Palabra | Qué significa |
| --- | --- |
| **Código de tienda** | El nombre de inicio de sesión de tu negocio (p. ej. `acme-market`). |
| **Sobra / falta** | Qué tan arriba (sobra) o abajo (falta) quedó un conteo respecto a lo esperado. |
| **Verificar / refrendar** | Un gerente confirmando un conteo con una segunda firma — nunca el propio. |
| **Marcado** | Un "explícame, por favor" automático en un conteo demasiado desviado. |
| **Variación** | La diferencia de la que trata un marcado — la brecha entre lo contado y lo esperado. |
| **Umbral** | Qué tan grande debe ser una variación para quedar marcada (lo define la tienda). |
| **Disputa** | Un empleado en desacuerdo formal, que queda en el registro. |
| **Conteo ciego** | Contar sin ver antes el número esperado. |
| **Paquete / libro** | Dos palabras para lo mismo: un fajo de boletos de raspadito de un juego. |
| **Censo** | Un recorrido del estante que registra cada libro de raspadito físicamente presente. |
| **Pago de caja** | Efectivo que sale de la caja durante un turno (premios de lotería, pagos a proveedores). |
| **Merma** | Mercancía que se fue sin venderse — la versión de inventario de un faltante. |
| **Período** | El rango de fechas que cubre un reporte (un día, un mes, un trimestre…). |
| **Venta que califica** | La parte de una venta que gana puntos de recompensa — todo excepto tabaco, vape, alcohol, lotería, tarjetas de regalo y gasolina. |

---

*¿Aún con dudas? El [Resumen de la app](app-summary-spec.md) explica todo el
producto en términos sencillos (en inglés), y el [Plan de ruta](roadmap.md)
muestra qué está listo y qué sigue.*
