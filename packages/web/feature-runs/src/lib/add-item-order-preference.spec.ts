import { TestBed } from '@angular/core/testing';
import { AddItemOrderPreference } from './add-item-order-preference';

describe('AddItemOrderPreference', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('adds at the end until told otherwise', () => {
    expect(TestBed.inject(AddItemOrderPreference).order()).toBe('end');
  });

  it('remembers the choice for the next visit', () => {
    TestBed.inject(AddItemOrderPreference).set('sorted');
    TestBed.resetTestingModule();

    expect(TestBed.inject(AddItemOrderPreference).order()).toBe('sorted');
  });

  it('ignores a value it does not know', () => {
    localStorage.setItem('lister.addItemOrder', 'sideways');
    expect(TestBed.inject(AddItemOrderPreference).order()).toBe('end');
  });
});
