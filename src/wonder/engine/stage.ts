import { clamp, lerp } from './ease';
import { type Painter, type View, viewOf } from './painter';

/** One finger, or the mouse. Positions are in the game's own units. */
export interface Pointer {
  readonly id: number;
  x: number;
  y: number;
  /** Where it was at the last move. */
  px: number;
  py: number;
  /** How fast it is going, in units per second, smoothed. */
  vx: number;
  vy: number;
  /** Where and when (game time) it went down. */
  x0: number;
  y0: number;
  t0: number;
  down: boolean;
}

/** What a game is to the stage: it is laid out, stepped, drawn and told where fingers are. */
export interface Scene {
  layout(view: View): void;
  update(dt: number): void;
  draw(p: Painter): void;
  /** Drawn after the light sheet has been laid over the picture, so on top of every glow. */
  drawAbove?(p: Painter): void;
  down?(p: Pointer): void;
  move?(p: Pointer): void;
  up?(p: Pointer): void;
  /**
   * How long, in seconds, light stays on the light sheet before it fades. 0 (or leaving it out)
   * clears the sheet every frame.
   */
  readonly trail?: number;
  /** How strongly the light blooms, from 0 to 1. */
  readonly bloom?: number;
  /**
   * The stage turned its quality down: 2 is full, 0 is lowest. The scene should make fewer
   * particles.
   */
  quality?(level: Quality): void;
}

export type Quality = 0 | 1 | 2;

export interface StageOptions {
  /** The element the canvas is put in. It decides the size. */
  host: HTMLElement;
  calm: boolean;
  /** No clock: the stage only moves when it is stepped. For tests and for filming. */
  manual?: boolean;
  /** The pixel ratio of the screen. */
  pixelRatio?: number;
  /**
   * The quality it starts at, for a device that is known to be slow. The highest if left out. The
   * stage lowers itself from here if frames run slow.
   */
  quality?: Quality;
  /**
   * The picture has holes in it, and what is behind the stage shows through them. Without it the
   * picture is whole and it begins from black.
   */
  transparent?: boolean;
}

/**
 * How big the light sheet is compared with the picture. Half the size is a quarter of the work, and
 * glow does not need edges.
 */
const LIGHT_SCALE = 0.5;
/**
 * Frames in a row that must be slow before the quality drops, and what slow is, in milliseconds of
 * script.
 */
const SLOW_FRAMES = 40;
const SLOW_MS = 13;
const LEVELS: readonly { ratio: number; light: boolean; bloom: boolean }[] = [
  { ratio: 1, light: false, bloom: false },
  { ratio: 1.5, light: true, bloom: true },
  { ratio: 2, light: true, bloom: true },
];

function canvasOf(w: number, h: number, opaque = false): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  return { canvas, g: canvas.getContext('2d', opaque ? { alpha: false } : undefined)! };
}

/**
 * The surface a game plays on. It owns a canvas that fills its host, the clock, the fingers, and a
 * light sheet laid over the picture so glows can trail and bloom. It watches how long each frame
 * takes and lowers its own quality on a device that cannot keep up, so a slow phone gets a simpler
 * show and not a slow one.
 */
export class Stage {
  readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private lightSheet: { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } | null = null;
  private bloomSheets: { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D }[] = [];
  private scene: Scene | null = null;
  private current: View = viewOf(640, 360);
  private cssW = 640;
  private cssH = 360;
  private ratio = 1;
  private frame = 0;
  private last = 0;
  private watch: ResizeObserver | null = null;
  private level: Quality = 2;
  private slow = 0;
  private running = false;
  private sized = false;
  private readonly pointerById = new Map<number, Pointer>();
  private readonly cleanups: (() => void)[] = [];
  private readonly painter: { -readonly [K in keyof Painter]: Painter[K] };
  /** Seconds the game has run, on its own clock. */
  time = 0;
  /**
   * Milliseconds of script a frame takes (update and draw, not the browser's own work), smoothed.
   */
  cost = 0;
  frames = 0;

  constructor(private readonly options: StageOptions) {
    this.level = options.quality ?? 2;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'wonder-canvas';
    this.g = this.canvas.getContext('2d', { alpha: options.transparent === true })!;
    this.painter = { ctx: this.g, light: this.g, w: 0, h: 0, k: 1, t: 0, dt: 0, calm: options.calm };
    options.host.append(this.canvas);
    this.listen();
    this.measure();
    if (!options.manual) {
      this.watch = new ResizeObserver(() => this.measure());
      this.watch.observe(options.host);
    }
  }

  get view(): View {
    return this.current;
  }

  get quality(): Quality {
    return this.level;
  }

