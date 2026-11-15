import { describe, expect, it } from 'vitest';
import { attribution } from './attribution';

describe('attribution', () => {
  const at = new Date(2026, 10, 15, 14, 2).getTime();

  it('shows only the time for today', () => {
    const now = new Date(2026, 10, 15, 18, 0).getTime();
    expect(attribution('Anna', at, now, 'en-GB')).toBe('Anna · 14:02');
  });

  it('adds the date for another day', () => {
    const now = new Date(2026, 10, 17, 9, 0).getTime();
    expect(attribution('Anna', at, now, 'en-GB')).toBe('Anna · 15 Nov, 14:02');
  });

  it('does not zero-pad the hour in 12-hour locales', () => {
    const morning = new Date(2026, 10, 15, 9, 5).getTime();
    expect(attribution('Anna', morning, morning, 'en-US')).toBe(
      'Anna · 9:05 AM',
    );
  });

  it('says "Someone" for an unknown person', () => {
    const now = at;
    expect(attribution(undefined, at, now, 'en-GB')).toBe('Someone · 14:02');
  });
});
