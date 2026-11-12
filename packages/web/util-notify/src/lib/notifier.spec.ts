import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { NOTICE_DURATION_MS, Notifier } from './notifier';

/** A MatSnackBar stand-in that shows one snackbar at a time, like the real one. */
class FakeSnackBar {
  readonly shown: { message: string; action?: string; duration?: number }[] =
    [];
  private current?: { action: Subject<void>; dismissed: Subject<void> };

  open(message: string, action?: string, config?: { duration?: number }) {
    this.current?.dismissed.next(); // a new one replaces the current one
    const ref = { action: new Subject<void>(), dismissed: new Subject<void>() };
    this.current = ref;
    this.shown.push({ message, action, duration: config?.duration });
    return {
      onAction: () => ref.action,
      afterDismissed: () => ref.dismissed,
      dismiss: () => this.close(ref),
    };
  }

  /** The user taps the action. */
  act() {
    const ref = this.current;
    ref?.action.next();
    if (ref) this.close(ref);
  }

  /** The duration runs out (or the user swipes it away). */
  expire() {
    if (this.current) this.close(this.current);
  }

  get visible() {
    return this.current ? this.shown.at(-1)?.message : undefined;
  }

  private close(ref: { dismissed: Subject<void> }) {
    if (this.current === ref) this.current = undefined;
    ref.dismissed.next();
  }
}

let snackBar: FakeSnackBar;
let notifier: Notifier;

beforeEach(() => {
  snackBar = new FakeSnackBar();
  TestBed.configureTestingModule({
    providers: [{ provide: MatSnackBar, useValue: snackBar }],
  });
  notifier = TestBed.inject(Notifier);
});

describe('Notifier', () => {
  it('shows timed notices one after another, none lost', async () => {
    const first = notifier.notify({
      message: 'Deleted A',
      action: 'Undo',
      duration: NOTICE_DURATION_MS,
    });
    const second = notifier.notify({
      message: 'Deleted B',
      action: 'Undo',
      duration: NOTICE_DURATION_MS,
    });
    expect(snackBar.visible).toBe('Deleted A');

    snackBar.act();
    expect(await first).toBe('action');
    expect(snackBar.visible).toBe('Deleted B');

    snackBar.expire();
    expect(await second).toBe('dismissed');
    expect(snackBar.visible).toBeUndefined();
  });

  it('lets a sticky notice make way and brings it back afterwards', async () => {
    const update = notifier.notify({
      message: 'New version available',
      action: 'Reload',
    });
    expect(snackBar.visible).toBe('New version available');

    const undo = notifier.notify({
      message: 'Deleted A',
      action: 'Undo',
      duration: 6000,
    });
    expect(snackBar.visible).toBe('Deleted A');

    snackBar.act();
    expect(await undo).toBe('action');
    expect(snackBar.visible).toBe('New version available');

    snackBar.act();
    expect(await update).toBe('action');
  });

  it('waits with a sticky notice while timed ones are showing', () => {
    void notifier.notify({ message: 'Deleted A', duration: 6000 });
    void notifier.notify({
      message: 'New version available',
      action: 'Reload',
    });

    expect(snackBar.visible).toBe('Deleted A');
    snackBar.expire();
    expect(snackBar.visible).toBe('New version available');
  });

  it('replaces an older sticky notice with a newer one', async () => {
    const old = notifier.notify({ message: 'Old prompt' });
    void notifier.notify({ message: 'New prompt' });
    snackBar.expire();

    expect(await old).toBe('dismissed');
    expect(snackBar.shown.map((s) => s.message)).toContain('New prompt');
  });
});
