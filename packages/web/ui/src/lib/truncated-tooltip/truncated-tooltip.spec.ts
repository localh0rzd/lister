import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Platform } from '@angular/cdk/platform';
import { MatTooltip } from '@angular/material/tooltip';
import {
  LONG_PRESS_MS,
  TOUCH_HIDE_DELAY_MS,
  TruncatedTooltip,
} from './truncated-tooltip';

@Component({
  imports: [TruncatedTooltip],
  template: `<a
      class="t"
      href="#"
      listerTruncatedTooltip
      (click)="clicks.set(clicks() + 1)"
      >{{ title() }}</a
    >
    <button class="wrap" type="button" [listerTruncatedTooltip]="inner">
      <span class="inner" #inner>{{ title() }}</span>
    </button>`,
})
class Host {
  readonly title = signal('A very long title');
  readonly clicks = signal(0);
}

let resizeCallbacks: (() => void)[] = [];

beforeEach(() => {
  resizeCallbacks = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resizeCallbacks.push(callback);
      }
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setWidths(el: HTMLElement, scroll: number, client: number) {
  Object.defineProperty(el, 'scrollWidth', {
    value: scroll,
    configurable: true,
  });
  Object.defineProperty(el, 'clientWidth', {
    value: client,
    configurable: true,
  });
}

async function render(scroll: number, client: number, touch = false) {
  if (touch) TestBed.inject(Platform).ANDROID = true;
  const fixture = TestBed.createComponent(Host);
  const root = fixture.nativeElement as HTMLElement;
  const el = root.querySelector('.t') as HTMLElement;
  setWidths(el, scroll, client);
  await fixture.whenStable();
  const tooltip = fixture.debugElement
    .query(By.css('.t'))
    .injector.get(MatTooltip);
  return { fixture, root, el, tooltip };
}

/** The text of the open tooltip, or `null` when none is open. */
const tooltipText = () =>
  document.querySelector('.mat-mdc-tooltip')?.textContent?.trim() ?? null;

function touchEvent(
  el: HTMLElement,
  type: string,
  point?: { x: number; y: number },
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const touches = point ? [{ clientX: point.x, clientY: point.y }] : [];
  Object.defineProperty(event, 'touches', { value: touches });
  el.dispatchEvent(event);
}

describe('TruncatedTooltip', () => {
  it('shows the full title in a tooltip when the text is cut off', async () => {
    const { el } = await render(300, 100);
    el.dispatchEvent(new Event('mouseenter'));
    await vi.waitFor(() => expect(tooltipText()).toBe('A very long title'));
  });

  it('shows no tooltip when the text fits', async () => {
    const { el, tooltip } = await render(100, 100);
    el.dispatchEvent(new Event('mouseenter'));
    expect(tooltip.disabled).toBe(true);
    expect(tooltipText()).toBeNull();
  });

  it('does not add a second description for screen readers', async () => {
    const { fixture, el } = await render(300, 100);
    el.dispatchEvent(new Event('mouseenter'));
    await vi.waitFor(() => expect(tooltipText()).not.toBeNull());
    await fixture.whenStable();
    expect(el.hasAttribute('aria-describedby')).toBe(false);
  });

  it('follows a resize', async () => {
    const { el, tooltip } = await render(100, 100);
    setWidths(el, 300, 100);
    resizeCallbacks.forEach((cb) => cb());
    expect(tooltip.disabled).toBe(false);
    el.dispatchEvent(new Event('mouseenter'));
    await vi.waitFor(() => expect(tooltipText()).toBe('A very long title'));
  });

  it('shows the new text after the title changes', async () => {
    const { fixture, el, tooltip } = await render(300, 100);
    fixture.componentInstance.title.set('Renamed long title');
    await fixture.whenStable();
    await vi.waitFor(() => expect(tooltip.message).toBe('Renamed long title'));
    el.dispatchEvent(new Event('mouseenter'));
    await vi.waitFor(() => expect(tooltipText()).toBe('Renamed long title'));
  });

  it('measures the bound inner element when the host wraps it', async () => {
    const fixture = TestBed.createComponent(Host);
    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector('.wrap') as HTMLElement;
    setWidths(button, 100, 100);
    setWidths(root.querySelector('.inner') as HTMLElement, 300, 100);
    await fixture.whenStable();
    const tooltip = fixture.debugElement
      .query(By.css('.wrap'))
      .injector.get(MatTooltip);
    expect(tooltip.disabled).toBe(false);
    expect(tooltip.message).toBe('A very long title');
  });

  describe('on a touch device', () => {
    it('leaves scrolling alone: no touch-action on the title', async () => {
      const { el, tooltip } = await render(300, 100, true);
      expect(tooltip.disabled).toBe(false);
      // jsdom keeps unknown style properties as plain values, so Material's would show here.
      expect(el.style.touchAction).not.toBe('none');
      // Only the text selection and the iOS link preview make way for the long-press.
      expect(el.style.userSelect).toBe('none');
    });

    it('does not block text selection on a title that fits', async () => {
      const { el } = await render(100, 100, true);
      expect(el.style.userSelect).toBe('');
    });

    it('shows the tooltip on a long-press and hides it after the finger lifts', async () => {
      const { el, tooltip } = await render(300, 100, true);
      const show = vi
        .spyOn(tooltip, 'show')
        .mockImplementation(() => undefined);
      const hide = vi
        .spyOn(tooltip, 'hide')
        .mockImplementation(() => undefined);
      vi.useFakeTimers();

      touchEvent(el, 'touchstart', { x: 10, y: 10 });
      vi.advanceTimersByTime(LONG_PRESS_MS - 1);
      expect(show).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(show).toHaveBeenCalledWith(0);

      touchEvent(el, 'touchend');
      expect(hide).toHaveBeenCalledWith(TOUCH_HIDE_DELAY_MS);
    });

    it('does not show the tooltip for a swipe that starts on the title', async () => {
      const { el, tooltip } = await render(300, 100, true);
      const show = vi
        .spyOn(tooltip, 'show')
        .mockImplementation(() => undefined);
      vi.useFakeTimers();

      touchEvent(el, 'touchstart', { x: 10, y: 100 });
      touchEvent(el, 'touchmove', { x: 10, y: 60 });
      vi.advanceTimersByTime(LONG_PRESS_MS);
      expect(show).not.toHaveBeenCalled();
    });

    it('does not show the tooltip for a press on a title that fits', async () => {
      const { el, tooltip } = await render(100, 100, true);
      const show = vi
        .spyOn(tooltip, 'show')
        .mockImplementation(() => undefined);
      vi.useFakeTimers();

      touchEvent(el, 'touchstart', { x: 10, y: 10 });
      vi.advanceTimersByTime(LONG_PRESS_MS);
      expect(show).not.toHaveBeenCalled();
    });

    it('a long-press does not open the title; a tap still does', async () => {
      const { fixture, el, tooltip } = await render(300, 100, true);
      vi.spyOn(tooltip, 'show').mockImplementation(() => undefined);
      vi.spyOn(tooltip, 'hide').mockImplementation(() => undefined);
      vi.useFakeTimers();

      touchEvent(el, 'touchstart', { x: 10, y: 10 });
      const menu = new Event('contextmenu', { cancelable: true });
      el.dispatchEvent(menu);
      expect(menu.defaultPrevented).toBe(true);
      touchEvent(el, 'touchend');
      el.click();
      expect(fixture.componentInstance.clicks()).toBe(0);

      touchEvent(el, 'touchstart', { x: 10, y: 10 });
      touchEvent(el, 'touchend');
      el.click();
      expect(fixture.componentInstance.clicks()).toBe(1);
    });
  });
});
