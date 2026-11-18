import { DOCUMENT, Service, inject } from '@angular/core';
import { Diagnostics } from './diagnostics';
import { formatReport, reportFilename } from './format-log';

export type ExportOutcome = 'shared' | 'downloaded' | 'cancelled';

/**
 * Hands the log to the user as one text file: the share sheet on a phone (where Web Share can
 * send files), a download everywhere else or when sharing is refused. Reads only the device's
 * own IndexedDB, so it works offline.
 */
@Service()
export class DiagnosticsExport {
  private readonly diagnostics = inject(Diagnostics);
  private readonly document = inject(DOCUMENT);

  /** Builds the file and shares or downloads it. */
  async export(): Promise<ExportOutcome> {
    const win = this.document.defaultView;
    const entries = await this.diagnostics.entries();
    const text = formatReport(await this.diagnostics.header(), entries);
    const name = reportFilename(new Date());
    const file = new File([text], name, { type: 'text/plain' });

    const nav = win?.navigator;
    // Desktop browsers that can share still do better with a plain download.
    const phone = win?.matchMedia?.('(pointer: coarse)').matches === true;
    if (phone && nav?.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: 'Lister diagnostic log' });
        return 'shared';
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError')
          return 'cancelled';
        // Refused (no user gesture left, unsupported): download instead.
      }
    }
    this.download(file);
    return 'downloaded';
  }

  private download(file: File): void {
    const url = URL.createObjectURL(file);
    const link = this.document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    // The browser has started the download by the time the click returns.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
