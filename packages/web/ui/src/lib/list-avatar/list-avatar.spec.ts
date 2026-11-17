import { TestBed } from '@angular/core/testing';
import { ListAvatar } from './list-avatar';

async function render(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(ListAvatar);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('ListAvatar', () => {
  it('shows the icon on the colour', async () => {
    const element = await render({
      colour: 'teal',
      icon: 'camping',
      title: 'x',
    });
    expect(element.getAttribute('data-colour')).toBe('teal');
    expect(element.querySelector('mat-icon')?.textContent).toBe('camping');
  });

  it('shows the first letter of the title when there is no icon', async () => {
    const element = await render({ title: '  élan' });
    expect(element.hasAttribute('data-colour')).toBe(false);
    expect(element.querySelector('mat-icon')).toBeNull();
    expect(element.textContent?.trim()).toBe('É');
  });

  it('is hidden from assistive technology: the title sits beside it', async () => {
    expect((await render({})).getAttribute('aria-hidden')).toBe('true');
  });
});
