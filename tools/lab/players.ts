import type { ScreenId } from '../../src/content/wonders';
import type { Rng } from '../../src/domain/rng';
import type { BalloonSong } from '../../src/wonder/games/balloon-song';
import { type Cloud, isSpecial, reachable } from '../../src/wonder/games/bounce/world';
import type { BubbleGarden } from '../../src/wonder/games/bubble-garden';
import type { CloudBounce } from '../../src/wonder/games/cloud-bounce';
import type { JewelFountain } from '../../src/wonder/games/jewel-fountain';
import type { LilyHop } from '../../src/wonder/games/lily-hop';
import type { MorphMachine } from '../../src/wonder/games/morph-machine';
import type { PartyTime } from '../../src/wonder/games/party-time';
import type { RainbowRide } from '../../src/wonder/games/rainbow-ride';
import type { Group } from '../../src/wonder/games/ride/course';
import type { StarCannon } from '../../src/wonder/games/star-cannon';
import type { ToneMatrix } from '../../src/wonder/games/tone-matrix';
import { PART_IDS, type PartId } from '../../src/wonder/games/tonematrix/parts';
import type { TreasureRain } from '../../src/wonder/games/treasure-rain';
import type { WonderHandle } from '../../src/wonder/wonder';

/**
 * Stand-ins for a person, so a game can be played through in the lab and measured, with nobody's
 * thumb in the way.
 *   idle    never touches the screen
 *   child   taps anywhere every second or so, the way a small child does
 *   expert  taps where a game wants a tap, as well as it can be done
 */
export type Skill = 'idle' | 'child' | 'expert';

/** The fingers a player has. Positions are in the game's own units. */
export interface Hands {
  tap(x: number, y: number): void;
  /** Puts a finger down and leaves it there until `lift`, for a game that is played by holding. */
  press(x: number, y: number): void;
  /** Moves a finger that is held, along the screen, which is a swipe. */
  move(x: number, y: number): void;
  lift(): void;
  readonly width: number;
  readonly height: number;
}

export interface Player {
  /** One moment of play: look at the game and, maybe, touch it. */
  act(dt: number): void;
}

const idle: Player = { act: () => undefined };

/**
 * A child who taps at random places, a beat or so apart, and never looks at what is on the screen.
 */
function child(hands: Hands, rng: Rng): Player {
  let wait = rng.range(0.3, 0.9);
  return {
    act(dt) {
      wait -= dt;
      if (wait > 0) return;
      wait = rng.range(0.55, 1.4);
      hands.tap(rng.range(0.1, 0.9) * hands.width, rng.range(0.15, 0.85) * hands.height);
    },
  };
}

/**
 * Leaps for every motif of stars as it comes up, and steps again in the air where the motif asks
 * for a step.
 */
function rideExpert(ride: RainbowRide, hands: Hands): Player {
  const pending = new WeakSet<Group>();
  let stepAfter = -1;
  return {
    act() {
      const { runner: r, course, place } = ride.inspect();
      if (place !== 'ride') return;
      const next = course.groups.find(
        (g) => !pending.has(g) && g.x > r.x - 10 && g.motif !== 'trail' && g.motif !== 'hoop',
      );
      if (next && r.x >= next.x && r.grounded) {
        hands.tap(hands.width * 0.6, hands.height * 0.5);
        pending.add(next);
        stepAfter = next.motif === 'double' || next.motif === 'crown' ? 0.36 : next.motif === 'heart' ? 0.3 : -1;
      }
      if (stepAfter >= 0 && !r.grounded && r.air >= stepAfter) {
        hands.tap(hands.width * 0.6, hands.height * 0.5);
        stepAfter = -1;
      }
    },
  };
}

/**
 * Climbs the way a child who has understood would: each time the unicorn is standing, a touch on
 * the cloud above that is best to go to, which is the friend who waits if there is one, and
 * otherwise a cloud with something in it, and otherwise the nearest.
 */
