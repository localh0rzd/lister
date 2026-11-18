import { Component, computed, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { DiagnosticsExport, Diagnostics } from '@lister/web/util-diagnostics';
import {
  IOS_INSTALL_STEPS,
  InstallPrompt,
  StoragePersistence,
} from '@lister/web/util-pwa';

/** The "App" part of the Settings page: installing Lister and whether the browser keeps its data. */
@Component({
  selector: 'lister-app-section',
  imports: [MatButton, MatIcon],
  templateUrl: './app-section.html',
  styleUrl: './app-section.scss',
})
export class AppSection {
  protected readonly installPrompt = inject(InstallPrompt);
  private readonly persistence = inject(StoragePersistence);
  private readonly diagnosticsExport = inject(DiagnosticsExport);
  private readonly diagnostics = inject(Diagnostics);
  protected readonly iosSteps = IOS_INSTALL_STEPS;
  /** What the diagnostic log buttons last did, for screen readers and the user. */
  protected readonly logMessage = signal('');
  protected readonly logBusy = signal(false);

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

  protected async exportLog(): Promise<void> {
    await this.runLogAction(async () => {
      const outcome = await this.diagnosticsExport.export();
      return outcome === 'cancelled'
        ? 'Sharing cancelled'
        : outcome === 'shared'
          ? 'Diagnostic log shared'
          : 'Diagnostic log downloaded';
    }, 'The diagnostic log could not be exported');
  }

  protected async clearLog(): Promise<void> {
    await this.runLogAction(async () => {
      await this.diagnostics.clear();
      return 'Diagnostic log cleared';
    }, 'The diagnostic log could not be cleared');
  }

  private async runLogAction(
    action: () => Promise<string>,
    failure: string,
  ): Promise<void> {
    this.logBusy.set(true);
    try {
      this.logMessage.set(await action());
    } catch {
      this.logMessage.set(failure);
    } finally {
      this.logBusy.set(false);
    }
  }
}
