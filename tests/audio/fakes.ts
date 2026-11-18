import type { Engine, EngineStats, LoopRequest, Playing, PlayRequest, Slot } from '../../src/audio/engine';
import type { AudioMix } from '../../src/audio/mix';
import type { AudioPlace } from '../../src/game/ports';
import type { AudioAssets, LoopAsset, SheetAsset, SheetId } from '../../src/shared/audio';

/**
 * An engine that records what it was asked and makes no sound, so the decisions above it can be
 * checked.
 */
export class FakeEngine implements Engine {
  unlocked = 0;
  resumed = 0;
  suspended = 0;
  prefetched: string[] = [];
  loaded: SheetId[] = [];
  loops: Record<Slot, LoopRequest | null> = { music: null, ambience: null };
  loopCalls: { slot: Slot; request: LoopRequest }[] = [];
  plays: PlayRequest[] = [];
  stops: { voice: Playing; fade: number }[] = [];
  mix: AudioMix | null = null;
  clock = 0;
  /** How long every sound lasts, in seconds. */
  length = 1;
  /** Sheets that never finish decoding, to see how the game behaves while they load. */
  stuck = new Set<SheetId>();
  /** Makes loop requests fail, as a failed decode would. */
  failLoops = false;
  private readonly ready = new Set<SheetId>();

  unlock(): void {
    this.unlocked += 1;
  }

  prefetch(files: readonly string[]): void {
    this.prefetched.push(...files);
  }

  async loadSheet(id: SheetId): Promise<void> {
    this.loaded.push(id);
    if (!this.stuck.has(id)) this.ready.add(id);
  }

  hasSheet(id: SheetId): boolean {
    return this.ready.has(id);
  }

  async setLoop(slot: Slot, request: LoopRequest): Promise<void> {
    this.loopCalls.push({ slot, request });
    if (this.failLoops) throw new Error('decode failed');
    this.loops[slot] = request;
  }

  play(request: PlayRequest): Playing | null {
    this.plays.push(request);
    return { family: request.family, endsAt: this.clock + request.delay + this.length };
  }

  stop(voice: Playing, fade: number): void {
    this.stops.push({ voice, fade });
  }

  setMix(mix: AudioMix): void {
    this.mix = mix;
  }

  suspend(): void {
    this.suspended += 1;
  }

  resume(): void {
    this.resumed += 1;
  }

  now(): number {
    return this.clock;
  }

  stats(): EngineStats {
    return {
      state: this.unlocked > 0 ? 'running' : 'idle',
      sampleRate: 32000,
      decodedBytes: 0,
      sheets: [...this.ready],
      loops: { music: this.loops.music?.id ?? null, ambience: this.loops.ambience?.id ?? null },
      voices: 0,
      worldShare: 1,
    };
  }
}

const loop = (id: string, kind: LoopAsset['kind'], seconds: number): LoopAsset => ({
  file: `audio/${id}.mp3`,
  kind,
  seconds,
  loopStart: 1,
  loopEnd: 1 + seconds,
  bytes: 1000,
  lufs: -20,
  truePeak: -3,
  decodedBytes: 1000,
});
const sheet = (id: string): SheetAsset => ({
  file: `audio/sheet-${id}.mp3`,
  bytes: 1000,
  seconds: 30,
  sprites: {},
  decodedBytes: 1000,
});

export const FAKE_ASSETS: AudioAssets = {
  loops: {
    'music-forest': loop('music-forest', 'music', 36),
    'music-garden': loop('music-garden', 'music', 36),
    'music-snow': loop('music-snow', 'music', 32),
    'ambience-forest': loop('ambience-forest', 'ambience', 24),
    'ambience-garden': loop('ambience-garden', 'ambience', 24),
    'ambience-treasure-room': loop('ambience-treasure-room', 'ambience', 16),
    'ambience-stable-room': loop('ambience-stable-room', 'ambience', 16),
    'ambience-manor-yard': loop('ambience-manor-yard', 'ambience', 24),
    'ambience-manor-hall': loop('ambience-manor-hall', 'ambience', 16),
    'ambience-sky-garden': loop('ambience-sky-garden', 'ambience', 16),
  },
  sheets: { core: sheet('core'), magic: sheet('magic'), objects: sheet('objects') },
};

const soft = (): 'soft' => 'soft';
export const FOREST: AudioPlace = { mapId: 'forest', music: 'forest', ambience: 'forest', surfaceAt: soft };
export const GARDEN: AudioPlace = { mapId: 'palace-garden', music: 'garden', ambience: 'garden', surfaceAt: soft };
export const TREASURE: AudioPlace = {
  mapId: 'treasure-house',
  music: 'quiet',
  ambience: 'treasure-room',
  surfaceAt: soft,
};
export const STABLE: AudioPlace = { mapId: 'stable', music: 'quiet', ambience: 'stable-room', surfaceAt: soft };

/** Lets the promises the service starts finish. */
export const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