function bounceExpert(game: CloudBounce, hands: Hands): Player {
  return {
    act() {
      const { climb, world, place, camera } = game.inspect();
      if (place !== 'climb') return;
      const lead = climb.leader;
      if (lead.mode !== 'stand' || climb.aim) return;
      let best: Cloud | null = null;
      let bestScore = -Infinity;
      for (let row = lead.to.row + 1; row <= lead.to.row + 2; row++) {
        for (const c of world.row(row)) {
          if (!reachable(lead.to, c)) continue;
          const friend = c.friend && !climb.joined.has(c.friend) ? 40 : 0;
          const special = isSpecial(c.kind) ? 12 : 0;
          const score =
            friend +
            special +
            (climb.visited.has(c.id) ? -20 : 0) +
            (row - lead.to.row === 1 ? 6 : 0) -
            Math.abs(c.x - lead.x) * 0.03;
          if (score > bestScore) {
            bestScore = score;
            best = c;
          }
        }
      }
      if (best) hands.tap(camera.screenX(best.x, hands.width), camera.screenY(best.y - 16, hands.height));
    },
  };
}

/**
 * Wakes a sleeping star every so often, close to where it is as a child would, and when all are
 * awake plays the picture.
 */
function cannonExpert(game: StarCannon, hands: Hands, rng: Rng): Player {
  let wait = 0.6;
  return {
    act(dt) {
      wait -= dt;
      if (wait > 0) return;
      wait = 0.6;
      const { stars, orders } = game.inspect();
      if (orders > 2) return;
      const asleep = stars.filter((s) => !s.awake);
      const pool = asleep.length > 0 ? asleep : stars;
      const s = pool[rng.int(pool.length)]!;
      hands.tap(s.x + rng.range(-6, 6), s.y + rng.range(-6, 6));
    },
  };
}

/**
 * Plays the balloons as a child who has looked at the screen would. The child pops a balloon they
 * can see, a second or so apart, and the expert always pops the one that sings the next note while
 * a child does about half the time and otherwise any balloon. In the finale both pop what is on the
 * rainbow.
 */
function balloonPlayer(game: BalloonSong, hands: Hands, rng: Rng, skill: 'child' | 'expert'): Player {
  const pace = skill === 'expert' ? 0.7 : 1.05;
  const follow = skill === 'expert' ? 1 : 0.5;
  let wait = rng.range(0.5, 1.2);
  return {
    act(dt) {
      wait -= dt;
      if (wait > 0) return;
      const now = game.inspect();
      if (now.rainbow.standing) {
        wait = pace * 0.6;
        hands.tap(rng.range(0.15, 0.85) * hands.width, rng.range(0.2, 0.7) * hands.height);
        return;
      }
      wait = pace * rng.range(0.8, 1.25);
      const seen = now.balloons.filter(
        (b) => b.ready && b.y > 70 && b.y < hands.height - 20 && b.x > 10 && b.x < hands.width - 10,
      );
      if (seen.length === 0) return;
      const wanted = seen.filter((b) => b.kind === 'note' && b.degree === now.target);
      const pool = wanted.length > 0 && rng.next() < follow ? wanted : seen;
      const b = pool[rng.int(pool.length)]!;
      hands.tap(b.x + rng.range(-b.r * 0.4, b.r * 0.4), b.y + rng.range(-b.r * 0.4, b.r * 0.4));
    },
  };
}

/**
 * Plays the bubble garden as a child who has looked at the screen would. The child pops a bubble
 * they can see, about a second apart, now and then misses, and now and then touches the machine: a
 * quick tap for more bubbles, and, once they have seen what holding does, a long hold for a big
 * one. The expert is quicker, never misses, goes for the bubble that holds the most, and blows a
 * big bubble of their own every so often and pops it first.
 */
