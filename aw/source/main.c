/*
 * ANIA+ — Asistente Wii
 *
 * Copyright (C) 2026 FerdinandoPH
 *
 * Software libre bajo la GNU General Public License **version 2**; el texto completo esta en
 * `aw/LICENSE`. La version 2 y no la 3 porque `iospatch.c` lleva codigo de libruntimeiospatch,
 * que se publica bajo la 2 y solo la 2; la web (`ania/`) es un programa aparte y va bajo la 3.
 * Se distribuye con la esperanza de que sea util, pero SIN NINGUNA GARANTIA.
 *
 * Homebrew que hace de puente entre el guardado de Pokémon Battle Revolution en la NAND y el
 * asistente principal (la web). A propósito NO entiende el formato del guardado: lee 3,5 MB, los
 * manda, recibe 3,5 MB y los escribe. Toda la lógica delicada —cifrado, checksums, BK4— vive en
 * la web, donde se puede probar de verdad.
 *
 * Sirve por HTTP:
 *   GET  /api/status  -> JSON con el estado
 *   GET  /api/save    -> el guardado
 *   PUT  /api/save    <- el guardado
 *   GET  /...         -> ficheros estaticos desde la SD (la propia web), si estan presentes
 */
#include <fat.h>
#include <gccore.h>
#include <malloc.h>
#include <ogc/isfs.h>
#include <ogc/lwp_watchdog.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <wiiuse/wpad.h>

#include "http.h"
#include "nand.h"
#include "screen.h"
#include "text.h"

#define AW_VERSION "0.1.2"
/* Raiz de los ficheros de la web en la SD. */
#define WEB_ROOT "sd:/apps/aniaplus/web"

/*
 * Margen de la consola.
 *
 * Tiene que descontarse del ancho y del alto, no solo del origen: si se le declara a la consola la
 * pantalla entera empezando en (24,24), su ultima fila cae fuera del framebuffer, y al desplazarse
 * escribe unos 25 KB por encima del monton. De ahi salian a la vez la pantalla corrupta y la
 * excepcion DSI al recargar la web, porque lo que hay detras del framebuffer es justo la memoria
 * que se reserva para servir ficheros.
 */
#define MARGIN 24

static void *xfb = NULL;
static GXRModeObj *rmode = NULL;

static u8 *save_buffer = NULL;
/* Copia de seguridad en memoria del guardado tal como estaba al arrancar. */
static u8 *original_buffer = NULL;
static bool has_original = false;

static u32 reads_served = 0;
static u32 writes_served = 0;
static s32 server_fd = -1;

/*
 * Salida ordenada.
 *
 * Las pulsa el usuario en cualquier momento, incluso desde dentro de una interrupcion, asi que lo
 * unico que hacen los callbacks es levantar una bandera: el trabajo de verdad (cerrar sockets,
 * avisar al cliente) se hace en el bucle principal, donde se puede hacer con calma. Marcadas
 * volatile porque las escribe una interrupcion y las lee el bucle.
 */
static volatile bool exit_requested = false;
static volatile bool poweroff_requested = false;

/* Boton de encendido de la consola. */
static void on_power_pressed(void)
{
	exit_requested = true;
	poweroff_requested = true;
}

/* Boton RESET de la consola: se vuelve al Homebrew Channel, no se apaga. */
static void on_reset_pressed(u32 irq, void *context)
{
	(void)irq;
	(void)context;
	exit_requested = true;
}

/* Boton de encendido del mando. */
static void on_wiimote_power(s32 channel)
{
	(void)channel;
	exit_requested = true;
	poweroff_requested = true;
}

/*
 * Sesion exclusiva sobre el guardado.
 *
 * El requisito no es "una peticion a la vez", sino "un dispositivo editando a la vez": mientras
 * alguien tiene el guardado abierto en ANIA+ y esta montando equipos, ningun otro movil debe
 * poder empezar a editarlo. Si no, los dos leen lo mismo, cada uno cambia lo suyo, y el segundo
 * en escribir se carga el trabajo del primero sin que nadie se entere.
 *
 * Editar son minutos sin hacer ninguna peticion, asi que no vale con mirar cuando fue la ultima:
 * el cliente toma la sesion explicitamente, la mantiene viva con un latido mientras la pestana
 * siga abierta, y la suelta al cerrar. El plazo solo existe para recuperarse de un cliente que
 * desaparece sin avisar (se queda sin bateria, se va de la wifi), no para el uso normal.
 *
 * El plazo es corto (45 s, con latido cada 15) porque el aviso de cierre es best-effort por
 * definicion: siempre habra cierres que se lo lleven por delante —matar la aplicacion, quedarse sin
 * bateria, salirse de la wifi— y en esos casos el siguiente dispositivo se come la espera entera
 * sin que nadie haya hecho nada mal. Menos margen para el cliente fantasma, y para el vivo no hay
 * riesgo: cualquier peticion suya cuenta como latido.
 */
#define SESSION_TIMEOUT_SECONDS 45

static char session_token[17] = "";
static u64 session_last_beat = 0;
static u32 session_ip = 0;

/* Segundos desde el arranque. */
static u64 now_seconds(void)
{
	return ticks_to_secs(gettime());
}

static bool session_is_live(void)
{
	if (session_token[0] == '\0')
		return false;
	return (now_seconds() - session_last_beat) <= SESSION_TIMEOUT_SECONDS;
}

/* Segundos desde el ultimo latido. La web lo usa para saber cuanto le queda a la sesion de otro. */
static u32 session_idle_seconds(void)
{
	if (session_token[0] == '\0')
		return 0;
	return (u32)(now_seconds() - session_last_beat);
}

