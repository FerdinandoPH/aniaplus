#include "text.h"

#include <stdarg.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

#ifndef AW_TEXT_NATIVE_TEST
#include <ogc/conf.h>
#endif

/* Donde se recuerda el idioma elegido a mano. Tres bytes; si no se puede escribir, no pasa nada. */
#define LANG_FILE "sd:/apps/aniaplus/lang.txt"

static aw_lang current = AW_LANG_ES;

/*
 * Las tablas van con inicializadores designados a proposito: asi el orden del enum y el de las
 * cadenas no pueden desincronizarse en silencio al insertar un mensaje por el medio.
 */
static const char *const ES[TXT_COUNT] = {
	[TXT_APP_SUBTITLE] = "Asistente Wii",
	[TXT_HDR_ADDRESS] = "Direccion",
	[TXT_HDR_NO_NET] = "sin red - reintentando...",
	[TXT_HDR_NO_NET_YET] = "(todavia sin red)",
	[TXT_HDR_SAVE] = "Guardado",
	[TXT_HDR_SAVE_LINE] = "%ld bytes   copia de seguridad: %s",
	[TXT_HDR_SAVE_UNAVAILABLE] = "no disponible (error %ld)",
	[TXT_HDR_ACTIVITY] = "Actividad",
	[TXT_HDR_ACTIVITY_LINE] = "%lu lecturas, %lu escrituras   sesion: %s   mudas: %lu",
	[TXT_HDR_KEYS] = "1 restaurar   2 liberar sesion   - idioma   HOME salir",
	[TXT_YES] = "si",
	[TXT_NOT_YET] = "aun no",
	[TXT_SESSION_OPEN] = "abierta",
	[TXT_SESSION_FREE] = "libre",

	[TXT_BOOT_FIND_IOS] = "Buscando un IOS con acceso a la NAND...",
	[TXT_BOOT_DOLPHIN] = "  Dolphin: se usa su IOS emulado, sin recargar nada",
	[TXT_BOOT_IOS_LINE] = "  IOS %ld v%ld%s",
	[TXT_BOOT_NO_ACCESS_WARN] = "  aviso: sin AHBPROT ni cIOS; es probable que la NAND deniegue el acceso",
	[TXT_BOOT_NAND_PREP] = "Preparando el acceso a la NAND...",
	[TXT_BOOT_NAND_ERROR] = "  ERROR: %s (IOS %ld)",
	[TXT_BOOT_NO_ACCESS_CAUSE] = "  lanza el asistente desde el Homebrew Channel, o instala un cIOS (249/250).",
	[TXT_BOOT_SAVE_FOUND] = "  guardado de PBR encontrado: version %s (%d bytes)",
	[TXT_BOOT_STAGE_FAIL] = "  aviso: fallo %s (codigo %ld)",
	[TXT_BOOT_DENIED] = "  la NAND deniega el acceso%s",
	[TXT_BOOT_NO_ACCESS_SUFFIX] = "; no se pudo parchear el IOS y no hay cIOS (249/250)",
	[TXT_BOOT_NOT_EXIST] = "  no existe: %s\n  (probadas las tres versiones: PAL, USA y JAP)",
	[TXT_BOOT_NOT_EXIST_DOLPHIN] = "no hay guardado de PBR en la NAND de Dolphin",
	[TXT_BOOT_NOT_EXIST_WII] = "se ha jugado alguna vez a PBR en esta consola?",
	[TXT_BOOT_SIZE_WARN] = "  aviso: el guardado mide %ld bytes, se esperaban %d",
	[TXT_BOOT_NO_MEMORY] = "  ERROR: no hay memoria para el guardado",
	[TXT_BOOT_NO_BACKUP_MEMORY] = "  aviso: sin memoria para la copia de seguridad en memoria",

	[TXT_NET_CONNECTING] = "Conectando a la red...",
	[TXT_NET_START_FAIL] = "  no se ha podido arrancar la red (%ld)",
	[TXT_NET_CONFIG_FAIL] = "  la configuracion de red ha fallado (%ld)",
	[TXT_NET_TIMEOUT] = "  sin respuesta tras %d segundos",
	[TXT_NET_WAITING] = "  esperando a la red... (%lu s)",
	[TXT_NET_ERROR] = "  ERROR: no hay red, o no se ha podido levantar el servidor.",
	[TXT_NET_CHECK] = "  Comprueba que la consola tiene una conexion configurada y con cobertura.",
	[TXT_NET_RETRY_PROMPT] = "  Pulsa A para reintentar, HOME o el boton de encendido para salir.",
	[TXT_NET_RETRYING] = "Reintentando...",
	[TXT_NET_LOST] = "sin red: se ha perdido la conexion, reintentando",
	[TXT_NET_IP_CHANGED] = "ATENCION: la direccion ha cambiado, hay que reconectar la web",
	[TXT_NET_BACK] = "red recuperada: http://%s:%d/",

	[TXT_EXIT_PROMPT] = "Pulsa HOME o el boton de encendido para salir.",
	[TXT_EXITING_CAPS] = "Saliendo...",
	[TXT_EXITING] = "saliendo...",
	[TXT_POWERING_OFF] = "Apagando...",

	[TXT_LOG_READY] = "listo: abre https://ferdinandoph.github.io/aniaplus/ y escribe %s",
	[TXT_LOG_READY_LOCAL] = "  sin internet, pero con red local: abre http://%s:%d/",
	[TXT_LOG_NOTIFY_CLIENT] = "avisando al dispositivo conectado...",
	[TXT_LOG_NO_BACKUP_YET] = "todavia no hay copia de seguridad: lee el guardado primero",
	[TXT_LOG_RESTORING] = "restaurando el guardado original...",
	[TXT_LOG_RESTORED] = "restaurado",
	[TXT_LOG_SESSION_ALIVE] = "hay una sesion de edicion abierta.",
	[TXT_LOG_HOME_AGAIN] = "HOME otra vez para salir igualmente; otro boton para seguir.",
	[TXT_LOG_CANCELLED] = "cancelado, sigo en marcha",
	[TXT_LOG_SESSION_RELEASED] = "sesion liberada: ya puede conectarse otro dispositivo",
	[TXT_LOG_LANGUAGE] = "idioma: %s",
	[TXT_LOG_GET_SAVE] = "-> el dispositivo pide el guardado: leyendo la NAND...",
	[TXT_LOG_SENDING] = "   enviando 3,5 MB al dispositivo, espera...",
	[TXT_LOG_RECEIVING] = "<- el dispositivo manda un guardado: recibiendo 3,5 MB...",
	[TXT_LOG_WRITING_NAND] = "   escribiendo en la NAND: no apagues la consola",

	[TXT_OUT_PREFLIGHT] = "preflight",
	[TXT_OUT_STATUS_SENT] = "estado enviado",
	[TXT_OUT_SESSION_OPENED] = "sesion abierta",
	[TXT_OUT_HEARTBEAT] = "latido",
	[TXT_OUT_BUSY_OTHER] = "ocupada por otro dispositivo",
	[TXT_OUT_OTHER_DEVICE] = "es de otro dispositivo",
	[TXT_OUT_SESSION_CLOSED_CLIENT] = "sesion cerrada por el cliente",
	[TXT_OUT_QUERY_BUSY] = "consulta: ocupada",
	[TXT_OUT_QUERY_FREE] = "consulta: libre",
	[TXT_OUT_NO_SESSION_TO_RELEASE] = "sin sesion que soltar",
	[TXT_OUT_SESSION_CLOSED_WEB] = "sesion cerrada al cerrarse la web",
	[TXT_OUT_TAKEOVER_DENIED] = "relevo denegado: la sesion sigue viva",
	[TXT_OUT_TAKEOVER_OK] = "sesion tomada por otro dispositivo",
	[TXT_OUT_REJECTED_OTHER] = "rechazado: otro dispositivo tiene la sesion",
	[TXT_OUT_REJECTED_NO_SESSION] = "rechazado: sin sesion abierta",
	[TXT_OUT_METHOD_NOT_ALLOWED] = "metodo no permitido",
	[TXT_OUT_NOT_FOUND] = "no existe",
	[TXT_OUT_SAVE_SENT] = "guardado enviado",
	[TXT_OUT_SAVE_SENT_FIRST] = "guardado enviado y copiado en memoria",
	[TXT_OUT_SAVE_WRITTEN] = "guardado escrito en la NAND",
	[TXT_OUT_BAD_SIZE] = "rechazado: %lu bytes en vez de %d",
	[TXT_OUT_INCOMPLETE] = "recepcion incompleta: %ld bytes",
	[TXT_OUT_SD_ERROR] = "error al leer de la SD",
	[TXT_OUT_TOO_BIG] = "descartado por su tamano",
	[TXT_OUT_CUT] = "cortado en %ld de %ld bytes",
	[TXT_OUT_BYTES] = "%ld bytes",

	/* NAND y red */
	[TXT_NAND_OK] = "correcto",
	[TXT_NAND_ERR_INIT] = "no se ha podido inicializar el sistema de ficheros de la NAND",
	[TXT_NAND_ERR_PERMISSION] = "la NAND ha denegado el acceso al guardado de PBR",
	[TXT_NAND_ERR_NOT_FOUND] = "no hay guardado de PBR en esta Wii",
	[TXT_NAND_ERR_SIZE] = "el guardado no tiene el tamano esperado",
	[TXT_NAND_ERR_IO] = "error de lectura o escritura en la NAND",
	[TXT_NAND_ERR_MEMORY] = "memoria insuficiente",
	[TXT_NAND_ERR_UNKNOWN] = "error desconocido",
	[TXT_NAND_STAGE_OPEN] = "al abrir el fichero",
	[TXT_NAND_STAGE_STATS] = "al leer el tamano del fichero",
	[TXT_NAND_STAGE_READ] = "al leer el contenido",
	[TXT_NAND_STAGE_WRITE] = "al escribir el contenido",
	[TXT_NAND_TRY_AHBPROT] = "  parcheando el IOS en memoria (AHBPROT)...",
	[TXT_NAND_AHBPROT_OK] = "  IOS parcheado: %ld sitio(s)",
	[TXT_NAND_AHBPROT_FAIL] = "  este IOS no se deja parchear; se prueba con un cIOS",
	[TXT_NAND_TRY_CIOS] = "  probando cIOS %d...",
	[TXT_NAND_SETUID_WARN] = "  aviso: ES_SetUID (%s) ha devuelto %ld",
	[TXT_NAND_SAVE_FOUND] = "  guardado encontrado: version %s",
	[TXT_NAND_CANNOT_OPEN] = "  version %s: no se ha podido abrir (%ld)",
	[TXT_NAND_NO_PBR] = "  no hay ninguna version de PBR instalada en esta consola",
	[TXT_NET_SOCKET_FAIL] = "  net_socket ha fallado (%ld)",
	[TXT_NET_BIND_FAIL] = "  net_bind ha fallado (%ld): hay algo mas usando el puerto %u?",
	[TXT_NET_LISTEN_FAIL] = "  net_listen ha fallado (%ld)",
	[TXT_REGION_CHOOSE] = "\nHay guardado de %d versiones de PBR. Elige cual editar:",
	[TXT_REGION_CHOOSE_KEYS] = "  Izquierda y derecha para cambiar, A para aceptar.",
	[TXT_REGION_CHOSEN] = "  se editara la version %s",
	[TXT_BOOT_NO_SAVE_STOP] = "  sin un guardado que servir no se abre el asistente.",
};

