import { Component, computed, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import {
  IOS_INSTALL_STEPS,
  InstallPrompt,
  StoragePersistence,
} from '@lister/web/util-pwa';

/** The "App" part of the Space page: installing Lister and whether the browser keeps its data. */
@Component({
  selector: 'lister-app-section',
  imports: [MatButton, MatIcon],
  templateUrl: './app-section.html',
  styleUrl: './app-section.scss',
})
export class AppSection {
  protected readonly installPrompt = inject(InstallPrompt);
  private readonly persistence = inject(StoragePersistence);
  protected readonly iosSteps = IOS_INSTALL_STEPS;

  protected readonly storage = computed(() => {
    switch (this.persistence.state()) {
      case 'granted':
        return 'Granted: the browser keeps this device’s data';
      case 'denied':
        return 'Not granted: the browser may clear unsynced changes when storage runs low';
      case 'unsupported':
        return 'Not supported by this browser';
      default:
        return 'Not requested yet: asked after your first sync';
    }
  });
}
