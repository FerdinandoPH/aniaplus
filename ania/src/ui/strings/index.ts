import type { Lang } from '../../data/index.ts';
import { de } from './de.ts';
import { en } from './en.ts';
import { es } from './es.ts';
import { fr } from './fr.ts';
import { it } from './it.ts';
import { ja } from './ja.ts';

export const dictionaries: Record<Lang, Record<string, string>> = { es, en, de, fr, it, ja };