static const char *const EN[TXT_COUNT] = {
	[TXT_APP_SUBTITLE] = "Wii assistant",
	[TXT_HDR_ADDRESS] = "Address",
	[TXT_HDR_NO_NET] = "no network - retrying...",
	[TXT_HDR_NO_NET_YET] = "(no network yet)",
	[TXT_HDR_SAVE] = "Save file",
	[TXT_HDR_SAVE_LINE] = "%ld bytes   backup: %s",
	[TXT_HDR_SAVE_UNAVAILABLE] = "not available (error %ld)",
	[TXT_HDR_ACTIVITY] = "Activity",
	[TXT_HDR_ACTIVITY_LINE] = "%lu reads, %lu writes   session: %s   silent: %lu",
	[TXT_HDR_KEYS] = "1 restore   2 release session   - language   HOME quit",
	[TXT_YES] = "yes",
	[TXT_NOT_YET] = "not yet",
	[TXT_SESSION_OPEN] = "open",
	[TXT_SESSION_FREE] = "free",

	[TXT_BOOT_FIND_IOS] = "Looking for an IOS with NAND access...",
	[TXT_BOOT_DOLPHIN] = "  Dolphin: using its emulated IOS, nothing to reload",
	[TXT_BOOT_IOS_LINE] = "  IOS %ld v%ld%s",
	[TXT_BOOT_NO_ACCESS_WARN] = "  warning: no AHBPROT and no cIOS; the NAND will probably deny access",
	[TXT_BOOT_NAND_PREP] = "Preparing NAND access...",
	[TXT_BOOT_NAND_ERROR] = "  ERROR: %s (IOS %ld)",
	[TXT_BOOT_NO_ACCESS_CAUSE] = "  launch the assistant from the Homebrew Channel, or install a cIOS (249/250).",
	[TXT_BOOT_SAVE_FOUND] = "  PBR save found: %s version (%d bytes)",
	[TXT_BOOT_STAGE_FAIL] = "  warning: failed %s (code %ld)",
	[TXT_BOOT_DENIED] = "  the NAND denies access%s",
	[TXT_BOOT_NO_ACCESS_SUFFIX] = "; the IOS could not be patched and there is no cIOS (249/250)",
	[TXT_BOOT_NOT_EXIST] = "  does not exist: %s\n  (tried all three versions: PAL, USA and JAP)",
	[TXT_BOOT_NOT_EXIST_DOLPHIN] = "there is no PBR save in Dolphin's NAND",
	[TXT_BOOT_NOT_EXIST_WII] = "has PBR ever been played on this console?",
	[TXT_BOOT_SIZE_WARN] = "  warning: the save is %ld bytes, expected %d",
	[TXT_BOOT_NO_MEMORY] = "  ERROR: not enough memory for the save file",
	[TXT_BOOT_NO_BACKUP_MEMORY] = "  warning: no memory for the in-memory backup",

	[TXT_NET_CONNECTING] = "Connecting to the network...",
	[TXT_NET_START_FAIL] = "  could not start the network (%ld)",
	[TXT_NET_CONFIG_FAIL] = "  network configuration failed (%ld)",
	[TXT_NET_TIMEOUT] = "  no answer after %d seconds",
	[TXT_NET_WAITING] = "  waiting for the network... (%lu s)",
	[TXT_NET_ERROR] = "  ERROR: no network, or the server could not start.",
	[TXT_NET_CHECK] = "  Check that the console has a connection set up and in range.",
	[TXT_NET_RETRY_PROMPT] = "  Press A to retry, HOME or the power button to quit.",
	[TXT_NET_RETRYING] = "Retrying...",
	[TXT_NET_LOST] = "no network: the connection dropped, retrying",
	[TXT_NET_IP_CHANGED] = "WARNING: the address changed, reconnect from the web",
	[TXT_NET_BACK] = "network back: http://%s:%d/",

	[TXT_EXIT_PROMPT] = "Press HOME or the power button to quit.",
	[TXT_EXITING_CAPS] = "Quitting...",
	[TXT_EXITING] = "quitting...",
	[TXT_POWERING_OFF] = "Powering off...",

	[TXT_LOG_READY] = "ready: open https://ferdinandoph.github.io/aniaplus/ and type %s",
	[TXT_LOG_READY_LOCAL] = "  no internet but local network: open http://%s:%d/",
	[TXT_LOG_NOTIFY_CLIENT] = "telling the connected device...",
	[TXT_LOG_NO_BACKUP_YET] = "no backup yet: read the save file first",
	[TXT_LOG_RESTORING] = "restoring the original save...",
	[TXT_LOG_RESTORED] = "restored",
	[TXT_LOG_SESSION_ALIVE] = "an editing session is open.",
	[TXT_LOG_HOME_AGAIN] = "HOME again to quit anyway; any other button to stay.",
	[TXT_LOG_CANCELLED] = "cancelled, still running",
	[TXT_LOG_SESSION_RELEASED] = "session released: another device can connect now",
	[TXT_LOG_LANGUAGE] = "language: %s",
	[TXT_LOG_GET_SAVE] = "-> the device asks for the save: reading the NAND...",
	[TXT_LOG_SENDING] = "   sending 3.5 MB to the device, hold on...",
	[TXT_LOG_RECEIVING] = "<- the device sends a save: receiving 3.5 MB...",
	[TXT_LOG_WRITING_NAND] = "   writing to the NAND: do not turn the console off",

	[TXT_OUT_PREFLIGHT] = "preflight",
	[TXT_OUT_STATUS_SENT] = "status sent",
	[TXT_OUT_SESSION_OPENED] = "session opened",
	[TXT_OUT_HEARTBEAT] = "heartbeat",
	[TXT_OUT_BUSY_OTHER] = "busy: another device",
	[TXT_OUT_OTHER_DEVICE] = "belongs to another device",
	[TXT_OUT_SESSION_CLOSED_CLIENT] = "session closed by the client",
	[TXT_OUT_QUERY_BUSY] = "query: busy",
	[TXT_OUT_QUERY_FREE] = "query: free",
	[TXT_OUT_NO_SESSION_TO_RELEASE] = "no session to release",
	[TXT_OUT_SESSION_CLOSED_WEB] = "session closed when the web closed",
	[TXT_OUT_TAKEOVER_DENIED] = "takeover denied: the session is still alive",
	[TXT_OUT_TAKEOVER_OK] = "session taken over by another device",
	[TXT_OUT_REJECTED_OTHER] = "rejected: another device holds the session",
	[TXT_OUT_REJECTED_NO_SESSION] = "rejected: no session open",
	[TXT_OUT_METHOD_NOT_ALLOWED] = "method not allowed",
	[TXT_OUT_NOT_FOUND] = "not found",
	[TXT_OUT_SAVE_SENT] = "save sent",
	[TXT_OUT_SAVE_SENT_FIRST] = "save sent and copied to memory",
	[TXT_OUT_SAVE_WRITTEN] = "save written to the NAND",
	[TXT_OUT_BAD_SIZE] = "rejected: %lu bytes instead of %d",
	[TXT_OUT_INCOMPLETE] = "incomplete transfer: %ld bytes",
	[TXT_OUT_SD_ERROR] = "error reading from the SD card",
	[TXT_OUT_TOO_BIG] = "skipped: too big",
	[TXT_OUT_CUT] = "cut at %ld of %ld bytes",
	[TXT_OUT_BYTES] = "%ld bytes",

	/* NAND y red */
	[TXT_NAND_OK] = "fine",
	[TXT_NAND_ERR_INIT] = "the NAND filesystem could not be started",
	[TXT_NAND_ERR_PERMISSION] = "the NAND denied access to the PBR save",
	[TXT_NAND_ERR_NOT_FOUND] = "there is no PBR save on this Wii",
	[TXT_NAND_ERR_SIZE] = "the save file is not the expected size",
	[TXT_NAND_ERR_IO] = "read or write error on the NAND",
	[TXT_NAND_ERR_MEMORY] = "not enough memory",
	[TXT_NAND_ERR_UNKNOWN] = "unknown error",
	[TXT_NAND_STAGE_OPEN] = "while opening the file",
	[TXT_NAND_STAGE_STATS] = "while reading the file size",
	[TXT_NAND_STAGE_READ] = "while reading the contents",
	[TXT_NAND_STAGE_WRITE] = "while writing the contents",
	[TXT_NAND_TRY_AHBPROT] = "  patching the running IOS (AHBPROT)...",
	[TXT_NAND_AHBPROT_OK] = "  IOS patched: %ld spot(s)",
	[TXT_NAND_AHBPROT_FAIL] = "  this IOS cannot be patched; trying a cIOS",
	[TXT_NAND_TRY_CIOS] = "  trying cIOS %d...",
	[TXT_NAND_SETUID_WARN] = "  warning: ES_SetUID (%s) returned %ld",
	[TXT_NAND_SAVE_FOUND] = "  save found: %s version",
	[TXT_NAND_CANNOT_OPEN] = "  %s version: could not open it (%ld)",
	[TXT_NAND_NO_PBR] = "  no version of PBR is installed on this console",
	[TXT_NET_SOCKET_FAIL] = "  net_socket failed (%ld)",
	[TXT_NET_BIND_FAIL] = "  net_bind failed (%ld): is something else using port %u?",
	[TXT_NET_LISTEN_FAIL] = "  net_listen failed (%ld)",
	[TXT_REGION_CHOOSE] = "\n%d versions of PBR have a save. Choose which one to edit:",
	[TXT_REGION_CHOOSE_KEYS] = "  Left and right to change, A to accept.",
	[TXT_REGION_CHOSEN] = "  editing the %s version",
	[TXT_BOOT_NO_SAVE_STOP] = "  without a save to serve, the assistant does not start.",
};

