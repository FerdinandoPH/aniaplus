#include "httpparse.h"

#include <stdlib.h>
#include <string.h>

/* Comparación sin distinguir mayúsculas, para las cabeceras. */
static int header_matches(const char *text, const char *name, size_t name_length)
{
	for (size_t i = 0; i < name_length; i++) {
		char a = text[i];
		char b = name[i];
		if (a >= 'A' && a <= 'Z') a = (char)(a - 'A' + 'a');
		if (b >= 'A' && b <= 'Z') b = (char)(b - 'A' + 'a');
		if (a != b)
			return 0;
	}
	return 1;
}

/* Busca una cabecera y devuelve el puntero a su valor, o NULL. */
static const char *find_header(const char *buffer, size_t length, const char *name)
{
	size_t name_length = strlen(name);
	for (size_t i = 0; i + name_length < length; i++) {
		/* Solo al principio de línea. */
		if (i != 0 && !(buffer[i - 1] == '\n'))
			continue;
		if (header_matches(buffer + i, name, name_length)) {
			const char *value = buffer + i + name_length;
			while (*value == ' ' || *value == '\t')
				value++;
			return value;
		}
	}
	return NULL;
}

int http_parse_request(const char *buffer, size_t length, http_request *request)
{
	memset(request, 0, sizeof(*request));
	request->method = HTTP_OTHER;

	/* ¿Están completas las cabeceras? */
	const char *separator = NULL;
	for (size_t i = 0; i + 3 < length; i++) {
		if (memcmp(buffer + i, "\r\n\r\n", 4) == 0) {
			separator = buffer + i;
			break;
		}
	}
	if (separator == NULL)
		return 0;

	request->complete = 1;
	size_t header_length = (size_t)(separator - buffer) + 4;
	request->body_offset = header_length;
	request->body_available = length - header_length;

	if (length >= 4 && memcmp(buffer, "GET ", 4) == 0)
		request->method = HTTP_GET;
	else if (length >= 4 && memcmp(buffer, "PUT ", 4) == 0)
		request->method = HTTP_PUT;
	else if (length >= 5 && memcmp(buffer, "POST ", 5) == 0)
		request->method = HTTP_POST;
	else if (length >= 7 && memcmp(buffer, "DELETE ", 7) == 0)
		request->method = HTTP_DELETE;
	else if (length >= 8 && memcmp(buffer, "OPTIONS ", 8) == 0)
		request->method = HTTP_OPTIONS;

	/* Ruta: entre el primer y el segundo espacio. */
	const char *start = memchr(buffer, ' ', header_length);
	if (start != NULL) {
		start++;
		const char *end = memchr(start, ' ', header_length - (size_t)(start - buffer));
		if (end != NULL) {
			size_t path_length = (size_t)(end - start);
			if (path_length >= sizeof(request->path))
				path_length = sizeof(request->path) - 1;
			memcpy(request->path, start, path_length);
			request->path[path_length] = '\0';
		}
	}

	const char *value = find_header(buffer, header_length, "content-length:");
	if (value != NULL)
		request->content_length = strtoul(value, NULL, 10);

	value = find_header(buffer, header_length, "x-ania-session:");
	if (value != NULL) {
		size_t i = 0;
		while (i < sizeof(request->session) - 1 &&
		       value[i] != '\r' && value[i] != '\n' && value[i] != '\0') {
			request->session[i] = value[i];
			i++;
		}
		request->session[i] = '\0';
	}

	return 1;
}
