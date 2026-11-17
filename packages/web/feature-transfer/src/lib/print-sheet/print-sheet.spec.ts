import { TestBed } from '@angular/core/testing';
import { PrintSheet } from './print-sheet';

describe('PrintSheet', () => {
  function render(
    groups: PrintSheet['groups'] extends never ? never : unknown[],
  ) {
    const fixture = TestBed.createComponent(PrintSheet);
    fixture.componentRef.setInput('title', 'Alps');
    fixture.componentRef.setInput('groups', groups);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('prints the title, headings and items with quantity and note', () => {
    const el = render([
      {
        key: 'a',
        title: null,
        items: [{ id: '1', title: 'Tent', quantity: '2', note: 'big' }],
      },
      {
        key: 'b',
        title: 'Toiletries',
        items: [{ id: '2', title: 'Soap', quantity: '', note: '' }],
      },
    ]);

    expect(el.querySelector('h1')?.textContent).toBe('Alps');
    expect(el.querySelector('h2')?.textContent).toBe('Toiletries');
    expect(el.querySelectorAll('li')).toHaveLength(2);
    expect(el.querySelector('li')?.textContent).toMatch(/Tent\s*× 2\s*— big/);
    expect(el.querySelector('.mark')).toBeNull();
  });

  it('prints the check state of a run item, as text rather than colour', () => {
    const el = render([
      {
        key: 'a',
        title: null,
        items: [
          { id: '1', title: 'Tent', quantity: '', note: '', state: 'checked' },
          { id: '2', title: 'Stove', quantity: '', note: '', state: 'skipped' },
          {
            id: '3',
            title: 'Lamp',
            quantity: '',
            note: '',
            state: 'unchecked',
          },
        ],
      },
    ]);

    const rows = [...el.querySelectorAll('li')].map((li) =>
      li.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(rows).toEqual(['☑Tent', '⊘Stove(skipped)', '☐Lamp']);
  });

  it('says so when there are no items', () => {
    expect(render([]).textContent).toContain('No items.');
  });
});
