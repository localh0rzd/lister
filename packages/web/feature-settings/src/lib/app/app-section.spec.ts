import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  type DiagnosticEntry,
  Diagnostics,
  DiagnosticsExport,
} from '@lister/web/util-diagnostics';
import { Notifier } from '@lister/web/util-notify';
import {
  InstallPrompt,
  type PersistenceState,
  StoragePersistence,
} from '@lister/web/util-pwa';
import { AppSection } from './app-section';

const FILE = new File(['log'], 'lister-diagnostic-2026-11-18.log');
const CLEARED: DiagnosticEntry[] = [
  { at: 1, area: 'app', event: 'start', tab: 't', leader: false },
];

function render({
  exportLog = vi.fn(() => Promise.resolve('downloaded')),
  clearLog = vi.fn(() => Promise.resolve(CLEARED)),
  undo = false,
  canInstall = false,
  iosSteps = false,
  state = 'unknown' as PersistenceState,
} = {}) {
  const restore = vi.fn(() => Promise.resolve());
  const notify = vi.fn(() => Promise.resolve(undo ? 'action' : 'dismissed'));
  const install = vi.fn(() => Promise.resolve());
  TestBed.configureTestingModule({
    providers: [
      {
        provide: InstallPrompt,
        useValue: {
          canInstall: signal(canInstall),
          iosSteps: signal(iosSteps),
          install,
        },
      },
      { provide: StoragePersistence, useValue: { state: signal(state) } },
      {
        provide: DiagnosticsExport,
        useValue: { build: () => Promise.resolve(FILE), deliver: exportLog },
      },
      { provide: Diagnostics, useValue: { clear: clearLog, restore } },
      { provide: Notifier, useValue: { notify } },
    ],
  });
  const fixture = TestBed.createComponent(AppSection);
  fixture.detectChanges();
  return {
    install,
    exportLog,
    clearLog,
    restore,
    notify,
    fixture,
    el: fixture.nativeElement as HTMLElement,
  };
}

const buttons = (el: HTMLElement) =>
  [...el.querySelectorAll('button')].map((b) => b.textContent?.trim());
const button = (el: HTMLElement, label: string) =>
  [...el.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label,
  ) as HTMLButtonElement;

describe('AppSection', () => {
  it('opens the browser install prompt from "Install app"', () => {
    const { el, install } = render({ canInstall: true });
    expect(el.textContent).toContain('Install app');
    button(el, 'Install').click();
    expect(install).toHaveBeenCalledTimes(1);
  });

  it('explains Share → Add to Home Screen on iOS, without a button', () => {
    const { el } = render({ iosSteps: true });
    expect(el.textContent).toContain('Add to Home Screen');
    expect(el.textContent).not.toContain('Install\n');
    expect(buttons(el)).toEqual([
      'Export diagnostic log',
      'Clear diagnostic log',
    ]);
  });

  it('shows no install row when installing is not possible', () => {
    const { el } = render();
    expect(el.textContent).not.toContain('Install app');
  });

  it.each([
    ['granted', 'Granted'],
    ['denied', 'Not granted'],
    ['unsupported', 'Not supported'],
    ['unknown', 'Not requested yet'],
  ] as const)('shows persistent storage as %s', (state, text) => {
    const { el } = render({ state });
    expect(el.textContent).toContain(text);
  });

  it('exports the diagnostic log and says what happened', async () => {
    const { el, exportLog, fixture } = render();
    button(el, 'Export diagnostic log').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(exportLog).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain('Diagnostic log downloaded');
  });

  it('says when sharing was cancelled', async () => {
    const { el, fixture } = render({
      exportLog: vi.fn(() => Promise.resolve('cancelled')),
    });
    button(el, 'Export diagnostic log').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('Sharing cancelled');
  });

  it('says so when the export fails', async () => {
    const { el, fixture } = render({
      exportLog: vi.fn(() => Promise.reject(new Error('no storage'))),
    });
    button(el, 'Export diagnostic log').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('could not be exported');
  });

  it('clears the diagnostic log and offers Undo', async () => {
    const { el, clearLog, notify, restore, fixture } = render();
    button(el, 'Clear diagnostic log').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(clearLog).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain('Diagnostic log cleared');
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Diagnostic log cleared',
        action: 'Undo',
      }),
    );
    expect(restore).not.toHaveBeenCalled();
  });

  it('puts the cleared log back on Undo', async () => {
    const { el, restore, fixture } = render({ undo: true });
    button(el, 'Clear diagnostic log').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(restore).toHaveBeenCalledWith(CLEARED);
    expect(el.textContent).toContain('Diagnostic log restored');
  });

  it('keeps the buttons usable while the share sheet never answers', async () => {
    const { el, fixture, exportLog } = render({
      exportLog: vi.fn(() => new Promise<string>(() => undefined)),
    });
    button(el, 'Export diagnostic log').click();
    await vi.waitFor(() => expect(exportLog).toHaveBeenCalled());
    fixture.detectChanges();
    expect(button(el, 'Export diagnostic log').disabled).toBe(false);
    expect(button(el, 'Clear diagnostic log').disabled).toBe(false);
  });
});
