#include "nand.h"

#include "iospatch.h"
#include "text.h"

#include <malloc.h>
#include <ogc/es.h>
#include <ogc/ios.h>
#include <ogc/ipc.h>
#include <ogc/isfs.h>
#include <stdio.h>
#include <string.h>

/*
 * ISFS trabaja por IPC con IOS, así que los buffers tienen que estar alineados a 32 bytes y las
 * transferencias conviene hacerlas por trozos: pedir 3,5 MB de una vez falla en muchas IOS.
 */
#define CHUNK_SIZE (32 * 1024)

static bool initialised = false;
static s32 last_ios_error = 0;
static nand_stage last_stage = NAND_STAGE_NONE;

s32 nand_last_ios_error(void)
{
	return last_ios_error;
}

nand_stage nand_last_stage(void)
{
	return last_stage;
}

const char *nand_stage_text(nand_stage stage)
{
	switch (stage) {
	case NAND_STAGE_OPEN:  return aw_text(TXT_NAND_STAGE_OPEN);
	case NAND_STAGE_STATS: return aw_text(TXT_NAND_STAGE_STATS);
	case NAND_STAGE_READ:  return aw_text(TXT_NAND_STAGE_READ);
	case NAND_STAGE_WRITE: return aw_text(TXT_NAND_STAGE_WRITE);
	default:               return "";
	}
}

const char *nand_error_text(nand_result result)
{
	switch (result) {
	case NAND_OK:              return aw_text(TXT_NAND_OK);
	case NAND_ERR_INIT:        return aw_text(TXT_NAND_ERR_INIT);
	case NAND_ERR_PERMISSION:  return aw_text(TXT_NAND_ERR_PERMISSION);
	case NAND_ERR_NOT_FOUND:   return aw_text(TXT_NAND_ERR_NOT_FOUND);
	case NAND_ERR_SIZE:        return aw_text(TXT_NAND_ERR_SIZE);
	case NAND_ERR_IO:          return aw_text(TXT_NAND_ERR_IO);
	case NAND_ERR_MEMORY:      return aw_text(TXT_NAND_ERR_MEMORY);
	default:                   return aw_text(TXT_NAND_ERR_UNKNOWN);
	}
}

/*
 * Slots donde se instalan los cIOS habituales (d2x / Waninkoko). Se prueban en orden y vale el
 * primero que entre.
 */
static const int CIOS_SLOTS[] = { 249, 250 };
#define CIOS_SLOT_COUNT ((int)(sizeof(CIOS_SLOTS) / sizeof(CIOS_SLOTS[0])))

static nand_access access_mode = NAND_ACCESS_NONE;

nand_access nand_access_mode(void)
{
	return access_mode;
}

const char *nand_access_label(void)
{
	switch (access_mode) {
	case NAND_ACCESS_AHBPROT: return " (AHBPROT)";
	case NAND_ACCESS_CIOS:    return " (cIOS)";
	default:                  return "";
	}
}

/*
 * ¿Esto es Dolphin?
 *
 * El emulador expone /dev/dolphin, un dispositivo que en una consola de verdad no existe (IOS_Open
 * devuelve -6). Es la forma que tiene el propio Dolphin de dejarse reconocer, y aqui hace falta para
 * dos cosas: no intentar recargar un IOS que el emulador no tiene, y no soltarle al usuario el
 * consejo de instalar un cIOS, que ahi no significa nada.
 *
 * La ruta va en un buffer alineado a 32 como todo lo que cruza el IPC.
 */
static char dolphin_path[32] ATTRIBUTE_ALIGN(32) = "/dev/dolphin";

bool nand_is_dolphin(void)
{
	static int cached = -1;
	if (cached >= 0)
		return cached == 1;

	s32 fd = IOS_Open(dolphin_path, IPC_OPEN_NONE);
	if (fd >= 0) {
		IOS_Close(fd);
		cached = 1;
	} else {
		cached = 0;
	}
	return cached == 1;
}

/*
 * ¿Esta ese IOS instalado en la consola?
 *
 * Es la pregunta que faltaba: `IOS_ReloadIOS` a un titulo que no existe no devuelve un error y ya,
 * sino que deja el sistema a medio arrancar —en Dolphin se lleva por delante la emulacion entera—.
 * Se mira antes la lista de titulos que tiene ES, que es barata y no toca nada.
 */
