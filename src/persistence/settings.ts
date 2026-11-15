import { DEFAULT_SETTINGS, type DeviceSettings, nearestZoom } from '../shared/save';
import { realClock, type SaveClock } from './save-service';
import type { LocalStore } from './store';

/**
 * How long after the last change the settings are written, so dragging a slider is one write and
 * not hundreds.
 */
export const WRITE_DELAY_MS = 400;

export type SettingsListener = (settings: DeviceSettings) => void;

const level = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

const normalized = (s: DeviceSettings): DeviceSettings => ({
  musicVolume: level(s.musicVolume),
  effectsVolume: level(s.effectsVolume),
  muted: s.muted,
  reducedEffects: s.reducedEffects,
  startFresh: s.startFresh,
  startPlace: s.startPlace,
  zoom: nearestZoom(s.zoom),
  lowEnd: s.lowEnd,
  season: s.season,
  learning: { ...s.learning },
});

/**
 * Whether two flat records hold the same values. It reads the keys of the record, so a choice added
 * later is compared without anyone remembering to add it here.
 */
const shallowSame = <T extends object>(a: T, b: T): boolean =>
  (Object.keys(a) as (keyof T)[]).every((key) => a[key] === b[key]);

const same = (a: DeviceSettings, b: DeviceSettings): boolean =>
  a.musicVolume === b.musicVolume &&
  a.effectsVolume === b.effectsVolume &&
  a.muted === b.muted &&
  a.reducedEffects === b.reducedEffects &&
  a.startFresh === b.startFresh &&
  a.startPlace === b.startPlace &&
  a.zoom === b.zoom &&
  a.lowEnd === b.lowEnd &&
  a.season === b.season &&
  shallowSame(a.learning, b.learning);

/**
 * What a parent has chosen on this device: how loud the music and effects are, whether sound is
 * off, whether effects are toned down, whether each visit starts from the beginning, where a visit
 * begins and whether the game draws itself lighter. It stays on the device and is never backed up.
 * A change reaches every listener at once and is written shortly after. If the device cannot store
 * it the choice still holds until the page closes.
 */
export class SettingsModel {
  private current: DeviceSettings;
  private dirty = false;
  private cancel: (() => void) | null = null;
  private writing: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<SettingsListener>();

  constructor(
    initial: DeviceSettings,
    private readonly store: Pick<LocalStore, 'saveSettings'> | null,
    private readonly clock: Pick<SaveClock, 'later'> = realClock,
  ) {
    this.current = normalized(initial);
  }

  /**
   * Reads the stored settings, or starts from the defaults when there is no storage or nothing
   * readable in it.
   */
  static async load(
    store: Pick<LocalStore, 'settings' | 'saveSettings'> | null,
    clock?: Pick<SaveClock, 'later'>,
  ): Promise<SettingsModel> {
    let stored: DeviceSettings = { ...DEFAULT_SETTINGS };
    if (store) {
      try {
        stored = await store.settings();
      } catch {
        // Storage that cannot be read is the same as storage with nothing in it.
      }
    }
    return new SettingsModel(stored, store, clock);
  }

  get(): DeviceSettings {
    return this.current;
  }

  /**
   * A copy that holds the same choices and never writes them, for a visit that must leave the
   * device as it found it.
   */
  detached(): SettingsModel {
    return new SettingsModel(this.current, null);
  }

  /**
   * Calls `listener` after every change, not for the settings that are already in force. Returns a
   * way to stop.
   */
  subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  update(patch: Partial<DeviceSettings>): void {
    const next = normalized({ ...this.current, ...patch });
    if (same(next, this.current)) return;
    this.current = next;
    for (const listener of this.listeners) listener(next);
    this.dirty = true;
    this.cancel?.();
    this.cancel = this.clock.later(WRITE_DELAY_MS, () => void this.flush());
  }

  /**
   * Writes any change that is waiting, now. For when the page is about to go away. Resolves when
   * the write has finished.
   */
  flush(): Promise<void> {
    this.cancel?.();
    this.cancel = null;
    const store = this.store;
    if (!this.dirty || !store) return this.writing;
    this.dirty = false;
    const snapshot = this.current;
    this.writing = this.writing
      .then(() => store.saveSettings(snapshot))
      // A failed write leaves the change waiting, so the next change or the next flush tries again.
      .catch(() => {
        this.dirty = true;
      });
    return this.writing;
  }
}
