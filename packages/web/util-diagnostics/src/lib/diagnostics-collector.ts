import { DOCUMENT, Service, inject } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import type { DiagnosticData } from './diagnostic-entry';
import { Diagnostics } from './diagnostics';

type NetworkInformation = EventTarget & {
  effectiveType?: string;
  type?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
};

/**
 * Logs the browser's own signals about the network, the page lifecycle and the service worker.
 * Socket, lock, sync and REST entries come from the code that owns them.
 */
@Service()
export class DiagnosticsCollector {
  private readonly diagnostics = inject(Diagnostics);
  private readonly document = inject(DOCUMENT);
  private readonly updates = inject(SwUpdate, { optional: true });
  private started = false;
  private readonly workers = { current: 'unknown' as string };

  start(): void {
    const win = this.document.defaultView;
    if (this.started || !win) return;
    this.started = true;
    const { diagnostics, document } = this;
    const nav = win.navigator;
    const on = (
      target: EventTarget,
      event: string,
      handler: (event: Event) => void,
    ) => target.addEventListener(event, handler, { passive: true });
    const page = (event: string, data?: DiagnosticData) => {
      diagnostics.log('page', event, data);
    };
    const flushSoon = () => void diagnostics.flush();

    const navigation = win.performance
      ?.getEntriesByType?.('navigation')
      .at(0) as PerformanceNavigationTiming | undefined;
    diagnostics.log('app', 'start', {
      navigation: navigation?.type,
      onLine: nav.onLine,
      visibility: document.visibilityState,
      wasDiscarded:
        (document as { wasDiscarded?: boolean }).wasDiscarded === true,
      standalone: win.matchMedia?.('(display-mode: standalone)').matches,
      serviceWorkerSupported: 'serviceWorker' in nav,
      swEnabled: this.updates?.isEnabled,
    });

    on(win, 'online', () =>
      diagnostics.log('net', 'online', { onLine: nav.onLine }),
    );
    on(win, 'offline', () =>
      diagnostics.log('net', 'offline', { onLine: nav.onLine }),
    );
    const connection = (nav as { connection?: NetworkInformation }).connection;
    if (connection)
      on(connection, 'change', () =>
        diagnostics.log('net', 'connection-change', {
          effectiveType: connection.effectiveType,
          type: connection.type,
          downlink: connection.downlink,
          rtt: connection.rtt,
          saveData: connection.saveData,
        }),
      );

    on(document, 'visibilitychange', () => {
      page('visibilitychange', { visibility: document.visibilityState });
      if (document.visibilityState === 'hidden') flushSoon();
    });
    on(win, 'focus', () => page('focus', { hasFocus: document.hasFocus() }));
    on(win, 'blur', () => page('blur'));
    on(win, 'pagehide', (event) => {
      page('pagehide', {
        persisted: (event as PageTransitionEvent).persisted,
      });
      flushSoon();
    });
    on(win, 'pageshow', (event) =>
      page('pageshow', { persisted: (event as PageTransitionEvent).persisted }),
    );
    on(document, 'freeze', () => {
      page('freeze');
      flushSoon();
    });
    on(document, 'resume', () => page('resume'));
    on(win, 'unhandledrejection', (event) => {
      const reason = (event as PromiseRejectionEvent).reason as unknown;
      page('unhandledrejection', {
        name: reason instanceof Error ? reason.name : typeof reason,
        message: reason instanceof Error ? reason.message : undefined,
      });
    });

    this.watchServiceWorker(nav);
    diagnostics.registerState('serviceWorkerVersions', () => this.workers);
  }

  private watchServiceWorker(nav: Navigator): void {
    const { diagnostics } = this;
    const container = nav.serviceWorker;
    if (container) {
      container.addEventListener('controllerchange', () =>
        diagnostics.log('sw', 'controllerchange', {
          controller: container.controller?.state ?? 'none',
        }),
      );
      void container
        .getRegistration()
        .then((registration) =>
          diagnostics.log('sw', 'registration', {
            registered: registration !== undefined,
            scope: registration?.scope,
            active: registration?.active?.state,
            waiting: registration?.waiting?.state,
            installing: registration?.installing?.state,
            controller: container.controller?.state ?? 'none',
          }),
        )
        .catch((error: unknown) =>
          diagnostics.log('sw', 'registration-error', {
            name: error instanceof Error ? error.name : 'unknown',
          }),
        );
      const watchState = () => {
        const controller = container.controller;
        controller?.addEventListener('statechange', () =>
          diagnostics.log('sw', 'controller-statechange', {
            state: controller.state,
          }),
        );
      };
      watchState();
      container.addEventListener('controllerchange', watchState);
    }
    this.updates?.versionUpdates.subscribe((event) => {
      const hash = (version: { hash: string }) => version.hash.slice(0, 12);
      const ready = event.type === 'VERSION_READY';
      const version = ready ? hash(event.latestVersion) : hash(event.version);
      this.workers.current = `${event.type.toLowerCase()} ${version}`;
      diagnostics.log('sw', event.type.toLowerCase(), {
        version,
        running: ready ? hash(event.currentVersion) : undefined,
        error:
          event.type === 'VERSION_INSTALLATION_FAILED'
            ? event.error
            : undefined,
      });
    });
    this.updates?.unrecoverable.subscribe((event) =>
      diagnostics.log('sw', 'unrecoverable', { reason: event.reason }),
    );
  }
}
