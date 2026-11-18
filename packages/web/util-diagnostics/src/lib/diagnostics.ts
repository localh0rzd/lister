import {
  DOCUMENT,
  InjectionToken,
  Service,
  VERSION,
  inject,
} from '@angular/core';
import type {
  DiagnosticArea,
  DiagnosticData,
  DiagnosticEntry,
} from './diagnostic-entry';
import { apiPath } from '@lister/shared/api-contracts';
import type { DiagnosticStore } from './diagnostic-store';
import { scrubData } from './redact';
import { servedBy } from './served-by';

/** Opens the persisted log. A token so tests can bring their own; the real one loads Dexie lazily. */
export const DIAGNOSTIC_STORE = new InjectionToken<
  () => Promise<DiagnosticStore>
>('DIAGNOSTIC_STORE', {
  providedIn: 'root',
  factory: () => {
    let store: Promise<DiagnosticStore> | undefined;
    return () =>
      (store ??= import('./diagnostic-store').then(
        ({ DiagnosticStore }) => new DiagnosticStore(),
      ));
  },
});

/** Entries wait this long in memory so a burst becomes one write. */
export const FLUSH_DELAY_MS = 500;
const FLUSH_AT = 50;
/** If IndexedDB never works, the memory buffer stays this small. */
const MAX_BUFFER = 1000;
/** A repeating failure is logged this many times in a row... */
const REPEATS_IN_FULL = 3;
/** ...then only every this many times, so a loop that retries every few seconds can't push its
 * own beginning out of the bounded log. */
export const REPEAT_EVERY = 20;
/** A probe that gets no answer gives up after this long. */
const PROBE_TIMEOUT_MS = 10_000;

/** Whether the `count`-th repetition of something is logged (1 is the first). */
export function worthLogging(count: number): boolean {
  return count <= REPEATS_IN_FULL || count % REPEAT_EVERY === 0;
}

/**
 * The diagnostic log (T-063): a verbose, always-on record of what decides whether the app is
 * online, kept on the device in IndexedDB and exported from Settings → App. Writing never blocks
 * or throws: entries wait in memory and are stored in batches by a lazily loaded store.
 *
 * Only ids, counts, status codes and short reasons belong in it (`data`); strings are scrubbed of
 * quoted text, so a refusal that names a list does not keep the name. Never pass list or item
 * text, cookies, tokens, passwords or passkey material.
 */
