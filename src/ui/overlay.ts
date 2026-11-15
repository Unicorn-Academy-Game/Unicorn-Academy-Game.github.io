/** What a screen that goes over the game needs of the page. */
export interface OverlayDeps {
  /**
   * The page's own layer, which gets a flag while the screen is up so the rest of the corner can
   * step aside.
   */
  host: HTMLElement;
  /** Puts the screen on the page, under the buttons that are always there. */
  mount: (node: HTMLElement) => void;
  /** Whether a parent asked for fewer effects. */
  calm: () => boolean;
}
