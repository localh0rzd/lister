import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TruncatedTooltip } from './truncated-tooltip';

@Component({
  imports: [TruncatedTooltip],
  template: `<a class="t" listerTruncatedTooltip>{{ title() }}</a>`,
})
class Host {
  readonly title = signal('A very long title');
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
afterEach(() => vi.unstubAllGlobals());

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

async function render(scroll: number, client: number) {
  const fixture = TestBed.createComponent(Host);
  const el = (fixture.nativeElement as HTMLElement).querySelector(
    '.t',
  ) as HTMLElement;
  setWidths(el, scroll, client);
  await fixture.whenStable();
  return { fixture, el };
}

describe('TruncatedTooltip', () => {
  it('shows the full title in a tooltip when the text is cut off', async () => {
    const { fixture, el } = await render(300, 100);
    el.dispatchEvent(new Event('mouseenter'));
    await new Promise((r) => setTimeout(r, 10));
    expect(document.body.textContent).toContain('A very long title');
    expect(
      document.querySelector('.mat-mdc-tooltip, .mdc-tooltip'),
    ).not.toBeNull();
    fixture.destroy();
  });

  it('shows no tooltip when the text fits', async () => {
    const { fixture, el } = await render(100, 100);
    el.dispatchEvent(new Event('mouseenter'));
    await new Promise((r) => setTimeout(r, 10));
    expect(document.querySelector('.mat-mdc-tooltip, .mdc-tooltip')).toBeNull();
    fixture.destroy();
  });

  it('does not add a second description for screen readers', async () => {
    const { fixture, el } = await render(300, 100);
    expect(el.hasAttribute('aria-describedby')).toBe(false);
    fixture.destroy();
  });

  it('follows a resize', async () => {
    const { fixture, el } = await render(100, 100);
    setWidths(el, 300, 100);
    resizeCallbacks.forEach((cb) => cb());
    el.dispatchEvent(new Event('mouseenter'));
    await new Promise((r) => setTimeout(r, 10));
    expect(
      document.querySelector('.mat-mdc-tooltip, .mdc-tooltip'),
    ).not.toBeNull();
    fixture.destroy();
  });

  it('shows the new text after the title changes', async () => {
    const { fixture, el } = await render(300, 100);
    fixture.componentInstance.title.set('Renamed long title');
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r)); // MutationObserver microtask/task
    el.dispatchEvent(new Event('mouseenter'));
    await new Promise((r) => setTimeout(r, 10));
    expect(document.body.textContent).toContain('Renamed long title');
    expect(
      document.querySelector('.mat-mdc-tooltip, .mdc-tooltip'),
    ).not.toBeNull();
    fixture.destroy();
  });
});