function bubblePlayer(game: BubbleGarden, hands: Hands, rng: Rng, skill: 'child' | 'expert'): Player {
  const pace = skill === 'expert' ? 0.62 : 1.05;
  let wait = rng.range(0.4, 1);
  let turns = 0;
  let holdFor = 0;
  let sinceBlow = 0;
  return {
    act(dt) {
      if (holdFor > 0) {
        holdFor -= dt;
        if (holdFor <= 0) hands.lift();
        return;
      }
      sinceBlow += dt;
      wait -= dt;
      if (wait > 0) return;
      wait = pace * rng.range(0.8, 1.25);
      turns++;
      const now = game.inspect();
      const m = now.machine;
      const mouth = { x: m.x, y: m.y - m.height * 0.4 };
      const wantsBlow = skill === 'expert' ? sinceBlow > 7 : turns % 9 === 0;
      if (wantsBlow) {
        sinceBlow = 0;
        holdFor = skill === 'expert' ? 2.1 : rng.range(0.6, 2.4);
        hands.press(mouth.x, mouth.y);
        wait = holdFor + pace * 0.5;
        return;
      }
      const seen = now.bubbles.filter(
        (b) => b.ready && b.y > 70 && b.y < hands.height - 60 && b.x > 10 && b.x < hands.width - 10,
      );
      if (seen.length === 0 || (skill === 'child' && turns % 7 === 0)) {
        hands.tap(mouth.x, mouth.y);
        return;
      }
      if (skill === 'child' && rng.next() < 0.3) {
        hands.tap(rng.range(0.1, 0.9) * hands.width, rng.range(0.15, 0.75) * hands.height);
        return;
      }
      const most = skill === 'expert' ? Math.max(...seen.map((b) => b.prizes.length)) : 1;
      const pool = skill === 'expert' ? seen.filter((b) => b.prizes.length === most) : seen;
      const b = pool[rng.int(pool.length)]!;
      const reach = skill === 'expert' ? 0.2 : 0.5;
      hands.tap(b.x + rng.range(-b.r * reach, b.r * reach), b.y + rng.range(-b.r * reach, b.r * reach));
    },
  };
}

/**
 * Plays the party as a child who has looked at the screen would. The child touches what they can
 * see, a second or so apart: mostly the friends who are not dancing yet, then the cannons, the
 * pinata, the mirror ball, the speakers and the floor, and now and then nothing in particular. The
 * expert goes round everything there is, quicker and without missing, and keeps the friends
 * dancing.
 */
function partyPlayer(game: PartyTime, hands: Hands, rng: Rng, skill: 'child' | 'expert'): Player {
  const pace = skill === 'expert' ? 0.58 : 1.1;
  const slop = skill === 'expert' ? 0.2 : 1;
  let wait = rng.range(0.4, 0.9);
  let turns = 0;
  let lastBall = -99;
  let lastSpeaker = -99;
  let clock = 0;
  return {
    act(dt) {
      clock += dt;
      wait -= dt;
      if (wait > 0) return;
      wait = pace * rng.range(0.8, 1.25);
      turns++;
      const now = game.inspect();
      const tapFriend = (d: { x: number; y: number; head: number }): void =>
        hands.tap(d.x + rng.range(-24, 24) * slop, (d.y + d.head) / 2 + rng.range(-14, 14) * slop);
      const tapCannon = (i: number): boolean => {
        const c = now.cannons[i % now.cannons.length];
        if (!c || (skill === 'expert' && !c.ready)) return false;
        hands.tap((c.x + c.mouth.x) / 2 + rng.range(-8, 8) * slop, (c.y + c.mouth.y) / 2 + rng.range(-12, 12) * slop);
        return true;
      };
      const tapPinata = (): boolean => {
        if (now.pinata.state !== 'hanging') return false;
        hands.tap(now.pinata.x + rng.range(-16, 16) * slop, now.pinata.y + rng.range(-16, 16) * slop);
        return true;
      };
      const tapBall = (): void => {
        lastBall = clock;
        hands.tap(now.ball.x + rng.range(-8, 8) * slop, now.ball.y + rng.range(-8, 8) * slop);
      };
      const tapSpeaker = (): void => {
        lastSpeaker = clock;
        const sp = now.speakers[turns % now.speakers.length]!;
        hands.tap(sp.x + rng.range(-12, 12) * slop, sp.y + rng.range(-20, 20) * slop);
      };
      const tapFloor = (): void =>
        hands.tap(
          rng.range(now.floor.left + 40, now.floor.right - 40),
          rng.range(now.floor.top + 20, now.floor.bottom - 6),
        );
      const sleepers = now.dancers.filter((d) => d.move === null);
      if (skill === 'expert') {
        if (sleepers.length > 0) tapFriend(sleepers[0]!);
        else if (turns % 4 === 1 && tapCannon(turns >> 2)) return;
        else if (turns % 3 !== 0 && tapPinata()) return;
        else if (clock - lastBall > 14) tapBall();
        else if (clock - lastSpeaker > 11) tapSpeaker();
        else if (turns % 5 === 0) tapFloor();
        else tapFriend(now.dancers[turns % now.dancers.length]!);
        return;
      }
      const roll = rng.next();
      if (roll < 0.34) {
        const pool = sleepers.length > 0 && rng.next() < 0.7 ? sleepers : now.dancers;
        tapFriend(pool[rng.int(pool.length)]!);
      } else if (roll < 0.46) tapCannon(rng.int(2));
      else if (roll < 0.6) {
        if (!tapPinata()) tapFloor();
      } else if (roll < 0.66) tapBall();
      else if (roll < 0.72) tapSpeaker();
      else if (roll < 0.9) tapFloor();
      else hands.tap(rng.range(0.1, 0.9) * hands.width, rng.range(0.1, 0.9) * hands.height);
    },
  };
}

