# Guía del panel

Para quien confirma los pedidos y arma el reparto. El panel es una página privada que muestra lo que anota el bot de WhatsApp y lo que se anota a mano. El bot registra y propone; una persona confirma.

## Entrar
1. Abre la dirección del panel (te la entrega Franco) en el computador o en el celular.
2. Escribe tu correo: te llega un código para entrar. Solo entran los correos autorizados.
3. La sesión dura 24 horas. Si aparece "Se cerró tu sesión", toca "Volver a entrar".
4. La primera vez, toca "Activar avisos del navegador": así suena y avisa cuando llega un pedido aunque estés en otra pestaña. La página tiene que quedar abierta.

## Pedidos
- **Por confirmar** es lo primero que se ve: cada pedido nuevo, con lo que escribió el cliente, los bidones, el total y la fecha de entrega que propuso el bot.
- **Confirmar**: si está todo bien. El bot ya le respondió al cliente y no se le escribe de nuevo; si algo cambia, escríbele tú por WhatsApp (su teléfono es un enlace).
- **Cambiar**: la fecha, la comuna, la dirección, las notas para el repartidor, los envases por retirar, los bidones y los precios.
- **Completar precio**: aparece cuando el bot no pudo asegurar el precio (un cliente nuevo, una cantidad inusual). Sin precio no se puede confirmar.
- **Observaciones** (recuadro amarillo): por qué el bot pide que lo revises.
- **Fuera de zona**: la comuna no se atiende. Se puede cancelar o "Confirmar igual".
- **Cancelar pedido**: pide un motivo, que es opcional. Si fue un error, después se puede reabrir.
- **Historial**: quién hizo cada cambio y cuándo.
- **Buscar**: por nombre, teléfono, dirección o número de pedido.
- Si aparece "Otra persona cambió este pedido hace un momento", no se perdió nada: la página se recarga con lo último y lo vuelves a intentar.

## Nuevo pedido: los que no llegan por el bot
Para una llamada, un audio o una empresa con plan mensual. Toca "+ Nuevo pedido":
1. Escribe el teléfono. Si ya pidió antes, el panel completa su nombre y su dirección: revísalos.
2. Revisa la fecha de entrega. Viene sugerida con el corte de las 9:00, pero el panel no conoce los feriados.
3. Agrega los bidones con su precio.
4. "Dejarlo confirmado" viene marcado: con todos los precios, el pedido queda confirmado de una vez. Sin algún precio, queda por confirmar.

## Reparto
- Muestra las entregas confirmadas de **Hoy**, de **Mañana** o del día que elijas, ordenadas por comuna y dirección, con lo que hay que cargar en el furgón, lo que se cobra en cada parada y los envases por retirar.
- Si dice "Hay pedidos de este día sin confirmar", todavía no están en la lista: toca "Verlos".
- **Copiar lista**: el texto para mandarle al repartidor por WhatsApp.
- **Copiar para Excel**: para pegar en Excel o en la app de rutas.
- **Descargar archivo**: lo mismo, en un archivo que Excel abre.
- Cuando sale el furgón, marca **En ruta**; cuando se entrega, **Entregado**. Un pedido entregado ya no se puede cambiar.

## Avisos
Lo que el bot no resuelve solo y deja para una persona: reclamos, facturas, comprobantes de pago, audios, mensajes que no entendió y fallas del sistema. Atiende el caso por WhatsApp y toca "Marcar resuelto". Los de borde rojo son urgentes y llegan también por Telegram.

## Si algo falla
| Qué ves | Qué significa | Qué hacer |
|---|---|---|
| "Se cerró tu sesión" | Pasaron 24 horas | "Volver a entrar" y pedir un código nuevo |
| "Sin conexión con el panel" | Se cayó el internet de tu equipo | Revisa tu conexión. El bot sigue anotando pedidos: aparecen cuando vuelvas |
| Aviso "El bot no terminó de atender un mensaje" | El bot se interrumpió antes de responder | Abre el chat de ese cliente y respóndele |
| Aviso "El token de WhatsApp venció" | El bot no puede responderle a nadie | Avisa a Franco de inmediato y atiende a mano mientras tanto |
| Aviso "No se pudo leer la planilla" | El bot no ve clientes ni precios y deja todo para una persona | Avisa a Franco y revisa que la planilla siga compartida |
| El bot responde cosas equivocadas | Hay que detenerlo | En la hoja CONFIGURACION pon `BOT_ACTIVO` en `NO` (tarda un minuto). Para encenderlo, `SI` |
| Hay una falla en el reparto | Los clientes tienen que saberlo | En CONFIGURACION pon `ESTADO_SERVICIO` en `reducido` y escribe el aviso en `MENSAJE_EXCEPCION`: el bot lo agrega a sus respuestas |

## Lo que el panel todavía no hace
No le escribe al cliente, no guarda las imágenes de los comprobantes, no ordena la ruta (eso lo hace la app de rutas) y no tiene las fichas de los clientes ni los precios, que siguen en la planilla.
