import { EXIT_ARROW_HEIGHT } from '../content/exits';
import { lifeSubject, propSubject, unicornSubject, WORDS, type WordId } from '../content/lexicon';
import { PROP_DEFS } from '../content/props';
import type { World } from '../domain';
import { critterTop, type TapTarget, unicornTop } from '../input/hit';
import { type Chart, routeTo } from '../learning';
import type { Vec2 } from '../shared/ids';
import { type Interactable, portalMark } from '../shared/map';

/**
 * Taking the herd to a word. The lesson says which word the player is looking for. This says where
 * to go in the place she is in. That is the thing that gives the word when it is here, and
 * otherwise the way out the road to it begins with. It reads the world and changes none of it, so
 * it can be asked every frame.
 */

export type Goal =
  /**
   * The thing that gives the word is here, and `target` is what a tap on it would be. `at` is just
   * above it.
   */
  | { kind: 'thing'; target: TapTarget; at: Vec2 }
  /** The word is through a way out. `at` is where that way out's own arrow hovers. */
  | { kind: 'exit'; portalId: string; at: Vec2 };

interface Thing {
  target: TapTarget;
  at: Vec2;
  /** Where it stands on the ground, which is what nearest means. */
  ground: Vec2;
}

/** Where the bubble for a prop hovers, which is the middle of the top of its tap region. */
const topOf = (inst: Interactable): Vec2 => ({ x: inst.hit.x + inst.hit.w / 2, y: inst.hit.y });

/** Everything standing in the world now that gives one of these subjects. */
function thingsGiving(world: World, subjects: ReadonlySet<string>): Thing[] {
  const found: Thing[] = [];
  for (const inst of world.interactables.values()) {
    if (!subjects.has(propSubject(inst.definitionId))) continue;
    found.push({ target: { kind: 'prop', instanceId: inst.instanceId }, at: topOf(inst), ground: inst.pos });
  }
  for (const critter of world.life.critters) {
    if (!subjects.has(lifeSubject(critter.kind))) continue;
    found.push({ target: { kind: 'critter', id: critter.id }, at: critterTop(critter), ground: critter.pos });
  }
  for (const unicorn of Object.values(world.unicorns)) {
    if (unicorn && subjects.has(unicornSubject(unicorn.id)))
      found.push({ target: { kind: 'unicorn', id: unicorn.id }, at: unicornTop(unicorn), ground: unicorn.pos });
  }
  return found;
}

/**
 * The clue that opens a door still shut for want of one, so that the way on starts with it. A door
 * that wants a word asks for it when the herd gets there.
 */
function clueFor(world: World, doorId: string | undefined): Interactable | undefined {
  const door = doorId === undefined ? undefined : world.interactables.get(doorId);
  if (!door || world.unlocked.has(door.instanceId) || PROP_DEFS[door.definitionId]?.lock !== 'clue') return undefined;
  return [...world.interactables.values()].find((i) => PROP_DEFS[i.definitionId]?.opens === door.definitionId);
}

const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Where to go to find a word from where the herd stands. Nothing when no place in the game gives
 * it. The friends who walk along are here wherever the herd goes, except where only Wildstar may go
 * in.
 */
export function goalFor(world: World, chart: Chart, word: WordId): Goal | null {
  const subjects = WORDS[word].subjects;
  const walking = new Set(
    world.persistent.recruited.filter((id) => world.unicorns[id] !== undefined).map(unicornSubject),
  );
  const route = routeTo(chart, world.map.id, subjects, walking);
  if (route.kind === 'nowhere') return null;
  if (route.kind === 'onward') {
    const portal = world.map.portals.find((p) => p.portalId === route.exit.portalId);
    if (!portal) return null;
    const clue = clueFor(world, portal.door);
    if (clue) return { kind: 'thing', target: { kind: 'prop', instanceId: clue.instanceId }, at: topOf(clue) };
    const mark = portalMark(portal);
    return { kind: 'exit', portalId: portal.portalId, at: { x: mark.x, y: mark.y - EXIT_ARROW_HEIGHT } };
  }
  const herd = world.unicorns.wildstar!.pos;
  const nearest = thingsGiving(world, new Set(subjects)).sort(
    (a, b) => distance(herd, a.ground) - distance(herd, b.ground),
  )[0];
  return nearest ? { kind: 'thing', target: nearest.target, at: nearest.at } : null;
}