static const char *const DE[TXT_COUNT] = {
	[TXT_APP_SUBTITLE] = "Wii-Assistent",
	[TXT_HDR_ADDRESS] = "Adresse",
	[TXT_HDR_NO_NET] = "kein Netz - neuer Versuch...",
	[TXT_HDR_NO_NET_YET] = "(noch kein Netz)",
	[TXT_HDR_SAVE] = "Spielstand",
	[TXT_HDR_SAVE_LINE] = "%ld Bytes   Sicherung: %s",
	[TXT_HDR_SAVE_UNAVAILABLE] = "nicht verfuegbar (Fehler %ld)",
	[TXT_HDR_ACTIVITY] = "Aktivitaet",
	[TXT_HDR_ACTIVITY_LINE] = "%lu gelesen, %lu geschrieben   Sitzung: %s   stumm: %lu",
	[TXT_HDR_KEYS] = "1 wiederherst.   2 Sitzung frei   - Sprache   HOME beenden",
	[TXT_YES] = "ja",
	[TXT_NOT_YET] = "noch nicht",
	[TXT_SESSION_OPEN] = "offen",
	[TXT_SESSION_FREE] = "frei",

	[TXT_BOOT_FIND_IOS] = "Suche ein IOS mit NAND-Zugriff...",
	[TXT_BOOT_DOLPHIN] = "  Dolphin: benutzt sein emuliertes IOS, nichts wird neu geladen",
	[TXT_BOOT_IOS_LINE] = "  IOS %ld v%ld%s",
	[TXT_BOOT_NO_ACCESS_WARN] = "  Hinweis: kein AHBPROT und kein cIOS; die NAND verweigert den Zugriff wahrscheinlich",
	[TXT_BOOT_NAND_PREP] = "NAND-Zugriff wird vorbereitet...",
	[TXT_BOOT_NAND_ERROR] = "  FEHLER: %s (IOS %ld)",
	[TXT_BOOT_NO_ACCESS_CAUSE] = "  starte den Assistenten ueber den Homebrew Channel, oder installiere ein cIOS (249/250).",
	[TXT_BOOT_SAVE_FOUND] = "  PBR-Spielstand gefunden: Version %s (%d Bytes)",
	[TXT_BOOT_STAGE_FAIL] = "  Hinweis: fehlgeschlagen %s (Code %ld)",
	[TXT_BOOT_DENIED] = "  die NAND verweigert den Zugriff%s",
	[TXT_BOOT_NO_ACCESS_SUFFIX] = "; IOS konnte nicht gepatcht werden und es gibt kein cIOS (249/250)",
	[TXT_BOOT_NOT_EXIST] = "  nicht vorhanden: %s\n  (alle drei Versionen geprueft: PAL, USA und JAP)",
	[TXT_BOOT_NOT_EXIST_DOLPHIN] = "in Dolphins NAND liegt kein PBR-Spielstand",
	[TXT_BOOT_NOT_EXIST_WII] = "wurde PBR auf dieser Konsole jemals gespielt?",
	[TXT_BOOT_SIZE_WARN] = "  Hinweis: der Spielstand hat %ld Bytes, erwartet waren %d",
	[TXT_BOOT_NO_MEMORY] = "  FEHLER: nicht genug Speicher fuer den Spielstand",
	[TXT_BOOT_NO_BACKUP_MEMORY] = "  Hinweis: kein Speicher fuer die Sicherung im RAM",

	[TXT_NET_CONNECTING] = "Verbinde mit dem Netzwerk...",
	[TXT_NET_START_FAIL] = "  das Netzwerk liess sich nicht starten (%ld)",
	[TXT_NET_CONFIG_FAIL] = "  die Netzwerkkonfiguration ist fehlgeschlagen (%ld)",
	[TXT_NET_TIMEOUT] = "  keine Antwort nach %d Sekunden",
	[TXT_NET_WAITING] = "  warte auf das Netzwerk... (%lu s)",
	[TXT_NET_ERROR] = "  FEHLER: kein Netz, oder der Server liess sich nicht starten.",
	[TXT_NET_CHECK] = "  Pruefe, ob die Konsole eine eingerichtete Verbindung mit Empfang hat.",
	[TXT_NET_RETRY_PROMPT] = "  A fuer einen neuen Versuch, HOME oder die Power-Taste zum Beenden.",
	[TXT_NET_RETRYING] = "Neuer Versuch...",
	[TXT_NET_LOST] = "kein Netz: die Verbindung ist weg, neuer Versuch",
	[TXT_NET_IP_CHANGED] = "ACHTUNG: die Adresse hat sich geaendert, im Browser neu verbinden",
	[TXT_NET_BACK] = "Netz wieder da: http://%s:%d/",

	[TXT_EXIT_PROMPT] = "HOME oder die Power-Taste zum Beenden.",
	[TXT_EXITING_CAPS] = "Beende...",
	[TXT_EXITING] = "beende...",
	[TXT_POWERING_OFF] = "Schalte aus...",

	[TXT_LOG_READY] = "bereit: oeffne https://ferdinandoph.github.io/aniaplus/, IP: %s",
	[TXT_LOG_READY_LOCAL] = "  kein Internet, aber lokales Netz: oeffne http://%s:%d/",
	[TXT_LOG_NOTIFY_CLIENT] = "benachrichtige das verbundene Geraet...",
	[TXT_LOG_NO_BACKUP_YET] = "noch keine Sicherung: lies zuerst den Spielstand",
	[TXT_LOG_RESTORING] = "stelle den urspruenglichen Spielstand wieder her...",
	[TXT_LOG_RESTORED] = "wiederhergestellt",
	[TXT_LOG_SESSION_ALIVE] = "es ist eine Bearbeitungssitzung offen.",
	[TXT_LOG_HOME_AGAIN] = "nochmal HOME zum Beenden; eine andere Taste zum Weitermachen.",
	[TXT_LOG_CANCELLED] = "abgebrochen, laeuft weiter",
	[TXT_LOG_SESSION_RELEASED] = "Sitzung freigegeben: ein anderes Geraet kann sich verbinden",
	[TXT_LOG_LANGUAGE] = "Sprache: %s",
	[TXT_LOG_GET_SAVE] = "-> das Geraet fragt nach dem Spielstand: lese die NAND...",
	[TXT_LOG_SENDING] = "   sende 3,5 MB an das Geraet, bitte warten...",
	[TXT_LOG_RECEIVING] = "<- das Geraet schickt einen Spielstand: empfange 3,5 MB...",
	[TXT_LOG_WRITING_NAND] = "   schreibe in die NAND: die Konsole nicht ausschalten",

	[TXT_OUT_PREFLIGHT] = "Preflight",
	[TXT_OUT_STATUS_SENT] = "Status gesendet",
	[TXT_OUT_SESSION_OPENED] = "Sitzung geoeffnet",
	[TXT_OUT_HEARTBEAT] = "Lebenszeichen",
	[TXT_OUT_BUSY_OTHER] = "belegt: anderes Geraet",
	[TXT_OUT_OTHER_DEVICE] = "gehoert einem anderen Geraet",
	[TXT_OUT_SESSION_CLOSED_CLIENT] = "Sitzung vom Client geschlossen",
	[TXT_OUT_QUERY_BUSY] = "Abfrage: belegt",
	[TXT_OUT_QUERY_FREE] = "Abfrage: frei",
	[TXT_OUT_NO_SESSION_TO_RELEASE] = "keine Sitzung freizugeben",
	[TXT_OUT_SESSION_CLOSED_WEB] = "Sitzung beim Schliessen der Seite beendet",
	[TXT_OUT_TAKEOVER_DENIED] = "Uebernahme abgelehnt: die Sitzung lebt noch",
	[TXT_OUT_TAKEOVER_OK] = "Sitzung von einem anderen Geraet uebernommen",
	[TXT_OUT_REJECTED_OTHER] = "abgelehnt: ein anderes Geraet hat die Sitzung",
	[TXT_OUT_REJECTED_NO_SESSION] = "abgelehnt: keine Sitzung offen",
	[TXT_OUT_METHOD_NOT_ALLOWED] = "Methode nicht erlaubt",
	[TXT_OUT_NOT_FOUND] = "nicht gefunden",
	[TXT_OUT_SAVE_SENT] = "Spielstand gesendet",
	[TXT_OUT_SAVE_SENT_FIRST] = "Spielstand gesendet und im RAM gesichert",
	[TXT_OUT_SAVE_WRITTEN] = "Spielstand in die NAND geschrieben",
	[TXT_OUT_BAD_SIZE] = "abgelehnt: %lu Bytes statt %d",
	[TXT_OUT_INCOMPLETE] = "unvollstaendig empfangen: %ld Bytes",
	[TXT_OUT_SD_ERROR] = "Fehler beim Lesen von der SD-Karte",
	[TXT_OUT_TOO_BIG] = "verworfen: zu gross",
	[TXT_OUT_CUT] = "abgebrochen bei %ld von %ld Bytes",
	[TXT_OUT_BYTES] = "%ld Bytes",

	/* NAND y red */
	[TXT_NAND_OK] = "in Ordnung",
	[TXT_NAND_ERR_INIT] = "das NAND-Dateisystem liess sich nicht starten",
	[TXT_NAND_ERR_PERMISSION] = "die NAND verweigert den Zugriff auf den PBR-Spielstand",
	[TXT_NAND_ERR_NOT_FOUND] = "auf dieser Wii gibt es keinen PBR-Spielstand",
	[TXT_NAND_ERR_SIZE] = "der Spielstand hat nicht die erwartete Groesse",
	[TXT_NAND_ERR_IO] = "Lese- oder Schreibfehler in der NAND",
	[TXT_NAND_ERR_MEMORY] = "nicht genug Speicher",
	[TXT_NAND_ERR_UNKNOWN] = "unbekannter Fehler",
	[TXT_NAND_STAGE_OPEN] = "beim Oeffnen der Datei",
	[TXT_NAND_STAGE_STATS] = "beim Lesen der Dateigroesse",
	[TXT_NAND_STAGE_READ] = "beim Lesen des Inhalts",
	[TXT_NAND_STAGE_WRITE] = "beim Schreiben des Inhalts",
	[TXT_NAND_TRY_AHBPROT] = "  patche das laufende IOS (AHBPROT)...",
	[TXT_NAND_AHBPROT_OK] = "  IOS gepatcht: %ld Stelle(n)",
	[TXT_NAND_AHBPROT_FAIL] = "  dieses IOS laesst sich nicht patchen; versuche ein cIOS",
	[TXT_NAND_TRY_CIOS] = "  versuche cIOS %d...",
	[TXT_NAND_SETUID_WARN] = "  Hinweis: ES_SetUID (%s) ergab %ld",
	[TXT_NAND_SAVE_FOUND] = "  Spielstand gefunden: Version %s",
	[TXT_NAND_CANNOT_OPEN] = "  Version %s: liess sich nicht oeffnen (%ld)",
	[TXT_NAND_NO_PBR] = "  auf dieser Konsole ist keine PBR-Version installiert",
	[TXT_NET_SOCKET_FAIL] = "  net_socket fehlgeschlagen (%ld)",
	[TXT_NET_BIND_FAIL] = "  net_bind fehlgeschlagen (%ld): benutzt etwas anderes Port %u?",
	[TXT_NET_LISTEN_FAIL] = "  net_listen fehlgeschlagen (%ld)",
	[TXT_REGION_CHOOSE] = "\n%d PBR-Versionen haben einen Spielstand. Welchen bearbeiten?",
	[TXT_REGION_CHOOSE_KEYS] = "  Links und rechts zum Wechseln, A zum Bestaetigen.",
	[TXT_REGION_CHOSEN] = "  es wird die Version %s bearbeitet",
	[TXT_BOOT_NO_SAVE_STOP] = "  ohne Spielstand zum Ausliefern startet der Assistent nicht.",
};