/**
 * Plays the machine as a child who has looked at the screen would. The child feeds it the fruit
 * that are on the cart, a second or so apart and mostly in no order, now and then touches a friend,
 * pulls the lever, blows the whistle, touches the shelf or a creature, and after the finale touches
 * the hatchling. The expert goes along the rainbow, keeps the machine busy, and uses everything
 * there is.
 */
function morphPlayer(game: MorphMachine, hands: Hands, rng: Rng, skill: 'child' | 'expert'): Player {
  const pace = skill === 'expert' ? 0.62 : 1.15;
  const slop = skill === 'expert' ? 0.25 : 1;
  let wait = rng.range(0.4, 0.9);
  let turns = 0;
  let next = 0;
  let lastLever = -99;
  let lastWhistle = -99;
  let clock = 0;
  return {
    act(dt) {
      clock += dt;
      wait -= dt;
      if (wait > 0) return;
      wait = pace * rng.range(0.8, 1.25);
      turns++;
      const now = game.inspect();
      const near = (s: { x: number; y: number; r: number }, spread = 0.45): void =>
        hands.tap(s.x + rng.range(-s.r, s.r) * spread * slop, s.y + rng.range(-s.r, s.r) * spread * slop);
      const here = now.fruit.filter((f) => f.here);
      const feed = (index: number): void => {
        const f = here[index % Math.max(1, here.length)];
        if (f) near(f);
        else hands.tap(now.hopper.x, now.hopper.y);
      };
      if (now.hatchling.here) {
        if (turns % 3 === 0) return near(now.hatchling);
      }
      if (skill === 'expert') {
        if (here.length >= 5 && clock - lastLever > 9) {
          lastLever = clock;
          return near(now.lever);
        }
        if (now.shelf.length >= 8 && clock - lastWhistle > 14) {
          lastWhistle = clock;
          return near(now.whistle);
        }
        if (turns % 6 === 0 && now.friends.length > 0)
          return near(now.friends[((turns / 6) % now.friends.length) | 0]!, 0.3);
        if (turns % 9 === 0 && now.creatures.length > 0) return hands.tap(now.creatures[0]!.x, now.creatures[0]!.y);
        const slot = here.find((f) => f.id === now.fruit[next % now.fruit.length]!.id);
        next++;
        return slot ? near(slot) : feed(turns);
      }
      const roll = rng.next();
      if (roll < 0.56) feed(rng.int(7));
      else if (roll < 0.66 && now.friends.length > 0) near(now.friends[rng.int(now.friends.length)]!, 0.4);
      else if (roll < 0.71) near(now.lever);
      else if (roll < 0.76) near(now.whistle);
      else if (roll < 0.84 && now.shelf.length > 0) {
        const item = now.shelf[rng.int(now.shelf.length)]!;
        hands.tap(item.x, item.y);
      } else if (roll < 0.88 && now.creatures.length > 0) hands.tap(now.creatures[0]!.x, now.creatures[0]!.y);
      else if (roll < 0.92) near(now.dome);
      else hands.tap(rng.range(0.1, 0.9) * hands.width, rng.range(0.1, 0.9) * hands.height);
    },
  };
}