@Service()
export class Diagnostics {
  private readonly openStore = inject(DIAGNOSTIC_STORE);
  private readonly window = inject(DOCUMENT).defaultView;
  private buffer: DiagnosticEntry[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  /** Writes run one after the other, so entries keep their order. */
  private writing: Promise<unknown> = Promise.resolve();
  private readonly states = new Map<string, () => unknown>();
  /** The last write to IndexedDB failed. */
  private writeFailing = false;
  /** The failure that repeats now, and how often it has in a row. */
  private repeating?: { signature: string; count: number };
  private probing = false;

  /** Random per page load: tells the tabs and windows of one device apart in the log. */
  readonly tabId = this.window?.crypto?.randomUUID?.().slice(0, 8) ?? 'no-tab';
  /** Whether this tab leads sync; the sync engine sets it, every entry records it. */
  leader = false;
  /** Server time minus device time in ms, from the `Date` header of the last REST answer. */
  serverTimeOffsetMs: number | null = null;

  /** Adds an entry. */
  log(area: DiagnosticArea, event: string, data?: DiagnosticData): void {
    try {
      const entry: DiagnosticEntry = {
        at: Date.now(),
        area,
        event,
        tab: this.tabId,
        leader: this.leader,
      };
      const scrubbed = scrubData(data);
      if (scrubbed) entry.data = scrubbed;
      this.buffer.push(entry);
      if (this.buffer.length > MAX_BUFFER) this.buffer.shift();
      if (this.buffer.length >= FLUSH_AT) void this.flush();
      else this.timer ??= setTimeout(() => void this.flush(), FLUSH_DELAY_MS);
    } catch {
      // Logging must never break the app.
    }
  }

  /**
   * Logs a failure that may repeat for hours (a reconnect attempt that fails): every change in
   * full, then only the first few in a row and every `REPEAT_EVERY`-th, with `repeat` (the count).
   * The first of a run and every `REPEAT_EVERY`-th also probe the API over HTTP (`probe`), which
   * tells a refused WebSocket from a server that cannot be reached at all.
   */
  logRepeating(
    area: DiagnosticArea,
    event: string,
    data: DiagnosticData = {},
  ): void {
    const signature = JSON.stringify([area, event, data]);
    const count =
      this.repeating?.signature === signature ? this.repeating.count + 1 : 1;
    this.repeating = { signature, count };
    if (worthLogging(count))
      this.log(area, event, count > 1 ? { ...data, repeat: count } : data);
    if (count === 1 || count % REPEAT_EVERY === 0) void this.probe(event);
  }

  /** The repeating failure is over (connected): the next one is logged in full again. */
  endRepeating(): void {
    this.repeating = undefined;
  }

  /**
   * Asks the API who is signed in, outside Angular's HttpClient, and logs `net.probe` with the
   * answer: status 0 when none came (no network, DNS, TLS, a broken service worker), 401 without
   * a session, a proxy's 404/502/503, or 200 when HTTP works. Also records the page's origin,
   * which the API's handshake check compares with `PUBLIC_URL`.
   */
  async probe(why: string): Promise<void> {
    const win = this.window;
    if (this.probing || !win?.fetch) return;
    this.probing = true;
    const path = apiPath('auth', 'me');
    const started = win.performance.now();
    const base = { why, path, origin: win.location.origin };
    try {
      const response = await win.fetch(path, {
        cache: 'no-store',
        credentials: 'same-origin',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      this.log('net', 'probe', {
        ...base,
        status: response.status,
        ms: Math.round(win.performance.now() - started),
        ...servedBy(path, started),
      });
    } catch (error) {
      this.log('net', 'probe', {
        ...base,
        status: 0,
        ms: Math.round(win.performance.now() - started),
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : undefined,
        onLine: win.navigator.onLine,
      });
    } finally {
      this.probing = false;
    }
  }

  /** Describes something for the export's header (the sync state, say) when it is exported. */
  registerState(name: string, describe: () => unknown): () => void {
    this.states.set(name, describe);
    return () => {
      if (this.states.get(name) === describe) this.states.delete(name);
    };
  }

  /** What registered states say now, as header values. */
  describeStates(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [name, describe] of this.states) {
      try {
        result[name] = JSON.stringify(describe());
      } catch {
        result[name] = 'unavailable';
      }
    }
    return result;
  }

  /** Writes what waits in memory to IndexedDB. */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    const batch = this.buffer;
    if (batch.length === 0) return this.writing.then(() => undefined);
    this.buffer = [];
    this.writing = this.writing.then(async () => {
      try {
        await (await this.openStore()).append(batch);
        this.writeFailing = false;
      } catch (error) {
        // No usable IndexedDB (private mode, blocked): the log stays in memory for this page.
        this.buffer = [...batch, ...this.buffer].slice(-MAX_BUFFER);
        // Said once per streak, so an export shows that (and why) entries were not persisted.
        if (!this.writeFailing)
          this.log('app', 'store-write-failed', {
            name: error instanceof Error ? error.name : typeof error,
            message: error instanceof Error ? error.message : undefined,
            waiting: this.buffer.length,
          });
        this.writeFailing = true;
      }
    });
    return this.writing.then(() => undefined);
  }

  /** The whole log, oldest first (every tab's entries). */
  async entries(): Promise<DiagnosticEntry[]> {
    await this.flush();
    let stored: DiagnosticEntry[] = [];
    try {
      stored = await (await this.openStore()).all();
    } catch {
      // Fall back to this page's entries.
    }
    return [...stored, ...this.buffer];
  }

  /** Empties the log (every tab's entries); returns what it held, for `restore` (Undo). */
  async clear(): Promise<DiagnosticEntry[]> {
    const removed = await this.entries();
    this.buffer = [];
    await (await this.openStore()).clear();
    return removed;
  }

  /** Puts entries that `clear` returned back (Undo). */
  async restore(entries: readonly DiagnosticEntry[]): Promise<void> {
    await this.flush();
    // New ids: the store numbers entries as they come.
    const fresh = entries.map((entry) => {
      const copy = { ...entry };
      delete copy.id;
      return copy;
    });
    await (await this.openStore()).append(fresh);
  }

  /** Facts about the device and app for the top of the export. */
  async header(): Promise<Record<string, string>> {
    const win = this.window;
    const nav = win?.navigator;
    const header: Record<string, string> = {
      exported: new Date().toISOString(),
      timezoneOffsetMinutes: String(new Date().getTimezoneOffset()),
      tab: this.tabId,
      angular: VERSION.full,
      build: buildOf(win?.document),
      mode:
        win?.matchMedia?.('(display-mode: standalone)').matches ||
        (nav as { standalone?: boolean } | undefined)?.standalone
          ? 'standalone (installed app)'
          : 'browser tab',
      userAgent: nav?.userAgent ?? 'unknown',
      platform:
        (nav as { userAgentData?: { platform?: string } } | undefined)
          ?.userAgentData?.platform ??
        nav?.platform ??
        'unknown',
      language: nav?.language ?? 'unknown',
      onLine: String(nav?.onLine),
      visibility: win?.document.visibilityState ?? 'unknown',
      storagePersisted: await settled(() => nav?.storage?.persisted()),
      storageEstimate: await settled(async () => {
        const estimate = await nav?.storage?.estimate();
        return (
          estimate &&
          `${estimate.usage ?? '?'} of ${estimate.quota ?? '?'} bytes`
        );
      }),
      serviceWorker: await settled(() => describeWorker(nav)),
      serviceWorkerState: await settled(() => workerState(win)),
      serverTimeOffsetMs:
        this.serverTimeOffsetMs === null
          ? 'unknown'
          : String(this.serverTimeOffsetMs),
      ...this.describeStates(),
    };
    return header;
  }
}

/** The script names of the page, which carry the build's content hashes. */
function buildOf(document: Document | undefined): string {
  const names = [...(document?.querySelectorAll('script[src]') ?? [])]
    .map((script) => script.getAttribute('src')?.split('/').pop() ?? '')
    .filter((name) => /^(main|polyfills)-/.test(name));
  return names.length > 0 ? names.join(' ') : 'development build';
}

async function settled(read: () => unknown): Promise<string> {
  try {
    const value = await read();
    return value === undefined || value === null ? 'unknown' : String(value);
  } catch (error) {
    return `error: ${error instanceof Error ? error.name : 'unknown'}`;
  }
}

async function describeWorker(nav: Navigator | undefined): Promise<string> {
  const container = nav?.serviceWorker;
  if (!container) return 'not supported';
  const registration = await container.getRegistration();
  const controller = container.controller;
  const parts = [
    `controller=${controller ? `${controller.state} ${scriptPath(controller.scriptURL)}` : 'none'}`,
    `registration=${registration ? registration.scope : 'none'}`,
  ];
  if (registration)
    parts.push(
      `active=${registration.active?.state ?? 'none'}`,
      `waiting=${registration.waiting?.state ?? 'none'}`,
      `installing=${registration.installing?.state ?? 'none'}`,
    );
  return parts.join(' ');
}

/**
 * The Angular service worker's own report (`/ngsw/state`): driver state (NORMAL,
 * EXISTING_CLIENTS_ONLY, SAFE_MODE), the latest manifest, the last update check and its debug
 * log. Served by the worker, so it is there offline; only asked when a worker controls the page
 * (without one the request would go to the server).
 */
async function workerState(win: Window | null): Promise<string> {
  if (!win?.navigator.serviceWorker?.controller) return 'no controlling worker';
  const response = await win.fetch('/ngsw/state', {
    cache: 'no-store',
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  return response.ok
    ? (await response.text()).trim()
    : `HTTP ${response.status}`;
}

function scriptPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
