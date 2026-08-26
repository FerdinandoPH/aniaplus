/*
 * Pantalla del asistente: una cabecera fija y un registro acotado.
 *
 * Con printf a secas, la salida se va por abajo y no vuelve: lo primero que se imprimio se queda
 * clavado arriba y lo ultimo cae fuera de la pantalla. Aqui la parte que interesa de un vistazo
 * —direccion, estado del guardado, teclas— vive en una ventana propia que se repinta entera, y los
 * mensajes van a otra ventana justo debajo, donde pueden desplazarse sin tocar a la cabecera.
 *
 * La distribucion en dos ventanas es de la propia consola de libogc (`consoleSetWindow`), asi que
 * el desplazamiento sigue siendo el suyo y queda confinado al registro.
 */
#ifndef ANIA_SCREEN_H
#define ANIA_SCREEN_H

#include <gccore.h>

/* Lo que se enseña en la cabecera. `ip` tiene que apuntar a algo que siga vivo. */
typedef struct {
	const char *version;
	s32 ios;
	s32 ios_revision;
	/* Por donde se entro a la NAND: " (AHBPROT)", " (cIOS)" o cadena vacia. Nunca NULL. */
	const char *access;
	/* Corriendo dentro de Dolphin: ahi el numero de IOS no dice nada util. */
	bool dolphin;
	/* Version del juego cuyo guardado se ha encontrado: "PAL", "USA", "JAP" o "?". */
	const char *region;
	const char *ip;
	u16 port;
	/* Tamaño del guardado en la NAND, o negativo si no se pudo leer. */
	s32 save_size;
	u32 reads;
	u32 writes;
	bool backup;
	bool session;
	/* La red se ha caido con el asistente ya en marcha: la direccion de arriba ya no responde. */
	bool net_lost;
	/*
	 * Conexiones que se abrieron y se cerraron sin decir nada. Sirve para distinguir "no llego
	 * nada" de "llego algo que no supe leer" cuando se persigue un aviso que no aparece.
	 */
	u32 silent;
} screen_info;

/* Limpia la pantalla, pinta la cabecera y deja el cursor en el registro. */
void screen_begin(const screen_info *info);

/* Repinta solo la cabecera, sin mover el registro. */
void screen_update(const screen_info *info);

/* Una linea en el registro. Se recorta a lo ancho de la pantalla para que no ocupe dos filas. */
void screen_log(const char *format, ...) __attribute__((format(printf, 1, 2)));

#endif
