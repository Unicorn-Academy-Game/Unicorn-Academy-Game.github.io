import {
  CONFIG,
  type Command,
  checkInvariants,
  createWorld,
  dispatch,
  drainEvents,
  newPersistent,
  type Persistent,
  step,
  type UnicornActor,
  type World,
} from '../../src/domain';
import { slotS } from '../../src/domain/ops';
import { MAP_IDS, type MapId, type UnicornId } from '../../src/shared/ids';
import type { LogicMap } from '../../src/shared/map';
import { mulberry32 } from '../art/core/rng';

/**
 * Plays the simulation with no screen and counts what looks wrong to a child: a unicorn that
 * changes what it is doing several times a second, one that jumps instead of walking, and two that
 * stand on top of each other for more than a moment. It plays the built maps the way a visitor
 * does: idle spells, walks, frantic tapping, spells, doors, and any set of friends.
 */

export interface CensusOptions {
  /** Herd minutes played from each starting map, per seed. */
  minutes: number;
  seeds: number;
  /** Only start on this map. The herd still walks through doors to the others. */
  only?: MapId | undefined;
  /** A change that undoes itself within this many seconds counts as a flicker. */
  fast: number;
  /** Two unicorns nearer than this many units, for half a second or more, count as stacked. */
  close: number;
  /**
   * The share of play spent steering Wildstar the way a child does, with a finger held on the
   * screen and moved about (see `steering` below). The rest is played as taps. Left out, the play
   * is all taps.
   */
  steering?: number | undefined;
  /** Which of the five ways of holding a finger are played, by number. Left out, all of them. */
  styles?: readonly number[] | undefined;
  /** Print what the named unicorns do, every few steps, in one run and time window. */
  trace?: { where: string; from: number; to: number; who: readonly string[]; every: number } | undefined;
  log?: ((line: string) => void) | undefined;
  /**
   * Called after every step of every run, for a script that wants to look at the world at one
   * moment.
   */
  inspect?: ((world: World, where: string) => void) | undefined;
}

interface Flicker {
  field: 'state' | 'clip' | 'facing';
  pattern: string;
  where: string;
  at: number;
  held: number;
  during: string;
}

interface Stack {
  pair: string;
  states: string;
  where: string;
  at: number;
  seconds: number;
  nearest: number;
}

interface Arrival {
  where: string;
  members: number;
  /** Closest pair the moment the herd arrives, and three seconds later once it has settled. */
  nearest: number;
  settled: number;
}

export interface Census {
  herdMinutes: number;
  flickers: Flicker[];
  /** Unicorn with unicorn. */
  stacks: Stack[];
  /** A worker with a unicorn. */
  crossings: Stack[];
  arrivals: Arrival[];
  jumps: {
    steps: number;
    count: number;
    worst: number;
    by: Record<string, number>;
    examples: { where: string; at: number; who: string; gap: number }[];
  };
  /**
   * Followers that could not walk back to the herd and were put back on its trail. Each one is a
   * pop and a sparkle.
   */
  relocations: number;
  /**
   * Wildstar set down on open ground. `misplaced` is for standing where no route could begin, which
   * a finger can walk her into, or not on her feet at all. `stalled` is the watch finding her meant
   * to move and not moving, whatever the cause. Play should never need it.
   */
  leaderResets: { misplaced: number; stalled: number };
  violations: Record<string, number>;
  /** The first time each kind of invariant broke, as it was worded then and where. */
  violationExamples: Record<string, string>;
  closeness: { seconds: number; under: Record<number, number> };
}

/**
 * A unicorn that moves farther than this in one step has jumped, not walked. Walking tops out near
 * ten.
 */
const JUMP = 14;
const THRESHOLDS = [30, 45, 60, 75, 90] as const;
const STACK_FOR = 0.5;
const FRIENDS: UnicornId[] = ['leaf', 'glacier', 'river', 'cinder', 'storm'];
/**
 * The sets of friends the herd is played with: all of them, the first two, three reversed, and a
 * shuffled four.
 */
const SUBSETS: UnicornId[][] = [
  FRIENDS,
  FRIENDS.slice(0, 2),
  [...FRIENDS].reverse().slice(0, 3),
  ['storm', 'river', 'leaf', 'cinder'],
];
const DT = CONFIG.step;

/** A command as the player gives it, before it is numbered. */
type Intent = Command extends infer C ? (C extends unknown ? Omit<C, 'commandId'> : never) : never;

interface Run {
  value: string;
  start: number;
  end: number;
  during: string;
}
interface Open {
  since: number;
  nearest: number;
  states: string;
  seconds: number;
  kind: 'stacks' | 'crossings';
}

