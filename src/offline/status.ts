import type { Report, Voice } from '../shared/offline';

/** What a parent is told about offline play. */
export type OfflineStatus =
  /** No service worker here: a development server, a private tab or a browser that lacks one. */
  | { kind: 'unsupported' }
  /** `total` is 0 until the worker has said how many parts there are. */
  | { kind: 'preparing'; done: number; total: number }
  /**
   * The game is on the device. The spoken lessons are on it as far as `spoken` says, which is as
   * many as have been heard unless a parent asked for all of them.
   */
  | { kind: 'ready'; spoken: Voice }
  /** A newer version is downloaded and waits for a safe moment, which a parent can choose. */
  | { kind: 'update-ready' }
  | { kind: 'trouble'; detail: string };

export interface Facts {
  /**
   * Set when there is no worker to speak of: the browser has none, or it would not let this page
   * register one.
   */
  unavailable: Extract<OfflineStatus, { kind: 'unsupported' | 'trouble' }> | null;
  /**
   * The newest thing the worker that serves, or will serve, the game has said about its release.
   */
  report: Report | null;
  /** A newer release is downloaded and waiting to take over. */
  waiting: boolean;
}

const UNKNOWN = 'Offline play ran into a problem that has no details.';

export function statusOf({ unavailable, report, waiting }: Facts): OfflineStatus {
  if (unavailable) return unavailable;
  // A waiting release means the one running is old, whatever state its own files are in.
  if (waiting) return { kind: 'update-ready' };
  if (!report) return { kind: 'preparing', done: 0, total: 0 };
  switch (report.phase) {
    case 'complete':
      return { kind: 'ready', spoken: report.voice };
    case 'failed':
      return { kind: 'trouble', detail: report.detail ?? UNKNOWN };
    case 'installing':
    case 'warming':
    case 'partial':
      return { kind: 'preparing', done: report.done, total: report.total };
  }
}

export const sameStatus = (a: OfflineStatus, b: OfflineStatus): boolean => JSON.stringify(a) === JSON.stringify(b);