  get pointers(): ReadonlyMap<number, Pointer> {
    return this.pointerById;
  }

  /** Sets the stage's game. It is laid out at once. */
  play(scene: Scene): void {
    this.scene = scene;
    scene.layout(this.current);
    scene.quality?.(this.level);
  }

  /** Starts the clock. Does nothing for a stage that is stepped by hand. */
  start(): void {
    if (this.running || this.options.manual) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number): void => {
      if (!this.running) return;
      this.frame = requestAnimationFrame(tick);
      const dt = clamp((now - this.last) / 1000, 0.001, 0.05);
      this.last = now;
      this.advance(dt);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  /**
   * Moves the game forward by `seconds`, in frames of at most a sixtieth, drawing the last. For
   * tests and filming.
   */
  step(seconds: number, frame = 1 / 60): void {
    let left = seconds;
    while (left > 1e-9) {
      const dt = Math.min(frame, left);
      left -= dt;
      this.advance(dt, left <= 1e-9);
    }
  }

  /** Sends a finger to the game without a browser event. `x` and `y` are in units. */
  inject(kind: 'down' | 'move' | 'up', id: number, x: number, y: number): void {
    this.pointerEvent(kind, id, x, y, this.time);
  }

  /** Puts the picture right now, without moving time. */
  redraw(): void {
    this.render(0);
  }

  dispose(): void {
    this.stop();
    this.watch?.disconnect();
    for (const undo of this.cleanups) undo();
    this.cleanups.length = 0;
    this.canvas.remove();
    this.lightSheet = null;
    this.bloomSheets = [];
    this.scene = null;
    this.pointerById.clear();
  }

  /**
   * Drops the quality one step, as a slow device would make it. Public so a test can see what a
   * slow device sees.
   */
  lower(): void {
    if (this.level === 0) return;
    this.level = (this.level - 1) as Quality;
    this.slow = 0;
    this.size();
    this.scene?.quality?.(this.level);
  }

  private measure(): void {
    const box = this.options.host.getBoundingClientRect();
    const w = Math.max(1, box.width);
    const h = Math.max(1, box.height);
    // The first measure always sizes the canvas, even when the host is the size the stage starts
    // out assuming (640 by 360).
    if (this.sized && w === this.cssW && h === this.cssH) return;
    this.sized = true;
    this.cssW = w;
    this.cssH = h;
    this.size();
  }

  /** The canvases follow the host's size and the quality. */
  private size(): void {
    const { ratio, light, bloom } = LEVELS[this.level]!;
    this.ratio = Math.min(
      this.options.pixelRatio ?? (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1),
      ratio,
    );
    const w = Math.round(this.cssW * this.ratio);
    const h = Math.round(this.cssH * this.ratio);
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.current = viewOf(this.cssW, this.cssH);
    if (light) {
      this.lightSheet = canvasOf(w * LIGHT_SCALE, h * LIGHT_SCALE);
      this.bloomSheets = bloom ? [4, 8, 16].map((d) => canvasOf(w / d, h / d)) : [];
    } else {
      this.lightSheet = null;
      this.bloomSheets = [];
    }
    this.scene?.layout(this.current);
  }

  private advance(dt: number, draw = true): void {
    const began = performance.now();
    this.time += dt;
    this.scene?.update(dt);
    if (draw) this.render(dt);
    this.frames++;
    const spent = performance.now() - began;
    this.cost = this.frames === 1 ? spent : lerp(this.cost, spent, 0.1);
    if (!this.options.manual) this.guard(spent);
  }

  /**
   * A device that is slow for long enough gets a lighter show, and does not get the heavy one back.
   */
  private guard(spent: number): void {
    if (spent > SLOW_MS) this.slow++;
    else this.slow = Math.max(0, this.slow - 2);
    if (this.slow >= SLOW_FRAMES) this.lower();
  }

  private render(dt: number): void {
    const scene = this.scene;
    if (!scene) return;
    const g = this.g;
    const k = this.ratio * this.current.unit;
    const sheet = this.lightSheet;
    const p = this.painter;
    p.w = this.current.w;
    p.h = this.current.h;
    p.k = k;
    p.t = this.time;
    p.dt = dt;
    p.calm = this.options.calm;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    if (this.options.transparent) {
      g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    } else {
      g.fillStyle = '#000';
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    g.setTransform(k, 0, 0, k, 0, 0);

    if (sheet) {
      const lg = sheet.g;
      lg.setTransform(1, 0, 0, 1, 0, 0);
      lg.globalAlpha = 1;
      lg.globalCompositeOperation = 'source-over';
      const persist = scene.trail ?? 0;
      if (persist > 0 && dt > 0) {
        // Each frame takes away its share of what is there, so a trail lasts as long as the game
        // says at any frame rate.
        lg.globalCompositeOperation = 'destination-out';
        lg.fillStyle = `rgba(0,0,0,${(1 - Math.exp(-dt / persist)).toFixed(4)})`;
        lg.fillRect(0, 0, sheet.canvas.width, sheet.canvas.height);
        lg.globalCompositeOperation = 'source-over';
      } else if (dt > 0 || persist === 0) {
        lg.clearRect(0, 0, sheet.canvas.width, sheet.canvas.height);
      }
      lg.setTransform(k * LIGHT_SCALE, 0, 0, k * LIGHT_SCALE, 0, 0);
      p.light = lg;
    } else {
      p.light = g;
    }

    scene.draw(p);

    if (sheet) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'lighter';
      g.drawImage(sheet.canvas, 0, 0, this.canvas.width, this.canvas.height);
      const strength = clamp(scene.bloom ?? 0);
      if (strength > 0 && this.bloomSheets.length > 0) this.bloom(sheet.canvas, strength);
      g.globalCompositeOperation = 'source-over';
      g.setTransform(k, 0, 0, k, 0, 0);
    }
    scene.drawAbove?.(p);
    g.globalAlpha = 1;
  }

  /**
   * The light sheet shrunk again and again, then spread back over the picture: a soft halo around
   * everything bright.
   */
  private bloom(from: HTMLCanvasElement, strength: number): void {
    let source: HTMLCanvasElement = from;
    for (const s of this.bloomSheets) {
      s.g.globalCompositeOperation = 'copy';
      s.g.drawImage(source, 0, 0, s.canvas.width, s.canvas.height);
      source = s.canvas;
    }
    const g = this.g;
    const weights = [0.55, 0.5, 0.45];
    this.bloomSheets.forEach((s, i) => {
      g.globalAlpha = strength * (weights[i] ?? 0.4);
      g.drawImage(s.canvas, 0, 0, this.canvas.width, this.canvas.height);
    });
    g.globalAlpha = 1;
  }

  private listen(): void {
    const c = this.canvas;
    const at = (e: PointerEvent): { x: number; y: number } => {
      const box = c.getBoundingClientRect();
      return { x: (e.clientX - box.left) / this.current.unit, y: (e.clientY - box.top) / this.current.unit };
    };
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void): void => {
      c.addEventListener(type, fn as EventListener);
      this.cleanups.push(() => c.removeEventListener(type, fn as EventListener));
    };
    on('pointerdown', (e) => {
      const p = at(e);
      c.setPointerCapture?.(e.pointerId);
      this.pointerEvent('down', e.pointerId, p.x, p.y, e.timeStamp / 1000);
      e.preventDefault();
    });
    on('pointermove', (e) => {
      const p = at(e);
      this.pointerEvent('move', e.pointerId, p.x, p.y, e.timeStamp / 1000);
    });
    const lift = (e: PointerEvent): void => {
      const p = at(e);
      this.pointerEvent('up', e.pointerId, p.x, p.y, e.timeStamp / 1000);
    };
    on('pointerup', lift);
    on('pointercancel', lift);
    on('contextmenu', (e) => e.preventDefault());
  }

