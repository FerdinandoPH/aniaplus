#include "http.h"

#include "text.h"

#include <errno.h>
#include <network.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

/* Cabeceras CORS: sin esto el navegador rechaza las respuestas si la web no viene de la Wii. */
#define CORS_HEADERS \
	"Access-Control-Allow-Origin: *\r\n" \
	"Access-Control-Allow-Methods: GET, PUT, POST, DELETE, OPTIONS\r\n" \
	"Access-Control-Allow-Headers: Content-Type, X-Ania-Session\r\n"

static char local_ip[16] = "0.0.0.0";

/*
 * En un PUT, la primera lectura del socket suele traer las cabeceras Y los primeros bytes del
 * cuerpo en el mismo paquete. Si se descartan, el guardado llega corrupto y desplazado. Aqui se
 * guarda ese sobrante para que http_read_body lo consuma antes de volver a leer del socket.
 */
static u8 leftover[2048];
static u32 leftover_length = 0;

static u32 last_client_ip = 0;

u32 http_client_ip(void)
{
	return last_client_ip;
}

const char *http_local_ip(void)
{
	return local_ip;
}

/*
 * Estado de la configuracion de red.
 *
 * Se guarda por duplicado a proposito: el callback de `net_init_async` es lo unico que garantiza
 * enterarse del resultado, pero si la red ya estaba configurada libogc puede no llamarlo nunca y
 * limitarse a contestar en `net_get_status`. Mirar los dos sitios es lo que hace que el estado sea
 * correcto tanto en el primer arranque como en un reintento.
 */
static volatile bool net_callback_done = false;
static volatile s32 net_callback_result = 0;
static s32 net_last_error = 0;
static bool net_started = false;

static s32 on_net_configured(s32 result, void *usrdata)
{
	(void)usrdata;
	net_callback_result = result;
	net_callback_done = true;
	return 0;
}

/* La IP que tenga la consola ahora mismo, en texto, o "0.0.0.0" si no tiene. */
static void refresh_local_ip(void)
{
	u32 ip = net_gethostip();
	snprintf(local_ip, sizeof(local_ip), "%lu.%lu.%lu.%lu",
		(unsigned long)((ip >> 24) & 0xff), (unsigned long)((ip >> 16) & 0xff),
		(unsigned long)((ip >> 8) & 0xff), (unsigned long)(ip & 0xff));
}

s32 http_net_begin(void)
{
	net_callback_done = false;
	net_callback_result = 0;
	net_last_error = 0;

	s32 result = net_init_async(on_net_configured, NULL);
	if (result < 0) {
		net_last_error = result;
		net_started = false;
		return result;
	}
	net_started = true;
	return 0;
}

http_net_state http_net_poll(void)
{
	if (!net_started)
		return HTTP_NET_FAILED;

	s32 status = net_callback_done ? net_callback_result : net_get_status();
	if (status == -EBUSY)
		return HTTP_NET_CONNECTING;
	if (status < 0) {
		net_last_error = status;
		return HTTP_NET_FAILED;
	}

	refresh_local_ip();
	/*
	 * Configurada pero sin direccion: pasa mientras el DHCP todavia esta negociando. Sin esta
	 * comprobacion el asistente anunciaria un http://0.0.0.0:8080/ que no sirve para nada.
	 */
	if (net_gethostip() == 0)
		return HTTP_NET_CONNECTING;
	return HTTP_NET_READY;
}

s32 http_net_error(void)
{
	return net_last_error;
}

bool http_net_alive(void)
{
	return net_gethostip() != 0;
}

s32 http_listen(u16 port)
{
	/*
	 * Cada paso dice su nombre al fallar. Antes se devolvia el codigo pelado y no habia forma de
	 * saber si el problema era la red o el socket: un -123 podia venir de dos sitios distintos, y
	 * distinguirlos costo una vuelta entera a la consola.
	 */
	refresh_local_ip();

	/*
	 * IPPROTO_IP, no IPPROTO_TCP: la pila de red de IOS solo acepta el 0 y devuelve -123
	 * (EPROTONOSUPPORT) con cualquier otro, aunque para un SOCK_STREAM lo natural pareceria ser
	 * IPPROTO_TCP. Es lo que usan los ejemplos de devkitPro.
	 */
	s32 server = net_socket(AF_INET, SOCK_STREAM, IPPROTO_IP);
	if (server < 0) {
		aw_say(TXT_NET_SOCKET_FAIL, (long)server);
		return server;
	}

	struct sockaddr_in address;
	memset(&address, 0, sizeof(address));
	address.sin_family = AF_INET;
	/* En PowerPC htons no hace nada (big-endian ya es orden de red), pero deja claro el intento. */
	address.sin_port = htons(port);
	address.sin_addr.s_addr = INADDR_ANY;

	s32 bound = net_bind(server, (struct sockaddr *)&address, sizeof(address));
	if (bound < 0) {
		aw_say(TXT_NET_BIND_FAIL, (long)bound, (unsigned)port);
		net_close(server);
		return bound;
	}
	/*
	 * Backlog holgado. Las peticiones se atienden de una en una, que es lo que garantiza que dos
	 * clientes no escriban el guardado a la vez; el backlog es otra cosa: al cargar la web, el
	 * navegador abre varias conexiones en paralelo para el HTML, el CSS y el JS. Con backlog 1
	 * las sobrantes se rechazan y la pagina carga a medias.
	 */
	s32 listening = net_listen(server, 8);
	if (listening < 0) {
		aw_say(TXT_NET_LISTEN_FAIL, (long)listening);
		net_close(server);
		return listening;
	}
	return server;
}

