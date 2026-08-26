/*
 * Parseo de una petición HTTP. Está separado del socket a propósito: es la parte con lógica
 * sutil (el cuerpo puede venir pegado a las cabeceras) y así se puede compilar y probar en el
 * ordenador, sin Wii ni emulador. Ver `tests/test_httpparse.c`.
 */
#ifndef ANIA_HTTPPARSE_H
#define ANIA_HTTPPARSE_H

#include <stddef.h>

typedef enum {
	HTTP_GET,
	HTTP_PUT,
	HTTP_POST,
	HTTP_DELETE,
	HTTP_OPTIONS,
	HTTP_OTHER,
} http_method;

typedef struct {
	http_method method;
	char path[256];
	unsigned long content_length;
	/* Valor de X-Ania-Session: identifica al dispositivo que tiene la sesion de edicion. */
	char session[33];
	/*
	 * Desplazamiento del primer byte del cuerpo dentro del buffer leído, y cuántos bytes de
	 * cuerpo había ya ahí. Si se ignoran, un PUT llega desplazado y el guardado sale corrupto.
	 */
	size_t body_offset;
	size_t body_available;
	/* 0 si las cabeceras aún no están completas (falta el \r\n\r\n). */
	int complete;
} http_request;

/*
 * Interpreta lo leído del socket. `length` son los bytes válidos de `buffer`.
 * Devuelve 1 si la petición está completa, 0 si hay que seguir leyendo.
 */
int http_parse_request(const char *buffer, size_t length, http_request *request);

#endif
