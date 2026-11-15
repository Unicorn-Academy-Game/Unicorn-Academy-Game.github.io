import type { ReplaceSource } from '../../../persistence/keeper';
import type { ConfirmOptions, PageContext } from '../panel';

/** Steps more than one page takes. */

/** Downloads the world on this device as a file, and says what happened. */
export async function downloadCopy(ctx: PageContext): Promise<void> {
  const file = await ctx.services.world.exportWorld();
  if (!file) {
    ctx.say('There is no world on this device to download yet.', 'warn');
    return;
  }
  ctx.services.download(file);
  ctx.say('A copy was downloaded. Keep it somewhere safe.', 'good');
}

/**
 * Asks, then swaps the world on this device for `source`. When it works the game restarts onto the
 * new world, so the cover stays up until then. When it does not, the cover comes off and the reason
 * is shown.
 */
export async function swapWorld(ctx: PageContext, source: ReplaceSource, ask: ConfirmOptions): Promise<void> {
  if (!(await ctx.confirm(ask))) return;
  const done = ctx.busy('Putting the world in place…');
  const result = await ctx.services.world.replace(source);
  if (result.ok) return;
  done();
  ctx.say(result.reason, 'bad');
}
