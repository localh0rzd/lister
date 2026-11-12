import { Component, input, model } from '@angular/core';
import {
  MatButtonToggle,
  MatButtonToggleGroup,
} from '@angular/material/button-toggle';
import { MatIcon } from '@angular/material/icon';
import {
  THEME_PREFERENCES,
  type ThemePreference,
} from '@lister/web/util-theme';

const OPTION_DETAILS: Record<ThemePreference, { label: string; icon: string }> =
  {
    system: { label: 'System', icon: 'brightness_auto' },
    light: { label: 'Light', icon: 'light_mode' },
    dark: { label: 'Dark', icon: 'dark_mode' },
  };
const OPTIONS = THEME_PREFERENCES.map((value) => ({
  value,
  ...OPTION_DETAILS[value],
}));

/** Choose System, Light or Dark (Space › Appearance in the mock-ups). */
@Component({
  selector: 'lister-theme-picker',
  imports: [MatButtonToggleGroup, MatButtonToggle, MatIcon],
  template: `
    <mat-button-toggle-group
      [value]="value()"
      (change)="value.set($event.value)"
      [attr.aria-label]="label()"
      hideSingleSelectionIndicator
    >
      @for (option of options; track option.value) {
        <mat-button-toggle [value]="option.value">
          <mat-icon aria-hidden="true">{{ option.icon }}</mat-icon>
          {{ option.label }}
        </mat-button-toggle>
      }
    </mat-button-toggle-group>
  `,
  styles: `
    mat-icon {
      vertical-align: middle;
      margin-inline-end: 4px;
    }
  `,
})
export class ThemePicker {
  readonly value = model.required<ThemePreference>();
  readonly label = input('Theme');
  protected readonly options = OPTIONS;
}
