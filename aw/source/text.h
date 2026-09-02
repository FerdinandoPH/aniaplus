/*
 * Textos del asistente, en varios idiomas.
 *
 * Dos decisiones que conviene tener presentes al añadir un mensaje:
 *
 *  1. **Sin acentos ni eñes.** La consola de libogc pinta con una fuente de 8x16 que no los tiene,
 *     y el fuente es UTF-8, asi que una "o con tilde" saldria como dos glifos raros. El castellano
 *     ya esta escrito asi ("Direccion", "senal") y las traducciones siguen la regla: el aleman usa
 *     ae/oe/ue/ss. Por lo mismo no hay japones: sin kana en la fuente, saldrian cuadros. En una Wii
 *     japonesa el asistente habla ingles.
 *  2. **Los %s y los %ld van en el mismo orden en todos los idiomas.** Es la trampa clasica de una
 *     tabla de cadenas: cambiar el orden no da error al compilar, da una excepcion en la consola.
 *     `tests/test_text.c` lo comprueba idioma por idioma.
 *
 * Esto traduce lo que se ve en la tele. Los cuerpos de las respuestas HTTP se quedan como estan:
 * los lee la web, que tiene sus propios textos y su propio idioma.
 */
#ifndef ANIA_TEXT_H
#define ANIA_TEXT_H

typedef enum {
	AW_LANG_ES = 0,
	AW_LANG_EN,
	AW_LANG_DE,
	AW_LANG_FR,
	AW_LANG_IT,
	AW_LANG_COUNT,
} aw_lang;

