#include "screen.h"

#include "text.h"

#include <ogc/console.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>

/*
 * Filas que ocupa la cabecera. El resto de la pantalla es el registro.
 *
 * La consola de una Wii PAL da unas 30 filas, asi que quedan mas de veinte para los mensajes: de
 * sobra para ver lo ultimo que ha pasado sin tener que recordar lo que se fue por arriba.
 */
#define HEADER_ROWS 8

static int columns = 80;
static int total_rows = 30;
static int log_height = 1;
/* Fila del registro donde se escribira el siguiente mensaje, 1 = la primera del recuadro. */
static int log_row = 1;
static bool ready = false;

static void select_header(void)
{
	consoleSetWindow(NULL, 1, 1, columns, HEADER_ROWS);
}

static void select_log(void)
{
	consoleSetWindow(NULL, 1, HEADER_ROWS + 1, columns, log_height);
}

/*
 * Una fila de la cabecera. Sin salto de linea a proposito: un '\n' en la ultima fila desplazaria
 * la ventana de la cabecera, que es justo lo que no debe moverse nunca.
 */
static void header_line(int row, const char *format, ...)
{
	printf("\x1b[%d;1H\x1b[K", row);
	va_list args;
	va_start(args, format);
	vprintf(format, args);
	va_end(args);
}

static void draw_header(const screen_info *info)
{
	select_header();

	/*
	 * La version del juego va siempre: con guardados de tres regiones, es lo primero que hay que
	 * poder confirmar de un vistazo. En Dolphin, ademas, el numero de IOS es el que el emulador se
	 * inventa —no dice nada— y distrae del unico dato que ahi importa, que se esta en el emulador.
	 */
	if (info->dolphin)
		header_line(1, "ANIA+  %s  v%s   %s   Dolphin",
			aw_text(TXT_APP_SUBTITLE), info->version, info->region);
	else
		header_line(1, "ANIA+  %s  v%s   %s   IOS %ld v%ld%s",
			aw_text(TXT_APP_SUBTITLE), info->version, info->region,
			(long)info->ios, (long)info->ios_revision, info->access);

	/*
	 * Las etiquetas se alinean a mano: son de longitud distinta en cada idioma, y sin eso la
	 * cabecera se descuadraria al cambiar de idioma.
	 *
	 * Con la red caida no se enseña la direccion: apuntaria a algo que ya no contesta.
	 */
	if (info->net_lost)
		header_line(3, "%-11s %s", aw_text(TXT_HDR_ADDRESS), aw_text(TXT_HDR_NO_NET));
	else if (info->ip != NULL && info->port != 0)
		header_line(3, "%-11s http://%s:%u/", aw_text(TXT_HDR_ADDRESS), info->ip, (unsigned)info->port);
	else
		header_line(3, "%-11s %s", aw_text(TXT_HDR_ADDRESS), aw_text(TXT_HDR_NO_NET_YET));

	if (info->save_size > 0) {
		char detail[80];
		snprintf(detail, sizeof(detail), aw_text(TXT_HDR_SAVE_LINE),
			(long)info->save_size, aw_text(info->backup ? TXT_YES : TXT_NOT_YET));
		header_line(4, "%-11s %s", aw_text(TXT_HDR_SAVE), detail);
	} else {
		char detail[80];
		snprintf(detail, sizeof(detail), aw_text(TXT_HDR_SAVE_UNAVAILABLE), (long)info->save_size);
		header_line(4, "%-11s %s", aw_text(TXT_HDR_SAVE), detail);
	}

	{
		char detail[100];
		snprintf(detail, sizeof(detail), aw_text(TXT_HDR_ACTIVITY_LINE),
			(unsigned long)info->reads, (unsigned long)info->writes,
			aw_text(info->session ? TXT_SESSION_OPEN : TXT_SESSION_FREE),
			(unsigned long)info->silent);
		header_line(5, "%-11s %s", aw_text(TXT_HDR_ACTIVITY), detail);
	}

	header_line(7, "%s", aw_text(TXT_HDR_KEYS));

	/* Raya de separacion: deja claro donde acaba lo fijo y empieza lo que va cambiando. */
	printf("\x1b[%d;1H\x1b[K", HEADER_ROWS);
	for (int i = 0; i < columns - 1; i++)
		putchar('-');
}

/* Vuelve al registro dejando el cursor donde estaba, que cambiar de ventana lo manda al origen. */
static void restore_log_cursor(void)
{
	select_log();
	printf("\x1b[%d;1H", log_row);
}

void screen_begin(const screen_info *info)
{
	CON_GetMetrics(&columns, &total_rows);
	log_height = total_rows - HEADER_ROWS;
	if (log_height < 1)
		log_height = 1;
	log_row = 1;
	ready = true;

	/* Se limpia con la ventana entera; si no, el borrado se quedaria dentro del recuadro activo. */
	consoleSetWindow(NULL, 1, 1, columns, total_rows);
	printf("\x1b[2J");

	draw_header(info);
	restore_log_cursor();
}

void screen_update(const screen_info *info)
{
	if (!ready)
		return;
	draw_header(info);
	restore_log_cursor();
}

void screen_log(const char *format, ...)
{
	char line[128];
	va_list args;
	va_start(args, format);
	vsnprintf(line, sizeof(line), format, args);
	va_end(args);

	/* Recortado a lo ancho: una linea mas larga daria la vuelta y ocuparia dos filas. */
	int limit = columns - 1;
	if (limit > 0 && (int)strlen(line) > limit)
		line[limit] = '\0';

	if (!ready) {
		/* Antes de montar la pantalla (el arranque) esto es un printf normal y ya esta. */
		printf("%s\n", line);
		return;
	}

	printf("\x1b[%d;1H\x1b[K%s", log_row, line);
	if (log_row < log_height)
		log_row++;
	else
		/* Ya en la ultima fila: el salto desplaza el registro y deja el cursor abajo otra vez. */
		printf("\n");
}
