import { TestBed } from '@angular/core/testing';
import { SwUpdate, type VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { Diagnostics } from './diagnostics';
import { DiagnosticsCollector } from './diagnostics-collector';

/** A service worker container as the page sees it: a controller, a registration, events. */
function fakeWorker(state = 'activated') {
  const controller = Object.assign(new EventTarget(), {
    state,
    scriptURL: 'http://localhost/ngsw-worker.js',
  });
  const container = Object.assign(new EventTarget(), {
    controller: controller as typeof controller | null,
    getRegistration: () =>
      Promise.resolve({
        scope: 'http://localhost/',
        active: { state },
        waiting: null,
        installing: null,
      }),
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: container,
  });
  return { container, controller };
}

function fakeUpdates() {
  const updates = {
    isEnabled: true,
    versionUpdates: new Subject<VersionEvent>(),
    unrecoverable: new Subject<{
      type: 'UNRECOVERABLE_STATE';
      reason: string;
    }>(),
  };
  TestBed.configureTestingModule({
    providers: [{ provide: SwUpdate, useValue: updates }],
  });
  return updates;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

function setup() {
  const diagnostics = TestBed.inject(Diagnostics);
  const log = vi.spyOn(diagnostics, 'log');
  const flush = vi.spyOn(diagnostics, 'flush').mockResolvedValue();
  TestBed.inject(DiagnosticsCollector).start();
  return { diagnostics, log, flush };
}

describe('DiagnosticsCollector', () => {
  it('logs the start of the app with the navigator state', () => {
    const { log } = setup();
    expect(log).toHaveBeenCalledWith(
      'app',
      'start',
      expect.objectContaining({ onLine: navigator.onLine }),
    );
  });

  it.each([
    ['online', 'net', 'online'],
    ['offline', 'net', 'offline'],
    ['focus', 'page', 'focus'],
  ])('logs the browser %s event', (name, area, event) => {
    const { log } = setup();
    window.dispatchEvent(new Event(name));
    expect(log).toHaveBeenCalledWith(area, event, expect.anything());
  });

  it('logs a page that goes into the back/forward cache and keeps the log safe', () => {
    const { log, flush } = setup();
    const event = new Event('pagehide') as PageTransitionEvent;
    Object.defineProperty(event, 'persisted', { value: true });
    window.dispatchEvent(event);
    expect(log).toHaveBeenCalledWith('page', 'pagehide', { persisted: true });
    expect(flush).toHaveBeenCalled();
  });

  it('logs visibility changes', () => {
    const { log } = setup();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(log).toHaveBeenCalledWith('page', 'visibilitychange', {
      visibility: document.visibilityState,
    });
  });

  it('starts once', () => {
    const { log } = setup();
    TestBed.inject(DiagnosticsCollector).start();
    expect(
      log.mock.calls.filter(([, event]) => event === 'start'),
    ).toHaveLength(1);
  });

  describe('service worker', () => {
    it('logs the registration and the controller', async () => {
      fakeWorker();
      const { log } = setup();
      await vi.waitFor(() =>
        expect(log).toHaveBeenCalledWith(
          'sw',
          'registration',
          expect.objectContaining({
            registered: true,
            active: 'activated',
            controller: 'activated',
          }),
        ),
      );
    });

    it('logs a new controller and its state changes', () => {
      const { container, controller } = fakeWorker('activating');
      const { log } = setup();
      controller.state = 'activated';
      controller.dispatchEvent(new Event('statechange'));
      expect(log).toHaveBeenCalledWith('sw', 'controller-statechange', {
        state: 'activated',
      });
      container.controller = null;
      container.dispatchEvent(new Event('controllerchange'));
      expect(log).toHaveBeenCalledWith('sw', 'controllerchange', {
        controller: 'none',
      });
    });

    it('logs version events and keeps the latest for the export header', async () => {
      const updates = fakeUpdates();
      const { diagnostics, log } = setup();
      updates.versionUpdates.next({
        type: 'VERSION_DETECTED',
        version: { hash: 'abcdef0123456789' },
      });
      updates.versionUpdates.next({
        type: 'VERSION_READY',
        currentVersion: { hash: '1111111111111111' },
        latestVersion: { hash: '2222222222222222' },
      });
      updates.versionUpdates.next({
        type: 'VERSION_INSTALLATION_FAILED',
        version: { hash: '3333333333333333' },
        error: 'Hash mismatch',
      });
      updates.unrecoverable.next({
        type: 'UNRECOVERABLE_STATE',
        reason: 'missing file',
      });

      expect(log).toHaveBeenCalledWith('sw', 'version_detected', {
        version: 'abcdef012345',
        running: undefined,
        error: undefined,
      });
      expect(log).toHaveBeenCalledWith('sw', 'version_ready', {
        version: '222222222222',
        running: '111111111111',
        error: undefined,
      });
      expect(log).toHaveBeenCalledWith(
        'sw',
        'version_installation_failed',
        expect.objectContaining({ error: 'Hash mismatch' }),
      );
      expect(log).toHaveBeenCalledWith('sw', 'unrecoverable', {
        reason: 'missing file',
      });
      expect((await diagnostics.header())['serviceWorkerVersions']).toBe(
        '{"current":"version_installation_failed 333333333333"}',
      );
    });
  });
});
