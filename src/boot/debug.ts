import { checkInvariants } from '../domain';
import type { GameController } from '../game/controller';

/**
 * Puts the running game on `window.__ua`, for the browser tests and for a developer's console. A
 * production build leaves it off unless the address asks for `test`.
 */
export function exposeForTests(parts: { controller: GameController } & Record<string, unknown>): void {
  if (!(import.meta.env.DEV || new URLSearchParams(location.search).has('test'))) return;
  (window as unknown as { __ua: unknown }).__ua = {
    ...parts,
    invariants: () => checkInvariants(parts.controller.world),
  };
}