static bool title_installed(u64 wanted)
{
	u32 count = 0;
	if (ES_GetNumTitles(&count) < 0 || count == 0)
		return false;

	/* ES escribe por IPC: el buffer tiene que estar alineado a 32. */
	u64 *titles = memalign(32, count * sizeof(u64));
	if (titles == NULL)
		return false;

	bool found = false;
	if (ES_GetTitles(titles, count) >= 0) {
		for (u32 i = 0; i < count && !found; i++)
			found = titles[i] == wanted;
	}

	free(titles);
	return found;
}

/* Los IOS son titulos del sistema: el mismo listado, con el hueco alto a 1. */
static bool ios_installed(int slot)
{
	return title_installed(0x0000000100000000ULL | (u64)slot);
}

s32 nand_prepare_ios(void)
{
	/*
	 * En el emulador no hay cIOS ninguno, no hay AHBPROT que valga y su IOS emulado no aplica los
	 * permisos de la NAND: no hay nada que hacer ni motivo para hacerlo.
	 */
	if (nand_is_dolphin()) {
		access_mode = NAND_ACCESS_DOLPHIN;
		return IOS_GetVersion();
	}

	/*
	 * Via preferente: parchear en caliente el IOS que ya esta corriendo.
	 *
	 * Solo funciona si el Homebrew Channel nos ha arrancado con AHBPROT desactivado, que es lo que
	 * pide el meta.xml con <ahb_access/>. Si la aplicacion se lanzo desde otra cosa —un forwarder,
	 * un loader, un HBC viejo— eso no llega y hay que seguir por el cIOS.
	 *
	 * Va antes que el cIOS y no despues porque `IOS_ReloadIOS` se lleva AHBPROT por delante: en
	 * cuanto se recarga, esta via deja de estar disponible para siempre.
	 */
	if (AHBPROT_DISABLED) {
		aw_say(TXT_NAND_TRY_AHBPROT);
		s32 patched = iospatch_apply();
		if (patched > 0) {
			access_mode = NAND_ACCESS_AHBPROT;
			aw_say(TXT_NAND_AHBPROT_OK, (long)patched);
			return IOS_GetVersion();
		}
		/*
		 * Ni un solo sitio parcheado: este IOS no tiene el patron que se esperaba. No es un fallo
		 * fatal, es que toca probar el cIOS.
		 */
		aw_say(TXT_NAND_AHBPROT_FAIL);
	}

	s32 current = IOS_GetVersion();

	for (int i = 0; i < CIOS_SLOT_COUNT; i++) {
		int slot = CIOS_SLOTS[i];

		/* Ya estamos donde queriamos: recargar al mismo IOS seria tirar la SD y el mando a la basura. */
		if (current == slot) {
			access_mode = NAND_ACCESS_CIOS;
			return current;
		}

		if (!ios_installed(slot))
			continue;

		aw_say(TXT_NAND_TRY_CIOS, slot);
		if (IOS_ReloadIOS(slot) >= 0) {
			access_mode = NAND_ACCESS_CIOS;
			return IOS_GetVersion();
		}
	}

	/*
	 * Ni AHBPROT ni cIOS. No se aborta: puede que este IOS permita el acceso, y si no, el error de
	 * apertura dira exactamente que ha pasado. Mejor eso que negarse a arrancar por una suposicion.
	 */
	access_mode = NAND_ACCESS_NONE;
	return IOS_GetVersion();
}

/*
 * Las tres versiones, en el orden en que se prueban.
 *
 * Se prueban todas, no solo hasta la primera que valga: en una consola —o en Dolphin, donde es lo
 * normal en cuanto se prueban varias regiones— puede haber guardado de mas de una version, y
 * quedarse con la primera en silencio esconderia las otras. La prueba no es "esta el titulo" sino
 * "se abre su fichero".
 */
static const struct {
	pbr_region region;
	const char *name;
	u64 title;
	const char *path;
} PBR_TITLES[] = {
	{ PBR_REGION_PAL, "PAL", 0x0001000052504250ULL, "/title/00010000/52504250/data/GeniusPbr/PbrSaveData" },
	{ PBR_REGION_USA, "USA", 0x0001000052504245ULL, "/title/00010000/52504245/data/GeniusPbr/PbrSaveData" },
	{ PBR_REGION_JAP, "JAP", 0x000100005250424aULL, "/title/00010000/5250424a/data/GeniusPbr/PbrSaveData" },
};
#define PBR_TITLE_COUNT ((int)(sizeof(PBR_TITLES) / sizeof(PBR_TITLES[0])))