static void session_clear(void)
{
	session_token[0] = '\0';
	session_ip = 0;
}

/* Token nuevo a partir del reloj y de la IP: no necesita ser impredecible, solo distinto. */
static void session_open(u32 client_ip)
{
	u64 seed = gettime() ^ ((u64)client_ip << 16);
	snprintf(session_token, sizeof(session_token), "%08lx%08lx",
		(unsigned long)(seed >> 32), (unsigned long)(seed & 0xffffffff));
	session_ip = client_ip;
	session_last_beat = now_seconds();
}

/* ¿Trae este cliente el token de la sesion viva? */
static bool session_token_matches(const http_request *request)
{
	if (!session_is_live())
		return false;
	return strcmp(request->session, session_token) == 0;
}

/*
 * Soltar la sesion cuando el navegador se esta cerrando.
 *
 * Ahi no vale el DELETE de siempre: `navigator.sendBeacon` es lo unico que el navegador garantiza
 * que sale aunque la pagina muera, y solo manda peticiones "simples" —POST, sin cabeceras
 * propias—. Con DELETE y X-Ania-Session el navegador manda antes un preflight OPTIONS, y desde una
 * web servida por otra maquina eso son dos viajes que terminar en el ultimo instante: casi nunca
 * llegan. Por eso el token viaja aqui en la ruta.
 */
#define RELEASE_PREFIX "/api/session/release/"

static const char *handle_release(s32 client, const char *path)
{
	const char *token = path + strlen(RELEASE_PREFIX);

	if (!session_is_live()) {
		http_send_status(client, 200, "OK", "no habia sesion");
		return aw_text(TXT_OUT_NO_SESSION_TO_RELEASE);
	}
	if (strcmp(token, session_token) != 0) {
		http_send_status(client, 409, "Conflict", "la sesion es de otro dispositivo");
		return aw_text(TXT_OUT_OTHER_DEVICE);
	}

	session_clear();
	http_send_status(client, 200, "OK", "sesion cerrada");
	return aw_text(TXT_OUT_SESSION_CLOSED_WEB);
}

static const char *handle_session(s32 client, const http_request *request, u32 client_ip)
{
	if (request->method == HTTP_POST) {
		if (session_is_live() && strcmp(request->session, session_token) != 0) {
			http_send_status(client, 409, "Conflict",
				"otro dispositivo esta editando el guardado");
			return aw_text(TXT_OUT_BUSY_OTHER);
		}
		bool opened = !session_is_live();
		if (opened)
			session_open(client_ip);
		else
			session_last_beat = now_seconds();

		char json[128];
		snprintf(json, sizeof(json), "{\"token\":\"%s\",\"timeout\":%d}",
			session_token, SESSION_TIMEOUT_SECONDS);
		http_send_json(client, json);
		return aw_text(opened ? TXT_OUT_SESSION_OPENED : TXT_OUT_HEARTBEAT);
	}

	if (request->method == HTTP_DELETE) {
		if (session_is_live() && strcmp(request->session, session_token) != 0) {
			http_send_status(client, 409, "Conflict", "la sesion es de otro dispositivo");
			return aw_text(TXT_OUT_OTHER_DEVICE);
		}
		session_clear();
		http_send_status(client, 200, "OK", "sesion cerrada");
		return aw_text(TXT_OUT_SESSION_CLOSED_CLIENT);
	}

	/*
	 * GET: consultar el estado sin tomarla. `idle` es lo que convierte el aviso de "ocupada" en
	 * algo accionable: sin el, el otro dispositivo solo puede esperar a ciegas sin saber si le
	 * quedan dos segundos o si el que la tiene se fue hace rato.
	 */
	char json[128];
	snprintf(json, sizeof(json), "{\"busy\":%s,\"mine\":%s,\"timeout\":%d,\"idle\":%lu}",
		session_is_live() ? "true" : "false",
		session_token_matches(request) ? "true" : "false",
		SESSION_TIMEOUT_SECONDS,
		(unsigned long)session_idle_seconds());
	http_send_json(client, json);
	return aw_text(session_is_live() ? TXT_OUT_QUERY_BUSY : TXT_OUT_QUERY_FREE);
}

/*
 * Tomar el relevo de una sesion que parece abandonada.
 *
 * Es lo mismo que hace el boton 2 del mando, pero desde donde esta el usuario. Solo se concede si
 * la sesion lleva un rato sin latir: mientras el otro dispositivo siga vivo, la sesion es suya y no
 * hay nada que discutir. El umbral es corto porque el latido va cada tercio del plazo: quince
 * segundos sin uno son ya dos latidos perdidos.
 */
#define TAKEOVER_IDLE_SECONDS 15

static const char *handle_takeover(s32 client, u32 client_ip)
{
	if (session_is_live() && session_idle_seconds() < TAKEOVER_IDLE_SECONDS) {
		http_send_status(client, 409, "Conflict", "el otro dispositivo sigue conectado");
		return aw_text(TXT_OUT_TAKEOVER_DENIED);
	}

	session_open(client_ip);
	char json[128];
	snprintf(json, sizeof(json), "{\"token\":\"%s\",\"timeout\":%d}",
		session_token, SESSION_TIMEOUT_SECONDS);
	http_send_json(client, json);
	return aw_text(TXT_OUT_TAKEOVER_OK);
}

