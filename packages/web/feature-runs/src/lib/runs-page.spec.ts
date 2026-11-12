import { TestBed } from '@angular/core/testing';
import { RunsPage } from './runs-page';

describe('RunsPage', () => {
  it('shows the Runs heading', async () => {
    const fixture = TestBed.createComponent(RunsPage);
    await fixture.whenStable();

    const heading = (fixture.nativeElement as HTMLElement).querySelector('h1');
    expect(heading?.textContent).toBe('Runs');
  });
});