const label = (u: UnicornActor): string => {
  const s = u.state;
  return s.kind === 'performing' || s.kind === 'approaching' ? `${s.kind}:${s.activity}` : s.kind;
};

const herdOf = (world: World): UnicornActor[] =>
  Object.values(world.unicorns).filter(
    (u): u is UnicornActor => u !== undefined && world.persistent.recruited.includes(u.id),
  );

const nearestPair = (herd: readonly UnicornActor[]): number => {
  let nearest = Infinity;
  for (let i = 0; i < herd.length; i++)
    for (let j = i + 1; j < herd.length; j++)
      nearest = Math.min(nearest, Math.hypot(herd[i]!.pos.x - herd[j]!.pos.x, herd[i]!.pos.y - herd[j]!.pos.y));
  return nearest;
};

/** One map visit: the runs of each tracked value and the pairs that are close right now. */
class Visit {
  private readonly runs = new Map<string, Run[]>();
  private readonly open = new Map<string, Open>();
  /**
   * When the player last gave a command, so a change the player caused is not counted against the
   * unicorns.
   */
  commandAt = -Infinity;
  constructor(
    readonly where: string,
    private readonly census: Census,
    private readonly options: CensusOptions,
  ) {}

  value(t: number, key: string, field: Flicker['field'], value: string, during: string): void {
    let runs = this.runs.get(key);
    if (!runs) {
      runs = [];
      this.runs.set(key, runs);
    }
    const last = runs[runs.length - 1];
    if (last && last.value === value) {
      last.end = t;
      return;
    }
    if (last && runs.length >= 2) {
      const a = runs[runs.length - 2]!;
      const held = last.end - last.start + DT;
      const byPlayer = field === 'state' && this.commandAt >= last.start - 0.1;
      if (a.value === value && held <= this.options.fast && !byPlayer) {
        this.census.flickers.push({
          field,
          pattern: `${a.value} > ${last.value} > ${value}`,
          where: `${this.where} ${key}`,
          at: last.start,
          held,
          during: `${a.during} | ${last.during} | ${during}`,
        });
      }
    }
    runs.push({ value, start: t, end: t, during });
    if (runs.length > 2) runs.shift();
  }

  pair(t: number, key: string, distance: number, states: string, kind: 'stacks' | 'crossings'): void {
    const now = this.open.get(key);
    if (distance < this.options.close) {
      if (now) {
        now.nearest = Math.min(now.nearest, distance);
        now.seconds += DT;
        if (distance === now.nearest) now.states = states;
      } else this.open.set(key, { since: t, nearest: distance, states, seconds: DT, kind });
    } else if (now) this.settle(key, now);
  }

  private settle(key: string, now: Open): void {
    if (now.seconds >= STACK_FOR) {
      this.census[now.kind].push({
        pair: key,
        states: now.states,
        where: this.where,
        at: now.since,
        seconds: now.seconds,
        nearest: now.nearest,
      });
    }
    this.open.delete(key);
  }

  finish(): void {
    for (const [key, now] of this.open) this.settle(key, now);
  }
}

function observe(world: World, visit: Visit, census: Census, options: CensusOptions): void {
  const t = world.time;
  const trace = options.trace;
  options.inspect?.(world, visit.where);
  if (trace && visit.where.includes(trace.where) && t >= trace.from && t <= trace.to && world.tick % trace.every === 0)
    traceLine(world, visit.where, trace.who, options.log ?? console.log);

  for (const message of checkInvariants(world)) {
    const kind = message.replace(/\d+(\.\d+)?/g, '#');
    census.violations[kind] = (census.violations[kind] ?? 0) + 1;
    census.violationExamples[kind] ??= `${message} at ${visit.where} ${t.toFixed(2)} s`;
  }

  const herd = herdOf(world);
  for (const u of herd) {
    const gap = Math.hypot(u.pos.x - u.prev.x, u.pos.y - u.prev.y);
    census.jumps.steps++;
    if (gap > JUMP) {
      census.jumps.count++;
      census.jumps.worst = Math.max(census.jumps.worst, gap);
      census.jumps.by[u.state.kind] = (census.jumps.by[u.state.kind] ?? 0) + 1;
      if (census.jumps.examples.length < 40) census.jumps.examples.push({ where: visit.where, at: t, who: u.id, gap });
    }
    const during = `${label(u)}@${Math.round(u.speed)}`;
    visit.value(t, `${u.id}.state`, 'state', label(u), during);
    visit.value(t, `${u.id}.clip`, 'clip', u.anim.clip, during);
    visit.value(t, `${u.id}.facing`, 'facing', String(u.anim.facing), during);
  }
  for (let i = 0; i < herd.length; i++) {
    for (let j = i + 1; j < herd.length; j++) {
      const a = herd[i]!;
      const b = herd[j]!;
      visit.pair(
        t,
        `${a.id}+${b.id}`,
        Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y),
        `${label(a)} / ${label(b)}`,
        'stacks',
      );
    }
  }
  for (const n of world.npcs) {
    for (const u of herd)
      visit.pair(
        t,
        `${n.id}+${u.id}`,
        Math.hypot(n.pos.x - u.pos.x, n.pos.y - u.pos.y),
        `${n.state.kind} / ${label(u)}`,
        'crossings',
      );
  }
  if (herd.length > 1) {
    const nearest = nearestPair(herd);
    census.closeness.seconds += DT;
    for (const k of THRESHOLDS) if (nearest < k) census.closeness.under[k]! += DT;
  }
}

