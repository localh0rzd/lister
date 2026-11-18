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
import type { DiagnosticStore } from './diagnostic-store';
import { scrubData } from './redact';

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
      } catch {
        // No usable IndexedDB (private mode, blocked): the log stays in memory for this page.
        this.buffer = [...batch, ...this.buffer].slice(-MAX_BUFFER);
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

  /** Empties the log (every tab's entries). */
  async clear(): Promise<void> {
    await this.flush();
    this.buffer = [];
    await (await this.openStore()).clear();
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

function scriptPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
