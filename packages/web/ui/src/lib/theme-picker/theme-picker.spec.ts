import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonToggleGroupHarness } from '@angular/material/button-toggle/testing';
import { ThemePicker } from './theme-picker';

async function setup(value: 'system' | 'light' | 'dark') {
  const fixture = TestBed.createComponent(ThemePicker);
  fixture.componentRef.setInput('value', value);
  await fixture.whenStable();
  const group = await TestbedHarnessEnvironment.loader(fixture).getHarness(
    MatButtonToggleGroupHarness,
  );
  return { fixture, group };
}

describe('ThemePicker', () => {
  it('offers System, Light and Dark and marks the current one', async () => {
    const { group } = await setup('light');
    const toggles = await group.getToggles();

    expect(await Promise.all(toggles.map((t) => t.getText()))).toEqual([
      'brightness_auto System',
      'light_mode Light',
      'dark_mode Dark',
    ]);
    expect(await Promise.all(toggles.map((t) => t.isChecked()))).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('emits the chosen preference', async () => {
    const { fixture, group } = await setup('system');
    const chosen: string[] = [];
    fixture.componentInstance.value.subscribe((v) => chosen.push(v));

    const [dark] = await group.getToggles({ text: /Dark/ });
    await dark.check();

    expect(chosen).toEqual(['dark']);
    expect(await dark.isChecked()).toBe(true);
  });

  it('labels the group for assistive technology', async () => {
    const { fixture } = await setup('system');
    const group = (fixture.nativeElement as HTMLElement).querySelector(
      '[role="radiogroup"]',
    );

    expect(group?.getAttribute('aria-label')).toBe('Theme');
  });
});
