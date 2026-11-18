import { Component, computed, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import {
  type DiagnosticEntry,
  Diagnostics,
  DiagnosticsExport,
  type ExportOutcome,
} from '@lister/web/util-diagnostics';
import { NOTICE_DURATION_MS, Notifier } from '@lister/web/util-notify';
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
  private readonly notifier = inject(Notifier);
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
    let file: File;
    // Busy only while the file is built: a share sheet that never answers must not lock the
    // buttons.
    this.logBusy.set(true);
    try {
      file = await this.diagnosticsExport.build();
    } catch {
      this.logMessage.set('The diagnostic log could not be exported');
      return;
    } finally {
      this.logBusy.set(false);
    }
    let outcome: ExportOutcome;
    try {
      outcome = await this.diagnosticsExport.deliver(file);
    } catch {
      this.logMessage.set('The diagnostic log could not be exported');
      return;
    }
    this.logMessage.set(
      outcome === 'cancelled'
        ? 'Sharing cancelled'
        : outcome === 'shared'
          ? 'Diagnostic log shared'
          : 'Diagnostic log downloaded',
    );
  }

  protected async clearLog(): Promise<void> {
    this.logBusy.set(true);
    let removed: DiagnosticEntry[];
    try {
      removed = await this.diagnostics.clear();
    } catch {
      this.logMessage.set('The diagnostic log could not be cleared');
      return;
    } finally {
      this.logBusy.set(false);
    }
    this.logMessage.set('Diagnostic log cleared');
    const outcome = await this.notifier.notify({
      message: 'Diagnostic log cleared',
      action: 'Undo',
      duration: NOTICE_DURATION_MS,
    });
    if (outcome !== 'action') return;
    try {
      await this.diagnostics.restore(removed);
      this.logMessage.set('Diagnostic log restored');
    } catch {
      this.logMessage.set('The diagnostic log could not be restored');
    }
  }
}
