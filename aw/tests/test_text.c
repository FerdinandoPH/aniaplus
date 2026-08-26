/*
 * Comprueba las traducciones del asistente sin necesidad de una Wii.
 *
 * Lo que se busca es el fallo que no avisa: una traduccion que cambia el orden o el tipo de sus
 * `%s` y `%ld`. Eso compila igual y revienta en la consola —con suerte con basura en pantalla, sin
 * ella con una excepcion—, asi que se compara idioma por idioma contra el castellano, que es el de
 * referencia. De paso se comprueba que no falte ninguna cadena y que no se haya colado un acento,
 * que la fuente de la consola no sabe pintar.
 */
#define AW_TEXT_NATIVE_TEST
#include "../source/text.c"

#include <stdio.h>
#include <string.h>

static int failures = 0;

static void check(int condition, const char *message)
{
	if (condition) {
		printf("  ok   %s\n", message);
	} else {
		printf("  FALLO %s\n", message);
		failures++;
	}
}

/* Los especificadores de una cadena, en orden y sin lo demas: "%ld bytes de %s" -> "%ld|%s|". */
static void formats(const char *text, char *out, size_t size)
{
	size_t used = 0;
	out[0] = '\0';
	for (const char *p = text; *p != '\0'; p++) {
		if (*p != '%')
			continue;
		if (p[1] == '%') { p++; continue; }
		const char *start = p++;
		while (*p != '\0' && strchr("diouxXeEfgGcsp", *p) == NULL)
			p++;
		if (*p == '\0')
			break;
		size_t length = (size_t)(p - start) + 1;
		if (used + length + 2 >= size)
			return;
		memcpy(out + used, start, length);
		used += length;
		out[used++] = '|';
		out[used] = '\0';
	}
}

int main(void)
{
	static const char *const NAMES[AW_LANG_COUNT] = { "es", "en", "de", "fr", "it" };

	printf("no falta ninguna cadena\n");
	for (int lang = 0; lang < AW_LANG_COUNT; lang++) {
		int missing = 0;
		for (int id = 0; id < TXT_COUNT; id++)
			if (TABLES[lang][id] == NULL)
				missing++;
		char message[64];
		snprintf(message, sizeof(message), "%s: %d sin traducir", NAMES[lang], missing);
		check(missing == 0, message);
	}

	printf("los formatos coinciden con el castellano\n");
	for (int lang = 1; lang < AW_LANG_COUNT; lang++) {
		int mismatched = 0;
		for (int id = 0; id < TXT_COUNT; id++) {
			char expected[64], actual[64];
			formats(aw_text_of(AW_LANG_ES, (aw_text_id)id), expected, sizeof(expected));
			formats(aw_text_of((aw_lang)lang, (aw_text_id)id), actual, sizeof(actual));
			if (strcmp(expected, actual) != 0) {
				printf("       id %d: %s espera %s y tiene %s\n", id, NAMES[lang], expected, actual);
				mismatched++;
			}
		}
		char message[64];
		snprintf(message, sizeof(message), "%s: %d cadenas con formatos distintos", NAMES[lang], mismatched);
		check(mismatched == 0, message);
	}

	printf("solo ASCII: la fuente de la consola no tiene mas\n");
	for (int lang = 0; lang < AW_LANG_COUNT; lang++) {
		int non_ascii = 0;
		for (int id = 0; id < TXT_COUNT; id++) {
			for (const unsigned char *p = (const unsigned char *)aw_text_of((aw_lang)lang, (aw_text_id)id);
			     *p != '\0'; p++) {
				if (*p >= 0x80) {
					printf("       id %d (%s) tiene un caracter fuera de ASCII\n", id, NAMES[lang]);
					non_ascii++;
					break;
				}
			}
		}
		char message[64];
		snprintf(message, sizeof(message), "%s: %d cadenas con caracteres raros", NAMES[lang], non_ascii);
		check(non_ascii == 0, message);
	}

	if (failures > 0) {
		printf("\n%d comprobaciones han fallado.\n", failures);
		return 1;
	}
	printf("\nTodo correcto.\n");
	return 0;
}
