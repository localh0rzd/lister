import { TestBed } from '@angular/core/testing';
import { Transfers } from '../transfers';
import { ImportButton } from './import-button';

describe('ImportButton', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('opens the file picker and hands the picked file to the import', async () => {
    const importFile = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [{ provide: Transfers, useValue: { importFile } }],
    });
    const fixture = TestBed.createComponent(ImportButton);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');

    el.querySelector('button')?.click();
    expect(click).toHaveBeenCalled();
    expect(el.querySelector('button')?.textContent).toContain('Import');
    expect(input.accept).toContain('.json');

    const file = new File(['# A'], 'a.md');
    Object.defineProperty(input, 'files', {
      value: { item: () => file },
      configurable: true,
    });
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(importFile).toHaveBeenCalledWith(file);
  });
});
