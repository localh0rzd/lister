import { TestBed } from '@angular/core/testing';
import { LOADING_SPINNER_DELAY_MS, LoadingSpinner } from './loading-spinner';

afterEach(() => vi.useRealTimers());

describe('LoadingSpinner', () => {
  it('shows no spinner on a fast load and a labelled one on a slow load', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(LoadingSpinner);
    fixture.componentRef.setInput('label', 'Loading spaces');
    fixture.detectChanges();
    const spinner = () =>
      (fixture.nativeElement as HTMLElement).querySelector(
        'mat-progress-spinner',
      );

    vi.advanceTimersByTime(LOADING_SPINNER_DELAY_MS - 1);
    fixture.detectChanges();
    expect(spinner()).toBeNull();

    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(spinner()?.getAttribute('aria-label')).toBe('Loading spaces');
    expect(spinner()?.getAttribute('mode')).toBe('indeterminate');
  });

  it('cancels its timer when it goes away first', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(LoadingSpinner);
    fixture.componentRef.setInput('label', 'Loading');
    fixture.detectChanges();
    fixture.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
