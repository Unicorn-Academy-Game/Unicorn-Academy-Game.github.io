import { ALPHABET, type ClipId, soundClip } from '../learning';
import { runsOn, SPEECH_RESIDENT, type SpeechAssets } from '../shared/audio';
import type { SynthGraph } from './synth/synth';

/**
 * The voice. Every line the game says is a clip that ships with it, spoken once by a speech model
 * and the same on every device, so there is no voice of the device in the game at all. A clip is
 * fetched and decoded when it is first wanted, and a few seconds of the ones used most are kept so
 * a letter the player presses is heard at once.
 *
 * What is said is in the clips and what is shown is in the text, and they come from one list
 * (`src/learning/lines.ts`), so a card never says one thing and the voice another. A voice that
 * cannot be had, for no network, a muted game or a parent's switch, is silence, and the game goes
 * on: every word is on the screen as well.
 */

/**
 * Quiet between two clips said one after another, in seconds. The sounds of a word's tiles are said
 * one after another, and a child who is learning them needs each to finish before the next. A clip
 * that runs on (`runsOn`) has no quiet after it, because it is a piece of a sentence and the next
 * piece is the rest of the same breath.
 */
export const GAP = 0.3;
/** How long a clip that is cut off takes to fade out, so the cut is not a click. */
const CUT = 0.03;
/** The least time between asking and a sound starting, so the node is ready before it is wanted. */
const LEAD = 0.01;
/** How many clips are fetched at once while the letters are made ready. */
const WARM_LANES = 2;
/** How many of the clips that were said are remembered, for the game's own checks. */
const REMEMBERED = 64;
/**
 * The most time between a clip being played and being heard that is allowed for, in seconds.
 * Speakers over the air take a good part of this.
 */
const MAX_LAG = 0.4;

/**
 * How long what the context plays takes to be heard, where the browser says. A word on a card
 * follows what is heard and not what is scheduled.
 */
function lagOf(ctx: BaseAudioContext): number {
  const latency = (ctx as Partial<AudioContext>).outputLatency;
  return typeof latency === 'number' && Number.isFinite(latency) ? Math.min(Math.max(latency, 0), MAX_LAG) : 0;
}

export interface VoiceBankDeps {
  /** The manifest's speech section, or undefined for a game with no voice. */
  speech: SpeechAssets | undefined;
  /** Where sound goes, or null while there is no context to play into. */
  graph: () => SynthGraph | null;
  /** Turns a manifest path into a URL. */
  url: (file: string) => string;
  /** Whether words are to be said now: a parent wants them, and the game is not muted. */
  allowed: () => boolean;
  fetcher?: typeof fetch;
}

/**
 * Told as each clip of a line is set to sound: which clip it is, how long it lasts and how long
 * from now until it is heard, both in seconds. A word on a card follows the voice with it. A clip
 * that cannot be had is never told, and neither is one that was cut off before it began.
 */
export type Began = (clip: ClipId, seconds: number, delay: number) => void;

export interface VoiceStats {
  /**
   * Bytes of clips held decoded, which is never more than `SPEECH_RESIDENT` once what is being said
   * is let go.
   */
  resident: number;
  clips: number;
  /** Clips sounding or waiting to sound. */
  live: number;
  /**
   * Clips on their way, being fetched or decoded. It is 0 once nothing is asked for and the sounds
   * of the letters are in.
   */
  loading: number;
  /** How many times a clip has started since the page opened. */
  started: number;
}

interface Live {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

const bytesOf = (buffer: AudioBuffer): number => buffer.length * buffer.numberOfChannels * 4;

export class VoiceBank {
  /** Decoded clips, the one used longest ago first. */
  private readonly cache = new Map<ClipId, AudioBuffer>();
  private readonly loading = new Map<ClipId, Promise<AudioBuffer | null>>();
  private readonly live = new Set<Live>();
  private resident = 0;
  /**
   * Bumped by every request to speak or stop, so a clip that arrives after a newer request can tell
   * it is stale.
   */
  private token = 0;
  private context: BaseAudioContext | null = null;
  private current: ReadonlySet<ClipId> = new Set();
  private warm = false;
  private started = 0;
  /** The clips that began, oldest first, for tests and for the game's own checks. */
  readonly heard: ClipId[] = [];

  constructor(private readonly deps: VoiceBankDeps) {}

  /** Whether the game has a voice at all, which is whether a speaker button means anything. */
  get available(): boolean {
    return this.deps.speech !== undefined;
  }

  /**
   * Whether a word said now would be heard: there is a voice, a parent wants it, and the game is
   * not muted.
   */
  get audible(): boolean {
    return this.deps.speech !== undefined && this.deps.allowed();
  }

  /**
   * Says the clips one after another, cutting off what was being said. A clip that cannot be had is
   * skipped. `began` is told as each one is set to sound.
   */
  say(clips: readonly ClipId[], began?: Began): void {
    const run = this.cut();
    const graph = this.ready();
    if (!graph || clips.length === 0) return;
    this.current = new Set(clips);
    void this.sequence(graph, clips, run, began);
    this.prepare(graph);
  }