function traceLine(world: World, where: string, who: readonly string[], log: (line: string) => void): void {
  const rows = herdOf(world)
    .filter((u) => who.length === 0 || who.includes(u.id))
    .map((u) => {
      const st = u.state;
      const bend = st.kind === 'following' ? world.trail.bendAt(st.s, 40) : null;
      const extra =
        st.kind === 'following' && bend
          ? ` s=${st.s.toFixed(0)}/${slotS(world, u.id).toFixed(0)} v=${st.v.toFixed(0)} lat=${st.lat.toFixed(0)} join=${Math.hypot(st.join.x, st.join.y).toFixed(0)} push=(${st.push.x.toFixed(0)},${st.push.y.toFixed(0)}) tan=(${bend.tangent.x.toFixed(2)},${bend.tangent.y.toFixed(2)}) straight=${bend.straight.toFixed(2)}`
          : '';
      return `${u.id.slice(0, 5)} ${label(u)} (${u.pos.x.toFixed(0)},${u.pos.y.toFixed(0)}) v${u.speed.toFixed(0)} ${u.anim.clip}/${u.anim.facing}${extra}`;
    });
  log(`[${where}] t=${world.time.toFixed(2)}\n   ${rows.join('\n   ')}`);
}

/**
 * One visitor's session: `minutes` of play on and across the maps, from `startMap`, with `friends`
 * in the herd.
 */