static const char *const FR[TXT_COUNT] = {
	[TXT_APP_SUBTITLE] = "Assistant Wii",
	[TXT_HDR_ADDRESS] = "Adresse",
	[TXT_HDR_NO_NET] = "pas de reseau - nouvel essai...",
	[TXT_HDR_NO_NET_YET] = "(pas encore de reseau)",
	[TXT_HDR_SAVE] = "Sauvegarde",
	[TXT_HDR_SAVE_LINE] = "%ld octets   copie: %s",
	[TXT_HDR_SAVE_UNAVAILABLE] = "indisponible (erreur %ld)",
	[TXT_HDR_ACTIVITY] = "Activite",
	[TXT_HDR_ACTIVITY_LINE] = "%lu lectures, %lu ecritures   session: %s   muettes: %lu",
	[TXT_HDR_KEYS] = "1 restaurer   2 liberer session   - langue   HOME quitter",
	[TXT_YES] = "oui",
	[TXT_NOT_YET] = "pas encore",
	[TXT_SESSION_OPEN] = "ouverte",
	[TXT_SESSION_FREE] = "libre",

	[TXT_BOOT_FIND_IOS] = "Recherche d'un IOS avec acces a la NAND...",
	[TXT_BOOT_DOLPHIN] = "  Dolphin: on utilise son IOS emule, rien a recharger",
	[TXT_BOOT_IOS_LINE] = "  IOS %ld v%ld%s",
	[TXT_BOOT_NO_ACCESS_WARN] = "  attention: ni AHBPROT ni cIOS; la NAND refusera probablement l'acces",
	[TXT_BOOT_NAND_PREP] = "Preparation de l'acces a la NAND...",
	[TXT_BOOT_NAND_ERROR] = "  ERREUR: %s (IOS %ld)",
	[TXT_BOOT_NO_ACCESS_CAUSE] = "  lance l'assistant depuis le Homebrew Channel, ou installe un cIOS (249/250).",
	[TXT_BOOT_SAVE_FOUND] = "  sauvegarde PBR trouvee: version %s (%d octets)",
	[TXT_BOOT_STAGE_FAIL] = "  attention: echec %s (code %ld)",
	[TXT_BOOT_DENIED] = "  la NAND refuse l'acces%s",
	[TXT_BOOT_NO_ACCESS_SUFFIX] = "; l'IOS n'a pas pu etre patche et il n'y a pas de cIOS (249/250)",
	[TXT_BOOT_NOT_EXIST] = "  inexistant: %s\n  (les trois versions ont ete essayees: PAL, USA et JAP)",
	[TXT_BOOT_NOT_EXIST_DOLPHIN] = "il n'y a pas de sauvegarde PBR dans la NAND de Dolphin",
	[TXT_BOOT_NOT_EXIST_WII] = "a-t-on deja joue a PBR sur cette console?",
	[TXT_BOOT_SIZE_WARN] = "  attention: la sauvegarde fait %ld octets, on en attendait %d",
	[TXT_BOOT_NO_MEMORY] = "  ERREUR: pas assez de memoire pour la sauvegarde",
	[TXT_BOOT_NO_BACKUP_MEMORY] = "  attention: pas de memoire pour la copie en RAM",

	[TXT_NET_CONNECTING] = "Connexion au reseau...",
	[TXT_NET_START_FAIL] = "  impossible de demarrer le reseau (%ld)",
	[TXT_NET_CONFIG_FAIL] = "  la configuration reseau a echoue (%ld)",
	[TXT_NET_TIMEOUT] = "  pas de reponse apres %d secondes",
	[TXT_NET_WAITING] = "  attente du reseau... (%lu s)",
	[TXT_NET_ERROR] = "  ERREUR: pas de reseau, ou le serveur n'a pas demarre.",
	[TXT_NET_CHECK] = "  Verifie que la console a une connexion configuree et du signal.",
	[TXT_NET_RETRY_PROMPT] = "  Appuie sur A pour reessayer, HOME ou le bouton power pour quitter.",
	[TXT_NET_RETRYING] = "Nouvel essai...",
	[TXT_NET_LOST] = "pas de reseau: la connexion est tombee, nouvel essai",
	[TXT_NET_IP_CHANGED] = "ATTENTION: l'adresse a change, il faut reconnecter le site",
	[TXT_NET_BACK] = "reseau retabli: http://%s:%d/",

	[TXT_EXIT_PROMPT] = "Appuie sur HOME ou sur le bouton power pour quitter.",
	[TXT_EXITING_CAPS] = "Fermeture...",
	[TXT_EXITING] = "fermeture...",
	[TXT_POWERING_OFF] = "Extinction...",

	[TXT_LOG_READY] = "pret: ouvre https://ferdinandoph.github.io/aniaplus/ et tape %s",
	[TXT_LOG_READY_LOCAL] = "  sans internet mais avec reseau local: ouvre http://%s:%d/",
	[TXT_LOG_NOTIFY_CLIENT] = "on previent l'appareil connecte...",
	[TXT_LOG_NO_BACKUP_YET] = "pas encore de copie: lis d'abord la sauvegarde",
	[TXT_LOG_RESTORING] = "restauration de la sauvegarde d'origine...",
	[TXT_LOG_RESTORED] = "restauree",
	[TXT_LOG_SESSION_ALIVE] = "une session d'edition est ouverte.",
	[TXT_LOG_HOME_AGAIN] = "HOME encore pour quitter quand meme; un autre bouton pour rester.",
	[TXT_LOG_CANCELLED] = "annule, on continue",
	[TXT_LOG_SESSION_RELEASED] = "session liberee: un autre appareil peut se connecter",
	[TXT_LOG_LANGUAGE] = "langue: %s",
	[TXT_LOG_GET_SAVE] = "-> l'appareil demande la sauvegarde: lecture de la NAND...",
	[TXT_LOG_SENDING] = "   envoi de 3,5 Mo a l'appareil, patiente...",
	[TXT_LOG_RECEIVING] = "<- l'appareil envoie une sauvegarde: reception de 3,5 Mo...",
	[TXT_LOG_WRITING_NAND] = "   ecriture dans la NAND: n'eteins pas la console",

	[TXT_OUT_PREFLIGHT] = "preflight",
	[TXT_OUT_STATUS_SENT] = "etat envoye",
	[TXT_OUT_SESSION_OPENED] = "session ouverte",
	[TXT_OUT_HEARTBEAT] = "battement",
	[TXT_OUT_BUSY_OTHER] = "occupee: un autre appareil",
	[TXT_OUT_OTHER_DEVICE] = "appartient a un autre appareil",
	[TXT_OUT_SESSION_CLOSED_CLIENT] = "session fermee par le client",
	[TXT_OUT_QUERY_BUSY] = "consultation: occupee",
	[TXT_OUT_QUERY_FREE] = "consultation: libre",
	[TXT_OUT_NO_SESSION_TO_RELEASE] = "aucune session a liberer",
	[TXT_OUT_SESSION_CLOSED_WEB] = "session fermee a la fermeture du site",
	[TXT_OUT_TAKEOVER_DENIED] = "reprise refusee: la session est toujours vivante",
	[TXT_OUT_TAKEOVER_OK] = "session reprise par un autre appareil",
	[TXT_OUT_REJECTED_OTHER] = "refuse: un autre appareil a la session",
	[TXT_OUT_REJECTED_NO_SESSION] = "refuse: aucune session ouverte",
	[TXT_OUT_METHOD_NOT_ALLOWED] = "methode non autorisee",
	[TXT_OUT_NOT_FOUND] = "inexistant",
	[TXT_OUT_SAVE_SENT] = "sauvegarde envoyee",
	[TXT_OUT_SAVE_SENT_FIRST] = "sauvegarde envoyee et copiee en memoire",
	[TXT_OUT_SAVE_WRITTEN] = "sauvegarde ecrite dans la NAND",
	[TXT_OUT_BAD_SIZE] = "refuse: %lu octets au lieu de %d",
	[TXT_OUT_INCOMPLETE] = "reception incomplete: %ld octets",
	[TXT_OUT_SD_ERROR] = "erreur de lecture de la carte SD",
	[TXT_OUT_TOO_BIG] = "ignore: trop gros",
	[TXT_OUT_CUT] = "coupe a %ld sur %ld octets",
	[TXT_OUT_BYTES] = "%ld octets",

	/* NAND y red */
	[TXT_NAND_OK] = "correct",
	[TXT_NAND_ERR_INIT] = "le systeme de fichiers de la NAND n'a pas demarre",
	[TXT_NAND_ERR_PERMISSION] = "la NAND a refuse l'acces a la sauvegarde PBR",
	[TXT_NAND_ERR_NOT_FOUND] = "il n'y a pas de sauvegarde PBR sur cette Wii",
	[TXT_NAND_ERR_SIZE] = "la sauvegarde n'a pas la taille attendue",
	[TXT_NAND_ERR_IO] = "erreur de lecture ou d'ecriture dans la NAND",
	[TXT_NAND_ERR_MEMORY] = "memoire insuffisante",
	[TXT_NAND_ERR_UNKNOWN] = "erreur inconnue",
	[TXT_NAND_STAGE_OPEN] = "a l'ouverture du fichier",
	[TXT_NAND_STAGE_STATS] = "a la lecture de la taille du fichier",
	[TXT_NAND_STAGE_READ] = "a la lecture du contenu",
	[TXT_NAND_STAGE_WRITE] = "a l'ecriture du contenu",
	[TXT_NAND_TRY_AHBPROT] = "  patch de l'IOS en memoire (AHBPROT)...",
	[TXT_NAND_AHBPROT_OK] = "  IOS patche: %ld endroit(s)",
	[TXT_NAND_AHBPROT_FAIL] = "  cet IOS ne se laisse pas patcher; essai avec un cIOS",
	[TXT_NAND_TRY_CIOS] = "  essai du cIOS %d...",
	[TXT_NAND_SETUID_WARN] = "  attention: ES_SetUID (%s) a renvoye %ld",
	[TXT_NAND_SAVE_FOUND] = "  sauvegarde trouvee: version %s",
	[TXT_NAND_CANNOT_OPEN] = "  version %s: impossible de l'ouvrir (%ld)",
	[TXT_NAND_NO_PBR] = "  aucune version de PBR n'est installee sur cette console",
	[TXT_NET_SOCKET_FAIL] = "  net_socket a echoue (%ld)",
	[TXT_NET_BIND_FAIL] = "  net_bind a echoue (%ld): quelque chose utilise-t-il le port %u?",
	[TXT_NET_LISTEN_FAIL] = "  net_listen a echoue (%ld)",
	[TXT_REGION_CHOOSE] = "\n%d versions de PBR ont une sauvegarde. Laquelle editer?",
	[TXT_REGION_CHOOSE_KEYS] = "  Gauche et droite pour changer, A pour accepter.",
	[TXT_REGION_CHOSEN] = "  on editera la version %s",
	[TXT_BOOT_NO_SAVE_STOP] = "  sans sauvegarde a servir, l'assistant ne demarre pas.",
};