  /**
   * Says what a letter sounds like, "buh" for b and not "bee". Anything that is not a letter of the
   * alphabet is not said.
   */
  letter(letter: string): void {
    const name = letter.toLowerCase();
    if (name.length !== 1 || !ALPHABET.includes(name)) return;
    this.say([soundClip(name)]);
  }

  /** Stops what is being said, for when the player leaves or the card closes. */
  stop(): void {
    this.cut();
    this.current = new Set();
  }

  stats(): VoiceStats {
    return {
      resident: this.resident,
      clips: this.cache.size,
      live: this.live.size,
      loading: this.loading.size,
      started: this.started,
    };
  }

  /**
   * Where to play, or null when nothing would be heard: no voice, not wanted, no context yet, or a
   * context waiting for a touch.
   */
  private ready(): SynthGraph | null {
    if (!this.deps.speech || !this.deps.allowed()) return null;
    const graph = this.deps.graph();
    return graph?.playable() ? graph : null;
  }

  private async sequence(
    graph: SynthGraph,
    clips: readonly ClipId[],
    run: number,
    began: Began | undefined,
  ): Promise<void> {
    try {
      // Everything is asked for at once, so the later clips are on their way while the first is
      // heard.
      const wanted = clips.map((id) => this.load(graph, id));
      let at = 0;
      for (let i = 0; i < clips.length; i++) {
        const buffer = await wanted[i]!;
        if (run !== this.token || !graph.playable()) return;
        if (!buffer) continue;
        const start = Math.max(graph.ctx.currentTime + LEAD, at);
        this.begin(graph, clips[i]!, buffer, start);
        began?.(clips[i]!, buffer.duration, start - graph.ctx.currentTime + lagOf(graph.ctx));
        at = start + buffer.duration + (runsOn(clips[i]!) ? 0 : GAP);
      }
    } catch {
      // A context that has gone away. The words are on the card.
    }
  }

  private begin(graph: SynthGraph, id: ClipId, buffer: AudioBuffer, when: number): void {
    const ctx = graph.ctx;
    this.context = ctx;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(graph.effects);
    const live: Live = { source, gain };
    this.live.add(live);
    source.addEventListener('ended', () => {
      source.disconnect();
      gain.disconnect();
      this.live.delete(live);
    });
    source.start(when);
    this.started += 1;
    this.heard.push(id);
    if (this.heard.length > REMEMBERED) this.heard.shift();
  }

  /**
   * Stops what is sounding or waiting to, with a short fade, and gives back the number a clip that
   * is still on its way will compare with.
   */
  private cut(): number {
    const run = ++this.token;
    const ctx = this.context;
    if (ctx) {
      const t = ctx.currentTime;
      for (const live of this.live) {
        try {
          live.gain.gain.cancelScheduledValues(t);
          live.gain.gain.setValueAtTime(live.gain.gain.value, t);
          live.gain.gain.linearRampToValueAtTime(0, t + CUT);
          live.source.stop(t + CUT + 0.01);
        } catch {
          // Already stopped.
        }
      }
    }
    return run;
  }

  private load(graph: SynthGraph, id: ClipId): Promise<AudioBuffer | null> {
    const held = this.cache.get(id);
    if (held) {
      // Used now, so it is the last to go.
      this.cache.delete(id);
      this.cache.set(id, held);
      return Promise.resolve(held);
    }
    let pending = this.loading.get(id);
    if (!pending) {
      const clip = this.deps.speech?.clips[id];
      pending = clip ? this.fetchAndDecode(graph, id, clip.file) : Promise.resolve(null);
      this.loading.set(id, pending);
      void pending.then(() => this.loading.delete(id));
    }
    return pending;
  }

  private async fetchAndDecode(graph: SynthGraph, id: ClipId, file: string): Promise<AudioBuffer | null> {
    try {
      const fetcher: typeof fetch = this.deps.fetcher ?? ((...args) => fetch(...args));
      const response = await fetcher(this.deps.url(file));
      if (!response.ok) return null;
      const buffer = await graph.ctx.decodeAudioData(await response.arrayBuffer());
      if (!this.cache.has(id)) {
        this.cache.set(id, buffer);
        this.resident += bytesOf(buffer);
        this.trim(id);
      }
      return buffer;
    } catch {
      // No network, or a file the browser cannot decode. The word is on the card.
      return null;
    }
  }

  /**
   * Lets the clips used longest ago go until what is held fits, keeping what is being said now and
   * the clip that has just arrived.
   */
  private trim(arrived: ClipId): void {
    for (const [id, buffer] of this.cache) {
      if (this.resident <= SPEECH_RESIDENT) return;
      if (id === arrived || this.current.has(id)) continue;
      this.cache.delete(id);
      this.resident -= bytesOf(buffer);
    }
  }

  /**
   * The first time the player is spoken to, the sounds of the letters are fetched too, so the first
   * key they press is as quick as the rest.
   */
  private prepare(graph: SynthGraph): void {
    if (this.warm) return;
    this.warm = true;
    const queue = [...ALPHABET].map(soundClip);
    const lane = async (): Promise<void> => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) await this.load(graph, id);
    };
    for (let i = 0; i < WARM_LANES; i++) void lane();
  }
}
