import { TestBed } from '@angular/core/testing';
import { DoneSectionPreference } from './done-section-preference';

afterEach(() => {
  localStorage.clear();
  TestBed.resetTestingModule();
});

describe('DoneSectionPreference (D12)', () => {
  it('is off by default', () => {
    expect(TestBed.inject(DoneSectionPreference).on()).toBe(false);
  });

  it('is remembered on the device', () => {
    TestBed.inject(DoneSectionPreference).set(true);
    TestBed.resetTestingModule();
    expect(TestBed.inject(DoneSectionPreference).on()).toBe(true);
  });

  it('still works for this visit when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const preference = TestBed.inject(DoneSectionPreference);
    preference.set(true);
    expect(preference.on()).toBe(true);
    vi.restoreAllMocks();
  });
});