/*
 * NINGUNA espera sobre un socket puede ser eterna.
 *
 * `net_recv` y `net_send` bloquean hasta que el otro lado hable, y el bucle principal es
 * secuencial: mientras uno de los dos este bloqueado, ni se leen los botones ni se atienden mas
 * peticiones. El caso que lo destapa no es raro, es lo normal: los navegadores **abren conexiones
 * por adelantado y no mandan nada por ellas**. Una de esas dejaba al asistente esperando cabeceras
 * para siempre, con la consola aparentemente colgada —sin responder a HOME ni al boton de
 * encendido— y sin llegar a ver el aviso de que la web se habia cerrado.
 *
 * Con esto, toda espera tiene plazo: si se agota, se abandona esa conexion y se sigue.
 */
/*
 * El plazo de la primera lectura es corto a proposito: un navegador manda la peticion en cuanto
 * abre la conexion, asi que dos segundos sobran en una red local, y es el tiempo que los botones
 * del mando pueden quedarse sin atender por cada conexion muda.
 */
#define HEADER_FIRST_TIMEOUT_MS 2000
#define HEADER_NEXT_TIMEOUT_MS  3000  /* Entre trozos de unas cabeceras que ya han empezado. */
#define BODY_TIMEOUT_MS        15000  /* Un guardado de 3,5 MB por wifi puede ir a ratos. */
#define SEND_TIMEOUT_MS        15000  /* El movil puede tardar en leer, pero no para siempre. */

static bool wait_ready(s32 socket, u32 events, s32 timeout_ms)
{
	struct pollsd entry;
	entry.socket = socket;
	entry.events = events;
	entry.revents = 0;
	return net_poll(&entry, 1, timeout_ms) > 0;
}

/* Lee hasta encontrar el final de las cabeceras. Devuelve los bytes leídos, o negativo. */
static s32 read_headers(s32 client, char *buffer, u32 capacity)
{
	u32 total = 0;
	while (total < capacity - 1) {
		s32 timeout = total == 0 ? HEADER_FIRST_TIMEOUT_MS : HEADER_NEXT_TIMEOUT_MS;
		if (!wait_ready(client, POLLIN, timeout))
			break;
		s32 got = net_recv(client, buffer + total, capacity - 1 - total, 0);
		if (got <= 0)
			return got == 0 ? (s32)total : got;
		total += (u32)got;
		buffer[total] = '\0';
		if (strstr(buffer, "\r\n\r\n") != NULL)
			break;
	}
	buffer[total] = '\0';
	return (s32)total;
}

s32 http_accept(s32 server, http_request *request, s32 timeout_ms)
{
	/* Sin socket de escucha no hay nada que esperar; net_poll con un descriptor invalido no. */
	if (server < 0)
		return HTTP_NO_CLIENT;

	/* Se espera con poll en vez de bloquear en accept, para que el bucle principal siga vivo. */
	struct pollsd poll_entry;
	poll_entry.socket = server;
	poll_entry.events = POLLIN;
	poll_entry.revents = 0;

	s32 ready = net_poll(&poll_entry, 1, timeout_ms);
	if (ready <= 0)
		return HTTP_NO_CLIENT;

	struct sockaddr_in from;
	socklen_t from_length = sizeof(from);

	s32 client = net_accept(server, (struct sockaddr *)&from, &from_length);
	if (client < 0)
		return client;

	last_client_ip = from.sin_addr.s_addr;

	static char headers[2048];
	s32 headers_read = read_headers(client, headers, sizeof(headers));
	if (headers_read <= 0) {
		/*
		 * Conexion abierta y callada: es lo que hace el navegador cuando se adelanta a una peticion
		 * que puede que no llegue a hacer. No es un error del que informar, solo se cierra.
		 */
		net_close(client);
		return HTTP_SILENT_CLIENT;
	}

	/*
	 * El parseo vive en httpparse.c, sin dependencias del hardware, para poder probarlo en el
	 * ordenador (ver tests/test_httpparse.c). Aqui solo se mueven bytes.
	 */
	if (!http_parse_request(headers, (size_t)headers_read, request)) {
		net_close(client);
		return -1;
	}

	/* Sobrante del cuerpo que ha venido pegado a las cabeceras. */
	leftover_length = (u32)request->body_available;
	if (leftover_length > sizeof(leftover))
		leftover_length = sizeof(leftover);
	if (leftover_length > 0)
		memcpy(leftover, headers + request->body_offset, leftover_length);

	return client;
}

