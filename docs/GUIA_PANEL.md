# Guía del panel

Para quien confirma los pedidos y arma el reparto. El panel es una página privada que muestra lo que anota el bot de WhatsApp y lo que se anota a mano. El bot registra y propone; una persona confirma.

## Entrar
1. Abre la dirección de Brunen (te la entrega Franco) en el computador o en el celular. Aparecen dos entradas: **Administrador** y **Repartidor**.
2. Administrador: escribe tu correo y el código que te llega (solo entran los correos autorizados). Después, tu RUT y tu clave de 4 dígitos. La primera vez eliges tú el RUT y la clave.
3. Repartidor: su RUT y la clave que le dio un administrador.
4. Deja marcado "Recordar este dispositivo" en tu teléfono o tu computador: no vuelve a pedir la clave mientras lo sigas usando. No lo marques en un equipo que use otra gente.
5. Cinco intentos con una clave equivocada bloquean el ingreso por 15 minutos (y cada vez por más tiempo). Un administrador lo destraba cambiando la clave en Equipo.
6. Para tenerla como aplicación en el celular: en el menú del navegador, "Agregar a la pantalla de inicio" o "Instalar aplicación".
7. Si aparece "Se cerró tu sesión", toca "Volver a entrar".
8. La primera vez, toca "Activar avisos": así suena y avisa cuando llega un pedido aunque estés en otra pestaña. La página tiene que quedar abierta.

## Hoy
Es lo primero que se ve. Arriba, en una frase, cómo va el día (entregas, efectivo cobrado, pedidos por confirmar y avisos urgentes). Abajo, una fila por cada cosa que hay que mirar: tócala y te lleva ahí. Lo que está en rojo es urgente. **Equipo** está en el botón de arriba, junto a "Salir".

Mientras quedan entregas, Hoy también dice dónde está el repartidor ("en vivo" con un punto verde y la hora de su última ubicación) y, con la ruta publicada, la siguiente entrega con su hora aproximada y las que vienen después (D92). Si cambiaste la ruta y el repartidor todavía no lo vio en su app, aparece una fila para avisarle por WhatsApp (D94). Al tocarlas te lleva a esa parada en Reparto.

## Clientes
- Cada cliente reúne sus teléfonos, sus direcciones y sus pedidos. Las fichas se crean solas con los pedidos que llegan (por teléfono).
- **Buscar**: por nombre, parte del teléfono, dirección o comuna.
- **Ver ficha**: cambiar el nombre, el tipo de cliente, el precio especial por bidón de 20 L, los vacíos que debe, si está bloqueado y las notas (D104). **El bot cotiza con esto:** minimarket paga mayorista y, si tiene precio especial, ese precio; bloqueado, no anota sus pedidos y lo atiende una persona. Si la hoja CLIENTES dice otra cosa, manda la ficha y el pedido queda para revisión; agregar otro teléfono; ver todas sus direcciones (la primera es la vigente) y sus últimos pedidos.
- **Unir con otro cliente**: si alguien aparece dos veces, escribe un teléfono de la otra ficha y todo pasa a esta. No se puede deshacer.
- **Borrar sus datos**: solo si el cliente lo pide (su derecho por la ley de datos personales). Se borra todo lo que lo identifica; sus pedidos quedan sin nombre, teléfono ni dirección, para la contabilidad. No se puede si tiene un pedido sin entregar. Al terminar, el panel dice lo que falta hacer a mano en la planilla y en Telegram. No se puede deshacer.
- **Por comuna y en el mapa**: cuántos clientes hay en cada comuna (toca una para ver sus clientes) y el mapa con un círculo por comuna. Los puntos son los clientes cuyo lugar exacto ya se conoce: aparecen a medida que el repartidor entrega.

## Días sin reparto
En **Reparto > Días sin reparto** se marca un día que no se reparte (un feriado que no está en la planilla, un cierre, una falla del furgón) con un motivo corto: el cliente lo lee. Desde ese momento el bot no ofrece ese día y le explica al cliente por qué ("El jueves 19 de noviembre no hay reparto (mantención del furgón); la entrega más cercana es el viernes 20"). Si ese día ya tenía pedidos, el panel avisa cuántos y te lleva a verlos: hay que cambiarlos de día a mano. "Quitar" lo devuelve a la normalidad.

## Respaldo
En **Equipo > Respaldo** se ve cuándo se copiaron por última vez los pedidos y las fichas a la planilla de Google, y se pueden descargar todos los pedidos en Excel. Guarda ese archivo en un lugar seguro: tiene datos de clientes. Cómo restaurar: [RESPALDO.md](RESPALDO.md).

## Equipo
- Lista de quienes pueden entrar, con cuántos dispositivos tienen la sesión abierta.
- **Nuevo repartidor**: su nombre, su RUT y una clave de 4 dígitos, que se le dice en persona.
- **Cambiar clave**: cierra su sesión en todos sus dispositivos. Es lo que hay que hacer si pierde el teléfono.
- **Desactivar**: deja de poder entrar; se puede volver a activar.
- De tu propia cuenta puedes cambiar tu clave y cerrar tus otros dispositivos.

