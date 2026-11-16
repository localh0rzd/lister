import { TestBed } from '@angular/core/testing';
import { Notifier } from '@lister/web/util-notify';
import {
  IOS_HINT_KEY,
  IOS_INSTALL_STEPS,
  InstallPrompt,
} from './install-prompt';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const IOS_CHROME = IPHONE.replace('Version/18.0', 'CriOS/130.0');

function setup({ userAgent = 'Chrome', standalone = false } = {}) {
  const notify = vi.fn(() => Promise.resolve('dismissed' as const));
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  vi.stubGlobal(
    'matchMedia',
    () => ({ matches: standalone }) as MediaQueryList,
  );
  TestBed.configureTestingModule({
    providers: [{ provide: Notifier, useValue: { notify } }],
  });
  return { notify, prompts: TestBed.inject(InstallPrompt) };
}

function chromiumOffersInstall() {
  const prompt = vi.fn(() => Promise.resolve());
  const event = Object.assign(
    new Event('beforeinstallprompt', { cancelable: true }),
    {
      prompt,
    },
  );
  window.dispatchEvent(event);
  return { event, prompt };
}

describe('InstallPrompt', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the browser prompt until the user asks, once', async () => {
    const { prompts } = setup();
    expect(prompts.canInstall()).toBe(false);

    const { event, prompt } = chromiumOffersInstall();
    expect(event.defaultPrevented).toBe(true);
    expect(prompts.canInstall()).toBe(true);
    expect(prompt).not.toHaveBeenCalled();

    await prompts.install();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(prompts.canInstall()).toBe(false);
    await prompts.install();
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('settles quietly when the browser refuses to show the prompt', async () => {
    const { prompts } = setup();
    const { prompt } = chromiumOffersInstall();
    prompt.mockRejectedValueOnce(new DOMException('used', 'InvalidStateError'));

    await expect(prompts.install()).resolves.toBeUndefined();
    expect(prompts.canInstall()).toBe(false);
  });

  it('ignores a handed-over prompt when it already runs as an installed app', () => {
    const { prompts } = setup({ standalone: true });
    const event = new Event('beforeinstallprompt', { cancelable: true });
    prompts.offer(event);
    expect(prompts.canInstall()).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it('stops offering once the app is installed', () => {
    const { prompts } = setup();
    chromiumOffersInstall();
    window.dispatchEvent(new Event('appinstalled'));
    expect(prompts.canInstall()).toBe(false);
  });

  it('offers nothing when it already runs as an installed app', () => {
    const { prompts } = setup({ standalone: true, userAgent: IPHONE });
    chromiumOffersInstall();
    expect(prompts.canInstall()).toBe(false);
    expect(prompts.iosSteps()).toBe(false);
  });

  it('explains Share → Add to Home Screen once on iOS Safari', async () => {
    const { prompts, notify } = setup({ userAgent: IPHONE });
    expect(prompts.iosSteps()).toBe(true);

    await prompts.hintOnce();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(IOS_INSTALL_STEPS),
      }),
    );
    expect(localStorage.getItem(IOS_HINT_KEY)).not.toBeNull();

    await prompts.hintOnce();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('gives no iOS hint on other iOS browsers or on other systems', async () => {
    for (const userAgent of [
      IOS_CHROME,
      'Mozilla/5.0 (X11; Linux) Chrome/130',
    ]) {
      TestBed.resetTestingModule();
      const { prompts, notify } = setup({ userAgent });
      expect(prompts.iosSteps()).toBe(false);
      await prompts.hintOnce();
      expect(notify).not.toHaveBeenCalled();
    }
  });
});
