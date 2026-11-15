import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openUnicornDb } from '../../src/persistence/db';
import { SettingsModel, WRITE_DELAY_MS } from '../../src/persistence/settings';
import { LocalStore } from '../../src/persistence/store';
import { DEFAULT_SETTINGS, DeviceSettings, readSettings } from '../../src/shared/save';

/** A clock the test drives by hand: a delayed call runs only when time is moved past it. */
class HandClock {
  private t = 0;
  private timers: { at: number; fn: () => void }[] = [];
  later(ms: number, fn: () => void): () => void {
    const entry = { at: this.t + ms, fn };
    this.timers.push(entry);
    return () => {
      this.timers = this.timers.filter((x) => x !== entry);
    };
  }
  advance(ms: number): void {
    this.t += ms;
    const due = this.timers.filter((x) => x.at <= this.t);
    this.timers = this.timers.filter((x) => x.at > this.t);
    for (const x of due) x.fn();
  }
}

let name = '';
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  name = `settings-${Math.random().toString(16).slice(2)}`;
});

/** Settings as a recording store sees them, without a database. */
const recording = () => {
  const saved: DeviceSettings[] = [];
  return { saved, store: { saveSettings: async (s: DeviceSettings) => void saved.push(s) } };
};

describe('device settings', () => {
  it('start from the defaults on a new device and with no storage at all', async () => {
    expect((await SettingsModel.load(await LocalStore.open(name))).get()).toEqual(DEFAULT_SETTINGS);
    expect((await SettingsModel.load(null)).get()).toEqual(DEFAULT_SETTINGS);
  });

  it('come back after a reload, so mute and volumes are kept', async () => {
    const clock = new HandClock();
    const first = await SettingsModel.load(await LocalStore.open(name), clock);
    first.update({ muted: true, musicVolume: 0.25 });
    await first.flush();
    const second = await SettingsModel.load(await LocalStore.open(name), clock);
    expect(second.get()).toEqual({ ...DEFAULT_SETTINGS, muted: true, musicVolume: 0.25 });
  });

  it('start from the defaults when storage cannot be read', async () => {
    const broken = { settings: () => Promise.reject(new Error('unreadable')), saveSettings: async () => undefined };
    expect((await SettingsModel.load(broken)).get()).toEqual(DEFAULT_SETTINGS);
  });

  it('keep every volume between silence and full, whatever is asked', () => {
    const model = new SettingsModel(DEFAULT_SETTINGS, null);
    model.update({ musicVolume: 3, effectsVolume: -2 });
    expect(model.get()).toMatchObject({ musicVolume: 1, effectsVolume: 0 });
    model.update({ musicVolume: Number.NaN, effectsVolume: Number.POSITIVE_INFINITY });
    expect(model.get()).toMatchObject({ musicVolume: 0, effectsVolume: 0 });
    expect(new SettingsModel({ ...DEFAULT_SETTINGS, musicVolume: 9 }, null).get().musicVolume).toBe(1);
  });

  it('land the zoom on a step the controls can show, whatever is asked', () => {
    const model = new SettingsModel(DEFAULT_SETTINGS, null);
    for (const [asked, kept] of [
      [1.3, 1.25],
      [1.4, 1.5],
      [3, 2],
      [0.1, 0.75],
      [-5, 0.75],
      [Number.NaN, 1],
      [Number.POSITIVE_INFINITY, 1],
    ] as const) {
      model.update({ zoom: asked });
      expect(model.get().zoom).toBe(kept);
      model.update({ zoom: 1 });
    }
    expect(new SettingsModel({ ...DEFAULT_SETTINGS, zoom: 9 }, null).get().zoom).toBe(2);
  });

  it('read a record written before zoom and starting fresh existed, and keep the rest of it', () => {
    const { zoom: _zoom, startFresh: _startFresh, ...older } = DEFAULT_SETTINGS;
    expect(DeviceSettings.parse({ ...older, muted: true, musicVolume: 0.2 })).toEqual({
      ...DEFAULT_SETTINGS,
      muted: true,
      musicVolume: 0.2,
    });
  });

  it('read a record written before low-end mode existed as automatic, and keep the rest of it', () => {
    const { lowEnd: _lowEnd, ...older } = DEFAULT_SETTINGS;
    expect(DeviceSettings.parse({ ...older, muted: true })).toEqual({
      ...DEFAULT_SETTINGS,
      muted: true,
      lowEnd: 'auto',
    });
  });

  it('read a low-end choice it does not know as automatic, and keep the rest of it', () => {
    expect(DeviceSettings.parse({ ...DEFAULT_SETTINGS, lowEnd: 'sometimes', muted: true })).toEqual({
      ...DEFAULT_SETTINGS,
      muted: true,
      lowEnd: 'auto',
    });
  });

  it('come back after a reload with the low-end choice that was made', async () => {
    const first = await SettingsModel.load(await LocalStore.open(name), new HandClock());
    expect(first.get().lowEnd).toBe('auto');
    first.update({ lowEnd: 'on' });
    await first.flush();
    const second = await SettingsModel.load(await LocalStore.open(name), new HandClock());
    expect(second.get().lowEnd).toBe('on');
  });

  it('read a record written before the seasons existed as automatic, and keep the rest of it', () => {
    const { season: _season, ...older } = DEFAULT_SETTINGS;
    expect(DeviceSettings.parse({ ...older, muted: true })).toEqual({
      ...DEFAULT_SETTINGS,
      muted: true,
      season: 'auto',
    });
  });

  it('read a season it does not know as automatic, and keep the rest of it', () => {
    expect(DeviceSettings.parse({ ...DEFAULT_SETTINGS, season: 'monsoon', muted: true })).toEqual({
      ...DEFAULT_SETTINGS,
      muted: true,
      season: 'auto',
    });
  });

  it('come back after a reload with the season that was picked', async () => {
    const first = await SettingsModel.load(await LocalStore.open(name), new HandClock());
    expect(first.get().season).toBe('auto');
    first.update({ season: 'winter' });
    await first.flush();
    const second = await SettingsModel.load(await LocalStore.open(name), new HandClock());
    expect(second.get().season).toBe('winter');
  });

  it('change one thing at a time and leave the rest as it was', () => {
    const model = new SettingsModel({ ...DEFAULT_SETTINGS, musicVolume: 0.3, effectsVolume: 0.6 }, null);
    model.update({ reducedEffects: true });
    expect(model.get()).toEqual({ ...DEFAULT_SETTINGS, musicVolume: 0.3, effectsVolume: 0.6, reducedEffects: true });
  });
});

