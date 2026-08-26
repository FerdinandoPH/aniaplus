/*
 * Servidor HTTP mínimo del asistente Wii.
 *
 * Es HTTP y no un protocolo propio sobre TCP porque el cliente es una página web, y un navegador
 * no puede abrir sockets. Además responde con Access-Control-Allow-Origin para que la página
 * pueda estar servida desde otro sitio.
 */
#ifndef ANIA_HTTP_H
#define ANIA_HTTP_H

#include <gccore.h>

#include "httpparse.h"

#define AW_PORT 8080

/*
 * Configuracion de la red, en dos tiempos y sin bloquear.
 *
 * `if_config` es comodo pero bloquea hasta veinte intentos de DHCP dentro de IOS, y mientras tanto
 * nadie lee el mando ni mira las banderas de apagado: sin red, la consola se quedaba colgada de
 * verdad, con el boton de encendido incluido, y habia que apagarla a lo bruto. La version asincrona
 * devuelve el control en cada vuelta, que es lo unico que permite poner un plazo y una salida.
 */
typedef enum {
	HTTP_NET_CONNECTING,
	HTTP_NET_READY,
	HTTP_NET_FAILED,
} http_net_state;

/* Lanza la configuracion. Devuelve 0 si ha arrancado, negativo si ni siquiera eso. */
s32 http_net_begin(void);

/* Como va. No bloquea: se llama una vez por fotograma. */
http_net_state http_net_poll(void);

/* Codigo del ultimo fallo de red, para poder enseñarlo. */
s32 http_net_error(void);

/*
 * ¿Sigue habiendo red? Se contesta mirando si la consola conserva una IP: es barato y no manda
 * nada, pero tampoco detecta un router que se ha ido llevandose el enlace sin avisar a IOS. Por eso
 * el bucle principal lo combina con los errores del socket de escucha.
 */
bool http_net_alive(void);

/* Levanta el servidor sobre una red ya configurada. Devuelve el socket de escucha, o negativo. */
s32 http_listen(u16 port);

/*
 * Espera una conexión y lee su petición.
 *
 * Solo se atiende una a la vez, a propósito: dos clientes escribiendo el mismo guardado a la vez
 * lo dejarían inconsistente.
 *
 * `timeout_ms` evita que la espera bloquee el bucle principal: sin él, los botones del mando no
 * responderían mientras no llegase una conexión. Devuelve HTTP_NO_CLIENT si vence el plazo.
 */
#define HTTP_NO_CLIENT (-1000)
/*
 * Alguien abrio la conexion y la cerro sin decir nada. Es lo normal en un navegador, que se
 * adelanta a peticiones que puede que no llegue a hacer, pero se distingue de HTTP_NO_CLIENT
 * porque es la unica forma de saber si un aviso que no aparece es que no llego o que no se supo
 * leer. Se cuenta en la cabecera.
 */
#define HTTP_SILENT_CLIENT (-1001)
s32 http_accept(s32 server, http_request *request, s32 timeout_ms);

/* IP del ultimo cliente aceptado, para saber si es el mismo de antes. */
u32 http_client_ip(void);

/* Respuestas. `close` cierra el socket del cliente. */
void http_send_status(s32 client, int code, const char *reason, const char *body);
void http_send_binary(s32 client, const u8 *data, u32 length);
/* Envio con un Content-Type concreto, para los ficheros estaticos de la SD. */
void http_send_typed(s32 client, const char *content_type, const u8 *data, u32 length);
/*
 * Envio en dos tiempos, para servir un fichero sin cargarlo entero en memoria: primero las
 * cabeceras con su tamaño, luego el contenido a trozos. El JS de la web pasa del megabyte, y
 * reservarlo y liberarlo en cada peticion fragmenta el monton para nada.
 */
void http_send_headers(s32 client, const char *content_type, u32 length);
void http_send_chunk(s32 client, const u8 *data, u32 length);
void http_send_json(s32 client, const char *json);
s32 http_read_body(s32 client, u8 *buffer, u32 length);
void http_close(s32 client);

/* Direccion IP local en texto, para enseñarla en pantalla. */
const char *http_local_ip(void);

#endif