static void video_init(void)
{
	VIDEO_Init();
	rmode = VIDEO_GetPreferredMode(NULL);
	xfb = MEM_K0_TO_K1(SYS_AllocateFramebuffer(rmode));
	/*
	 * El margen deja un marco que la consola no pinta nunca, y que en una Wii de verdad viene con
	 * la basura que hubiera antes en esa memoria: se ve como bandas verdes y rosas por los bordes.
	 * En Dolphin no se nota porque su memoria arranca a cero. Hay que negrear el buffer entero a
	 * mano; `console_init` solo se ocupa de su ventana.
	 */
	VIDEO_ClearFrameBuffer(rmode, xfb, COLOR_BLACK);
	console_init(xfb, MARGIN, MARGIN, rmode->fbWidth - 2 * MARGIN, rmode->xfbHeight - 2 * MARGIN,
		rmode->fbWidth * VI_DISPLAY_PIX_SZ);
	VIDEO_Configure(rmode);
	VIDEO_SetNextFramebuffer(xfb);
	VIDEO_SetBlack(false);
	VIDEO_Flush();
	VIDEO_WaitVSync();
	if (rmode->viTVMode & VI_NON_INTERLACE)
		VIDEO_WaitVSync();
}

static void banner(void)
{
	printf("\x1b[2J");
	printf("\x1b[1;1H");
	printf("=====================================\n");
	printf("  ANIA+  Asistente Wii  v" AW_VERSION "\n");
	printf("=====================================\n\n");
}

/* Reserva alineada a 32 bytes: ISFS y la red lo necesitan para el DMA. */
static u8 *alloc_save_buffer(void)
{
	return (u8 *)memalign(32, PBR_SAVE_SIZE);
}

/* Trozo con el que se sirven los ficheros de la SD, y tope de lo que se acepta servir. */
#define STATIC_CHUNK (8 * 1024)
#define STATIC_MAX_SIZE (16 * 1024 * 1024)

static u8 static_chunk[STATIC_CHUNK];

/*
 * Sirve un fichero de la SD. Devuelve NULL si no existe (y entonces manda el 404 quien llama), o
 * el resultado en texto para el registro de la pantalla.
 *
 * Se envia por trozos en vez de cargarlo entero: el fichero mas grande de la web pasa del
 * megabyte, y pedirlo y soltarlo en cada peticion es la reserva mas grande y mas frecuente que
 * hace el programa, justo la que peor sienta a un monton pequeño.
 */
static const char *serve_static(s32 client, const char *path)
{
	char full[512];
	static char detail[64];

	/*
	 * Sin ".." ni "\" en la ruta: no queremos que nadie se pasee por la SD, y en FAT la barra
	 * invertida separa igual que la normal.
	 */
	if (strstr(path, "..") != NULL || strchr(path, '\\') != NULL)
		return NULL;
	if (strlen(path) > sizeof(full) - sizeof(WEB_ROOT) - 1)
		return NULL;

	if (strcmp(path, "/") == 0)
		snprintf(full, sizeof(full), WEB_ROOT "/index.html");
	else
		snprintf(full, sizeof(full), WEB_ROOT "%s", path);

	FILE *file = fopen(full, "rb");
	if (file == NULL)
		return NULL;

	if (fseek(file, 0, SEEK_END) != 0) {
		fclose(file);
		http_send_status(client, 500, "Internal Server Error", "no se ha podido leer el fichero");
		return aw_text(TXT_OUT_SD_ERROR);
	}
	long size = ftell(file);
	rewind(file);

	if (size < 0 || size > STATIC_MAX_SIZE) {
		fclose(file);
		http_send_status(client, 500, "Internal Server Error", "el fichero no se puede servir");
		return aw_text(TXT_OUT_TOO_BIG);
	}

	/*
	 * Tipo de contenido segun la extension. Los navegadores adivinan el tipo de las imagenes,
	 * pero el manifiesto y el favicon no: sin su tipo correcto el icono no sale y el "anadir a
	 * pantalla de inicio" del movil no funciona.
	 */
	const char *type = "application/octet-stream";
	const char *dot = strrchr(full, '.');
	if (dot != NULL) {
		if (strcmp(dot, ".html") == 0) type = "text/html; charset=utf-8";
		else if (strcmp(dot, ".js") == 0) type = "text/javascript; charset=utf-8";
		else if (strcmp(dot, ".css") == 0) type = "text/css; charset=utf-8";
		else if (strcmp(dot, ".json") == 0) type = "application/json; charset=utf-8";
		else if (strcmp(dot, ".webmanifest") == 0) type = "application/manifest+json; charset=utf-8";
		else if (strcmp(dot, ".svg") == 0) type = "image/svg+xml";
		else if (strcmp(dot, ".png") == 0) type = "image/png";
		else if (strcmp(dot, ".ico") == 0) type = "image/x-icon";
		else if (strcmp(dot, ".webp") == 0) type = "image/webp";
	}

	http_send_headers(client, type, (u32)size);

	long done = 0;
	while (done < size) {
		size_t want = (size_t)(size - done);
		if (want > sizeof(static_chunk))
			want = sizeof(static_chunk);

		size_t got = fread(static_chunk, 1, want, file);
		if (got == 0)
			break; /* La cabecera ya prometio el tamaño: cortar aqui hace que el navegador reintente. */
		http_send_chunk(client, static_chunk, (u32)got);
		done += (long)got;
	}
	fclose(file);

	if (done != size) {
		snprintf(detail, sizeof(detail), aw_text(TXT_OUT_CUT), done, size);
		return detail;
	}
	snprintf(detail, sizeof(detail), aw_text(TXT_OUT_BYTES), size);
	return detail;
}

