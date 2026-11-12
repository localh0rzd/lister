import { TestBed } from '@angular/core/testing';
import { LOADING_HINT_DELAY_MS, LoadingHint } from './loading-hint';

afterEach(() => vi.useRealTimers());

describe('LoadingHint', () => {
  it('stays empty on a fast load and says "Loading…" on a slow one', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(LoadingHint);
    fixture.detectChanges();
    const text = () =>
      (fixture.nativeElement as HTMLElement).textContent?.trim();

    vi.advanceTimersByTime(LOADING_HINT_DELAY_MS - 1);
    fixture.detectChanges();
    expect(text()).toBe('');

    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(text()).toBe('Loading…');
  });

  it('never appears once it is gone before the delay', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(LoadingHint);
    fixture.detectChanges();
    fixture.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