typedef enum {
	/* Cabecera */
	TXT_APP_SUBTITLE,
	TXT_HDR_ADDRESS,
	TXT_HDR_NO_NET,
	TXT_HDR_NO_NET_YET,
	TXT_HDR_SAVE,
	TXT_HDR_SAVE_LINE,
	TXT_HDR_SAVE_UNAVAILABLE,
	TXT_HDR_ACTIVITY,
	TXT_HDR_ACTIVITY_LINE,
	TXT_HDR_KEYS,
	TXT_YES,
	TXT_NOT_YET,
	TXT_SESSION_OPEN,
	TXT_SESSION_FREE,

	/* Arranque */
	TXT_BOOT_FIND_IOS,
	TXT_BOOT_DOLPHIN,
	TXT_BOOT_IOS_LINE,
	TXT_BOOT_NO_ACCESS_WARN,
	TXT_BOOT_NAND_PREP,
	TXT_BOOT_NAND_ERROR,
	TXT_BOOT_NO_ACCESS_CAUSE,
	TXT_BOOT_SAVE_FOUND,
	TXT_BOOT_STAGE_FAIL,
	TXT_BOOT_DENIED,
	TXT_BOOT_NO_ACCESS_SUFFIX,
	TXT_BOOT_NOT_EXIST,
	TXT_BOOT_NOT_EXIST_DOLPHIN,
	TXT_BOOT_NOT_EXIST_WII,
	TXT_BOOT_SIZE_WARN,
	TXT_BOOT_NO_SAVE_STOP,
	TXT_BOOT_NO_MEMORY,
	TXT_BOOT_NO_BACKUP_MEMORY,

	/* Red */
	TXT_NET_CONNECTING,
	TXT_NET_START_FAIL,
	TXT_NET_CONFIG_FAIL,
	TXT_NET_TIMEOUT,
	TXT_NET_WAITING,
	TXT_NET_ERROR,
	TXT_NET_CHECK,
	TXT_NET_RETRY_PROMPT,
	TXT_NET_RETRYING,
	TXT_NET_LOST,
	TXT_NET_IP_CHANGED,
	TXT_NET_BACK,

	/* Salida */
	TXT_EXIT_PROMPT,
	TXT_EXITING_CAPS,
	TXT_EXITING,
	TXT_POWERING_OFF,

	/* Registro */
	TXT_LOG_READY,
	TXT_LOG_READY_LOCAL,
	TXT_LOG_NOTIFY_CLIENT,
	TXT_LOG_NO_BACKUP_YET,
	TXT_LOG_RESTORING,
	TXT_LOG_RESTORED,
	TXT_LOG_SESSION_ALIVE,
	TXT_LOG_HOME_AGAIN,
	TXT_LOG_CANCELLED,
	TXT_LOG_SESSION_RELEASED,
	TXT_LOG_LANGUAGE,
	TXT_LOG_GET_SAVE,
	TXT_LOG_SENDING,
	TXT_LOG_RECEIVING,
	TXT_LOG_WRITING_NAND,

	/* Resultado de cada peticion */
	TXT_OUT_PREFLIGHT,
	TXT_OUT_STATUS_SENT,
	TXT_OUT_SESSION_OPENED,
	TXT_OUT_HEARTBEAT,
	TXT_OUT_BUSY_OTHER,
	TXT_OUT_OTHER_DEVICE,
	TXT_OUT_SESSION_CLOSED_CLIENT,
	TXT_OUT_QUERY_BUSY,
	TXT_OUT_QUERY_FREE,
	TXT_OUT_NO_SESSION_TO_RELEASE,
	TXT_OUT_SESSION_CLOSED_WEB,
	TXT_OUT_TAKEOVER_DENIED,
	TXT_OUT_TAKEOVER_OK,
	TXT_OUT_REJECTED_OTHER,
	TXT_OUT_REJECTED_NO_SESSION,
	TXT_OUT_METHOD_NOT_ALLOWED,
	TXT_OUT_NOT_FOUND,
	TXT_OUT_SAVE_SENT,
	TXT_OUT_SAVE_SENT_FIRST,
	TXT_OUT_SAVE_WRITTEN,
	TXT_OUT_BAD_SIZE,
	TXT_OUT_INCOMPLETE,
	TXT_OUT_SD_ERROR,
	TXT_OUT_TOO_BIG,
	TXT_OUT_CUT,
	TXT_OUT_BYTES,

	/* NAND y red */
	TXT_NAND_OK,
	TXT_NAND_ERR_INIT,
	TXT_NAND_ERR_PERMISSION,
	TXT_NAND_ERR_NOT_FOUND,
	TXT_NAND_ERR_SIZE,
	TXT_NAND_ERR_IO,
	TXT_NAND_ERR_MEMORY,
	TXT_NAND_ERR_UNKNOWN,
	TXT_NAND_STAGE_OPEN,
	TXT_NAND_STAGE_STATS,
	TXT_NAND_STAGE_READ,
	TXT_NAND_STAGE_WRITE,
	TXT_NAND_TRY_AHBPROT,
	TXT_NAND_AHBPROT_OK,
	TXT_NAND_AHBPROT_FAIL,
	TXT_NAND_TRY_CIOS,
	TXT_NAND_SETUID_WARN,
	TXT_NAND_SAVE_FOUND,
	TXT_NAND_CANNOT_OPEN,
	TXT_NAND_NO_PBR,
	TXT_REGION_CHOOSE,
	TXT_REGION_CHOOSE_KEYS,
	TXT_REGION_CHOSEN,
	TXT_NET_SOCKET_FAIL,
	TXT_NET_BIND_FAIL,
	TXT_NET_LISTEN_FAIL,

	TXT_COUNT,
} aw_text_id;

/* El texto en el idioma activo. Nunca devuelve NULL. */
const char *aw_text(aw_text_id id);

/*
 * Escribe un mensaje de la tabla, con sus argumentos y su salto de linea.
 *
 * Existe porque la cadena viene de la tabla y no de un literal: el "\n" no se puede pegar al final
 * como se hacia antes, y separarlo en un `putchar` suelto es justo como se cuela un salto de linea
 * dentro de un `if` sin llaves. Aqui va todo junto y no hay forma de equivocarse.
 */
void aw_say(aw_text_id id, ...);

/* Nombre del idioma, en su propio idioma ("Espanol", "English"...). */
const char *aw_lang_name(aw_lang lang);

aw_lang aw_get_lang(void);
void aw_set_lang(aw_lang lang);

/*
 * Idioma inicial: el de la propia consola (`CONF_GetLanguage`), o el que se guardara la ultima vez
 * en la SD. Japones, coreano, chino y holandes caen a ingles, que es lo unico que esta fuente sabe
 * pintar.
 */
void aw_text_init(void);

/* Pasa al siguiente idioma y lo recuerda en la SD. Devuelve el que queda activo. */
aw_lang aw_next_lang(void);

/* Solo para las pruebas nativas: la tabla cruda, para comparar formatos entre idiomas. */
const char *aw_text_of(aw_lang lang, aw_text_id id);

#endif
