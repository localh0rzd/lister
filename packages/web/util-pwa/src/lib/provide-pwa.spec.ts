import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Notifier } from '@lister/web/util-notify';
import { InstallPrompt } from './install-prompt';
import { providePwa } from './provide-pwa';

describe('providePwa', () => {
  it('keeps an install prompt that fires before InstallPrompt has loaded', async () => {
    TestBed.configureTestingModule({
      providers: [
        providePwa(),
        { provide: Notifier, useValue: { notify: vi.fn() } },
      ],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;

    // Fires while `import('./install-prompt')` is still pending.
    const event = new Event('beforeinstallprompt', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    await vi.waitFor(() =>
      expect(TestBed.inject(InstallPrompt).canInstall()).toBe(true),
    );
  });
});
