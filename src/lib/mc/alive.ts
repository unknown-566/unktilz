import entitiesRaw from './data/entities.json';

/** Ids of entities that aren't alive (boats, arrows, TNT…): no health, gear, effects or AI. */
const NOT_ALIVE = new Set((entitiesRaw as [string, string, number][]).filter((e) => !e[2]).map((e) => e[0]));
/** Anything not known as an object (mobs, ids from mods or newer versions) counts as alive. */
export const isAlive = (entity: string) => !NOT_ALIVE.has(entity.replace(/^minecraft:/, '').trim());