static const char *handle_status(s32 client)
{
	s32 size = nand_save_size();
	char json[320];
	snprintf(json, sizeof(json),
		"{\"app\":\"ANIA+ Asistente Wii\",\"version\":\"" AW_VERSION "\","
		"\"saveFound\":%s,\"saveSize\":%ld,\"expectedSize\":%d,"
		"\"reads\":%lu,\"writes\":%lu,\"backup\":%s,\"busy\":%s,\"idle\":%lu,"
		"\"dolphin\":%s,\"region\":\"%s\"}",
		size == PBR_SAVE_SIZE ? "true" : "false",
		(long)size, PBR_SAVE_SIZE,
		(unsigned long)reads_served, (unsigned long)writes_served,
		has_original ? "true" : "false",
		session_is_live() ? "true" : "false",
		(unsigned long)session_idle_seconds(),
		nand_is_dolphin() ? "true" : "false",
		nand_region_text());
	http_send_json(client, json);
	return aw_text(TXT_OUT_STATUS_SENT);
}

static const char *method_text(http_method method)
{
	switch (method) {
	case HTTP_GET:     return "GET";
	case HTTP_PUT:     return "PUT";
	case HTTP_POST:    return "POST";
	case HTTP_DELETE:  return "DELETE";
	case HTTP_OPTIONS: return "OPTIONS";
	default:           return "?";
	}
}

/* Texto de un fallo de la NAND para el registro, con la etapa y el codigo crudo de IOS. */
static const char *nand_failure_text(nand_result result)
{
	static char detail[96];
	snprintf(detail, sizeof(detail), "%s %s (IOS %ld)", nand_error_text(result),
		nand_stage_text(nand_last_stage()), (long)nand_last_ios_error());
	return detail;
}

/*
 * Las dos transferencias del guardado tardan segundos y durante ellas el asistente no atiende nada
 * mas: sin decir que han empezado, parece que se ha quedado colgado justo cuando mas importa. Cada
 * paso lento se anuncia antes de darlo, y la linea de resultado que imprime el bucle principal hace
 * de "terminado".
 */
static const char *handle_get_save(s32 client)
{
	screen_log("%s", aw_text(TXT_LOG_GET_SAVE));

	nand_result result = nand_read_save(save_buffer);
	if (result != NAND_OK) {
		http_send_status(client, 500, "Internal Server Error", nand_error_text(result));
		return nand_failure_text(result);
	}

	/* La primera lectura se guarda como copia de seguridad de la sesion. */
	bool first = false;
	if (!has_original && original_buffer != NULL) {
		memcpy(original_buffer, save_buffer, PBR_SAVE_SIZE);
		has_original = true;
		first = true;
	}

	screen_log("%s", aw_text(TXT_LOG_SENDING));
	reads_served++;
	http_send_binary(client, save_buffer, PBR_SAVE_SIZE);
	return aw_text(first ? TXT_OUT_SAVE_SENT_FIRST : TXT_OUT_SAVE_SENT);
}

static const char *handle_put_save(s32 client, u32 content_length)
{
	static char detail[64];

	if (content_length != PBR_SAVE_SIZE) {
		http_send_status(client, 400, "Bad Request", "el guardado no tiene el tamano correcto");
		snprintf(detail, sizeof(detail), aw_text(TXT_OUT_BAD_SIZE),
			(unsigned long)content_length, PBR_SAVE_SIZE);
		return detail;
	}

	screen_log("%s", aw_text(TXT_LOG_RECEIVING));

	s32 got = http_read_body(client, save_buffer, PBR_SAVE_SIZE);
	if (got != PBR_SAVE_SIZE) {
		http_send_status(client, 400, "Bad Request", "la transferencia se ha cortado");
		snprintf(detail, sizeof(detail), aw_text(TXT_OUT_INCOMPLETE), (long)got);
		return detail;
	}

	screen_log("%s", aw_text(TXT_LOG_WRITING_NAND));

	nand_result result = nand_write_save(save_buffer);
	if (result != NAND_OK) {
		http_send_status(client, 500, "Internal Server Error", nand_error_text(result));
		return nand_failure_text(result);
	}

	writes_served++;
	http_send_status(client, 200, "OK", "guardado escrito");
	return aw_text(TXT_OUT_SAVE_WRITTEN);
}

/*
 * Volver al cargador de homebrew tarda unos segundos en una Wii de verdad. Sin decir nada, la
 * consola parece colgada y da por pensar que la pulsacion no ha entrado. Se avisa y se deja un
 * fotograma para que el mensaje llegue a verse antes de empezar a cerrar.
 */
static void announce_exit(void)
{
	screen_log("%s", aw_text(TXT_EXITING));
	VIDEO_WaitVSync();
}

/*
 * Espera a que el usuario quiera salir, tras un error del que no se puede seguir.
 *
 * NUNCA hay que quedarse en un `while (1)` pelado: sin leer el mando ni mirar las banderas de
 * apagado, la consola se queda colgada y hay que apagarla a lo bruto manteniendo el boton de
 * encendido. Este es el unico sitio donde se espera "para siempre", y siempre con salida.
 */
static void wait_for_exit(void)
{
	printf("\n");
	aw_say(TXT_EXIT_PROMPT);
	while (!exit_requested) {
		WPAD_ScanPads();
		if (WPAD_ButtonsDown(0) & WPAD_BUTTON_HOME)
			break;
		VIDEO_WaitVSync();
	}
	/* Aqui se usa printf y no `screen_log`: se llega desde errores previos a pintar la cabecera. */
	printf("\n");
	aw_say(TXT_EXITING_CAPS);
	VIDEO_WaitVSync();
}