/**
 * Plays the fountain as a child who has looked at it would: a jet, then another, now and then three
 * or four in a row the way a finger runs along a keyboard, a touch on the big gem or on a friend,
 * and a held jet. The expert plays the whole ring from end to end, both ways, and keeps the rainbow
 * coming.
 */
function fountainPlayer(game: JewelFountain, hands: Hands, rng: Rng, skill: 'child' | 'expert'): Player {
  type Move = { at: number; kind: 'tap' | 'press' | 'lift'; x: number; y: number };
  const queue: Move[] = [];
  const expert = skill === 'expert';
  let clock = 0;
  let wait = rng.range(0.4, 0.9);
  let turns = 0;
  const slop = expert ? 0.12 : 0.4;
  return {
    act(dt) {
      clock += dt;
      for (let i = queue.length - 1; i >= 0; i--) {
        const m = queue[i]!;
        if (m.at > clock) continue;
        queue.splice(i, 1);
        if (m.kind === 'tap') hands.tap(m.x, m.y);
        else if (m.kind === 'press') hands.press(m.x, m.y);
        else hands.lift();
      }
      wait -= dt;
      if (wait > 0 || queue.length > 0) return;
      turns++;
      const now = game.inspect();
      const jet = (k: number, at: number): void => {
        const j = now.jets[k]!;
        queue.push({
          at: clock + at,
          kind: 'tap',
          x: j.x + rng.range(-1, 1) * 14 * slop,
          y: j.y + rng.range(-1, 1) * 6 * slop,
        });
      };
      const run = (from: number, to: number, beat: number): void => {
        const way = Math.sign(to - from) || 1;
        for (let k = from, i = 0; k !== to + way; k += way, i++) jet(k, i * beat);
      };
      if (expert) {
        wait = rng.range(0.5, 1);
        const roll = turns % 8;
        if (roll === 0 || roll === 4) return run(0, now.jets.length - 1, 0.2);
        if (roll === 2 || roll === 6) return run(now.jets.length - 1, 0, 0.2);
        if (roll === 3) return hands.tap(now.gem.x, now.gem.y);
        if (roll === 7 && now.friends.length > 0)
          return hands.tap(now.friends[turns % now.friends.length]!.x, now.friends[turns % now.friends.length]!.y);
        wait = 0.4;
        return jet(rng.int(now.jets.length), 0);
      }
      wait = rng.range(0.6, 1.5);
      const roll = rng.next();
      if (roll < 0.52) jet(rng.int(now.jets.length), 0);
      else if (roll < 0.66) {
        const a = rng.int(now.jets.length - 3);
        run(a, a + 2 + rng.int(2), 0.28);
      } else if (roll < 0.74) {
        const j = now.jets[rng.int(now.jets.length)]!;
        queue.push(
          { at: clock, kind: 'press', x: j.x, y: j.y },
          { at: clock + rng.range(0.5, 1.2), kind: 'lift', x: j.x, y: j.y },
        );
      } else if (roll < 0.82)
        hands.tap(now.gem.x + rng.range(-1, 1) * now.gem.r * 0.5, now.gem.y + rng.range(-1, 1) * now.gem.r * 0.5);
      else if (roll < 0.9 && now.friends.length > 0) {
        const f = now.friends[rng.int(now.friends.length)]!;
        hands.tap(f.x, f.y);
      } else hands.tap(rng.range(0.1, 0.9) * hands.width, rng.range(0.1, 0.45) * hands.height);
    },
  };
}

