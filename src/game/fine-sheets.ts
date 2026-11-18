import type { FineReach } from '../render/profile';
import type { UnicornId } from '../shared/ids';
import type { Manifest } from '../shared/manifest';
import type { Textures } from './assets';

/**
 * How long to leave the game alone between one sheet and the next, so the frames that follow the
 * upload of one are not late for the next.
 */
const REST_MS = 300;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * Brings in the fine sheets of the unicorns who are out, after play has begun and without ever
 * holding it up. A unicorn is asked for when she first comes on screen and the sheets come one at a
 * time, in the order asked, with a rest between them, so the herd gets its 32 facings over ten
 * seconds or so and a device that cannot take them all at once is never asked to. When a device
 * does not show the fine facings nothing is loaded, and one that shows them for the leader alone
 * loads hers and no one else's. A sheet that does not come leaves her with the eight she has, and she is asked for again the next time she is put on screen, which is when the
 * world changes.
 */
export class FineSheets {
  private readonly asked = new Set<UnicornId>();
  private readonly queue: UnicornId[] = [];
  private going = false;

  constructor(
    private readonly textures: Pick<Textures, 'loadUnicornFine'>,
    private readonly manifest: Manifest,
    private readonly reach: FineReach,
    private readonly rest: (ms: number) => Promise<void> = sleep,
  ) {}

  /**
   * She is on screen: have her fine sheets brought in. Asking again for the same unicorn does
   * nothing.
   */
  want(id: UnicornId): void {
    if (!this.gets(id) || this.asked.has(id)) return;
    this.asked.add(id);
    this.queue.push(id);
    void this.drain();
  }

  private gets(id: UnicornId): boolean {
    return this.reach === 'herd' || (this.reach === 'leader' && id === 'wildstar');
  }

  private async drain(): Promise<void> {
    if (this.going) return;
    this.going = true;
    try {
      for (let id = this.queue.shift(); id !== undefined; id = this.queue.shift()) await this.bringIn(id);
    } finally {
      this.going = false;
    }
  }

  private async bringIn(id: UnicornId): Promise<void> {
    const sheets = this.manifest.unicorns[id].fine?.atlases.length ?? 0;
    for (let page = 0; page < sheets; page++) {
      try {
        await this.textures.loadUnicornFine(this.manifest, id, page);
      } catch {
        this.asked.delete(id);
        return;
      }
      await this.rest(REST_MS);
    }
  }
}