## Pedidos
- **Por confirmar**: cada pedido nuevo en una tarjeta corta, con quién es, los bidones, el total, la fecha de entrega que propuso el bot y lo que escribió. El teléfono, el pago, el historial y "Cancelar pedido" están en **Más datos**.
- **Confirmar**: si está todo bien. El bot ya le respondió al cliente y no se le escribe de nuevo; si algo cambia, escríbele tú por WhatsApp (su teléfono está en "Más datos").
- **Confirmar varios**: marca la casilla de cada pedido (o "Elegir los N" en la barra de abajo) y toca "Confirmar N". Solo se pueden elegir los que tienen precio.
- **Deshacer**: después de confirmar aparece "Deshacer" por 10 segundos. Devuelve los pedidos a como estaban.
- **Cambiar**: la fecha, la comuna, la dirección, las notas para el repartidor, los vacíos extra que debe, los bidones y los precios.
- **Completar precio**: aparece cuando el bot no pudo asegurar el precio (un cliente nuevo, una cantidad inusual). Sin precio no se puede confirmar.
- **Observaciones** (recuadro amarillo): por qué el bot pide que lo revises.
- **Fuera de zona**: la comuna no se atiende. Se puede cancelar o "Confirmar igual".
- **Cancelar pedido**: pide un motivo, que es opcional. Si fue un error, después se puede reabrir.
- **Pago y documento**: en "Cambiar" se elige la forma de pago, si está pagado o pendiente, si lleva boleta o factura y su número, y el tipo de cliente. Un pedido ya entregado todavía se puede marcar pagado o anotarle la factura.
- **Historial**: quién hizo cada cambio y cuándo.
- **Buscar**: por nombre, teléfono, dirección o número de pedido.
- Si aparece "Otra persona cambió este pedido hace un momento", no se perdió nada: la página se recarga con lo último y lo vuelves a intentar.

## Nuevo pedido: los que no llegan por el bot
Para una llamada, un audio o una empresa con plan mensual. Toca "+ Nuevo pedido":
0. **Lo más rápido:** copia el mensaje del cliente en WhatsApp y pégalo en el cuadro de arriba. El formulario se llena solo (teléfono, bidones, fecha, comuna y forma de pago) y te avisa qué revisar. Después sigue con los pasos de abajo para revisar y completar el precio.
1. Escribe el teléfono. Si ya pidió antes, el panel completa su nombre y su dirección: revísalos.
2. Revisa la fecha de entrega. Viene sugerida con el corte de las 9:00, pero el panel no conoce los feriados.
3. Agrega los bidones con su precio (están arriba, justo debajo del mensaje). Para un cliente de hogar, el botón **Lista: $3.300** pone el precio de la lista con un toque; un minimarket, una empresa o un cliente con precio especial se escribe a mano.
4. Notas para el repartidor, envases, tipo de cliente y pago están plegados en "Notas, envases y pago": la línea dice qué quedó elegido. Ábrelo solo si hay que cambiar algo.
5. "Dejarlo confirmado" viene marcado: con todos los precios, el pedido queda confirmado de una vez. Si falta algún precio, la casilla lo dice y el pedido queda por confirmar.

## Reparto
- **Repartidor en vivo (D80):** con su jornada iniciada, arriba dice "en vivo, hace 2 min" o "última señal hace 40 min", y el mapa de la ruta lo muestra. Con la ruta publicada, cada parada que falta dice "Llegaría 12:05–12:25 aprox." y la que va dice "Siguiente": sirve para responderle al cliente que pregunta. Es una estimación, nunca una promesa.
- **Versión de la ruta (D94):** con la ruta publicada dice a qué hora se publicó y desde cuándo la tiene el repartidor. Si la cambias a mitad del día, su app le muestra un aviso hasta que toque "Entendido"; mientras no lo haga, aquí sale en rojo para que le avises.
- Muestra las entregas confirmadas de **Hoy**, de **Mañana** o del día que elijas, ordenadas por comuna y dirección, con lo que hay que cargar en el furgón (por viaje), lo que se cobra en cada parada y los vacíos extra.
- Si dice "Hay pedidos de este día sin confirmar", todavía no están en la lista: toca "Verlos".
- **Ruta eficiente y mapa**: el orden que recorre menos kilómetros, desde la planta y de vuelta. Puedes subir o bajar paradas, ubicar en el mapa una dirección que sale "aproximada" y tocar **Publicar ruta**: el repartidor ve ese orden en su teléfono.
- **Cierre del día**: cuánto efectivo cobró el repartidor contra lo que debía, las entregas sin cobrar, los vacíos que retiró y las paradas que no se pudieron entregar. Lo que sale en color hay que preguntárselo.
- **Bidones entregados y vacíos por retirar**: los bidones del día, la semana y el mes, un gráfico de los últimos 14 días y los clientes a los que les quedaron vacíos sin retirar.
- **Copiar mensaje** (el botón azul de cada parada): el mensaje de esa parada, igual al que hoy se le escribe al repartidor, para pegarlo en su chat en el orden de la ruta. "Entregado" lo marca el repartidor desde su teléfono; aquí queda para cuando avisa por llamada.
- **Vacíos que faltan (D108):** si el cliente entrega menos vacíos que bidones recibe, lo que falta queda como deuda en su ficha ("Vacíos que debe") y el próximo pedido dice cuántos retirar. Baja solo cuando los devuelve; puedes corregirlo a mano en la ficha. La lista "Vacíos por retirar" de Reparto sale de ahí.
- **Vacíos**: se espera un vacío por cada bidón que se deja. "Vacíos extra" son los que el cliente debía de antes. En el cierre del día, lo retirado se compara con las paradas ya entregadas.
- **Copiar lista**: el texto para mandarle al repartidor por WhatsApp.
- **Copiar para Excel**: para pegar en Excel o en la app de rutas.
- **Descargar archivo**: lo mismo, en un archivo que Excel abre.
- Cuando sale el furgón, marca **En ruta**; cuando se entrega, **Entregado**. Un pedido entregado ya no se puede cambiar.

