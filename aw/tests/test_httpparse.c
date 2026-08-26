/*
 * Pruebas del parseo HTTP del asistente Wii, compiladas de forma nativa.
 *
 *   cc -I../source -o /tmp/t test_httpparse.c ../source/httpparse.c && /tmp/t
 *
 * Se prueba aquí y no en la Wii porque es la parte con lógica sutil y sin dependencias del
 * hardware: el resto del asistente es E/S y no se puede probar sin consola.
 */
#include "httpparse.h"

#include <stdio.h>
#include <string.h>

static int failures = 0;

static void check(int condition, const char *what)
{
	printf("  %s %s\n", condition ? "ok  " : "FALLO", what);
	if (!condition)
		failures++;
}

static void test_get(void)
{
	printf("GET simple\n");
	const char *raw = "GET /api/status HTTP/1.1\r\nHost: 192.168.1.50:8080\r\n\r\n";
	http_request request;
	int done = http_parse_request(raw, strlen(raw), &request);

	check(done == 1, "peticion completa");
	check(request.method == HTTP_GET, "metodo GET");
	check(strcmp(request.path, "/api/status") == 0, "ruta /api/status");
	check(request.content_length == 0, "sin cuerpo");
	check(request.body_available == 0, "sin bytes de cuerpo pendientes");
}

static void test_incomplete(void)
{
	printf("cabeceras a medias\n");
	const char *raw = "GET /api/save HTTP/1.1\r\nHost: wii\r\n";
	http_request request;
	check(http_parse_request(raw, strlen(raw), &request) == 0, "se pide seguir leyendo");
}

static void test_put_with_body_in_first_packet(void)
{
	printf("PUT con parte del cuerpo pegada a las cabeceras\n");
	/* Este es el caso que corrompia el guardado si se descartaba el sobrante. */
	const char raw[] =
		"PUT /api/save HTTP/1.1\r\n"
		"Content-Type: application/octet-stream\r\n"
		"Content-Length: 3670016\r\n"
		"\r\n"
		"\x1e\x6d\xce\x9c\x2d\xb3\x0a\xf4";
	size_t length = sizeof(raw) - 1;

	http_request request;
	check(http_parse_request(raw, length, &request) == 1, "peticion completa");
	check(request.method == HTTP_PUT, "metodo PUT");
	check(strcmp(request.path, "/api/save") == 0, "ruta /api/save");
	check(request.content_length == 3670016, "Content-Length de un guardado de PBR");
	check(request.body_available == 8, "8 bytes de cuerpo ya recibidos");
	check(memcmp(raw + request.body_offset, "\x1e\x6d\xce\x9c", 4) == 0, "el cuerpo empieza donde toca");
}

static void test_case_insensitive_header(void)
{
	printf("Content-Length en minusculas\n");
	const char *raw = "PUT /api/save HTTP/1.1\r\ncontent-length: 42\r\n\r\n";
	http_request request;
	http_parse_request(raw, strlen(raw), &request);
	check(request.content_length == 42, "se reconoce igual");
}

static void test_header_not_confused_with_body(void)
{
	printf("una cabecera falsa dentro del cuerpo no confunde\n");
	/* Si se buscase "content-length" en todo el buffer, este cuerpo cambiaria el tamano. */
	const char raw[] =
		"PUT /api/save HTTP/1.1\r\n"
		"Content-Length: 20\r\n"
		"\r\n"
		"Content-Length: 999\r\n";
	http_request request;
	http_parse_request(raw, sizeof(raw) - 1, &request);
	check(request.content_length == 20, "se usa la cabecera real, no la del cuerpo");
}

static void test_options(void)
{
	printf("OPTIONS (preflight de CORS)\n");
	const char *raw = "OPTIONS /api/save HTTP/1.1\r\nOrigin: http://localhost:5173\r\n\r\n";
	http_request request;
	http_parse_request(raw, strlen(raw), &request);
	check(request.method == HTTP_OPTIONS, "metodo OPTIONS");
}

static void test_long_path_is_truncated(void)
{
	printf("una ruta larguisima no desborda\n");
	char raw[1024];
	int n = snprintf(raw, sizeof(raw), "GET /");
	for (int i = 0; i < 400 && n < (int)sizeof(raw) - 32; i++)
		n += snprintf(raw + n, sizeof(raw) - (size_t)n, "a");
	snprintf(raw + n, sizeof(raw) - (size_t)n, " HTTP/1.1\r\n\r\n");

	http_request request;
	http_parse_request(raw, strlen(raw), &request);
	check(strlen(request.path) == sizeof(request.path) - 1, "la ruta se recorta al tamano del buffer");
}

static void test_session_header(void)
{
	printf("cabecera de sesion\n");
	const char *raw =
		"PUT /api/save HTTP/1.1\r\n"
		"X-Ania-Session: a1b2c3d4e5f60718\r\n"
		"Content-Length: 3670016\r\n"
		"\r\n";
	http_request request;
	http_parse_request(raw, strlen(raw), &request);
	check(strcmp(request.session, "a1b2c3d4e5f60718") == 0, "token leido entero y sin el salto de linea");
	check(request.content_length == 3670016, "y la otra cabecera sigue bien");
}

static void test_session_methods(void)
{
	printf("metodos de la sesion\n");
	const char *post = "POST /api/session HTTP/1.1\r\n\r\n";
	const char *del = "DELETE /api/session HTTP/1.1\r\n\r\n";
	http_request request;

	http_parse_request(post, strlen(post), &request);
	check(request.method == HTTP_POST, "POST reconocido");
	check(strcmp(request.path, "/api/session") == 0, "ruta de sesion");

	http_parse_request(del, strlen(del), &request);
	check(request.method == HTTP_DELETE, "DELETE reconocido");
}

static void test_no_session_header(void)
{
	printf("sin cabecera de sesion\n");
	const char *raw = "GET /api/save HTTP/1.1\r\n\r\n";
	http_request request;
	http_parse_request(raw, strlen(raw), &request);
	check(request.session[0] == '\0', "el token queda vacio, no con basura");
}

int main(void)
{
	test_session_header();
	test_session_methods();
	test_no_session_header();
	test_get();
	test_incomplete();
	test_put_with_body_in_first_packet();
	test_case_insensitive_header();
	test_header_not_confused_with_body();
	test_options();
	test_long_path_is_truncated();

	printf("\n%s\n", failures == 0 ? "Todo correcto." : "HAY FALLOS.");
	return failures == 0 ? 0 : 1;
}