static const char *const IT[TXT_COUNT] = {
	[TXT_APP_SUBTITLE] = "Assistente Wii",
	[TXT_HDR_ADDRESS] = "Indirizzo",
	[TXT_HDR_NO_NET] = "niente rete - nuovo tentativo...",
	[TXT_HDR_NO_NET_YET] = "(ancora senza rete)",
	[TXT_HDR_SAVE] = "Salvataggio",
	[TXT_HDR_SAVE_LINE] = "%ld byte   copia: %s",
	[TXT_HDR_SAVE_UNAVAILABLE] = "non disponibile (errore %ld)",
	[TXT_HDR_ACTIVITY] = "Attivita",
	[TXT_HDR_ACTIVITY_LINE] = "%lu letture, %lu scritture   sessione: %s   mute: %lu",
	[TXT_HDR_KEYS] = "1 ripristina   2 libera sessione   - lingua   HOME esci",
	[TXT_YES] = "si",
	[TXT_NOT_YET] = "non ancora",
	[TXT_SESSION_OPEN] = "aperta",
	[TXT_SESSION_FREE] = "libera",

	[TXT_BOOT_FIND_IOS] = "Cerco un IOS con accesso alla NAND...",
	[TXT_BOOT_DOLPHIN] = "  Dolphin: si usa il suo IOS emulato, niente da ricaricare",
	[TXT_BOOT_IOS_LINE] = "  IOS %ld v%ld%s",
	[TXT_BOOT_NO_ACCESS_WARN] = "  avviso: niente AHBPROT ne cIOS; la NAND probabilmente negara l'accesso",
	[TXT_BOOT_NAND_PREP] = "Preparo l'accesso alla NAND...",
	[TXT_BOOT_NAND_ERROR] = "  ERRORE: %s (IOS %ld)",
	[TXT_BOOT_NO_ACCESS_CAUSE] = "  avvia l'assistente dall'Homebrew Channel, o installa un cIOS (249/250).",
	[TXT_BOOT_SAVE_FOUND] = "  salvataggio PBR trovato: versione %s (%d byte)",
	[TXT_BOOT_STAGE_FAIL] = "  avviso: fallito %s (codice %ld)",
	[TXT_BOOT_DENIED] = "  la NAND nega l'accesso%s",
	[TXT_BOOT_NO_ACCESS_SUFFIX] = "; non si e potuto patchare l'IOS e non c'e cIOS (249/250)",
	[TXT_BOOT_NOT_EXIST] = "  non esiste: %s\n  (provate tutte e tre le versioni: PAL, USA e JAP)",
	[TXT_BOOT_NOT_EXIST_DOLPHIN] = "non c'e nessun salvataggio PBR nella NAND di Dolphin",
	[TXT_BOOT_NOT_EXIST_WII] = "si e mai giocato a PBR su questa console?",
	[TXT_BOOT_SIZE_WARN] = "  avviso: il salvataggio misura %ld byte, ne erano attesi %d",
	[TXT_BOOT_NO_MEMORY] = "  ERRORE: memoria insufficiente per il salvataggio",
	[TXT_BOOT_NO_BACKUP_MEMORY] = "  avviso: niente memoria per la copia in RAM",

	[TXT_NET_CONNECTING] = "Connessione alla rete...",
	[TXT_NET_START_FAIL] = "  non si e potuta avviare la rete (%ld)",
	[TXT_NET_CONFIG_FAIL] = "  la configurazione di rete e fallita (%ld)",
	[TXT_NET_TIMEOUT] = "  nessuna risposta dopo %d secondi",
	[TXT_NET_WAITING] = "  attendo la rete... (%lu s)",
	[TXT_NET_ERROR] = "  ERRORE: niente rete, o il server non e partito.",
	[TXT_NET_CHECK] = "  Controlla che la console abbia una connessione configurata e con segnale.",
	[TXT_NET_RETRY_PROMPT] = "  Premi A per riprovare, HOME o il tasto power per uscire.",
	[TXT_NET_RETRYING] = "Nuovo tentativo...",
	[TXT_NET_LOST] = "niente rete: la connessione e caduta, riprovo",
	[TXT_NET_IP_CHANGED] = "ATTENZIONE: l'indirizzo e cambiato, riconnetti dal sito",
	[TXT_NET_BACK] = "rete tornata: http://%s:%d/",

	[TXT_EXIT_PROMPT] = "Premi HOME o il tasto power per uscire.",
	[TXT_EXITING_CAPS] = "Esco...",
	[TXT_EXITING] = "esco...",
	[TXT_POWERING_OFF] = "Spegnimento...",

	[TXT_LOG_READY] = "pronto: apri https://ferdinandoph.github.io/aniaplus/ e scrivi %s",
	[TXT_LOG_READY_LOCAL] = "  senza internet ma con rete locale: apri http://%s:%d/",
	[TXT_LOG_NOTIFY_CLIENT] = "avviso il dispositivo connesso...",
	[TXT_LOG_NO_BACKUP_YET] = "ancora nessuna copia: leggi prima il salvataggio",
	[TXT_LOG_RESTORING] = "ripristino il salvataggio originale...",
	[TXT_LOG_RESTORED] = "ripristinato",
	[TXT_LOG_SESSION_ALIVE] = "c'e una sessione di modifica aperta.",
	[TXT_LOG_HOME_AGAIN] = "HOME di nuovo per uscire lo stesso; un altro tasto per restare.",
	[TXT_LOG_CANCELLED] = "annullato, continuo",
	[TXT_LOG_SESSION_RELEASED] = "sessione liberata: ora puo connettersi un altro dispositivo",
	[TXT_LOG_LANGUAGE] = "lingua: %s",
	[TXT_LOG_GET_SAVE] = "-> il dispositivo chiede il salvataggio: leggo la NAND...",
	[TXT_LOG_SENDING] = "   invio 3,5 MB al dispositivo, aspetta...",
	[TXT_LOG_RECEIVING] = "<- il dispositivo manda un salvataggio: ricevo 3,5 MB...",
	[TXT_LOG_WRITING_NAND] = "   scrivo nella NAND: non spegnere la console",

	[TXT_OUT_PREFLIGHT] = "preflight",
	[TXT_OUT_STATUS_SENT] = "stato inviato",
	[TXT_OUT_SESSION_OPENED] = "sessione aperta",
	[TXT_OUT_HEARTBEAT] = "battito",
	[TXT_OUT_BUSY_OTHER] = "occupata: un altro dispositivo",
	[TXT_OUT_OTHER_DEVICE] = "e di un altro dispositivo",
	[TXT_OUT_SESSION_CLOSED_CLIENT] = "sessione chiusa dal client",
	[TXT_OUT_QUERY_BUSY] = "richiesta: occupata",
	[TXT_OUT_QUERY_FREE] = "richiesta: libera",
	[TXT_OUT_NO_SESSION_TO_RELEASE] = "nessuna sessione da liberare",
	[TXT_OUT_SESSION_CLOSED_WEB] = "sessione chiusa alla chiusura del sito",
	[TXT_OUT_TAKEOVER_DENIED] = "subentro negato: la sessione e ancora viva",
	[TXT_OUT_TAKEOVER_OK] = "sessione presa da un altro dispositivo",
	[TXT_OUT_REJECTED_OTHER] = "rifiutato: la sessione e di un altro dispositivo",
	[TXT_OUT_REJECTED_NO_SESSION] = "rifiutato: nessuna sessione aperta",
	[TXT_OUT_METHOD_NOT_ALLOWED] = "metodo non consentito",
	[TXT_OUT_NOT_FOUND] = "non esiste",
	[TXT_OUT_SAVE_SENT] = "salvataggio inviato",
	[TXT_OUT_SAVE_SENT_FIRST] = "salvataggio inviato e copiato in memoria",
	[TXT_OUT_SAVE_WRITTEN] = "salvataggio scritto nella NAND",
	[TXT_OUT_BAD_SIZE] = "rifiutato: %lu byte invece di %d",
	[TXT_OUT_INCOMPLETE] = "ricezione incompleta: %ld byte",
	[TXT_OUT_SD_ERROR] = "errore leggendo dalla SD",
	[TXT_OUT_TOO_BIG] = "scartato: troppo grande",
	[TXT_OUT_CUT] = "interrotto a %ld di %ld byte",
	[TXT_OUT_BYTES] = "%ld byte",

	/* NAND y red */
	[TXT_NAND_OK] = "corretto",
	[TXT_NAND_ERR_INIT] = "non si e potuto avviare il filesystem della NAND",
	[TXT_NAND_ERR_PERMISSION] = "la NAND ha negato l'accesso al salvataggio di PBR",
	[TXT_NAND_ERR_NOT_FOUND] = "su questa Wii non c'e nessun salvataggio di PBR",
	[TXT_NAND_ERR_SIZE] = "il salvataggio non ha la dimensione attesa",
	[TXT_NAND_ERR_IO] = "errore di lettura o scrittura nella NAND",
	[TXT_NAND_ERR_MEMORY] = "memoria insufficiente",
	[TXT_NAND_ERR_UNKNOWN] = "errore sconosciuto",
	[TXT_NAND_STAGE_OPEN] = "nell'apertura del file",
	[TXT_NAND_STAGE_STATS] = "nella lettura della dimensione del file",
	[TXT_NAND_STAGE_READ] = "nella lettura del contenuto",
	[TXT_NAND_STAGE_WRITE] = "nella scrittura del contenuto",
	[TXT_NAND_TRY_AHBPROT] = "  applico le patch all'IOS in memoria (AHBPROT)...",
	[TXT_NAND_AHBPROT_OK] = "  IOS patchato: %ld punto/i",
	[TXT_NAND_AHBPROT_FAIL] = "  questo IOS non si lascia patchare; provo con un cIOS",
	[TXT_NAND_TRY_CIOS] = "  provo il cIOS %d...",
	[TXT_NAND_SETUID_WARN] = "  avviso: ES_SetUID (%s) ha restituito %ld",
	[TXT_NAND_SAVE_FOUND] = "  salvataggio trovato: versione %s",
	[TXT_NAND_CANNOT_OPEN] = "  versione %s: non si e potuta aprire (%ld)",
	[TXT_NAND_NO_PBR] = "  su questa console non c'e installata nessuna versione di PBR",
	[TXT_NET_SOCKET_FAIL] = "  net_socket e fallita (%ld)",
	[TXT_NET_BIND_FAIL] = "  net_bind e fallita (%ld): c'e qualcos'altro che usa la porta %u?",
	[TXT_NET_LISTEN_FAIL] = "  net_listen e fallita (%ld)",
	[TXT_REGION_CHOOSE] = "\n%d versioni di PBR hanno un salvataggio. Quale vuoi modificare?",
	[TXT_REGION_CHOOSE_KEYS] = "  Sinistra e destra per cambiare, A per accettare.",
	[TXT_REGION_CHOSEN] = "  si modifichera la versione %s",
	[TXT_BOOT_NO_SAVE_STOP] = "  senza un salvataggio da servire, l'assistente non si avvia.",
};