## Cobros
Una pestaña con tres cosas, de arriba abajo (D107):
- **Por verificar:** pagos que alguien anotó (una transferencia, un abono) y que nadie ha visto llegar. Toca **Llegó** cuando veas el dinero en el banco, o **No llegó** si no está: ese pago deja de contar. El efectivo que cobra el repartidor no sale aquí.
- **Rendición del día:** elige el día, escribe cuánta **bencina** pagó el repartidor con el efectivo y cuánto **entregó**, y toca **Rendir y verificar el efectivo**. Dice si cuadra, si faltan o si sobran pesos. Si después llega un cobro atrasado de ese día, vuelve a guardarla.
- **Lo que deben los clientes:** pedidos entregados que no están pagados del todo, por cliente. Los **a crédito** salen en gris (su saldo no es un atraso); marca "Cliente a crédito" en la ficha del cliente.
- En cada pedido, el botón **Pagos** muestra lo que se ha pagado y deja anotar otro (un abono, una transferencia). Un pedido puede quedar *Pendiente*, *Abonado* (pagó una parte), *Por verificar* (pagó todo y falta ver el dinero) o *Pagado*.

## Avisos
Lo que el bot no resuelve solo y deja para una persona: reclamos, facturas, comprobantes de pago, audios, mensajes que no entendió y fallas del sistema. Atiende el caso por WhatsApp y toca "Marcar resuelto". Los de borde rojo son urgentes y llegan también por Telegram.

## Si algo falla
| Qué ves | Qué significa | Qué hacer |
|---|---|---|
| "Se cerró tu sesión" | Pasaron 24 horas | "Volver a entrar" y pedir un código nuevo |
| "Sin conexión con el panel" | Se cayó el internet de tu equipo | Revisa tu conexión. El bot sigue anotando pedidos: aparecen cuando vuelvas |
| Aviso "El bot no terminó de atender un mensaje" | El bot se interrumpió antes de responder | Abre el chat de ese cliente y respóndele |
| Aviso "El token de WhatsApp venció" | El bot no puede responderle a nadie | Avisa a Franco de inmediato y atiende a mano mientras tanto |
| Aviso "No llega la ubicación del repartidor hace … minutos" | Con la ruta iniciada, su teléfono dejó de mandar la ubicación (sin señal, app cerrada o teléfono apagado) | Llámalo. El tiempo se cambia en CONFIGURACION con `ALERTA_SIN_SENAL_MINUTOS` (por defecto 20; `NO` la apaga) |
| Aviso "nadie tocó Iniciar ruta" | Son más de las 10:30, hay entregas para hoy y la ruta no empezó en la app | Pregúntale al repartidor si ya salió. La hora se cambia con `ALERTA_RUTA_NO_INICIADA` (por defecto 10:30; `NO` la apaga) |
| Aviso "No se pudo leer la planilla" | El bot no ve clientes ni precios y deja todo para una persona | Avisa a Franco y revisa que la planilla siga compartida |
| El bot responde cosas equivocadas | Hay que detenerlo | En la hoja CONFIGURACION pon `BOT_ACTIVO` en `NO` (tarda un minuto). Para encenderlo, `SI` |
| El bot no da los datos para transferir (deja un aviso de pago) | Falta la variable `DATOS_TRANSFERENCIA` en CONFIGURACION | Agrega una fila: Variable `DATOS_TRANSFERENCIA`, Valor con el banco, tipo y número de cuenta, titular, RUT y correo (hasta 500 letras; puede llevar varias líneas). En un minuto el bot lo usa |
| Hay una falla en el reparto | Los clientes tienen que saberlo | En CONFIGURACION pon `ESTADO_SERVICIO` en `reducido` y escribe el aviso en `MENSAJE_EXCEPCION`: el bot lo agrega a sus respuestas |

## Lo que el panel todavía no hace
No le escribe solo al cliente (al cancelar o cambiar un pedido, "Avisar al cliente" abre su chat con el texto listo y lo envías tú, D99), no guarda las imágenes de los comprobantes y no tiene los precios, que siguen en la planilla. La ruta que calcula es aproximada (en línea recta): sirve para ordenar las paradas, no para prometer horas.