/* Espera a que se suelte y se vuelva a pulsar un boton, para pedir confirmacion sin librerias de UI. */
static u32 wait_for_button(void)
{
	while (WPAD_ButtonsDown(0) != 0) {
		WPAD_ScanPads();
		VIDEO_WaitVSync();
	}
	while (!exit_requested) {
		WPAD_ScanPads();
		u32 pressed = WPAD_ButtonsDown(0);
		if (pressed != 0)
			return pressed;
		VIDEO_WaitVSync();
	}
	/* Se ha pulsado el boton de encendido mientras se preguntaba: no hay nada que confirmar. */
	return 0;
}

/*
 * Que significa un codigo de ISFS, en cristiano.
 *
 * El -101 se cuenta como el -102 a proposito: IOS lo devuelve tambien cuando el proceso no tiene
 * derecho a esa rama de la NAND, y decir "error de lectura" manda a buscar donde no es. Antes se
 * quedaba sin explicacion y lo que salia era el numero pelado.
 */
static void explain_nand_error(s32 code)
{
	if (code == -102 || code == ISFS_EINVAL)
		aw_say(TXT_BOOT_DENIED,
			nand_access_mode() == NAND_ACCESS_NONE ? aw_text(TXT_BOOT_NO_ACCESS_SUFFIX) : "");
	else if (code == -106)
		aw_say(TXT_BOOT_NOT_EXIST,
			aw_text(nand_is_dolphin() ? TXT_BOOT_NOT_EXIST_DOLPHIN : TXT_BOOT_NOT_EXIST_WII));
}

/*
 * Con guardado de varias versiones, cual editar.
 *
 * Solo se pregunta al arrancar y solo si de verdad hay mas de una —lo normal es que no—, porque
 * cambiar de version mas tarde es cambiar de fichero: lo leido en memoria, la copia de seguridad y
 * lo que el movil tenga abierto pertenecen al guardado anterior. Decidirlo una vez, antes de que
 * nada de eso exista, evita todo ese lio.
 *
 * Como cualquier espera del programa, esta lee el mando y mira las banderas de apagado: si el
 * usuario quiere salir aqui, sale.
 */
static void choose_region(void)
{
	if (nand_region_count() < 2)
		return;

	aw_say(TXT_REGION_CHOOSE, nand_region_count());
	aw_say(TXT_REGION_CHOOSE_KEYS);

	/*
	 * Una sola linea que se reescribe. El `\r` mas `\x1b[K` es lo que ya usa la cabecera para
	 * repintar sin dejar restos de lo anterior; imprimir una linea por pulsacion llenaria la
	 * pantalla en cuanto alguien se entretenga con el mando.
	 */
	printf("  -> %s\x1b[K", nand_region_text());
	VIDEO_WaitVSync();

	while (!exit_requested) {
		WPAD_ScanPads();
		u32 pressed = WPAD_ButtonsDown(0);

		if (pressed & WPAD_BUTTON_A)
			break;
		/* HOME aqui es salir, como en todas partes; no vale de "aceptar". */
		if (pressed & WPAD_BUTTON_HOME) {
			exit_requested = true;
			break;
		}
		if (pressed & (WPAD_BUTTON_RIGHT | WPAD_BUTTON_LEFT | WPAD_BUTTON_PLUS | WPAD_BUTTON_MINUS)) {
			nand_next_region();
			printf("\r  -> %s\x1b[K", nand_region_text());
		}
		VIDEO_WaitVSync();
	}

	printf("\n");
	if (!exit_requested)
		aw_say(TXT_REGION_CHOSEN, nand_region_text());
}

/*
 * Configuracion de la red, con plazo y con salida.
 *
 * Esta es la lección que costo una consola apagada a lo bruto: *ninguna espera puede ocurrir fuera
 * de un bucle que lea el mando y mire `exit_requested`*. El plazo de los sockets ya lo cumplia,
 * pero la configuracion de la red se hacia con `if_config`, que bloquea hasta veinte intentos de
 * DHCP dentro de IOS. Sin cobertura, la consola se quedaba en "Conectando a la red..." sin
 * responder ni a HOME ni al boton de encendido —el callback levanta la bandera, pero no habia
 * nadie mirandola—.
 *
 * Devuelve el socket de escucha, o negativo si no ha podido (y entonces `exit_requested` dice si
 * fue porque el usuario quiso salir).
 */
#define NET_CONNECT_TIMEOUT_SECONDS 30

static s32 network_connect(void)
{
	if (http_net_begin() < 0) {
		aw_say(TXT_NET_START_FAIL, (long)http_net_error());
		return -1;
	}

	u64 start = now_seconds();
	u64 announced = 0;
	for (;;) {
		WPAD_ScanPads();
		if (WPAD_ButtonsDown(0) & WPAD_BUTTON_HOME)
			exit_requested = true;
		if (exit_requested)
			return -1;

		http_net_state state = http_net_poll();
		if (state == HTTP_NET_READY)
			break;
		if (state == HTTP_NET_FAILED) {
			aw_say(TXT_NET_CONFIG_FAIL, (long)http_net_error());
			return -1;
		}

		u64 waited = now_seconds() - start;
		if (waited >= NET_CONNECT_TIMEOUT_SECONDS) {
			aw_say(TXT_NET_TIMEOUT, NET_CONNECT_TIMEOUT_SECONDS);
			return -1;
		}
		/* Una nota cada cinco segundos: suficiente para que se vea que sigue vivo, sin llenar nada. */
		if (waited >= announced + 5) {
			announced = waited;
			aw_say(TXT_NET_WAITING, (unsigned long)waited);
		}
		VIDEO_WaitVSync();
	}

	return http_listen(AW_PORT);
}