/*
 * Versiones cuyo guardado se ha podido abrir, y cual de ellas se esta usando.
 *
 * `available` guarda indices de PBR_TITLES; `current` es una posicion dentro de `available`, no
 * dentro de PBR_TITLES. Todo lo demas lee de `save_path`, no de una macro.
 */
static int available[PBR_TITLE_COUNT];
static int available_count = 0;
static int current = -1;
static pbr_region found_region = PBR_REGION_UNKNOWN;
static const char *save_path = NULL;

pbr_region nand_region(void)
{
	return found_region;
}

const char *nand_region_text(void)
{
	for (int i = 0; i < PBR_TITLE_COUNT; i++)
		if (PBR_TITLES[i].region == found_region)
			return PBR_TITLES[i].name;
	return "?";
}

int nand_region_count(void)
{
	return available_count;
}

/* Definida mas abajo, junto a los codigos de ISFS que traduce. */
static nand_result classify_open_error(s32 code);

/*
 * Adoptar la identidad de un titulo y abrir la NAND con ella. **El orden importa y es este.**
 *
 * `ES_SetUID` va ANTES de `ISFS_Initialize`, que es lo que abre /dev/fs: un descriptor abierto con
 * la identidad del Homebrew Channel no cambia de permisos porque despues se llame a `ES_SetUID`, y
 * a partir de ahi ISFS deniega el acceso pase lo que pase (-101 o -102) aunque la identidad ya sea
 * la correcta. Es exactamente el fallo que se colo al reordenar este fichero.
 *
 * Las dos llamadas viven aqui y **solo aqui** a proposito: mientras esten juntas no se pueden
 * desordenar moviendo codigo de sitio, que es como se rompio la vez anterior teniendo la regla
 * escrita en un comentario justo al lado.
 */
static s32 last_uid_error = 0;   /* lo que dijo el ultimo ES_SetUID, para avisar solo cuando toca */

static nand_result adopt_identity(u64 title)
{
	last_uid_error = ES_SetUID(title);
	if (last_uid_error < 0)
		last_ios_error = last_uid_error;

	if (ISFS_Initialize() < 0)
		return NAND_ERR_INIT;

	/*
	 * Un `ES_SetUID` fallido no aborta: en algunas IOS el acceso ya esta permitido, y es mejor
	 * intentar abrir el fichero y ver que dice que rendirse aqui.
	 */
	return NAND_OK;
}

/* Cierra /dev/fs para poder volver a abrirlo con otra identidad. Sin esto, cambiarla no sirve. */
static void release_identity(void)
{
	ISFS_Deinitialize();
}

/*
 * Empieza a usar la version que ocupa `slot` de las disponibles.
 *
 * Cambiar de version es cambiar de identidad, y eso obliga a cerrar y volver a abrir la NAND: ver
 * `adopt_identity`.
 */
static nand_result use_available(int slot)
{
	release_identity();

	current = slot;
	const int i = available[slot];
	found_region = PBR_TITLES[i].region;
	save_path = PBR_TITLES[i].path;
	return adopt_identity(PBR_TITLES[i].title);
}

bool nand_next_region(void)
{
	if (available_count < 2)
		return false;
	return use_available((current + 1) % available_count) == NAND_OK;
}

