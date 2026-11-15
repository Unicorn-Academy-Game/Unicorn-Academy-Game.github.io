import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Hash of every file under `root` that `include` accepts, by path and content, in a stable order.
 */
export function hashTree(root: string, include: (relPath: string) => boolean): string {
  const h = createHash('sha256');
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else {
        const rel = relative(root, full);
        if (include(rel)) h.update(rel).update('\0').update(readFileSync(full)).update('\0');
      }
    }
  };
  walk(root);
  return h.digest('hex');
}

export const shortHash = (data: Uint8Array | string): string =>
  createHash('sha256').update(data).digest('hex').slice(0, 10);