function play(
  maps: Record<MapId, LogicMap>,
  startMap: MapId,
  seed: number,
  friends: UnicornId[],
  census: Census,
  options: CensusOptions,
): void {
  const rng = mulberry32(seed * 7919 + 13);
  const between = (lo: number, hi: number): number => lo + rng() * (hi - lo);
  const persistent: Persistent = newPersistent('00000000-0000-4000-8000-000000000001');
  persistent.recruited = ['wildstar', ...friends];
  const tag = `[from ${startMap} ${friends.length}f seed${seed}]`;
  let mapId = startMap;
  let spawn = maps[mapId].start ?? maps[mapId].spawns[0]!.spawnId;
  let world!: World;
  let visit!: Visit;
  let settleAt = Infinity;
  let arrival!: Arrival;
  let commandId = 0;
  let elapsed = 0;
  const horizon = options.minutes * 60;

  const enter = (seedFor: number): void => {
    world = createWorld({ map: maps[mapId], persistent, seed: seedFor, arrival: { kind: 'spawn', spawnId: spawn } });
    visit = new Visit(`${mapId} ${tag}`, census, options);
    arrival = {
      where: `${mapId}/${spawn} ${tag}`,
      members: friends.length + 1,
      nearest: nearestPair(herdOf(world)),
      settled: Infinity,
    };
    census.arrivals.push(arrival);
    settleAt = world.time + 3;
  };
  enter(seed);

  /**
   * `byPlayer` marks the moment the player did something, so a change that follows is not counted
   * against the unicorns.
   */
  const send = (c: Intent, byPlayer: boolean): void => {
    if (byPlayer) visit.commandAt = world.time;
    dispatch(world, { ...c, commandId: `c${commandId++}` });
  };
  const command = (c: Intent): void => send(c, true);

  /** Runs for up to `seconds`. Returns false when a door was taken, which starts a new visit. */
  const advance = (seconds: number): boolean => {
    const steps = Math.round(seconds * CONFIG.stepHz);
    for (let i = 0; i < steps && elapsed < horizon; i++) {
      step(world);
      elapsed += DT;
      observe(world, visit, census, options);
      if (world.time >= settleAt) {
        arrival.settled = nearestPair(herdOf(world));
        settleAt = Infinity;
      }
      const events = drainEvents(world);
      census.relocations += events.filter((e) => e.type === 'companion-relocated').length;
      for (const e of events) if (e.type === 'leader-reset') census.leaderResets[e.why]++;
      const entered = events.find((e) => e.type === 'portal-entered');
      if (entered && entered.type === 'portal-entered') {
        visit.finish();
        mapId = entered.to.mapId;
        spawn = entered.to.spawnId;
        enter(Math.floor(rng() * 1e9));
        return false;
      }
    }
    return true;
  };

  /**
   * A finger held on the screen for `seconds`, moved about fifteen times a second, in one of five
   * ways: drifting, wiggling, going round in a circle, turning right back on itself, and holding
   * and letting go. Only the first move and the last count as the player doing something. A door
   * taken on the way ends the visit, as it does everywhere.
   */
  const hold = (seconds: number): void => {
    const pool = options.styles ?? [0, 1, 2, 3, 4];
    const style = pool[Math.floor(rng() * pool.length)]!;
    let angle = rng() * Math.PI * 2;
    let down = false;
    const moves = Math.round((seconds * CONFIG.stepHz) / 2);
    for (let k = 0; k < moves; k++) {
      if (style === 0) angle += (rng() - 0.5) * 0.3;
      else if (style === 1) angle += (rng() - 0.5) * 2.2;
      else if (style === 2) angle += 0.09;
      else if (style === 3 && k > 0 && k % 30 === 0) angle += Math.PI;
      if (style === 4 && Math.floor(k / 12) % 2 === 1) {
        if (down) send({ type: 'halt' }, true);
        down = false;
      } else {
        send({ type: 'steer', heading: { x: Math.cos(angle), y: Math.sin(angle) } }, !down);
        down = true;
      }
      if (!advance(2 / CONFIG.stepHz)) return;
    }
    send({ type: 'halt' }, true);
    advance(between(0.5, 3));
  };

  const pointNear = (): { x: number; y: number } | null => {
    const lead = world.unicorns.wildstar!.pos;
    return world.nav.freePointNear({ x: lead.x + (rng() - 0.5) * 1100, y: lead.y + (rng() - 0.5) * 800 }, [], 0, 240);
  };
  const anyone = (): UnicornId => ['wildstar', ...friends][Math.floor(rng() * (friends.length + 1))] as UnicornId;

  while (elapsed < horizon) {
    if (options.steering && rng() < options.steering) {
      hold(between(2, 14));
      continue;
    }
    const roll = rng();
    const map = maps[mapId];
    if (roll < 0.3) advance(between(6, 28));
    else if (roll < 0.52) {
      const goal = pointNear();
      if (goal) command({ type: 'move', destination: goal });
      advance(between(3, 12));
    } else if (roll < 0.62) {
      // A small child tapping all over the screen.
      for (let k = 0, n = 3 + Math.floor(rng() * 6); k < n; k++) {
        const goal = pointNear();
        if (goal) command({ type: 'move', destination: goal });
        if (!advance(between(0.1, 0.9))) break;
      }
      advance(between(2, 6));
    } else if (roll < 0.72) {
      for (let k = 0, n = 2 + Math.floor(rng() * 4); k < n; k++) {
        command({ type: 'cast', unicornId: anyone() });
        if (!advance(between(0.1, 0.5))) break;
      }
      advance(between(1, 3));
    } else if (roll < 0.82) {
      command({ type: 'cast', unicornId: anyone() });
      advance(between(0.4, 3));
    } else if (roll < 0.92 && map.interactables.length > 0) {
      const props = map.interactables.filter((i) => i.definitionId !== 'door');
      const it = props[Math.floor(rng() * props.length)];
      if (it) command({ type: 'interact', instanceId: it.instanceId });
      advance(between(5, 18));
    } else if (map.portals.length > 0) {
      const portal = map.portals[Math.floor(rng() * map.portals.length)]!;
      const { x, y, w, h } = portal.bounds;
      if (portal.door) command({ type: 'interact', instanceId: portal.door });
      else command({ type: 'move', destination: { x: x + w / 2, y: y + h / 2 } });
      advance(between(8, 20));
    } else advance(between(2, 8));
  }
  visit.finish();
}

export function runCensus(maps: Record<MapId, LogicMap>, options: CensusOptions): Census {
  const census: Census = {
    herdMinutes: 0,
    flickers: [],
    stacks: [],
    crossings: [],
    arrivals: [],
    jumps: { steps: 0, count: 0, worst: 0, by: {}, examples: [] },
    relocations: 0,
    leaderResets: { misplaced: 0, stalled: 0 },
    violations: {},
    violationExamples: {},
    closeness: { seconds: 0, under: Object.fromEntries(THRESHOLDS.map((k) => [k, 0])) },
  };
  for (const id of MAP_IDS) {
    if (options.only && id !== options.only) continue;
    for (let seed = 1; seed <= options.seeds; seed++) {
      play(maps, id, seed, SUBSETS[(seed - 1) % SUBSETS.length]!, census, options);
      census.herdMinutes += options.minutes;
    }
  }
  return census;
}

