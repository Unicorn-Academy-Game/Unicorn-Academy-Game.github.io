/**
 * The grown-ups who live on the maps. Maps place them by these ids and the asset manifest keys
 * their pictures by them.
 */
export const NPC_IDS = [
  'gardener',
  'stable-worker',
  // The palace household.
  'steward',
  'cook',
  'butler',
  'librarian',
  'maestro',
  'dancer',
  'florist',
  'nanny',
  'jeweller',
  'guard',
  // Beyond the palace.
  'witch',
  'wizard',
  'ranger',
  'skipper',
  'santa',
  'elf',
] as const;
export type NpcId = (typeof NPC_IDS)[number];