static const char *const *const TABLES[AW_LANG_COUNT] = { ES, EN, DE, FR, IT };

static const char *const LANG_NAMES[AW_LANG_COUNT] = {
	"Espanol", "English", "Deutsch", "Francais", "Italiano",
};

/* Codigo corto para el fichero de la SD. */
static const char *const LANG_CODES[AW_LANG_COUNT] = { "es", "en", "de", "fr", "it" };

const char *aw_text_of(aw_lang lang, aw_text_id id)
{
	if (lang < 0 || lang >= AW_LANG_COUNT || id < 0 || id >= TXT_COUNT)
		return "";
	const char *text = TABLES[lang][id];
	/* Un hueco en una traduccion no deja la pantalla en blanco: se cae al castellano. */
	if (text == NULL)
		text = ES[id];
	return text != NULL ? text : "";
}

const char *aw_text(aw_text_id id)
{
	return aw_text_of(current, id);
}

void aw_say(aw_text_id id, ...)
{
	va_list args;
	va_start(args, id);
	vprintf(aw_text(id), args);
	va_end(args);
	putchar('\n');
}

const char *aw_lang_name(aw_lang lang)
{
	if (lang < 0 || lang >= AW_LANG_COUNT)
		return "?";
	return LANG_NAMES[lang];
}