/**
 * A record as the release before the start screen wrote it: every setting but where to start, with
 * the two it later changed the default of at their old defaults.
 */
const beforeTheStartScreen = (patch: Record<string, unknown> = {}): Record<string, unknown> => {
  const { startPlace: _place, ...older } = DEFAULT_SETTINGS;
  return { ...older, startFresh: true, learning: { ...DEFAULT_SETTINGS.learning, on: false }, ...patch };
};

describe('the choices of the start screen', () => {
  it('begin as a new game that carries on, with learning on, in the forest', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ startFresh: false, startPlace: 'forest', learning: { on: true } });
  });

  it('replace the old defaults once on a device that stored its settings before the start screen, and keep every other choice', () => {
    const read = readSettings(
      beforeTheStartScreen({
        muted: true,
        musicVolume: 0.2,
        zoom: 1.5,
        learning: { ...DEFAULT_SETTINGS.learning, on: false, keyboard: 'qwerty', ask: 'rarely' },
      }),
    );
    expect(read).toEqual({
      ...DEFAULT_SETTINGS,
      muted: true,
      musicVolume: 0.2,
      zoom: 1.5,
      learning: { ...DEFAULT_SETTINGS.learning, on: true, keyboard: 'qwerty', ask: 'rarely' },
    });
  });

  it('keep what was chosen on the start screen, even when it is what the old defaults were', () => {
    const chosen = {
      ...DEFAULT_SETTINGS,
      startFresh: true,
      startPlace: 'palace',
      learning: { ...DEFAULT_SETTINGS.learning, on: false },
    };
    expect(readSettings(chosen)).toEqual(chosen);
  });

  it('read a place this version does not know as the forest, and keep the rest', () => {
    expect(readSettings({ ...DEFAULT_SETTINGS, startPlace: 'moon', muted: true, startFresh: true })).toEqual({
      ...DEFAULT_SETTINGS,
      startPlace: 'forest',
      muted: true,
      startFresh: true,
    });
  });

  it('read nothing from what is not settings', () => {
    for (const junk of [null, undefined, 'x', 4, [], { musicVolume: 'loud' }])
      expect(readSettings(junk), String(junk)).toBeNull();
  });

  it('are taken from the stored record once, and then the choices made on the device stand', async () => {
    const raw = await openUnicornDb(name);
    await raw.put('settings', beforeTheStartScreen({ muted: true }) as unknown as DeviceSettings, 'device');
    raw.close();

    const first = await SettingsModel.load(await LocalStore.open(name), new HandClock());
    expect(first.get()).toEqual({ ...DEFAULT_SETTINGS, muted: true });
    first.update({ learning: { ...first.get().learning, on: false }, startFresh: true, startPlace: 'palace' });
    await first.flush();

    const second = await SettingsModel.load(await LocalStore.open(name), new HandClock());
    expect(second.get()).toMatchObject({
      muted: true,
      startFresh: true,
      startPlace: 'palace',
      learning: { on: false },
    });
  });

  it('tell the game when the place changes, and not when it is chosen again', () => {
    const model = new SettingsModel(DEFAULT_SETTINGS, null);
    const listener = vi.fn();
    model.subscribe(listener);
    model.update({ startPlace: 'palace' });
    model.update({ startPlace: 'palace' });
    expect(listener).toHaveBeenCalledExactlyOnceWith({ ...DEFAULT_SETTINGS, startPlace: 'palace' });
  });
});

