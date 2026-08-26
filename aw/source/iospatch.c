/*
 * Parches de IOS en caliente.
 *
 * Los patrones de bytes y el metodo de aplicacion vienen de libruntimeiospatch, que es lo que usa
 * medio homebrew de la Wii para esto. Se ha copiado aqui en vez de enlazar la libreria porque hacen
 * falta tres parches de los doce que trae, y porque el resto —los de firma— es justo lo que no se
 * quiere activar.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 2.0.
 *
 * Copyright (C) 2010      Joseph Jordan <joe.ftpii@psychlaw.com.au>
 * Copyright (C) 2012-2013 damysteryman
 * Copyright (C) 2012-2015 Christopher Bratusek <nano@jpberlin.de>
 * Copyright (C) 2013      DarkMatterCore
 * Copyright (C) 2014      megazig
 * Copyright (C) 2015      FIX94
 */
#include "iospatch.h"

#include <ogc/machine/processor.h>
#include <string.h>

/*
 * Registro de proteccion de MEM2. Mientras este puesto, IOS es de solo lectura para el PPC aunque
 * AHBPROT este desactivado: son dos cerrojos distintos y hay que abrir los dos.
 *
 * La direccion no esta alineada a 4 a proposito —el registro vive en 0x20a—, y asi es como lo hace
 * todo el mundo desde hace quince anos. No se toca.
 */
#define MEM_REG_BASE 0xd8b4000
#define MEM_PROT     (MEM_REG_BASE + 0x20a)

static void unlock_mem2(void)
{
	write32(MEM_PROT, read32(MEM_PROT) & 0x0000FFFF);
}

/*
 * Los tres parches que interesan.
 *
 * - isfs_permissions: el modulo FS deja de comprobar de quien es cada rama de la NAND. Es el unico
 *   imprescindible: sin el, /title/00010000/<juego>/data responde -102 pase lo que pase.
 * - es_setuid / es_identify: ES deja de filtrar a que titulo se puede uno hacer pasar, con lo que
 *   ES_SetUID vuelve a funcionar como en un cIOS. No hacen falta si el de arriba ha entrado, pero
 *   mantienen el codigo de nand.c con un unico camino en vez de dos.
 *
 * En los tres casos el parche sustituye un salto condicional por un salto siempre o por un nop
 * (0x46C0 es `mov r8, r8` en Thumb).
 */
static const u8 isfs_permissions_old[]   = { 0x42, 0x8B, 0xD0, 0x01, 0x25, 0x66 };
static const u8 isfs_permissions_patch[] = { 0x42, 0x8B, 0xE0, 0x01, 0x25, 0x66 };
static const u8 es_setuid_old[]          = { 0xD1, 0x2A, 0x1C, 0x39 };
static const u8 es_setuid_patch[]        = { 0x46, 0xC0 };
static const u8 es_identify_old[]        = { 0x28, 0x03, 0xD1, 0x23 };
static const u8 es_identify_patch[]      = { 0x00, 0x00 };

/*
 * Busca `old` por toda la zona de IOS y escribe `patch` a `offset` bytes del principio de cada
 * coincidencia. Devuelve cuantas encontro.
 *
 * El principio de la zona lo publica el propio IOS en 0x80003134; el final es donde acaba MEM2. Se
 * recorre entera y se parchean **todas** las coincidencias, no solo la primera: el patron puede
 * aparecer en mas de un modulo y dejarse uno a medias no arregla nada.
 *
 * Despues de escribir hay que bajar la cache de datos y tirar la de instrucciones del tramo tocado:
 * lo que se acaba de escribir esta en la cache del PPC, y quien lo ejecuta es Starlet.
 */
static u32 apply_patch(const u8 *old, u32 old_size, const u8 *patch, u32 patch_size, u32 offset)
{
	u8 *start = (u8 *)*((u32 *)0x80003134);
	u8 *end = (u8 *)0x94000000;
	u32 found = 0;

	for (u8 *p = start; p < end - old_size; p++) {
		if (memcmp(p, old, old_size) != 0)
			continue;

		found++;
		u8 *dest = p + offset;
		memcpy(dest, patch, patch_size);

		u8 *line = (u8 *)(((u32)dest) >> 5 << 5);
		DCFlushRange(line, (patch_size >> 5 << 5) + 64);
		ICInvalidateRange(line, (patch_size >> 5 << 5) + 64);
	}

	return found;
}

s32 iospatch_apply(void)
{
	if (!AHBPROT_DISABLED)
		return IOSPATCH_ERR_NO_AHBPROT;

	unlock_mem2();

	/*
	 * El que cuenta es el de ISFS: es el que abre el guardado. Los de ES se aplican igualmente
	 * pero no deciden nada, porque un IOS puede traerlos ya abiertos o tener otro patron.
	 */
	u32 isfs = apply_patch(isfs_permissions_old, sizeof(isfs_permissions_old),
		isfs_permissions_patch, sizeof(isfs_permissions_patch), 0);

	apply_patch(es_setuid_old, sizeof(es_setuid_old),
		es_setuid_patch, sizeof(es_setuid_patch), 0);
	apply_patch(es_identify_old, sizeof(es_identify_old),
		es_identify_patch, sizeof(es_identify_patch), 2);

	return (s32)isfs;
}
