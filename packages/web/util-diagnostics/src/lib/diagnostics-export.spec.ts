import { TestBed } from '@angular/core/testing';
import { DIAGNOSTIC_STORE, Diagnostics } from './diagnostics';
import { DiagnosticStore } from './diagnostic-store';
import { DiagnosticsExport } from './diagnostics-export';

let store: DiagnosticStore;
let clicked: HTMLAnchorElement[];

async function setup() {
  store = new DiagnosticStore();
  await store.clear();
  TestBed.configureTestingModule({
    providers: [
      { provide: DIAGNOSTIC_STORE, useValue: () => Promise.resolve(store) },
    ],
  });
  TestBed.inject(Diagnostics).log('socket', 'connect', { sid: 's1' });
  clicked = [];
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this);
  });
  return TestBed.inject(DiagnosticsExport);
}

function phone(share: unknown, canShare = true) {
  window.matchMedia = vi.fn(() => ({ matches: true }) as MediaQueryList);
  Object.assign(navigator, { share, canShare: () => canShare });
}

afterEach(() => {
  vi.restoreAllMocks();
  store.close();
  Object.assign(navigator, { share: undefined, canShare: undefined });
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('DiagnosticsExport', () => {
  it('downloads a dated file with the header and entries', async () => {
    const exporter = await setup();
    expect(await exporter.deliver(await exporter.build())).toBe('downloaded');
    expect(clicked[0]?.download).toMatch(
      /^lister-diagnostic-\d{4}-\d{2}-\d{2}\.log$/,
    );
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0] as File;
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(text).toContain('# Lister diagnostic log');
    expect(text).toContain('# userAgent:');
    expect(text).toContain('socket.connect {"sid":"s1"}');
  });

  it('shares the file on a phone', async () => {
    const exporter = await setup();
    const share = vi.fn(() => Promise.resolve());
    phone(share);
    expect(await exporter.deliver(await exporter.build())).toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
    expect(clicked).toHaveLength(0);
  });

  it('does nothing more when the share sheet is dismissed', async () => {
    const exporter = await setup();
    phone(() => Promise.reject(new DOMException('x', 'AbortError')));
    expect(await exporter.deliver(await exporter.build())).toBe('cancelled');
    expect(clicked).toHaveLength(0);
  });

  it('downloads when sharing is refused', async () => {
    const exporter = await setup();
    phone(() => Promise.reject(new DOMException('x', 'NotAllowedError')));
    expect(await exporter.deliver(await exporter.build())).toBe('downloaded');
  });

  it('downloads when files cannot be shared', async () => {
    const exporter = await setup();
    phone(vi.fn(), false);
    expect(await exporter.deliver(await exporter.build())).toBe('downloaded');
  });
});