/**
 * Plays the pond as a child who has looked at it would: a tap on the next bud along the path, now
 * and then on one out of order, and a touch on the frog, a friend, a duck, a dragonfly or the
 * water. The expert goes along the pads in order, a few taps at a time, so that the frog never
 * stops, and touches whatever else answers now and then.
 */
function lilyPlayer(game: LilyHop, hands: Hands, rng: Rng, skill: 'child' | 'expert'): Player {
  const expert = skill === 'expert';
  let wait = rng.range(0.4, 0.9);
  let turns = 0;
  let along = 0;
  return {
    act(dt) {
      wait -= dt;
      if (wait > 0) return;
      turns++;
      const now = game.inspect();
      const lotusPads = now.pads.filter((p) => p.lotus >= 0);
      const aim = (p: { x: number; y: number; rx: number; ry: number }): void =>
        hands.tap(p.x + rng.range(-1, 1) * p.rx * (expert ? 0.2 : 0.5), p.y - p.ry * rng.range(0, 1.6));
      const next = (): void => {
        const bud =
          lotusPads.find((p) => !p.open && p.lotus >= along) ??
          lotusPads.find((p) => !p.open) ??
          lotusPads[(turns + rng.int(7)) % 7]!;
        along = bud.lotus + 1 > 6 ? 0 : bud.lotus + 1;
        aim(bud);
      };
      if (expert) {
        wait = now.frog.busy ? rng.range(0.25, 0.5) : rng.range(0.4, 0.8);
        if (turns % 11 === 0 && now.friends.length > 0) {
          const f = now.friends[turns % now.friends.length]!;
          return hands.tap(f.x, f.y);
        }
        if (turns % 13 === 5) return hands.tap(now.frog.x, now.frog.y);
        if (turns % 17 === 9 && now.ducks.length > 0) return hands.tap(now.ducks[0]!.x, now.ducks[0]!.y);
        if (turns % 19 === 3)
          return hands.tap(rng.range(0.15, 0.85) * hands.width, rng.range(0.4, 0.62) * hands.height);
        return next();
      }
      wait = rng.range(0.6, 1.5);
      const roll = rng.next();
      if (roll < 0.5) next();
      else if (roll < 0.62) aim(lotusPads[rng.int(lotusPads.length)]!);
      else if (roll < 0.7) hands.tap(now.frog.x, now.frog.y);
      else if (roll < 0.76 && now.pals.length > 0) {
        const p = now.pals[rng.int(now.pals.length)]!;
        hands.tap(p.x, p.y);
      } else if (roll < 0.84 && now.friends.length > 0) {
        const f = now.friends[rng.int(now.friends.length)]!;
        hands.tap(f.x, f.y);
      } else if (roll < 0.9) hands.tap(rng.range(0.1, 0.9) * hands.width, rng.range(0.4, 0.66) * hands.height);
      else if (roll < 0.94 && now.ducks.length > 0) hands.tap(now.ducks[0]!.x, now.ducks[0]!.y);
      else if (roll < 0.97 && now.dragonflies.length > 0) hands.tap(now.dragonflies[0]!.x, now.dragonflies[0]!.y);
      else hands.tap(rng.range(0.1, 0.9) * hands.width, rng.range(0.05, 0.2) * hands.height);
    },
  };
}

/**
 * A child at the treasure rain touches what they see fall, a little behind it and not always on it,
 * and now and then touches the friends or the empty sky, or drags a finger through a handful. The
 * expert keeps a finger on the glass and sweeps it down through the lowest of what is falling, one
 * after another, the best a thumb can.
 */