nand_result nand_init(void)
{
	if (initialised)
		return NAND_OK;

	/*
	 * Que versiones hay que probar.
	 *
	 * Lo suyo es probar solo las que ES dice que estan instaladas: en una consola normal es una
	 * sola, y entonces todo esto se reduce a adoptar su identidad y abrir el fichero, que es la
	 * secuencia de toda la vida. Si ES no reconoce ninguna de las tres se prueban las tres, porque
	 * eso es lo que pasa en Dolphin: la carpeta del guardado existe sin que haya titulo instalado.
	 */
	/* Por si se reintenta tras un fallo: no acumular la lista de la vuelta anterior. */
	available_count = 0;
	current = -1;

	bool probe[PBR_TITLE_COUNT];
	int to_probe = 0;
	for (int i = 0; i < PBR_TITLE_COUNT; i++) {
		probe[i] = title_installed(PBR_TITLES[i].title);
		if (probe[i])
			to_probe++;
	}
	bool any_installed = to_probe > 0;
	if (!any_installed) {
		for (int i = 0; i < PBR_TITLE_COUNT; i++)
			probe[i] = true;
	}

	/*
	 * El primer error de una version que si esta instalada es el que dice algo util (permisos),
	 * frente al -106 de una version que esta consola no tiene.
	 */
	s32 first_error = 0;
	int last_probed = -1;

	for (int i = 0; i < PBR_TITLE_COUNT; i++) {
		if (!probe[i])
			continue;

		/*
		 * Cada candidato con su propio ciclo: identidad, abrir la NAND, probar el fichero. Solo se
		 * cierra si queda otro por probar, asi que con un unico candidato —el caso normal— no hay
		 * ni cierre ni reapertura, solo `ES_SetUID` + `ISFS_Initialize` + `ISFS_Open`.
		 */
		if (last_probed >= 0)
			release_identity();

		nand_result ready = adopt_identity(PBR_TITLES[i].title);
		last_probed = i;
		if (ready != NAND_OK)
			return ready;
		/* El aviso solo si ES conoce el titulo: en Dolphin fallan los tres y no significa nada. */
		if (last_uid_error < 0 && any_installed)
			aw_say(TXT_NAND_SETUID_WARN, PBR_TITLES[i].name, (long)last_uid_error);

		s32 fd = ISFS_Open(PBR_TITLES[i].path, ISFS_OPEN_READ);
		if (fd >= 0) {
			ISFS_Close(fd);
			available[available_count++] = i;
			aw_say(TXT_NAND_SAVE_FOUND, PBR_TITLES[i].name);
			continue;
		}
		if (first_error == 0)
			first_error = fd;
		if (any_installed)
			aw_say(TXT_NAND_CANNOT_OPEN, PBR_TITLES[i].name, (long)fd);
	}

	if (available_count > 0) {
		/*
		 * Se empieza por la primera; si hay mas de una, el que llama pregunta al usuario cual
		 * quiere (`nand_region_count` y `nand_next_region`). Elegir aqui seria elegir por el.
		 *
		 * Si la ultima que se probo ya es esa, no se toca nada: cerrar y reabrir la NAND para
		 * quedarse donde ya se estaba solo seria una oportunidad mas de fallar.
		 */
		initialised = true;
		last_ios_error = 0;
		if (last_probed == available[0]) {
			current = 0;
			found_region = PBR_TITLES[available[0]].region;
			save_path = PBR_TITLES[available[0]].path;
			return NAND_OK;
		}
		return use_available(0);
	}

	/*
	 * Ningun guardado que abrir. Se devuelve el error de verdad —no NAND_OK— para que el asistente
	 * lo diga y se pare: anunciar una direccion para servir un guardado que no existe no ayuda a
	 * nadie.
	 */
	save_path = PBR_TITLES[0].path;
	last_stage = NAND_STAGE_OPEN;
	if (!any_installed)
		aw_say(TXT_NAND_NO_PBR);
	return classify_open_error(first_error != 0 ? first_error : -106);
}

/*
 * Traduce los códigos de ISFS a algo que se pueda enseñar al usuario, guardando el crudo.
 *
 * -102 es el "no tienes permiso" clásico, el que ES_SetUID debería evitar. -101 (`ISFS_EINVAL`)
 * lo devuelve IOS también cuando el proceso no tiene derecho a esa rama de la NAND, así que en la
 * práctica se cuenta como problema de permisos y no como error de E/S: decirle al usuario "error
 * de lectura" cuando lo que falla es la identidad le manda a buscar donde no es.
 */
static nand_result classify_open_error(s32 code)
{
	last_ios_error = code;
	if (code == -106)
		return NAND_ERR_NOT_FOUND;
	if (code == -102 || code == ISFS_EINVAL)
		return NAND_ERR_PERMISSION;
	return NAND_ERR_IO;
}

