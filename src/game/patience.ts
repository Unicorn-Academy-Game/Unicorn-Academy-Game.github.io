/** What `patiently` answers for work that was not done in time. */
export const TOO_LONG: unique symbol = Symbol('too long');

/**
 * Waits for `work` for at most `ms` milliseconds. Work that fails fails here too. Work that is
 * still going when the time is up goes on by itself and what it finally says is thrown away, so a
 * caller that waits on a disk or a connection is never held by one that has stopped answering.
 */
export function patiently<T>(work: Promise<T>, ms: number): Promise<T | typeof TOO_LONG> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(TOO_LONG), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
