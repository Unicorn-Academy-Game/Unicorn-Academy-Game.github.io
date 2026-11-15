import { describe, expect, it, vi } from 'vitest';
import { browserFullscreen, type FullscreenDocument } from './fullscreen';

type Listener = () => void;

/** A page that goes full screen the way browsers do, with the names a test chooses to give it. */
function page(names: 'standard' | 'webkit' | 'none', options: { refuse?: boolean } = {}) {
  const listeners = new Map<string, Set<Listener>>();
  let element: object | null = null;
  const fire = (type: string): void =>
    listeners.get(type)?.forEach((l) => {
      l();
    });
  const enter = async (): Promise<void> => {
    if (options.refuse) throw new TypeError('Permissions check failed');
    element = {};
    fire(names === 'webkit' ? 'webkitfullscreenchange' : 'fullscreenchange');
  };
  const leave = async (): Promise<void> => {
    element = null;
    fire(names === 'webkit' ? 'webkitfullscreenchange' : 'fullscreenchange');
  };
  const doc: FullscreenDocument = {
    documentElement: {},
    addEventListener: (type, listener) =>
      void (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(listener),
    removeEventListener: (type, listener) => void listeners.get(type)?.delete(listener),
  };
  if (names === 'standard') {
    doc.fullscreenEnabled = true;
    Object.defineProperty(doc, 'fullscreenElement', { get: () => element });
    doc.exitFullscreen = leave;
    doc.documentElement.requestFullscreen = vi.fn(enter);
  }
  if (names === 'webkit') {
    doc.webkitFullscreenEnabled = true;
    Object.defineProperty(doc, 'webkitFullscreenElement', { get: () => element });
    doc.webkitExitFullscreen = leave;
    doc.documentElement.webkitRequestFullscreen = vi.fn(enter);
  }
  return { doc, listeners };
}

describe('full screen', () => {
  it('is supported where the page can ask for it, under either name', () => {
    expect(browserFullscreen(page('standard').doc).supported).toBe(true);
    expect(browserFullscreen(page('webkit').doc).supported).toBe(true);
  });

  it('is not supported where there is no way to ask, as on an iPhone', () => {
    const fullscreen = browserFullscreen(page('none').doc);
    expect(fullscreen.supported).toBe(false);
  });

  it('is not supported when the page has been told it may not, as inside a frame that does not allow it', () => {
    const { doc } = page('standard');
    doc.fullscreenEnabled = false;
    expect(browserFullscreen(doc).supported).toBe(false);
  });

  it.each(['standard', 'webkit'] as const)('goes full screen and comes back with the %s names', async (names) => {
    const fullscreen = browserFullscreen(page(names).doc);
    expect(fullscreen.active).toBe(false);
    await fullscreen.toggle();
    expect(fullscreen.active).toBe(true);
    await fullscreen.toggle();
    expect(fullscreen.active).toBe(false);
  });

  it('asks for the whole page with the browser bars hidden', async () => {
    const { doc } = page('standard');
    await browserFullscreen(doc).toggle();
    expect(doc.documentElement.requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' });
  });

  it('does nothing where it is not supported, and does not complain', async () => {
    const fullscreen = browserFullscreen(page('none').doc);
    await expect(fullscreen.toggle()).resolves.toBeUndefined();
    expect(fullscreen.active).toBe(false);
  });

  it('takes a refusal quietly and stays as it was', async () => {
    const fullscreen = browserFullscreen(page('standard', { refuse: true }).doc);
    await expect(fullscreen.toggle()).resolves.toBeUndefined();
    expect(fullscreen.active).toBe(false);
  });

  it.each(['standard', 'webkit'] as const)(
    'tells a listener each time full screen starts or stops, however it came about, with the %s names',
    async (names) => {
      const { doc } = page(names);
      const fullscreen = browserFullscreen(doc);
      const heard: boolean[] = [];
      fullscreen.subscribe((active) => heard.push(active));
      await fullscreen.toggle();
      await fullscreen.toggle();
      expect(heard).toEqual([true, false]);
    },
  );

  it('stops telling a listener that has gone', async () => {
    const { doc, listeners } = page('standard');
    const fullscreen = browserFullscreen(doc);
    const heard = vi.fn();
    const stop = fullscreen.subscribe(heard);
    stop();
    await fullscreen.toggle();
    expect(heard).not.toHaveBeenCalled();
    expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);
  });
});