/*
 * Todo lo que se le pasa a IOS por IPC tiene que estar alineado a 32 bytes, y `fstats` no es una
 * excepcion aunque solo mida 8: una variable de pila normal cae donde cae, y si no queda alineada
 * IOS rechaza la llamada con ISFS_EINVAL (-101). Cuesta un rato entenderlo, porque el error apunta
 * a "argumento invalido" y uno mira el descriptor o la ruta, que estan bien.
 */
static fstats stats_buffer __attribute__((aligned(32)));

s32 nand_save_size(void)
{
	s32 fd = ISFS_Open(save_path, ISFS_OPEN_READ);
	if (fd < 0) {
		last_ios_error = fd;
		last_stage = NAND_STAGE_OPEN;
		return fd;
	}

	s32 result = ISFS_GetFileStats(fd, &stats_buffer);
	ISFS_Close(fd);

	if (result < 0) {
		last_ios_error = result;
		last_stage = NAND_STAGE_STATS;
		return result;
	}
	last_stage = NAND_STAGE_NONE;
	return (s32)stats_buffer.file_length;
}

nand_result nand_read_save(u8 *buffer)
{
	if (buffer == NULL)
		return NAND_ERR_MEMORY;

	s32 fd = ISFS_Open(save_path, ISFS_OPEN_READ);
	if (fd < 0)
		return classify_open_error(fd);

	s32 stat_result = ISFS_GetFileStats(fd, &stats_buffer);
	if (stat_result < 0) {
		last_ios_error = stat_result;
		last_stage = NAND_STAGE_STATS;
		ISFS_Close(fd);
		return NAND_ERR_IO;
	}
	if (stats_buffer.file_length != PBR_SAVE_SIZE) {
		ISFS_Close(fd);
		return NAND_ERR_SIZE;
	}

	u32 done = 0;
	while (done < PBR_SAVE_SIZE) {
		u32 want = PBR_SAVE_SIZE - done;
		if (want > CHUNK_SIZE)
			want = CHUNK_SIZE;

		s32 got = ISFS_Read(fd, buffer + done, want);
		if (got <= 0) {
			last_ios_error = got;
			last_stage = NAND_STAGE_READ;
			ISFS_Close(fd);
			return NAND_ERR_IO;
		}
		/*
		 * Si IOS devuelve menos de lo pedido, el siguiente `buffer + done` deja de estar alineado
		 * a 32 y la lectura empezaria a fallar a mitad del guardado. No deberia pasar leyendo de
		 * la NAND, pero si pasa es mejor enterarse aqui que servir 3,5 MB medio corruptos.
		 */
		if ((u32)got != want && ((u32)got & 31) != 0) {
			last_ios_error = got;
			last_stage = NAND_STAGE_READ;
			ISFS_Close(fd);
			return NAND_ERR_IO;
		}
		done += (u32)got;
	}

	ISFS_Close(fd);
	last_stage = NAND_STAGE_NONE;
	return NAND_OK;
}

nand_result nand_write_save(const u8 *buffer)
{
	if (buffer == NULL)
		return NAND_ERR_MEMORY;

	/*
	 * Se abre en modo escritura sobre el fichero existente en vez de borrarlo y recrearlo: si
	 * algo va mal a mitad, al menos el fichero sigue teniendo su tamano y sus permisos, y el
	 * usuario puede volver a escribir encima. Borrarlo dejaria a la consola sin guardado.
	 */
	s32 fd = ISFS_Open(save_path, ISFS_OPEN_WRITE);
	if (fd < 0)
		return classify_open_error(fd);

	u32 done = 0;
	while (done < PBR_SAVE_SIZE) {
		u32 want = PBR_SAVE_SIZE - done;
		if (want > CHUNK_SIZE)
			want = CHUNK_SIZE;

		s32 put = ISFS_Write(fd, buffer + done, want);
		if (put <= 0) {
			last_ios_error = put;
			last_stage = NAND_STAGE_WRITE;
			ISFS_Close(fd);
			return NAND_ERR_IO;
		}
		/* Mismo cuidado que al leer: una escritura corta desalinearia el resto. */
		if ((u32)put != want && ((u32)put & 31) != 0) {
			last_ios_error = put;
			last_stage = NAND_STAGE_WRITE;
			ISFS_Close(fd);
			return NAND_ERR_IO;
		}
		done += (u32)put;
	}

	ISFS_Close(fd);
	last_stage = NAND_STAGE_NONE;
	return NAND_OK;
}