function rainPlayer(game: TreasureRain, hands: Hands, rng: Rng, skill: 'child' | 'expert'): Player {
  const expert = skill === 'expert';
  let wait = rng.range(0.3, 0.8);
  let finger: { x: number; y: number } | null = null;
  let turns = 0;
  return {
    act(dt) {
      const now = game.inspect();
      if (now.phase !== 'play' || now.lead > 0) {
        if (finger) {
          hands.lift();
          finger = null;
        }
        // After the finale the child spills the chest now and then, and touches a friend.
        if (now.phase === 'after') {
          wait -= dt;
          if (wait <= 0) {
            wait = rng.range(0.4, 0.9);
            if (turns++ % 4 === 3 && now.friends.length > 0) hands.tap(now.friends[0]!.x, now.friends[0]!.y);
            else hands.tap(now.chest.x + rng.range(-40, 40), now.chest.y + rng.range(-30, 10));
          }
        }
        return;
      }
      const low = now.pieces.filter((p) => p.y > 20).sort((a, b) => b.y - a.y);
      if (expert) {
        // The finger goes after the lowest piece at a thumb's speed, and takes the next as it
        // comes.
        const target = low[0];
        if (!target) {
          if (finger) {
            hands.lift();
            finger = null;
          }
          return;
        }
        if (!finger) {
          finger = { x: target.x, y: Math.max(10, target.y - 140) };
          hands.press(finger.x, finger.y);
        }
        const dx = target.x - finger.x;
        const dy = target.y - finger.y;
        const d = Math.hypot(dx, dy) || 1;
        const speed = 620 * dt;
        const k = Math.min(1, speed / d);
        finger = { x: finger.x + dx * k, y: finger.y + dy * k };
        hands.move(finger.x, finger.y);
        return;
      }
      wait -= dt;
      if (wait > 0) return;
      turns++;
      wait = rng.range(0.4, 0.95);
      const roll = rng.next();
      const aim = low.length > 0 ? low[rng.int(Math.min(3, low.length))]! : null;
      if (aim && roll < 0.62)
        hands.tap(aim.x + rng.range(-1, 1) * aim.r * 0.8, aim.y + rng.range(-0.3, 1) * aim.r * 0.8);
      else if (aim && roll < 0.74) {
        // A little swipe through a piece, started to one side of it.
        hands.press(aim.x - 50, aim.y + rng.range(-20, 20));
        hands.move(aim.x, aim.y);
        hands.move(aim.x + 50, aim.y + rng.range(-20, 20));
        hands.lift();
      } else if (roll < 0.82 && now.friends.length > 0) {
        const f = now.friends[rng.int(now.friends.length)]!;
        hands.tap(f.x, f.y);
      } else hands.tap(rng.range(0.08, 0.92) * hands.width, rng.range(0.15, 0.85) * hands.height);
    },
  };
}

/**
 * Plays the tone matrix. A child paints a light or a short stroke where they look, rings a key now
 * and then, waves the wand when they find it, now and then sweeps the lot away and now and then
 * goes to another part. The expert plays short phrases of their own on each of the three parts in
 * turn, the melody climbing or falling through new rows, the drums as a swipe along one row and the
 * bass as a line that walks, rings the keys, and tries each button once or twice in turn.
 */
