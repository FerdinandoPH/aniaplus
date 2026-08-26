import { defineConfig } from 'vite';

/*
 * Por defecto la web se sirve desde la raíz del dominio, que es lo que necesita el asistente
 * Wii al servirla desde la SD. `BASE` la construye para un subdirectorio —`BASE=/aniaplus/`
 * para `ejemplo.net/aniaplus/`—; el README lo explica en «Publicarla en un servidor propio».
 */
export default defineConfig({
  base: process.env.BASE ?? '/',
});