aw_lang aw_get_lang(void)
{
	return current;
}

void aw_set_lang(aw_lang lang)
{
	if (lang >= 0 && lang < AW_LANG_COUNT)
		current = lang;
}

#ifndef AW_TEXT_NATIVE_TEST

/* Lo elegido a mano la ultima vez, si es que se pudo guardar. */
static bool load_saved_lang(void)
{
	FILE *file = fopen(LANG_FILE, "r");
	if (file == NULL)
		return false;

	char code[8] = "";
	char *read = fgets(code, sizeof(code), file);
	fclose(file);
	if (read == NULL)
		return false;

	for (int i = 0; i < AW_LANG_COUNT; i++) {
		if (strncmp(code, LANG_CODES[i], 2) == 0) {
			current = (aw_lang)i;
			return true;
		}
	}
	return false;
}

static void save_lang(void)
{
	FILE *file = fopen(LANG_FILE, "w");
	if (file == NULL)
		return; /* Sin SD, o de solo lectura: se pierde la eleccion y ya esta. */
	fputs(LANG_CODES[current], file);
	fclose(file);
}

void aw_text_init(void)
{
	if (load_saved_lang())
		return;

	/*
	 * El idioma de la consola. Japones, coreano, chino y holandes caen a ingles: la fuente de la
	 * consola de libogc solo tiene ASCII, asi que un texto japones saldria en cuadros y el
	 * holandes no esta traducido.
	 */
	if (CONF_Init() < 0) {
		current = AW_LANG_EN;
		return;
	}

	switch (CONF_GetLanguage()) {
	case CONF_LANG_SPANISH: current = AW_LANG_ES; break;
	case CONF_LANG_GERMAN:  current = AW_LANG_DE; break;
	case CONF_LANG_FRENCH:  current = AW_LANG_FR; break;
	case CONF_LANG_ITALIAN: current = AW_LANG_IT; break;
	default:                current = AW_LANG_EN; break;
	}
}

aw_lang aw_next_lang(void)
{
	current = (aw_lang)((current + 1) % AW_LANG_COUNT);
	save_lang();
	return current;
}

#endif /* AW_TEXT_NATIVE_TEST */
