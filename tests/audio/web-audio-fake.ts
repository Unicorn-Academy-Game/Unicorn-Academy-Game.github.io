import type { SynthGraph } from '../../src/audio/synth/synth';

/**
 * A stand-in for the parts of Web Audio the synth touches, enough to count what is made, where it
 * is joined, when it starts and whether it is let go. It makes no sound. What a sound is made of is
 * measured in a real browser by `tools/qa/synth-sheet.ts` and `tests/e2e/synth.spec.ts`; this is
 * for what the synth does around the sounds.
 */

export interface FakeParam {
  value: number;
  /** Every automation call made on it, in order. */
  readonly events: Array<{ kind: string; args: unknown[] }>;
}

export interface FakeNode {
  readonly kind: string;
  [key: string]: unknown;
  readonly connections: unknown[];
  disconnected: boolean;
  /**
   * Times given to `start` and `stop`, and the places in a buffer that sources were started from.
   */
  readonly starts: number[];
  readonly stops: number[];
  readonly offsets: number[];
}

const AUTOMATION = [
  'setValueAtTime',
  'linearRampToValueAtTime',
  'exponentialRampToValueAtTime',
  'setTargetAtTime',
  'setValueCurveAtTime',
  'cancelScheduledValues',
  'cancelAndHoldAtTime',
];

/**
 * A parameter that refuses what Chromium refuses, as measured in it: a time that is not a finite
 * number from nought up, a curve that starts before now, which is moved to start now and so ends
 * later than its end was meant to be, and any event that falls within a curve, including the moment
 * it starts. An event at the very end of a curve is allowed.
 */
function strictTimeline(clock: () => number): (kind: string, args: unknown[]) => void {
  const curves: Array<{ from: number; to: number }> = [];
  const events: number[] = [];
  return (kind, args) => {
    if (kind === 'cancelScheduledValues' || kind === 'cancelAndHoldAtTime') return;
    const time = args[1] as number;
    if (!Number.isFinite(time) || time < 0) throw new RangeError(`Time must be a finite non-negative number: ${time}`);
    if (kind === 'setValueCurveAtTime') {
      const from = Math.max(time, clock());
      const to = from + (args[2] as number);
      if (curves.some((c) => from < c.to && c.from < to) || events.some((e) => e > from && e < to))
        throw new DOMException(
          `setValueCurveAtTime(..., ${from}, ${to - from}) overlaps another event`,
          'NotSupportedError',
        );
      curves.push({ from, to });
      return;
    }
    const within = curves.find((c) => time >= c.from && time < c.to);
    if (within)
      throw new DOMException(
        `${kind}(${String(args[0])}, ${time}) overlaps setValueCurveAtTime(..., ${within.from}, ${within.to - within.from})`,
        'NotSupportedError',
      );
    events.push(time);
  };
}

export function fakeParam(initial = 0, clock?: () => number): FakeParam {
  const events: FakeParam['events'] = [];
  const param: Record<string, unknown> = { value: initial, events };
  const check = clock ? strictTimeline(clock) : null;
  for (const kind of AUTOMATION) {
    param[kind] = (...args: unknown[]) => {
      check?.(kind, args);
      events.push({ kind, args });
      return param;
    };
  }
  return param as unknown as FakeParam;
}

class FakeContext {
  currentTime = 0;
  sampleRate = 32000;
  state: 'running' | 'suspended' = 'running';
  /**
   * Whether the parameters made from now on refuse what a browser refuses (see `strictTimeline`),
   * by the clock this context has.
   */
  strict = false;
  readonly nodes: FakeNode[] = [];
  readonly buffers: Array<{ channels: number; length: number }> = [];
  /** What listeners were added for `ended`, which a test calls to let time pass. */
  readonly ended: Array<() => void> = [];
  readonly destination = this.make('destination');

  /**
   * Makes any node: whatever is asked of it is accepted, and parameters are made when first looked
   * at.
   */
  make(kind: string): FakeNode {
    const params = new Map<string, FakeParam>();
    const data: Record<string, unknown> = {};
    const node: FakeNode = new Proxy(
      {
        kind,
        connections: [] as unknown[],
        disconnected: false,
        starts: [] as number[],
        stops: [] as number[],
        offsets: [] as number[],
      } as FakeNode,
      {
        get: (target, key: string) => {
          if (key in target) return target[key];
          if (key in data) return data[key];
          switch (key) {
            case 'connect':
              return (to: unknown) => {
                target.connections.push(to);
                return to;
              };
            case 'disconnect':
              return () => {
                target.disconnected = true;
              };
            case 'start':
              return (t = 0, offset?: number) => {
                target.starts.push(t);
                if (offset !== undefined) target.offsets.push(offset);
              };
            case 'stop':
              return (t = 0) => void target.stops.push(t);
            case 'addEventListener':
              return (type: string, fn: () => void) => {
                if (type === 'ended') this.ended.push(fn);
              };
            case 'duration':
              return 1.6;
            default: {
              let p = params.get(key);
              if (!p) {
                p = fakeParam(0, this.strict ? () => this.currentTime : undefined);
                params.set(key, p);
              }
              return p;
            }
          }
        },
        set: (target, key: string, value: unknown) => {
          // A parameter assigned a number keeps it as its value, as `node.gain.value = 1` would
          // have.
          if (key in target) (target as Record<string, unknown>)[key] = value;
          else data[key] = value;
          return true;
        },
      },
    );
    this.nodes.push(node);
    return node;
  }

  createBuffer(channels: number, length: number, rate: number): unknown {
    this.buffers.push({ channels, length });
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      numberOfChannels: channels,
      length,
      sampleRate: rate,
      duration: length / rate,
      getChannelData: (c: number) => data[c]!,
    };
  }
  createGain = (): FakeNode => this.make('gain');
  createOscillator = (): FakeNode => this.make('oscillator');
  createBufferSource = (): FakeNode => this.make('bufferSource');
  createBiquadFilter = (): FakeNode => this.make('biquad');
  createStereoPanner = (): FakeNode => this.make('panner');
  createConvolver = (): FakeNode => this.make('convolver');
  createDelay = (): FakeNode => this.make('delay');
  createWaveShaper = (): FakeNode => this.make('shaper');
  createDynamicsCompressor = (): FakeNode => this.make('compressor');
  createConstantSource = (): FakeNode => this.make('constant');
  createPeriodicWave = (): unknown => ({});

  /** Lets every sound that was made run to its end. */
  finish(): void {
    for (const fn of this.ended.splice(0)) fn();
  }

  count(kind: string): number {
    return this.nodes.filter((n) => n.kind === kind).length;
  }
}

export interface FakeRig {
  readonly ctx: FakeContext;
  readonly effects: FakeNode;
  readonly music: FakeNode;
  graph(): SynthGraph;
  hear(on: boolean): void;
}

export function fakeRig(): FakeRig {
  const ctx = new FakeContext();
  const effects = ctx.make('bus-effects');
  const music = ctx.make('bus-music');
  const graph: SynthGraph = {
    ctx: ctx as unknown as BaseAudioContext,
    effects: effects as unknown as AudioNode,
    music: music as unknown as AudioNode,
    playable: () => ctx.state === 'running',
  };
  return {
    ctx,
    effects,
    music,
    graph: () => graph,
    hear: (on) => {
      ctx.state = on ? 'running' : 'suspended';
    },
  };
}