/* La red se ha ido con el asistente ya en marcha: se cierra la escucha y se deja de anunciarla. */
static void network_lost(screen_info *info)
{
	if (server_fd >= 0) {
		http_close(server_fd);
		server_fd = -1;
	}
	info->net_lost = true;
	screen_log("%s", aw_text(TXT_NET_LOST));
	screen_update(info);
}

/*
 * Un intento de volver. No bloquea: si todavia no hay IP se relanza la configuracion y se deja para
 * la siguiente vuelta, que el bucle principal tiene que seguir atendiendo el mando mientras tanto.
 */
static bool network_retry(screen_info *info, char *previous_ip, size_t size)
{
	if (!http_net_alive()) {
		http_net_begin();
		return false;
	}

	s32 server = http_listen(AW_PORT);
	if (server < 0)
		return false;

	server_fd = server;
	info->net_lost = false;
	if (strcmp(previous_ip, http_local_ip()) != 0) {
		/*
		 * La IP nueva no le llega sola a nadie: la web del movil sigue apuntando a la vieja y lo
		 * unico que vera es que deja de responder.
		 */
		screen_log("%s", aw_text(TXT_NET_IP_CHANGED));
		snprintf(previous_ip, size, "%s", http_local_ip());
	}
	screen_log(aw_text(TXT_NET_BACK), http_local_ip(), AW_PORT);
	screen_update(info);
	return true;
}

/*
 * Avisa al dispositivo que tiene la sesion de que el asistente se apaga, para que el navegador
 * no se quede esperando una respuesta que no va a llegar. Best-effort: si nadie esta escuchando
 * en este instante, no pasa nada, el cliente lo notara igualmente por el fallo de conexion.
 */
static void notify_shutdown(void)
{
	if (server_fd < 0)
		return;
	screen_log("%s", aw_text(TXT_LOG_NOTIFY_CLIENT));
	http_request request;
	s32 client = http_accept(server_fd, &request, 500);
	if (client >= 0) {
		http_send_status(client, 503, "Service Unavailable", "el asistente Wii se esta cerrando");
		http_close(client);
	}
}

/* Restaura la copia de seguridad de la sesion. Se ofrece con el boton 1 del mando. */
static void restore_backup(void)
{
	if (!has_original) {
		screen_log("%s", aw_text(TXT_LOG_NO_BACKUP_YET));
		return;
	}
	screen_log("%s", aw_text(TXT_LOG_RESTORING));
	nand_result result = nand_write_save(original_buffer);
	screen_log("%s", result == NAND_OK ? aw_text(TXT_LOG_RESTORED) : nand_failure_text(result));
}