  private lastMove = new Map<number, number>();

  private pointerEvent(kind: 'down' | 'move' | 'up', id: number, x: number, y: number, at: number): void {
    let p = this.pointerById.get(id);
    if (kind === 'down') {
      p = { id, x, y, px: x, py: y, vx: 0, vy: 0, x0: x, y0: y, t0: this.time, down: true };
      this.pointerById.set(id, p);
      this.lastMove.set(id, at);
      this.scene?.down?.(p);
      return;
    }
    if (!p) {
      // A mouse that is moving without a button down is still a pointer the game may follow.
      if (kind === 'up') return;
      p = { id, x, y, px: x, py: y, vx: 0, vy: 0, x0: x, y0: y, t0: this.time, down: false };
      this.pointerById.set(id, p);
    }
    const before = this.lastMove.get(id) ?? at;
    const span = Math.max(0.004, at - before);
    this.lastMove.set(id, at);
    p.px = p.x;
    p.py = p.y;
    p.x = x;
    p.y = y;
    p.vx = lerp(p.vx, (x - p.px) / span, 0.5);
    p.vy = lerp(p.vy, (y - p.py) / span, 0.5);
    if (kind === 'move') {
      this.scene?.move?.(p);
      return;
    }
    p.down = false;
    this.scene?.up?.(p);
    this.pointerById.delete(id);
    this.lastMove.delete(id);
  }
}
