import { TestBed } from '@angular/core/testing';
import { Diagnostics } from './diagnostics';
import { DiagnosticsCollector } from './diagnostics-collector';

function setup() {
  const diagnostics = TestBed.inject(Diagnostics);
  const log = vi.spyOn(diagnostics, 'log');
  const flush = vi.spyOn(diagnostics, 'flush').mockResolvedValue();
  TestBed.inject(DiagnosticsCollector).start();
  return { log, flush };
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
});
