import { Service, signal } from '@angular/core';

const KEY = 'lister.runs.doneSection';

/** Whether checked run items move into a "Done" section (D12), remembered on this device. */
@Service()
export class DoneSectionPreference {
  readonly on = signal(read());

  set(on: boolean): void {
    this.on.set(on);
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      // Storage blocked: it holds for this visit only.
    }
  }
}

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}
