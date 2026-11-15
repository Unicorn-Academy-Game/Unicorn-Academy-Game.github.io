/**
 * Full screen for the page, where the browser allows it. A computer and an iPad can; an iPhone
 * cannot show a page full screen from a browser, and says so by having no way to ask. There the
 * answer is to add the game to the Home Screen, which opens it with no browser around it.
 */

interface FullscreenTarget {
  requestFullscreen?: (options?: { navigationUI?: 'hide' | 'show' | 'auto' }) => Promise<void>;
  webkitRequestFullscreen?: () => Promise<void> | void;
}

/**
 * The part of the page the full screen controls use. Safari's older names are included, so a test
 * can stand in for either.
 */
export interface FullscreenDocument {
  fullscreenEnabled?: boolean;
  webkitFullscreenEnabled?: boolean;
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => Promise<void> | void;
  documentElement: FullscreenTarget;
  addEventListener(type: 'fullscreenchange' | 'webkitfullscreenchange', listener: () => void): void;
  removeEventListener(type: 'fullscreenchange' | 'webkitfullscreenchange', listener: () => void): void;
}

export interface Fullscreen {
  /** Whether this browser can show the page full screen at all. */
  readonly supported: boolean;
  readonly active: boolean;
  /**
   * Goes full screen, or comes back. A refusal, as when the browser wants a tap first, changes
   * nothing and is not an error.
   */
  toggle(): Promise<void>;
  /**
   * Calls `listener` whenever full screen starts or stops, however it came about: a key the browser
   * handles, a swipe, a button.
   */
  subscribe(listener: (active: boolean) => void): () => void;
}

export function browserFullscreen(doc: FullscreenDocument = document as unknown as FullscreenDocument): Fullscreen {
  const root = doc.documentElement;
  const canAsk = typeof root.requestFullscreen === 'function' || typeof root.webkitRequestFullscreen === 'function';
  const supported = canAsk && (doc.fullscreenEnabled === true || doc.webkitFullscreenEnabled === true);
  const isActive = (): boolean => (doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null) !== null;

  return {
    supported,
    get active() {
      return isActive();
    },
    async toggle() {
      if (!supported) return;
      try {
        if (isActive()) await (doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.());
        else
          await (root.requestFullscreen
            ? root.requestFullscreen({ navigationUI: 'hide' })
            : root.webkitRequestFullscreen?.());
      } catch {
        // The browser said no. It does so when the request did not come from a tap or a key, and
        // the next tap will do.
      }
    },
    subscribe(listener) {
      const tell = (): void => listener(isActive());
      doc.addEventListener('fullscreenchange', tell);
      doc.addEventListener('webkitfullscreenchange', tell);
      return () => {
        doc.removeEventListener('fullscreenchange', tell);
        doc.removeEventListener('webkitfullscreenchange', tell);
      };
    },
  };
}