s32 http_read_body(s32 client, u8 *buffer, u32 length)
{
	u32 done = 0;

	/* Primero lo que ya se leyo junto a las cabeceras. */
	if (leftover_length > 0) {
		u32 take = leftover_length < length ? leftover_length : length;
		memcpy(buffer, leftover, take);
		done = take;
		leftover_length = 0;
	}

	while (done < length) {
		if (!wait_ready(client, POLLIN, BODY_TIMEOUT_MS))
			return (s32)done;  /* Transferencia cortada: el que llama lo vera por el tamaño. */
		s32 got = net_recv(client, buffer + done, length - done, 0);
		if (got <= 0)
			return got == 0 ? (s32)done : got;
		done += (u32)got;
	}
	return (s32)done;
}

static void send_all(s32 client, const void *data, u32 length)
{
	const u8 *bytes = (const u8 *)data;
	u32 done = 0;
	while (done < length) {
		u32 want = length - done;
		/* Trozos moderados: la pila de red de la Wii no digiere bien envíos enormes. */
		if (want > 4096)
			want = 4096;
		if (!wait_ready(client, POLLOUT, SEND_TIMEOUT_MS))
			return;
		s32 sent = net_send(client, bytes + done, want, 0);
		if (sent <= 0)
			return;
		done += (u32)sent;
	}
}

void http_send_status(s32 client, int code, const char *reason, const char *body)
{
	char header[512];
	u32 body_length = body != NULL ? (u32)strlen(body) : 0;

	snprintf(header, sizeof(header),
		"HTTP/1.1 %d %s\r\n"
		CORS_HEADERS
		"Content-Type: text/plain; charset=utf-8\r\n"
		"Content-Length: %u\r\n"
		"Connection: close\r\n\r\n",
		code, reason, body_length);

	send_all(client, header, (u32)strlen(header));
	if (body_length > 0)
		send_all(client, body, body_length);
}

void http_send_json(s32 client, const char *json)
{
	char header[512];
	u32 length = (u32)strlen(json);

	snprintf(header, sizeof(header),
		"HTTP/1.1 200 OK\r\n"
		CORS_HEADERS
		"Content-Type: application/json; charset=utf-8\r\n"
		"Content-Length: %u\r\n"
		"Connection: close\r\n\r\n",
		length);

	send_all(client, header, (u32)strlen(header));
	send_all(client, json, length);
}

void http_send_binary(s32 client, const u8 *data, u32 length)
{
	char header[512];
	snprintf(header, sizeof(header),
		"HTTP/1.1 200 OK\r\n"
		CORS_HEADERS
		"Content-Type: application/octet-stream\r\n"
		"Content-Length: %u\r\n"
		"Connection: close\r\n\r\n",
		length);

	send_all(client, header, (u32)strlen(header));
	send_all(client, data, length);
}

void http_send_headers(s32 client, const char *content_type, u32 length)
{
	char header[512];
	snprintf(header, sizeof(header),
		"HTTP/1.1 200 OK\r\n"
		CORS_HEADERS
		"Content-Type: %s\r\n"
		"Content-Length: %u\r\n"
		"Connection: close\r\n\r\n",
		content_type, length);

	send_all(client, header, (u32)strlen(header));
}

void http_send_chunk(s32 client, const u8 *data, u32 length)
{
	send_all(client, data, length);
}

void http_send_typed(s32 client, const char *content_type, const u8 *data, u32 length)
{
	char header[512];
	snprintf(header, sizeof(header),
		"HTTP/1.1 200 OK\r\n"
		CORS_HEADERS
		"Content-Type: %s\r\n"
		"Content-Length: %u\r\n"
		"Connection: close\r\n\r\n",
		content_type, length);

	send_all(client, header, (u32)strlen(header));
	send_all(client, data, length);
}

void http_close(s32 client)
{
	net_close(client);
}
