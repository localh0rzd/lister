import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  InstallPrompt,
  type PersistenceState,
  StoragePersistence,
} from '@lister/web/util-pwa';
import { AppSection } from './app-section';

function render({
  canInstall = false,
  iosSteps = false,
  state = 'unknown' as PersistenceState,
} = {}) {
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
    ],
  });
  const fixture = TestBed.createComponent(AppSection);
  fixture.detectChanges();
  return { install, el: fixture.nativeElement as HTMLElement };
}

describe('AppSection', () => {
  it('opens the browser install prompt from "Install app"', () => {
    const { el, install } = render({ canInstall: true });
    expect(el.textContent).toContain('Install app');
    el.querySelector<HTMLButtonElement>('button')?.click();
    expect(install).toHaveBeenCalledTimes(1);
  });

  it('explains Share → Add to Home Screen on iOS, without a button', () => {
    const { el } = render({ iosSteps: true });
    expect(el.textContent).toContain('Add to Home Screen');
    expect(el.querySelector('button')).toBeNull();
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
});
