/*
 * Acceso al guardado de Pokémon Battle Revolution en la NAND de la Wii.
 */
#ifndef ANIA_NAND_H
#define ANIA_NAND_H

#include <gccore.h>

/* Tamaño exacto de PbrSaveData. Cualquier otra cosa no es un guardado de PBR. */
#define PBR_SAVE_SIZE 0x380000

/*
 * Las tres versiones de PBR, cada una con su titulo en la NAND.
 *
 * El identificador es el ASCII del codigo del juego: RPBP (PAL), RPBE (americana) y RPBJ
 * (japonesa). La `a` final de la japonesa va en **minuscula** y eso importa: las carpetas de
 * /title son hexadecimal en minusculas y las rutas de ISFS distinguen mayusculas. Con PAL y USA
 * el problema no se veia, porque son todo digitos.
 */
typedef enum {
	PBR_REGION_UNKNOWN = 0,
	PBR_REGION_PAL,
	PBR_REGION_USA,
	PBR_REGION_JAP,
} pbr_region;

/* Que version se esta usando. "PAL"/"USA"/"JAP", o "?" si no se encontro ninguna. */
const char *nand_region_text(void);
pbr_region nand_region(void);

/*
 * Cuantas versiones tienen guardado en esta consola.
 *
 * Suele ser una, pero puede haber varias —en Dolphin es lo normal en cuanto se prueban regiones
 * distintas—, y entonces hay que dejar elegir en vez de quedarse con la primera en silencio.
 */
int nand_region_count(void);

/*
 * Pasa a la siguiente version disponible. Devuelve false si solo hay una.
 *
 * Cambiar de version es cambiar de fichero: lo que hubiera leido en memoria —incluida la copia de
 * seguridad de la sesion— pertenece al guardado anterior y deja de valer. De eso se encarga quien
 * llama, que es el unico que sabe si hay alguien editando.
 */
bool nand_next_region(void);

typedef enum {
	NAND_OK = 0,
	NAND_ERR_INIT = -1,       /* no se pudo inicializar ISFS */
	NAND_ERR_PERMISSION = -2, /* la NAND no nos deja: falta identificarse como PBR */
	NAND_ERR_NOT_FOUND = -3,  /* el guardado no existe: PBR no se ha jugado nunca */
	NAND_ERR_SIZE = -4,       /* el fichero no mide lo que debe */
	NAND_ERR_IO = -5,         /* fallo leyendo o escribiendo */
	NAND_ERR_MEMORY = -6,
} nand_result;

/*
 * En que llamada concreta se quedo la cosa.
 *
 * `nand_result` agrupa demasiado: un mismo mensaje puede venir de abrir el fichero o de pedir su
 * tamano, que son problemas distintos con soluciones distintas. Saber cual fue ahorra una vuelta
 * entera a la consola.
 */
typedef enum {
	NAND_STAGE_NONE = 0,
	NAND_STAGE_OPEN,
	NAND_STAGE_STATS,
	NAND_STAGE_READ,
	NAND_STAGE_WRITE,
} nand_stage;

const char *nand_error_text(nand_result result);

nand_stage nand_last_stage(void);
const char *nand_stage_text(nand_stage stage);

/*
 * Ultimo codigo crudo devuelto por IOS (ISFS o ES), o 0 si no hubo.
 *
 * `nand_result` agrupa varios fallos distintos bajo el mismo mensaje, y al depurar en una consola
 * de verdad el numero exacto es justo lo que hace falta para distinguirlos.
 */
s32 nand_last_ios_error(void);

/*
 * Prepara el acceso a la NAND.
 *
 * El paso clave es ES_SetUID: los ficheros de /title/00010000/<juego>/data pertenecen al título
 * PBR, y un homebrew lanzado desde el Homebrew Channel corre con otra identidad. Sin adoptar la
 * UID de PBR, ISFS_Open devuelve -102 (permiso denegado). Es lo mismo que hacen los gestores de
 * guardados. Como el título depende de la versión del juego, aquí se prueban las tres y se
 * adopta la del guardado que de verdad esté en esta consola.
 */
/*
 * Por que via se ha conseguido (o no) el acceso a la NAND.
 *
 * Son excluyentes y se prueban en este orden. No es solo informativo: es lo que decide que consejo
 * darle al usuario cuando el guardado no se deja abrir.
 */
typedef enum {
	NAND_ACCESS_NONE = 0, /* IOS de fabrica sin parchear: lo normal es que deniegue */
	NAND_ACCESS_AHBPROT,  /* IOS de fabrica, parcheado en caliente al arrancar */
	NAND_ACCESS_CIOS,     /* recargado a un cIOS, que ya viene parcheado */
	NAND_ACCESS_DOLPHIN,  /* emulador: su IOS no aplica los permisos */
} nand_access;

/*
 * Consigue acceso a la NAND, y devuelve el IOS en uso al terminar.
 *
 * Hay que llamarla **lo primero**, antes de WPAD_Init y de fatInitDefault: la via del cIOS recarga
 * IOS, y eso desmonta la SD y tira la pila Bluetooth, asi que hacerlo despues dejaria la tarjeta
 * sin montar y el mando sin responder. La via de AHBPROT no recarga nada, pero el orden tiene que
 * valer para las dos.
 *
 * Se prueba AHBPROT primero **a proposito**, aunque haya un cIOS instalado: parchear el IOS que ya
 * esta corriendo no recarga nada, con lo que no hay SD que remontar ni mando que reiniciar, y sale
 * mas barato y menos frágil que la recarga.
 *
 * Si no hay ninguna via no aborta: sigue con el IOS que haya y deja que nand_init lo intente
 * igualmente. Fallara, pero con un mensaje que explica por que.
 */
s32 nand_prepare_ios(void);

/* Por donde se ha entrado. Sirve para dar una pista al usuario cuando el acceso falla. */
nand_access nand_access_mode(void);

/* Etiqueta corta para la cabecera: " (AHBPROT)", " (cIOS)" o cadena vacia. */
const char *nand_access_label(void);

/*
 * ¿Se esta corriendo dentro de Dolphin?
 *
 * El emulador no necesita nada de esto —su IOS emulado abre el guardado sin mas— y ademas no
 * soporta que se recargue a un titulo que no tiene: se cierra. Lo que aqui se decide es no tocar el
 * IOS ni su memoria y, de paso, no dar consejos que en el emulador no vienen a cuento.
 */
bool nand_is_dolphin(void);

nand_result nand_init(void);

/* Lee el guardado completo en `buffer`, que debe tener PBR_SAVE_SIZE bytes y estar alineado a 32. */
nand_result nand_read_save(u8 *buffer);

/* Escribe el guardado completo desde `buffer`. */
nand_result nand_write_save(const u8 *buffer);

/* Tamaño del guardado en la NAND, o negativo si hay error. Sirve para comprobar que existe. */
s32 nand_save_size(void);

#endif
