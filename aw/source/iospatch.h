/*
 * Parcheo del IOS en caliente, aprovechando AHBPROT.
 *
 * Es la alternativa a exigir un cIOS. El Homebrew Channel, si el meta.xml lo pide, arranca la
 * aplicacion sin recargar IOS y con AHBPROT desactivado: a partir de ahi el PPC puede escribir en
 * la zona de MEM2 donde vive el IOS que esta corriendo y quitarle los dos chequeos que estorban
 * —los permisos de ISFS y el filtro de ES_SetUID—. El resultado es el mismo que da un cIOS, pero
 * sobre el IOS de fabrica y sin pedirle nada al usuario.
 *
 * El codigo de los parches viene de libruntimeiospatch (GPLv2); ver iospatch.c.
 */
#ifndef ANIA_IOSPATCH_H
#define ANIA_IOSPATCH_H

#include <gccore.h>

/*
 * ¿Nos han dejado entrar al hardware?
 *
 * Ese registro solo lee 0xFFFFFFFF cuando AHBPROT esta desactivado. Si el meta.xml no pide acceso,
 * o la aplicacion se lanzo desde algo que no es el Homebrew Channel, aqui sale que no y no hay nada
 * que parchear.
 */
#define AHBPROT_DISABLED (*(vu32 *)0xcd800064 == 0xFFFFFFFF)

/*
 * Parchea el IOS que esta corriendo. Devuelve cuantos sitios se han parcheado, o un negativo.
 *
 * Se aplica solo lo que hace falta para llegar al guardado; los parches de firma (trucha) no se
 * tocan, que sirven para instalar titulos y no vienen a cuento aqui.
 *
 * Vale 0: quiere decir que el IOS no tiene los patrones esperados y que hay que buscarse la vida
 * por otro lado (un cIOS).
 */
#define IOSPATCH_ERR_NO_AHBPROT -1

s32 iospatch_apply(void);

#endif
