import { TestBed } from '@angular/core/testing';
import { ListsPage } from './lists-page';

describe('ListsPage', () => {
  it('shows the Lists heading', async () => {
    const fixture = TestBed.createComponent(ListsPage);
    await fixture.whenStable();

    const heading = (fixture.nativeElement as HTMLElement).querySelector('h1');
    expect(heading?.textContent).toBe('Lists');
  });
});