function matrixPlayer(game: ToneMatrix, hands: Hands, rng: Rng, skill: 'child' | 'expert'): Player {
  const expert = skill === 'expert';
  const pace = expert ? 0.62 : 1.1;
  let wait = rng.range(0.4, 0.9);
  let turns = 0;
  let quicker = true;
  return {
    act(dt) {
      wait -= dt;
      if (wait > 0) return;
      wait = pace * rng.range(0.8, 1.25);
      turns++;
      const { plan, tiles, active } = game.inspect();
      const { grid, keys } = plan;
      const lit = new Set(tiles.map((t) => t.x * 16 + t.y));
      const centre = (x: number, y: number): [number, number] => [
        grid.x + (x + 0.5) * grid.tw,
        grid.y + (y + 0.5) * grid.th,
      ];
      const press = (id: string): void => {
        const b = plan.buttons.find((q) => q.id === id)!;
        hands.tap(b.x, b.y);
      };
      const tab = (id: PartId): void => {
        const t = plan.tabs.find((q) => q.id === id)!;
        hands.tap(t.x + t.w / 2, t.y + t.h / 2);
      };
      const next = (): PartId => PART_IDS[(PART_IDS.indexOf(active) + 1) % PART_IDS.length]!;
      const another = (): PartId =>
        PART_IDS[(PART_IDS.indexOf(active) + 1 + rng.int(PART_IDS.length - 1)) % PART_IDS.length]!;
      const key = (y: number): void => hands.tap(keys.x + keys.w / 2, keys.y + (y + 0.5) * keys.th);
      /**
       * A finger put down on a light that is off and drawn through the next few, each a row away
       * from the last.
       */
      const phrase = (length: number): void => {
        const rise = rng.next() < 0.5 ? -1 : 1;
        const x0 = rng.int(16 - length);
        let y0 = 2 + rng.int(12);
        for (let n = 0; n < 16 && lit.has(x0 * 16 + y0); n++) y0 = (y0 + 1) % 16;
        hands.press(...centre(x0, y0));
        for (let i = 1; i < length; i++)
          hands.move(...centre(x0 + i, Math.max(0, Math.min(15, y0 + rise * i * (1 + rng.int(2))))));
        hands.lift();
      };
      /** A swipe along one row, which on the drums is a roll of the same drum. */
      const roll = (length: number): void => {
        const x0 = rng.int(16 - length);
        const y = rng.int(16);
        hands.press(...centre(x0, y));
        for (let i = 1; i < length; i++) hands.move(...centre(Math.min(15, x0 + i * 2), y));
        hands.lift();
      };
      if (expert) {
        if (turns === 30) return press('broom');
        if (turns % 6 === 0) return tab(next());
        if (turns % 10 === 4) return press('wand');
        if (turns === 7 || turns === 19) {
          press(quicker ? 'hare' : 'turtle');
          quicker = !quicker;
          return;
        }
        if (turns % 5 === 0) return key(rng.int(16));
        return active === 'beat' ? roll(2 + rng.int(3)) : phrase(3 + rng.int(2));
      }
      const dice = rng.next();
      if (dice < 0.46) hands.tap(...centre(rng.int(16), rng.int(16)));
      else if (dice < 0.68) phrase(3 + rng.int(4));
      else if (dice < 0.78) key(rng.int(16));
      else if (dice < 0.85) press('wand');
      else if (dice < 0.88) press('broom');
      else if (dice < 0.93) press(rng.next() < 0.5 ? 'hare' : 'turtle');
      else tab(another());
    },
  };
}

export function playerFor(game: ScreenId, wonder: WonderHandle, skill: Skill, hands: Hands, rng: Rng): Player {
  if (skill === 'idle') return idle;
  if (game === 'balloon-song') return balloonPlayer(wonder as BalloonSong, hands, rng, skill);
  if (game === 'bubble-garden') return bubblePlayer(wonder as BubbleGarden, hands, rng, skill);
  if (game === 'party-time') return partyPlayer(wonder as PartyTime, hands, rng, skill);
  if (game === 'morph-machine') return morphPlayer(wonder as MorphMachine, hands, rng, skill);
  if (game === 'jewel-fountain') return fountainPlayer(wonder as JewelFountain, hands, rng, skill);
  if (game === 'lily-hop') return lilyPlayer(wonder as LilyHop, hands, rng, skill);
  if (game === 'treasure-rain') return rainPlayer(wonder as TreasureRain, hands, rng, skill);
  if (game === 'tone-matrix') return matrixPlayer(wonder as ToneMatrix, hands, rng, skill);
  if (skill === 'child') return child(hands, rng);
  if (game === 'rainbow-ride') return rideExpert(wonder as RainbowRide, hands);
  if (game === 'cloud-bounce') return bounceExpert(wonder as CloudBounce, hands);
  if (game === 'star-cannon') return cannonExpert(wonder as StarCannon, hands, rng);
  return child(hands, rng);
}
