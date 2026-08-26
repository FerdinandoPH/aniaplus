/**
 * Movimientos de estado de Gen 4 (potencia base 0), por nombre canónico en inglés.
 *
 * ---------------------------------------------------------------------------------------------
 * POR QUÉ ESTÁ ESCRITO A MANO
 *
 * Es el único dato de ANIA+ que no sale ni de PKHeX ni del disco del juego:
 *   - PKHeX solo guarda los PP de cada movimiento (`Moves/MoveInfo4.cs`). Al ser un editor de
 *     guardados nunca necesita potencia ni categoría, y no hay ninguna otra tabla.
 *   - En el disco, la tabla del juego vive dentro de los archivos `.fsys`, que están
 *     comprimidos. Se barrió `main.dol` con todas las zancadas de 1 a 128 y los 1711 ficheros
 *     del disco buscando la columna de PP de PKHeX, sin ninguna coincidencia.
 *
 * Se indexa por NOMBRE y no por ID a propósito: el extractor resuelve cada nombre contra
 * `text_Moves_en.txt` de PKHeX y falla si alguno no existe, así que una errata se detecta al
 * instante en vez de convertirse en un ID equivocado que nadie nota.
 *
 * Solo se usa para la regla "un equipo aleatorio debe llevar al menos un movimiento que haga
 * daño". No afecta a la legalidad ni a lo que se escribe en el guardado.
 * ---------------------------------------------------------------------------------------------
 */
export const GEN4_STATUS_MOVES = [
  // --- Gen 1
  'Swords Dance', 'Whirlwind', 'Sand Attack', 'Tail Whip', 'Leer', 'Growl', 'Roar', 'Sing',
  'Supersonic', 'Disable', 'Mist', 'Leech Seed', 'Growth', 'Poison Powder', 'Stun Spore',
  'Sleep Powder', 'String Shot', 'Thunder Wave', 'Toxic', 'Hypnosis', 'Meditate', 'Agility',
  'Teleport', 'Mimic', 'Screech', 'Double Team', 'Recover', 'Harden', 'Minimize', 'Smokescreen',
  'Confuse Ray', 'Withdraw', 'Defense Curl', 'Barrier', 'Light Screen', 'Haze', 'Reflect',
  'Focus Energy', 'Metronome', 'Mirror Move', 'Amnesia', 'Kinesis', 'Soft-Boiled', 'Glare',
  'Poison Gas', 'Lovely Kiss', 'Transform', 'Spore', 'Flash', 'Splash', 'Acid Armor', 'Rest',
  'Sharpen', 'Conversion', 'Substitute',

  // --- Gen 2
  'Sketch', 'Spider Web', 'Mind Reader', 'Nightmare', 'Curse', 'Conversion 2', 'Cotton Spore',
  'Spite', 'Protect', 'Scary Face', 'Sweet Kiss', 'Belly Drum', 'Spikes', 'Foresight',
  'Destiny Bond', 'Perish Song', 'Detect', 'Lock-On', 'Sandstorm', 'Endure', 'Charm', 'Swagger',
  'Milk Drink', 'Mean Look', 'Attract', 'Sleep Talk', 'Heal Bell', 'Safeguard', 'Pain Split',
  'Baton Pass', 'Encore', 'Sweet Scent', 'Morning Sun', 'Synthesis', 'Moonlight', 'Rain Dance',
  'Sunny Day', 'Psych Up',

  // --- Gen 3
  'Stockpile', 'Swallow', 'Hail', 'Torment', 'Flatter', 'Will-O-Wisp', 'Memento', 'Follow Me',
  'Charge', 'Taunt', 'Helping Hand', 'Trick', 'Role Play', 'Wish', 'Assist', 'Ingrain',
  'Magic Coat', 'Recycle', 'Yawn', 'Skill Swap', 'Imprison', 'Refresh', 'Grudge', 'Snatch',
  'Camouflage', 'Tail Glow', 'Feather Dance', 'Teeter Dance', 'Mud Sport', 'Slack Off',
  'Aromatherapy', 'Fake Tears', 'Odor Sleuth', 'Metal Sound', 'Grass Whistle', 'Tickle',
  'Cosmic Power', 'Iron Defense', 'Block', 'Howl', 'Bulk Up', 'Water Sport', 'Calm Mind',
  'Dragon Dance', 'Nature Power',

  // --- Gen 4
  'Roost', 'Gravity', 'Miracle Eye', 'Healing Wish', 'Tailwind', 'Acupressure', 'Embargo',
  'Psycho Shift', 'Heal Block', 'Power Trick', 'Gastro Acid', 'Lucky Chant', 'Me First',
  'Copycat', 'Power Swap', 'Guard Swap', 'Worry Seed', 'Toxic Spikes', 'Heart Swap', 'Aqua Ring',
  'Magnet Rise', 'Rock Polish', 'Switcheroo', 'Nasty Plot', 'Defog', 'Trick Room', 'Captivate',
  'Stealth Rock', 'Defend Order', 'Heal Order', 'Lunar Dance', 'Dark Void',
] as const;

/**
 * Pokémon a los que no se les exige un movimiento ofensivo al generar equipos aleatorios,
 * porque su función en combate no pasa por atacar directamente.
 */
export const NO_DAMAGE_REQUIRED_SPECIES = [
  132, // Ditto — solo puede llevar Transform
  202, // Wobbuffet — Contraataque/Manto Espejo son de daño pero dependen del rival
  360, // Wynaut
  235, // Smeargle — Esquema copia cualquier cosa
] as const;
