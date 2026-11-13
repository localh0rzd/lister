import {
  DestroyRef,
  Directive,
  ElementRef,
  Renderer2,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { AriaDescriber } from '@angular/cdk/a11y';
import { Platform } from '@angular/cdk/platform';
import { MatTooltip } from '@angular/material/tooltip';

/** How long a finger has to rest on a cut-off title before its tooltip shows (Material's default). */
export const LONG_PRESS_MS = 500;
/** How long the tooltip stays after the finger lifts (Material's default). */
export const TOUCH_HIDE_DELAY_MS = 1500;
/** A finger that moves further than this is scrolling, not pressing. */
const MOVE_TOLERANCE_PX = 10;

/**
 * Shows the element's full text in a Material tooltip, but only while it is cut off with an
 * ellipsis (`scrollWidth > clientWidth`): on hover, on keyboard focus and on a long-press. The
 * element keeps its text as its own content, so screen readers read it from there; the tooltip is
 * not announced a second time.
 *
 * The cut-off element is the host, or the element bound to the directive when the host is a
 * focusable wrapper around it (`<button [listerTruncatedTooltip]="title"><span #title>…`).
 *
 * Re-measures when that element is resized (viewport, rail ↔ bar layout), when its text changes
 * (edits arriving through sync) and once the web fonts have loaded.
 *
 * The long-press is our own, not MatTooltip's: Material's sets `touch-action: none` on the element,
 * which stops a page from scrolling when a swipe starts on a title.
 */
@Directive({
  selector: '[listerTruncatedTooltip]',
  hostDirectives: [MatTooltip],
  // The text is already in the DOM, so the tooltip must not also describe the element with it.
  providers: [
    {
      provide: AriaDescriber,
      useValue: {
        describe: () => undefined,
        removeDescription: () => undefined,
        ngOnDestroy: () => undefined,
      },
    },
  ],
  host: {
    // While a cut-off title can be long-pressed, the press shows the tooltip instead of selecting
    // text or opening the iOS link preview.
    '[style.user-select]': 'pressable() ? "none" : null',
    '[style.-webkit-user-select]': 'pressable() ? "none" : null',
    '[style.-webkit-touch-callout]': 'pressable() ? "none" : null',
  },
})
export class TruncatedTooltip {
  /** The element whose text is cut off; the host when left empty. */
  readonly target = input(undefined, {
    alias: 'listerTruncatedTooltip',
    transform: (value: HTMLElement | '' | null | undefined) =>
      value || undefined,
  });

  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly tooltip = inject(MatTooltip);
  private readonly renderer = inject(Renderer2);
  private readonly platform = inject(Platform);
  private readonly truncated = signal(false);
  protected readonly pressable = computed(
    () => this.truncated() && (this.platform.IOS || this.platform.ANDROID),
  );

  private pressTimer: ReturnType<typeof setTimeout> | undefined;
  private pressStart: { x: number; y: number } | undefined;
  /** The current touch showed the tooltip, so the click it ends with is not an activation. */
  private pressShown = false;
  private destroyed = false;

  constructor() {
    this.tooltip.disabled = true;
    this.tooltip.touchGestures = 'off';
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const element = this.element();
      this.measure();
      const resize =
        typeof ResizeObserver === 'undefined'
          ? undefined
          : new ResizeObserver(() => this.measure());
      resize?.observe(element);
      const mutation = new MutationObserver(() => this.measure());
      mutation.observe(element, {
        childList: true,
        characterData: true,
        subtree: true,
      });
      // The fallback font has other widths: measure again once the real one is there.
      void globalThis.document?.fonts?.ready.then(() => {
        if (!this.destroyed) this.measure();
      });
      const passive = { passive: true };
      const listeners = [
        this.renderer.listen(
          this.host,
          'touchstart',
          (e: TouchEvent) => this.touchStart(e),
          passive,
        ),
        this.renderer.listen(
          this.host,
          'touchmove',
          (e: TouchEvent) => this.touchMove(e),
          passive,
        ),
        this.renderer.listen(
          this.host,
          'touchend',
          () => this.touchEnd(),
          passive,
        ),
        this.renderer.listen(
          this.host,
          'touchcancel',
          () => this.touchEnd(),
          passive,
        ),
        // Android opens its link menu on a long-press: the tooltip is what the press is for.
        this.renderer.listen(this.host, 'contextmenu', (e: Event) => {
          if (this.pressStart && !this.tooltip.disabled) {
            e.preventDefault();
            this.showForPress();
          }
        }),
        // Capture, so it runs before the host's own click handlers (RouterLink, `(click)`).
        this.renderer.listen(
          this.host,
          'click',
          (e: Event) => {
            if (!this.pressShown) return;
            this.pressShown = false;
            e.preventDefault();
            e.stopImmediatePropagation();
          },
          { capture: true },
        ),
      ];
      destroyRef.onDestroy(() => {
        this.destroyed = true;
        this.cancelPress();
        resize?.disconnect();
        mutation.disconnect();
        listeners.forEach((stop) => stop());
      });
    });
  }

  private element(): HTMLElement {
    return this.target() ?? this.host;
  }

  private measure(): void {
    const element = this.element();
    const text = element.textContent?.trim() ?? '';
    const truncated = text !== '' && element.scrollWidth > element.clientWidth;
    this.tooltip.message = text;
    this.tooltip.disabled = !truncated;
    this.truncated.set(truncated);
  }

  private touchStart(event: TouchEvent): void {
    this.cancelPress();
    this.pressShown = false;
    const touch = event.touches[0];
    if (this.tooltip.disabled || event.touches.length !== 1 || !touch) return;
    this.pressStart = { x: touch.clientX, y: touch.clientY };
    this.pressTimer = setTimeout(() => this.showForPress(), LONG_PRESS_MS);
  }

  private touchMove(event: TouchEvent): void {
    const touch = event.touches[0];
    if (!this.pressStart || !touch) return;
    const moved = Math.hypot(
      touch.clientX - this.pressStart.x,
      touch.clientY - this.pressStart.y,
    );
    if (moved > MOVE_TOLERANCE_PX) this.cancelPress();
  }

  private touchEnd(): void {
    this.cancelPress();
    if (this.pressShown) this.tooltip.hide(TOUCH_HIDE_DELAY_MS);
  }

  private showForPress(): void {
    clearTimeout(this.pressTimer);
    this.pressTimer = undefined;
    if (this.pressShown) return;
    this.pressShown = true;
    this.tooltip.show(0);
  }

  private cancelPress(): void {
    clearTimeout(this.pressTimer);
    this.pressTimer = undefined;
    this.pressStart = undefined;
  }
}
