import { ambienceAt } from '../content/ambience-zones';
import type { DomainEvent, World } from '../domain';
import type { AudioPlace, AudioPort, View } from '../game/ports';
import { type AmbienceId, type AudioAssets, type SheetId, SOUND_FAMILIES, type SoundFamilyId } from '../shared/audio';
import type { Vec2 } from '../shared/ids';
import { type Cue, cuesFor } from './cues';
import type { Engine, EngineStats, LoopRequest, Playing } from './engine';
import type { AudioMix } from './mix';
import { Footfalls } from './steps';
import { decide, JITTER, VariantPicker, type Voice } from './voices';

/** Seconds to cross from one map's loops to the next (between 1.5 and 2). */
const CROSSFADE = 1.8;
/**
 * What the quiet arrangement indoors keeps of the garden theme: lower, and softened so it sits
 * behind the room.
 */
const QUIET = { gain: 0.55, lowpass: 2400 };
/**
 * How quickly a sound that must make way is let go, in seconds. Short enough to stop it, long
 * enough not to click.
 */
const STEAL_FADE = 0.04;
/** Sheets in the order they are decoded after unlock: what the first tap needs first. */
const SHEET_ORDER: readonly SheetId[] = ['core', 'magic', 'objects'];

export interface AudioDeps {
  engine: Engine;
  assets: AudioAssets;
  random?: () => number;
}

const loopsFor = (place: AudioPlace, ambience: AmbienceId): { music: LoopRequest; ambience: LoopRequest } => ({
  music:
    place.music === 'quiet'
      ? { id: 'music-garden', gain: QUIET.gain, lowpass: QUIET.lowpass, fade: CROSSFADE }
      : { id: `music-${place.music}`, gain: 1, fade: CROSSFADE },
  ambience: { id: `ambience-${ambience}`, gain: 1, fade: CROSSFADE },
});

/**
 * Sound for the game: music and ambience that follow the map, a sound for what happens, and
 * footsteps for the herd. Every method is safe to call before audio is unlocked, with the browser's
 * audio missing, or with no audio built; the game plays on in silence.
 */
export class GameAudio implements AudioPort {
  private readonly engine: Engine;
  private readonly assets: AudioAssets;
  private readonly random: () => number;
  private readonly picker: VariantPicker;
  private readonly footfalls = new Footfalls();
  private readonly book: Voice<Playing>[] = [];
  private place: AudioPlace | null = null;
  /** The ambience playing now: the map's own, or a place inside it that sounds different. */
  private heard: AmbienceId = 'forest';
  private view: View | null = null;
  private unlocked = false;

  constructor(deps: AudioDeps) {
    this.engine = deps.engine;
    this.assets = deps.assets;
    this.random = deps.random ?? Math.random;
    this.picker = new VariantPicker(this.random);
    // The bytes the first moments need start downloading now, so the first tap is not waiting on
    // the network.
    this.engine.prefetch([this.assets.sheets.core.file, this.assets.sheets.magic.file]);
  }

  unlock(): void {
    this.engine.unlock();
    if (this.unlocked) {
      this.engine.resume();
      return;
    }
    this.unlocked = true;
    void this.loadSheets();
    this.applyLoops();
  }

  enterMap(place: AudioPlace): void {
    this.place = place;
    this.heard = place.ambience;
    this.footfalls.reset();
    const loops = loopsFor(place, this.heard);
    this.engine.prefetch([this.assets.loops[loops.music.id!].file, this.assets.loops[loops.ambience.id!].file]);
    if (this.unlocked) this.applyLoops();
  }

  events(events: readonly DomainEvent[], world: World): void {
    if (!this.unlocked) return;
    for (const cue of cuesFor(events, world)) this.play(cue);
  }

  frame(world: World, view: View, seconds: number): void {
    this.view = view;
    if (!this.unlocked || !this.place) return;
    this.followZones(world);
    for (const cue of this.footfalls.update(world, view, seconds, this.place.surfaceAt)) this.play(cue);
  }