const tally = <T>(rows: readonly T[], key: (r: T) => string): [string, T[]][] => {
  const groups = new Map<string, T[]>();
  for (const r of rows) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
};

/** What each flicker was doing on either side of it, without the speeds. */
const kinds = (during: string): string =>
  during
    .split(' | ')
    .map((x) => x.split('@')[0])
    .join(' | ');

export function report(c: Census, options: CensusOptions): string[] {
  const out: string[] = [];
  const row = (n: number, text: string): string => `  ${String(n).padStart(4)}  ${text}`;
  out.push(`${c.herdMinutes} minutes of herd time played`);

  out.push('', `Flickers, a change undone within ${options.fast} s: ${c.flickers.length}`);
  for (const [k, rows] of tally(c.flickers, (f) => `${f.field}: ${f.pattern}`).slice(0, 14))
    out.push(
      row(
        rows.length,
        `${k}   e.g. ${rows[0]!.where} at ${rows[0]!.at.toFixed(2)} s held ${rows[0]!.held.toFixed(2)} s`,
      ),
    );
  if (c.flickers.length > 0) {
    out.push('', 'Flickers by what the unicorn was doing, before | during | after (state@speed):');
    for (const [k, rows] of tally(c.flickers, (f) => `${f.field} ${kinds(f.during)}`).slice(0, 16))
      out.push(row(rows.length, `${k}   e.g. ${rows[0]!.where} ${rows[0]!.at.toFixed(1)} s  ${rows[0]!.during}`));
  }

  out.push(
    '',
    `Jumps, a unicorn moving more than ${JUMP} units in one step: ${c.jumps.count} of ${c.jumps.steps} unicorn-steps, worst ${c.jumps.worst.toFixed(0)}`,
    JSON.stringify(c.jumps.by),
  );
  for (const j of [...c.jumps.examples].sort((a, b) => b.gap - a.gap).slice(0, 5))
    out.push(`  ${j.gap.toFixed(1)} units, ${j.who} at ${j.where} ${j.at.toFixed(2)} s`);
  out.push('', `Followers put back on the trail because they could not walk: ${c.relocations}`);
  out.push(
    `Wildstar set down on open ground: ${c.leaderResets.misplaced} for standing where no route could begin, ${c.leaderResets.stalled} for being meant to move and not moving`,
  );
  out.push('', `Broken invariants: ${Object.values(c.violations).reduce((a, b) => a + b, 0)}`);
  for (const [k, n] of Object.entries(c.violations)) out.push(row(n, `${k}   e.g. ${c.violationExamples[k]}`));

  const stackReport = (title: string, rows: readonly Stack[]): void => {
    out.push(
      '',
      `${title} (nearer than ${options.close} for ${STACK_FOR} s or more): ${rows.length} episodes, ${rows.reduce((s, x) => s + x.seconds, 0).toFixed(0)} s`,
    );
    for (const [k, group] of tally(rows, (s) => s.states).slice(0, 14)) {
      const worst = group.reduce((a, b) => (a.nearest < b.nearest ? a : b));
      out.push(
        row(
          group.length,
          `${k}   closest ${worst.nearest.toFixed(0)} (${worst.pair}) at ${worst.where} ${worst.at.toFixed(1)} s for ${worst.seconds.toFixed(1)} s`,
        ),
      );
    }
  };
  stackReport('Stacked unicorns', c.stacks);
  stackReport('Workers and unicorns', c.crossings);

  out.push('', 'Share of herd time the two nearest unicorns were closer than:');
  for (const k of THRESHOLDS)
    out.push(`  ${String(k).padStart(3)}: ${((100 * c.closeness.under[k]!) / c.closeness.seconds).toFixed(2)}%`);

  out.push('', `Arrivals: ${c.arrivals.length}; closest pair on arrival and three seconds on, worst five:`);
  for (const a of [...c.arrivals]
    .sort((x, y) => Math.min(x.nearest, x.settled) - Math.min(y.nearest, y.settled))
    .slice(0, 5))
    out.push(
      `  ${a.nearest.toFixed(1).padStart(6)} then ${a.settled.toFixed(1).padStart(6)}  ${a.where} (${a.members} unicorns)`,
    );
  return out;
}
