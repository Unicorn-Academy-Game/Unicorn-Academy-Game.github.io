import { toSave } from '../domain';
import type { GameController } from '../game/controller';
import type { SaveService } from '../persistence/save-service';
import type { WorldSaveV1 } from '../shared/save';
import { newId } from './browser';

/** The game as the saved world sees it: what to write, and how to start the page again. */
export interface Session {
  /** Called once the game exists. Until then there is nothing to save and nothing to show. */
  begin(game: GameController): void;
  /** Writes the world to the device. */
  flush(): Promise<void>;
  /** The world as it is now, in the shape it is saved in. Null before the game exists. */
  live(): WorldSaveV1 | null;
  readonly restarting: boolean;
  /**
   * Starts the page again. The game holds its world in memory, so a world that was swapped under it
   * is only seen after a reload.
   */
  restart(): void;
}

export function createSession(saves: SaveService): Session {
  let game: GameController | null = null;
  let restarting = false;
  return {
    begin: (started) => {
      game = started;
    },
    flush: () => (game ? saves.flush(game.world) : Promise.resolve()),
    live: () => (game ? toSave(game.world, newId()) : null),
    get restarting() {
      return restarting;
    },
    restart: () => {
      if (restarting) return;
      restarting = true;
      saves.retire();
      location.reload();
    },
  };
}
