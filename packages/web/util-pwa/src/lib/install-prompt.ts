import { DOCUMENT, Service, inject, signal } from '@angular/core';
import { Notifier } from '@lister/web/util-notify';

/** localStorage flag: the iOS "Add to Home Screen" hint was shown once. */
export const IOS_HINT_KEY = 'lister.iosInstallHintShown';

/** Chromium's `beforeinstallprompt` event, which isn't in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
}

/** What the Space page tells iOS Safari users, who have no install API. */
export const IOS_INSTALL_STEPS = 'Tap Share, then Add to Home Screen.';

/**
 * Installing the app. On Chromium the browser offers an install prompt (`beforeinstallprompt`),
 * which is kept until the user asks for it from the Space page. iOS Safari has no install API:
 * there, a one-time notice explains "Share → Add to Home Screen". Neither is offered once the
 * app runs installed (standalone).
 */
@Service()
export class InstallPrompt {
  private readonly document = inject(DOCUMENT);
  private readonly notifier = inject(Notifier);
  private deferred: BeforeInstallPromptEvent | undefined;

  /** Chromium has an install prompt ready. */
  readonly canInstall = signal(false);
  /** iOS Safari in a tab: no install API, so the steps are explained. */
  readonly iosSteps = signal(false);

  constructor() {
    const win = this.document.defaultView;
    if (!win || this.isStandalone(win)) return;
    this.iosSteps.set(this.isIosSafari(win));
    win.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.deferred = event as BeforeInstallPromptEvent;
      this.canInstall.set(true);
    });
    win.addEventListener('appinstalled', () => {
      this.deferred = undefined;
      this.canInstall.set(false);
      this.iosSteps.set(false);
    });
  }

  /** Opens the browser's install prompt (Chromium). */
  async install(): Promise<void> {
    const event = this.deferred;
    if (!event) return;
    // A prompt event can be used once.
    this.deferred = undefined;
    this.canInstall.set(false);
    await event.prompt();
  }

  /** On iOS Safari, explains how to install, once per device. */
  async hintOnce(): Promise<void> {
    if (!this.iosSteps() || this.hintShown()) return;
    try {
      localStorage.setItem(IOS_HINT_KEY, '1');
    } catch {
      // Storage blocked: the hint may show again, which is harmless.
    }
    await this.notifier.notify({
      message: `Install Lister: ${IOS_INSTALL_STEPS}`,
      action: 'OK',
      duration: 12000,
    });
  }

  private hintShown(): boolean {
    try {
      return localStorage.getItem(IOS_HINT_KEY) !== null;
    } catch {
      return false;
    }
  }

  private isStandalone(win: Window): boolean {
    return (
      win.matchMedia?.('(display-mode: standalone)').matches === true ||
      (win.navigator as Navigator & { standalone?: boolean }).standalone ===
        true
    );
  }

  private isIosSafari(win: Window): boolean {
    const { userAgent, platform, maxTouchPoints } = win.navigator;
    // iPadOS reports itself as a Mac with a touch screen.
    const ios =
      /iPad|iPhone|iPod/.test(userAgent) ||
      (platform === 'MacIntel' && maxTouchPoints > 1);
    // Other iOS browsers (Chrome, Firefox, Edge) can't add to the home screen the same way.
    return ios && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);
  }
}