  suspend(): void {
    this.engine.suspend();
  }

  resume(): void {
    this.engine.resume();
  }

  /** A short chime for a parent who has just changed a level, so the new level can be heard. */
  preview(): void {
    if (this.unlocked) this.play({ sound: 'confirm' });
  }

  /**
   * A sound that no event of the world asks for, such as one in a game on the screen. Nothing at
   * all before audio is unlocked.
   */
  cheer(sound: SoundFamilyId, gain = 1): void {
    if (this.unlocked) this.play({ sound, gain });
  }

  setMix(mix: AudioMix): void {
    this.engine.setMix(mix);
  }

  stats(): EngineStats {
    return this.engine.stats();
  }

  private async loadSheets(): Promise<void> {
    // One after another, so decoding never competes with itself for the main thread.
    for (const id of SHEET_ORDER) await this.engine.loadSheet(id);
  }

  /**
   * Crosses to the ambience of the place the leader stands in, when it differs from what is
   * playing.
   */
  private followZones(world: World): void {
    const leader = world.unicorns.wildstar;
    if (!leader || !this.place) return;
    const next = ambienceAt(this.place.mapId, leader.pos, this.heard, this.place.ambience);
    if (next === this.heard) return;
    this.heard = next;
    this.engine.prefetch([this.assets.loops[`ambience-${next}`].file]);
    void this.engine.setLoop('ambience', loopsFor(this.place, next).ambience).catch(() => undefined);
  }

  private applyLoops(): void {
    if (!this.place) return;
    const loops = loopsFor(this.place, this.heard);
    void this.engine.setLoop('music', loops.music).catch(() => undefined);
    void this.engine.setLoop('ambience', loops.ambience).catch(() => undefined);
  }

  private play(cue: Cue): void {
    const family = SOUND_FAMILIES[cue.sound];
    if (!this.engine.hasSheet(family.sheet)) return;
    const delay = cue.delay ?? 0;
    const startsAt = this.engine.now() + delay;
    this.forget(startsAt);
    const decision = decide(this.book, cue.sound, family.group, startsAt);
    if (!decision.play) return;
    for (const victim of decision.stop) {
      this.engine.stop(victim.handle, STEAL_FADE);
      this.book.splice(this.book.indexOf(victim), 1);
    }
    const jitter = JITTER[family.group];
    const where = this.locate(cue.at);
    const started = this.engine.play({
      family: cue.sound,
      variant: this.picker.pick(cue.sound, family.variants),
      gain: (cue.gain ?? 1) * where.gain * (1 + (this.random() * 2 - 1) * jitter.gain),
      pan: where.pan,
      rate: 1 + (this.random() * 2 - 1) * jitter.rate,
      delay,
    });
    if (started)
      this.book.push({
        handle: started,
        family: cue.sound,
        group: family.group,
        startedAt: startsAt,
        endsAt: started.endsAt,
      });
  }

  /** Drops the sounds that have finished from the list of what is playing. */
  private forget(now: number): void {
    for (let i = this.book.length - 1; i >= 0; i--) if (this.book[i]!.endsAt <= now) this.book.splice(i, 1);
  }

  /**
   * Where a sound sits in the stereo field and how loud it is, from where it is on screen. The
   * middle of the screen is full volume and centred; the edge leans a little to that side; beyond
   * the edge it softens, but is still heard.
   */
  private locate(at: Vec2 | undefined): { pan: number; gain: number } {
    const v = this.view;
    if (!at || !v) return { pan: 0, gain: 1 };
    const dx = (at.x - (v.x + v.w / 2)) / (v.w / 2);
    const dy = (at.y - (v.y + v.h / 2)) / (v.h / 2);
    const away = Math.hypot(dx, dy);
    return { pan: Math.max(-0.6, Math.min(0.6, dx * 0.6)), gain: Math.max(0.35, Math.min(1, 1.15 - 0.4 * away)) };
  }
}
