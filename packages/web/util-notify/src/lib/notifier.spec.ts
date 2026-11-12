import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { MIN_NOTICE_MS, NOTICE_DURATION_MS, Notifier } from './notifier';

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
  it('shows timed notices in order, none lost, the newer one soon', async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
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

    // A is cut short once it has shown for the minimum time.
    vi.advanceTimersByTime(MIN_NOTICE_MS - 1);
    expect(snackBar.visible).toBe('Deleted A');
    vi.advanceTimersByTime(1);
    expect(snackBar.visible).toBe('Deleted B');
    expect(await first).toBe('dismissed');

    snackBar.act();
    expect(await second).toBe('action');
    expect(snackBar.visible).toBeUndefined();
  });

  it('settles a notice the user acts on before it is cut short', async () => {
    const first = notifier.notify({
      message: 'Deleted A',
      action: 'Undo',
      duration: NOTICE_DURATION_MS,
    });
    void notifier.notify({
      message: 'Deleted B',
      action: 'Undo',
      duration: NOTICE_DURATION_MS,
    });

    snackBar.act();

    expect(await first).toBe('action');
    expect(snackBar.visible).toBe('Deleted B');
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

  it('replaces a visible sticky notice at once; the new one takes the action', async () => {
    const old = notifier.notify({
      message: 'New version available',
      action: 'Reload',
    });
    const replacement = notifier.notify({
      message: 'Lister needs to reload',
      action: 'Reload',
    });

    expect(await old).toBe('dismissed');
    expect(snackBar.visible).toBe('Lister needs to reload');

    snackBar.act();
    expect(await replacement).toBe('action');
    expect(snackBar.visible).toBeUndefined();
  });
});