describe('telling the game', () => {
  it('reaches every listener at once, with the new settings', () => {
    const model = new SettingsModel(DEFAULT_SETTINGS, null);
    const a = vi.fn();
    const b = vi.fn();
    model.subscribe(a);
    model.subscribe(b);
    model.update({ muted: true });
    expect(a).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, muted: true });
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('hears of a change to the low-end choice, which no other setting carries', () => {
    const model = new SettingsModel(DEFAULT_SETTINGS, null);
    const listener = vi.fn();
    model.subscribe(listener);
    model.update({ lowEnd: 'off' });
    expect(listener).toHaveBeenCalledExactlyOnceWith({ ...DEFAULT_SETTINGS, lowEnd: 'off' });
    model.update({ lowEnd: 'off' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('hears of a change to the season, which no other setting carries', () => {
    const model = new SettingsModel(DEFAULT_SETTINGS, null);
    const listener = vi.fn();
    model.subscribe(listener);
    model.update({ season: 'autumn' });
    expect(listener).toHaveBeenCalledExactlyOnceWith({ ...DEFAULT_SETTINGS, season: 'autumn' });
    model.update({ season: 'autumn' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('says nothing when nothing changed, and nothing to a listener that has gone', () => {
    const model = new SettingsModel(DEFAULT_SETTINGS, null);
    const listener = vi.fn();
    const stop = model.subscribe(listener);
    model.update({ muted: false, musicVolume: DEFAULT_SETTINGS.musicVolume });
    expect(listener).not.toHaveBeenCalled();
    stop();
    model.update({ muted: true });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('writing them down', () => {
  it('waits for the changes to stop, then writes once with the last of them', async () => {
    const { saved, store } = recording();
    const clock = new HandClock();
    const model = new SettingsModel(DEFAULT_SETTINGS, store, clock);
    for (const v of [0.1, 0.2, 0.3, 0.4]) {
      model.update({ musicVolume: v });
      clock.advance(WRITE_DELAY_MS - 50);
    }
    expect(saved).toEqual([]);
    clock.advance(100);
    await model.flush();
    expect(saved).toEqual([{ ...DEFAULT_SETTINGS, musicVolume: 0.4 }]);
  });

  it('writes straight away when the page is about to go, and only once', async () => {
    const { saved, store } = recording();
    const model = new SettingsModel(DEFAULT_SETTINGS, store, new HandClock());
    model.update({ muted: true });
    await model.flush();
    await model.flush();
    expect(saved).toEqual([{ ...DEFAULT_SETTINGS, muted: true }]);
  });

  it('does not write what is already stored', async () => {
    const { saved, store } = recording();
    const model = new SettingsModel(DEFAULT_SETTINGS, store, new HandClock());
    await model.flush();
    expect(saved).toEqual([]);
  });

  it('holds the choice in memory and tries again when the device cannot store it', async () => {
    let failing = true;
    const saved: DeviceSettings[] = [];
    const store = {
      saveSettings: async (s: DeviceSettings) => {
        if (failing) throw new Error('no room');
        saved.push(s);
      },
    };
    const model = new SettingsModel(DEFAULT_SETTINGS, store, new HandClock());
    model.update({ muted: true });
    await model.flush();
    expect(model.get().muted).toBe(true);
    expect(saved).toEqual([]);
    failing = false;
    await model.flush();
    expect(saved).toEqual([{ ...DEFAULT_SETTINGS, muted: true }]);
  });

  it('keeps writes in the order they were made', async () => {
    const order: number[] = [];
    const store = {
      saveSettings: async (s: DeviceSettings) => {
        await new Promise((r) => setTimeout(r, s.musicVolume === 0.1 ? 20 : 0));
        order.push(s.musicVolume);
      },
    };
    const model = new SettingsModel(DEFAULT_SETTINGS, store, new HandClock());
    model.update({ musicVolume: 0.1 });
    void model.flush();
    model.update({ musicVolume: 0.9 });
    await model.flush();
    expect(order).toEqual([0.1, 0.9]);
  });

  it('works with no storage, which is how a private window behaves', async () => {
    const model = new SettingsModel(DEFAULT_SETTINGS, null, new HandClock());
    model.update({ muted: true });
    await model.flush();
    expect(model.get().muted).toBe(true);
  });
});
