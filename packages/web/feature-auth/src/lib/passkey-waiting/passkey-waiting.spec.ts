import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PASSKEY_WAITING_DELAY_MS, PasskeyWaiting } from './passkey-waiting';

@Component({
  imports: [PasskeyWaiting],
  template: `<lister-passkey-waiting [waiting]="waiting()" />`,
})
class Host {
  readonly waiting = signal(false);
}

const TEXT =
  'Waiting for your passkey… If you closed the passkey window, choose Cancel.';

describe('PasskeyWaiting', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const region = () =>
      element.querySelector('lister-passkey-waiting') as HTMLElement;
    const text = () => region().querySelector('span');
    return { fixture, region, text };
  }

  function advance(fixture: { detectChanges(): void }, ms: number) {
    vi.advanceTimersByTime(ms);
    fixture.detectChanges();
  }

  it('is a live region that is there before anything is announced', async () => {
    const { region, text } = await render();

    expect(region().getAttribute('role')).toBe('status');
    expect(text()).toBeNull();
  });

  it('takes its place at once but shows only after a while', async () => {
    const { fixture, text } = await render();
    fixture.componentInstance.waiting.set(true);
    fixture.detectChanges();

    expect(text()?.textContent?.replace(/\s+/g, ' ').trim()).toBe(TEXT);
    expect(text()?.classList.contains('shown')).toBe(false);

    advance(fixture, PASSKEY_WAITING_DELAY_MS - 1);
    expect(text()?.classList.contains('shown')).toBe(false);
    advance(fixture, 1);
    expect(text()?.classList.contains('shown')).toBe(true);
  });

  it('never shows for a ceremony that ends at once, and starts over for the next one', async () => {
    const { fixture, text } = await render();
    fixture.componentInstance.waiting.set(true);
    fixture.detectChanges();
    fixture.componentInstance.waiting.set(false);
    fixture.detectChanges();
    advance(fixture, PASSKEY_WAITING_DELAY_MS);
    expect(text()).toBeNull();

    fixture.componentInstance.waiting.set(true);
    fixture.detectChanges();
    advance(fixture, PASSKEY_WAITING_DELAY_MS / 2);
    expect(text()?.classList.contains('shown')).toBe(false);
    advance(fixture, PASSKEY_WAITING_DELAY_MS / 2);
    expect(text()?.classList.contains('shown')).toBe(true);
  });
});
