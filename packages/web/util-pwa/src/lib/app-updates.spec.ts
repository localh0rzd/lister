import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SwUpdate, type VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import {
  AppUpdates,
  PAGE_RELOAD,
  UPDATE_CHECK_INTERVAL_MS,
} from './app-updates';

function setup({ enabled = true } = {}) {
  const versionUpdates = new Subject<VersionEvent>();
  const unrecoverable = new Subject<{
    type: 'UNRECOVERABLE_STATE';
    reason: string;
  }>();
  const action = new Subject<void>();
  const dismissed = new Subject<void>();
  const swUpdate = {
    isEnabled: enabled,
    versionUpdates,
    unrecoverable,
    checkForUpdate: vi.fn(() => Promise.resolve(false)),
  };
  const snackBar = {
    open: vi.fn(() => ({
      onAction: () => action,
      afterDismissed: () => dismissed,
    })),
  };
  const reload = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: SwUpdate, useValue: swUpdate },
      { provide: MatSnackBar, useValue: snackBar },
      { provide: PAGE_RELOAD, useValue: reload },
    ],
  });
  TestBed.inject(AppUpdates);
  return {
    versionUpdates,
    unrecoverable,
    action,
    dismissed,
    swUpdate,
    snackBar,
    reload,
  };
}

const versionReady: VersionEvent = {
  type: 'VERSION_READY',
  currentVersion: { hash: 'a' },
  latestVersion: { hash: 'b' },
};

describe('AppUpdates', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('offers a reload when a new version is ready', () => {
    const { versionUpdates, action, snackBar, reload } = setup();

    versionUpdates.next(versionReady);
    expect(snackBar.open).toHaveBeenCalledWith(
      'New version available',
      'Reload',
    );
    expect(reload).not.toHaveBeenCalled();

    action.next();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('stays quiet while a version is only detected or fails to install', () => {
    const { versionUpdates, snackBar } = setup();

    versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'b' } });
    versionUpdates.next({
      type: 'VERSION_INSTALLATION_FAILED',
      version: { hash: 'b' },
      error: 'offline',
    });
    versionUpdates.next({
      type: 'NO_NEW_VERSION_DETECTED',
      version: { hash: 'a' },
    });

    expect(snackBar.open).not.toHaveBeenCalled();
  });

  it('offers a reload when the cached version is broken', () => {
    const { unrecoverable, action, snackBar, reload } = setup();

    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'gone' });

    expect(snackBar.open).toHaveBeenCalledWith(
      'Lister needs to reload to keep working',
      'Reload',
    );
    action.next();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('checks for updates hourly and when the app becomes visible again', () => {
    vi.useFakeTimers();
    const { swUpdate } = setup();
    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(1);

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(1);

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(2);
  });

  it('offers the update again after another snackbar replaced the prompt', () => {
    vi.useFakeTimers();
    const { versionUpdates, dismissed, snackBar, swUpdate } = setup();
    versionUpdates.next(versionReady);
    expect(snackBar.open).toHaveBeenCalledTimes(1);

    // e.g. an Undo snackbar replaced it
    dismissed.next();
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);

    expect(snackBar.open).toHaveBeenCalledTimes(2);
    expect(snackBar.open).toHaveBeenLastCalledWith(
      'New version available',
      'Reload',
    );
    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();
  });

  it('does not stack the prompt while it is still showing', () => {
    vi.useFakeTimers();
    const { versionUpdates, snackBar } = setup();
    versionUpdates.next(versionReady);

    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);

    expect(snackBar.open).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a service worker (dev server, unsupported browser)', () => {
    vi.useFakeTimers();
    const { versionUpdates, swUpdate, snackBar } = setup({ enabled: false });

    versionUpdates.next(versionReady);
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);

    expect(snackBar.open).not.toHaveBeenCalled();
    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();
  });
});
