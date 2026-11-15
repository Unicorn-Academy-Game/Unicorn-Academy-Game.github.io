import type { SaveClock } from '../../persistence/save-service';

/**
 * The "hold to open parent controls" gate. It keeps a small child out by accident and does not
 * pretend to be a lock. A press that lasts the full time opens the controls. One that ends early is
 * a tap, which only explains the gate.
 */

/**
 * How long the button is held. Long enough that a tap or a swipe never reaches it, short enough for
 * a parent not to mind.
 */
export const HOLD_MS = 1100;

export interface HoldEvents {
  /** A press began. */
  onStart(): void;
  /** The press lasted long enough. Fires once per press, while the finger is still down. */
  onOpen(): void;
  /** The press ended before it was long enough. */
  onTap(): void;
  /** The press moved away from the button, or was interrupted. Not a tap. */
  onCancel(): void;
}

type State = 'idle' | 'holding' | 'opened';

export class HoldGesture {
  private state: State = 'idle';
  private stop: (() => void) | null = null;

  constructor(
    private readonly clock: Pick<SaveClock, 'later'>,
    private readonly events: HoldEvents,
    private readonly ms: number = HOLD_MS,
  ) {}

  get holding(): boolean {
    return this.state === 'holding';
  }

  /** A finger or key went down. A second press while one is already going is ignored. */
  press(): void {
    if (this.state !== 'idle') return;
    this.state = 'holding';
    this.events.onStart();
    this.stop = this.clock.later(this.ms, () => {
      this.stop = null;
      this.state = 'opened';
      this.events.onOpen();
    });
  }

  /** The finger or key came up. */
  release(): void {
    const was = this.state;
    this.state = 'idle';
    this.stop?.();
    this.stop = null;
    if (was === 'holding') this.events.onTap();
  }

  /** The press is no longer on the button. Nothing opens and it does not count as a tap. */
  cancel(): void {
    const was = this.state;
    this.state = 'idle';
    this.stop?.();
    this.stop = null;
    if (was === 'holding') this.events.onCancel();
  }
}