int main(void)
{
	video_init();

	/*
	 * El idioma, antes del primer mensaje, para que no haya ni una linea en el idioma que no toca.
	 * Sale del de la consola (`CONF_GetLanguage`), que se lee a RAM de una vez: la recarga de IOS
	 * que viene despues no lo invalida. La SD todavia no esta montada, asi que la eleccion manual
	 * guardada se relee mas abajo, tras `fatInitDefault`.
	 */
	aw_text_init();
	banner();

	/*
	 * La recarga de IOS va ANTES que nada que dependa de IOS: desmonta la SD y tira la pila
	 * Bluetooth, asi que hacerla despues de fatInitDefault o de WPAD_Init dejaria la tarjeta sin
	 * montar y el mando sin responder. El video no le afecta, porque es cosa del PPC, y por eso se
	 * puede seguir informando por pantalla.
	 */
	aw_say(TXT_BOOT_FIND_IOS);
	s32 ios = nand_prepare_ios();
	if (nand_is_dolphin()) {
		aw_say(TXT_BOOT_DOLPHIN);
	} else {
		aw_say(TXT_BOOT_IOS_LINE, (long)ios, (long)IOS_GetRevision(), nand_access_label());
		if (nand_access_mode() == NAND_ACCESS_NONE)
			aw_say(TXT_BOOT_NO_ACCESS_WARN);
	}

	WPAD_Init();

	/*
	 * Botones de apagado y reinicio. Sin esto la consola ignora por completo su propio boton de
	 * encendido mientras el asistente esta abierto, y hay que apagarla a lo bruto.
	 */
	SYS_SetPowerCallback(on_power_pressed);
	SYS_SetResetCallback(on_reset_pressed);
	WPAD_SetPowerButtonCallback(on_wiimote_power);

	fatInitDefault();
	/* Ahora si hay SD: si habia un idioma elegido a mano, manda ese. */
	aw_text_init();

	aw_say(TXT_BOOT_NAND_PREP);
	nand_result nand = nand_init();
	if (nand != NAND_OK) {
		aw_say(TXT_BOOT_NAND_ERROR, nand_error_text(nand), (long)nand_last_ios_error());
		explain_nand_error(nand_last_ios_error());
		if (nand_access_mode() == NAND_ACCESS_NONE)
			aw_say(TXT_BOOT_NO_ACCESS_CAUSE);
		aw_say(TXT_BOOT_NO_SAVE_STOP);
		wait_for_exit();
		goto cleanup;
	}

	choose_region();
	/* Si el usuario ha salido desde ahi, no tiene sentido seguir levantando la red. */
	if (exit_requested)
		goto cleanup;

	/*
	 * Sin guardado que servir no se sigue adelante.
	 *
	 * Antes esto era solo un aviso y el asistente acababa anunciando una direccion igualmente: una
	 * web que se conecta, pide el guardado y recibe un error. Mas vale pararse aqui, con el motivo
	 * en pantalla, que dar por bueno un arranque que no puede hacer nada.
	 */
	s32 size = nand_save_size();
	if (size != PBR_SAVE_SIZE) {
		if (size < 0) {
			aw_say(TXT_BOOT_STAGE_FAIL, nand_stage_text(nand_last_stage()), (long)size);
			explain_nand_error(size);
		} else {
			aw_say(TXT_BOOT_SIZE_WARN, (long)size, PBR_SAVE_SIZE);
		}
		aw_say(TXT_BOOT_NO_SAVE_STOP);
		wait_for_exit();
		goto cleanup;
	}
	aw_say(TXT_BOOT_SAVE_FOUND, nand_region_text(), PBR_SAVE_SIZE);

	save_buffer = alloc_save_buffer();
	original_buffer = alloc_save_buffer();
	if (save_buffer == NULL) {
		printf("\n");
		aw_say(TXT_BOOT_NO_MEMORY);
		wait_for_exit();
		goto cleanup;
	}
	if (original_buffer == NULL)
		aw_say(TXT_BOOT_NO_BACKUP_MEMORY);

	printf("\n");
	aw_say(TXT_NET_CONNECTING);
	s32 server;
	for (;;) {
		server = network_connect();
		if (server >= 0)
			break;
		if (exit_requested)
			goto cleanup;
		/*
		 * Antes, un fallo de red obligaba a volver al cargador para probar otra vez. Ofrecer el
		 * reintento aqui cuesta cuatro lineas y ahorra el viaje entero: lo normal es que el
		 * problema sea el router todavia arrancando o la wifi apagada.
		 */
		printf("\n");
		aw_say(TXT_NET_ERROR);
		aw_say(TXT_NET_CHECK);
		printf("\n");
		aw_say(TXT_NET_RETRY_PROMPT);
		if (!(wait_for_button() & WPAD_BUTTON_A)) {
			printf("\n");
			aw_say(TXT_EXITING_CAPS);
			VIDEO_WaitVSync();
			goto cleanup;
		}
		printf("\n");
		aw_say(TXT_NET_RETRYING);
	}
	server_fd = server;

	/*
	 * A partir de aqui manda la pantalla con cabecera fija: lo importante (direccion, estado,
	 * teclas) deja de irse por arriba en cuanto llegan cuatro peticiones.
	 */
	screen_info info = {
		.version = AW_VERSION,
		.ios = ios,
		.ios_revision = IOS_GetRevision(),
		.access = nand_access_label(),
		.dolphin = nand_is_dolphin(),
		.region = nand_region_text(),
		.ip = http_local_ip(),
		.port = AW_PORT,
		.save_size = size,
		.reads = 0,
		.writes = 0,
		.backup = false,
		.session = false,
		.net_lost = false,
		.silent = 0,
	};
	screen_begin(&info);
	/*
	 * Primero la copia publicada en GitHub Pages, que es la via buena: siempre esta al dia y solo
	 * necesita que le digan la IP de la consola. Se dice aqui y no solo en el README porque en este
	 * momento el usuario esta mirando a la tele.
	 */
	screen_log(aw_text(TXT_LOG_READY), http_local_ip());
	/*
	 * Y detras la que sirve la propia consola, para la casa sin internet pero con red local: la web
	 * que lleva dentro el .dol es la de su version, no la ultima, pero funciona sin salir fuera.
	 */
	screen_log(aw_text(TXT_LOG_READY_LOCAL), http_local_ip(), AW_PORT);

	/*
	 * Estado del modo de recuperacion. La espera entre intentos crece (2, 4, 8... hasta 30 s) para
	 * no freir la pila de red de IOS mientras el router vuelve a arrancar.
	 */
	u32 retry_delay = 2;
	u64 next_retry = 0;
	u64 last_net_check = 0;
	u32 accept_errors = 0;
	u32 silent_clients = 0;
	char last_ip[16];
	snprintf(last_ip, sizeof(last_ip), "%s", http_local_ip());

	while (!exit_requested) {
		WPAD_ScanPads();
		u32 pressed = WPAD_ButtonsDown(0);
		if (pressed & WPAD_BUTTON_HOME) {
			/*
			 * Salir sin avisar no corrompe el guardado (una PUT en curso siempre termina de
			 * escribirse antes de volver aqui, porque el bucle es secuencial), pero si hay una
			 * sesion de edicion viva se pierde sin que el otro lado se entere hasta que le falla
			 * el latido. Se pide confirmacion, y si el usuario sigue adelante, se avisa al
			 * navegador antes de cerrar.
			 */
			if (session_is_live()) {
				screen_log("%s", aw_text(TXT_LOG_SESSION_ALIVE));
				screen_log("%s", aw_text(TXT_LOG_HOME_AGAIN));
				u32 confirm = wait_for_button();
				if (confirm & WPAD_BUTTON_HOME) {
					notify_shutdown();
					break;
				}
				screen_log("%s", aw_text(TXT_LOG_CANCELLED));
				continue;
			}
			break;
		}
		if (pressed & (WPAD_BUTTON_1 | WPAD_BUTTON_2 | WPAD_BUTTON_MINUS)) {
			if (pressed & WPAD_BUTTON_1)
				restore_backup();
			if (pressed & WPAD_BUTTON_2) {
				session_clear();
				screen_log("%s", aw_text(TXT_LOG_SESSION_RELEASED));
			}
			if (pressed & WPAD_BUTTON_MINUS) {
				/*
				 * La cabecera se repinta ya traducida (lo hace `screen_update` de aqui abajo); el
				 * registro no se retraduce, porque lo que ya paso paso en el idioma que hubiera.
				 */
				aw_lang chosen = aw_next_lang();
				screen_log(aw_text(TXT_LOG_LANGUAGE), aw_lang_name(chosen));
			}
			info.backup = has_original;
			info.session = session_is_live();
			screen_update(&info);
		}

		u64 now = now_seconds();

		if (info.net_lost) {
			/*
			 * El reloj de la sesion no corre mientras no hay red: el cliente no tiene la culpa del
			 * corte, y sin esto un minuto de wifi caida le quitaria la sesion a alguien que sigue
			 * ahi con el guardado abierto.
			 */
			if (session_token[0] != '\0')
				session_last_beat = now;

			if (now >= next_retry) {
				next_retry = now + retry_delay;
				if (retry_delay < 30)
					retry_delay *= 2;
				if (network_retry(&info, last_ip, sizeof(last_ip))) {
					server = server_fd;
					retry_delay = 2;
					accept_errors = 0;
				}
			}
			VIDEO_WaitVSync();
			continue;
		}

		/* Una comprobacion por segundo: preguntar por la IP en cada fotograma es tirar tiempo. */
		if (now != last_net_check) {
			last_net_check = now;
			if (!http_net_alive()) {
				network_lost(&info);
				next_retry = now + 2;
				retry_delay = 2;
				continue;
			}
		}

		http_request request;
		/* 100 ms: suficiente para que los botones respondan sin consumir CPU en vacio. */
		s32 client = http_accept(server, &request, 100);
		if (client < 0) {
			if (client == HTTP_SILENT_CLIENT) {
				/*
				 * Conexion abierta y cerrada sin hablar: el navegador se adelanta a peticiones que
				 * puede que no llegue a hacer. No es un error, pero se cuenta, porque es lo unico
				 * que distingue "no llego nada" de "llego algo que no supe leer".
				 */
				silent_clients++;
				info.silent = silent_clients;
				screen_update(&info);
			} else if (client != HTTP_NO_CLIENT) {
				/*
				 * Un error de verdad en la escucha. Uno suelto no significa nada; varios seguidos
				 * son la otra cara de la caida de red, la que no se ve mirando la IP.
				 */
				if (++accept_errors >= 5) {
					accept_errors = 0;
					network_lost(&info);
					next_retry = now_seconds() + 2;
					retry_delay = 2;
				}
			}
			VIDEO_WaitVSync();
			continue;
		}
		accept_errors = 0;

		/*
		 * Una linea por peticion, con su resultado: los manejadores devuelven el texto en vez de
		 * imprimir cada uno lo suyo. Tres o cuatro lineas por peticion llenaban el registro en una
		 * sola carga de la web y no dejaban ver nada.
		 */
		const char *outcome;

		if (request.method == HTTP_OPTIONS) {
			/* Respuesta al preflight de CORS. */
			http_send_status(client, 204, "No Content", NULL);
			outcome = aw_text(TXT_OUT_PREFLIGHT);
		} else if (strcmp(request.path, "/api/status") == 0) {
			outcome = handle_status(client);
		} else if (strcmp(request.path, "/api/session") == 0) {
			outcome = handle_session(client, &request, http_client_ip());
		} else if (request.method == HTTP_POST &&
			   strcmp(request.path, "/api/session/takeover") == 0) {
			outcome = handle_takeover(client, http_client_ip());
		} else if (request.method == HTTP_POST &&
			   strncmp(request.path, RELEASE_PREFIX, strlen(RELEASE_PREFIX)) == 0) {
			outcome = handle_release(client, request.path);
		} else if (strcmp(request.path, "/api/save") == 0) {
			/*
			 * Sin el token de la sesion viva no se toca el guardado. Es lo que impide que un
			 * segundo dispositivo se ponga a editar mientras el primero tiene la pestana abierta.
			 */
			if (!session_token_matches(&request)) {
				http_send_status(client, 409, "Conflict",
					session_is_live()
						? "otro dispositivo esta editando el guardado"
						: "abre una sesion antes de tocar el guardado");
				outcome = aw_text(session_is_live()
					? TXT_OUT_REJECTED_OTHER
					: TXT_OUT_REJECTED_NO_SESSION);
			} else {
				/* Cualquier acceso valido cuenta como latido. */
				session_last_beat = now_seconds();
				if (request.method == HTTP_GET)
					outcome = handle_get_save(client);
				else if (request.method == HTTP_PUT)
					outcome = handle_put_save(client, request.content_length);
				else {
					http_send_status(client, 405, "Method Not Allowed", "solo GET y PUT");
					outcome = aw_text(TXT_OUT_METHOD_NOT_ALLOWED);
				}
			}
		} else if (request.method == HTTP_GET &&
			   (outcome = serve_static(client, request.path)) != NULL) {
			/* servido desde la SD */
		} else {
			http_send_status(client, 404, "Not Found", "no existe");
			outcome = aw_text(TXT_OUT_NOT_FOUND);
		}

		http_close(client);

		screen_log("%s %s -> %s", method_text(request.method), request.path, outcome);

		info.reads = reads_served;
		info.writes = writes_served;
		info.backup = has_original;
		info.session = session_is_live();
		screen_update(&info);
	}

	announce_exit();

	/*
	 * Si se sale por el boton de encendido, el cliente que estuviera editando merece enterarse
	 * igual que cuando se sale con HOME.
	 */
	if (exit_requested && session_is_live())
		notify_shutdown();

	if (server_fd >= 0)
		http_close(server_fd);

cleanup:
	server_fd = -1;
	free(save_buffer);
	free(original_buffer);

	if (poweroff_requested) {
		printf("\n");
		aw_say(TXT_POWERING_OFF);
		SYS_ResetSystem(SYS_POWEROFF, 0, 0);
	}
	return 0;
}
