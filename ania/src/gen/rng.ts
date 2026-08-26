/**
 * Generador pseudoaleatorio con semilla explícita.
 *
 * `Math.random()` no vale aquí por dos motivos: los tests necesitan ser reproducibles, y el
 * usuario debe poder regenerar el mismo lote de pases si comparte la semilla.
 *
 * Es un xoshiro128** — pequeño, rápido y de calidad más que suficiente para esto.
 */
export class Rng {
  private s: [number, number, number, number];

  constructor(seed: number = Date.now()) {
    // splitmix32 para expandir la semilla a los cuatro estados y evitar arrancar en cero.
    let x = seed >>> 0;
    const next = () => {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
      return (z ^ (z >>> 15)) >>> 0;
    };
    this.s = [next(), next(), next(), next()];
  }

  /** Siguiente entero de 32 bits sin signo. */
  next(): number {
    const [s0, s1, s2, s3] = this.s;
    const rotl = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0;
    const result = (Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0) >>> 0;

    const t = (s1 << 9) >>> 0;
    let a = s2 ^ s0;
    let b = s3 ^ s1;
    this.s = [
      (s0 ^ b) >>> 0,
      (s1 ^ a) >>> 0,
      (a ^ t) >>> 0,
      rotl(b, 11),
    ];
    return result;
  }

  /** Entero en [0, max). */
  int(max: number): number {
    if (max <= 0) return 0;
    return this.next() % max;
  }

  /** Entero en [min, max], ambos incluidos. */
  range(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  bool(): boolean {
    return (this.next() & 1) === 1;
  }

  /** Elemento al azar. Lanza si la lista está vacía, porque eso siempre es un error de lógica. */
  pick<T>(list: readonly T[]): T {
    if (list.length === 0) throw new Error('No se puede elegir de una lista vacía');
    return list[this.int(list.length)]!;
  }

  /** Baraja una copia (Fisher-Yates), sin tocar el original. */
  shuffle<T>(list: readonly T[]): T[] {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }

  /** `count` elementos distintos, o todos si la lista es más corta. */
  sample<T>(list: readonly T[], count: number): T[] {
    return this.shuffle(list).slice(0, count);
  }
}
