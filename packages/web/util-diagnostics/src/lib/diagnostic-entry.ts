/** What an entry may carry: ids, counts, flags and short reasons, never list text or secrets. */
export type DiagnosticValue = string | number | boolean | null | undefined;
export type DiagnosticData = Readonly<Record<string, DiagnosticValue>>;

/** Which part of the app wrote an entry. */
export type DiagnosticArea =
  'app' | 'net' | 'page' | 'sync' | 'lock' | 'socket' | 'rest' | 'auth' | 'sw';

/** One line of the log, as stored in IndexedDB. */
export interface DiagnosticEntry {
  /** Auto-incremented by the store. */
  id?: number;
  /** Epoch milliseconds on this device. */
  at: number;
  area: DiagnosticArea;
  event: string;
  /** Which tab or window wrote it (random per page load). */
  tab: string;
  /** This tab led sync (held the sync lock) when it wrote the entry. */
  leader: boolean;
  data?: Record<string, string | number | boolean | null>;
}

/** The log keeps at most this many entries... */
export const MAX_ENTRIES = 5000;
/** ...and none older than this. */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
