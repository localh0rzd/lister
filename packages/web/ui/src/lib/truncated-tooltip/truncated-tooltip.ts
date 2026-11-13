import {
  DestroyRef,
  Directive,
  ElementRef,
  afterNextRender,
  inject,
} from '@angular/core';
import { AriaDescriber } from '@angular/cdk/a11y';
import { MatTooltip } from '@angular/material/tooltip';

/**
 * Shows the element's full text in a Material tooltip, but only while it is cut off with an
 * ellipsis (`scrollWidth > clientWidth`). The element keeps its text as its own content, so
 * screen readers read it from there; the tooltip is not announced a second time.
 *
 * Re-measures when the element is resized (viewport, rail ↔ bar layout) and when its text
 * changes (edits arriving through sync).
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
})
export class TruncatedTooltip {
  private readonly element =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly tooltip = inject(MatTooltip);

  constructor() {
    this.tooltip.disabled = true;
    this.tooltip.touchGestures = 'on';
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.measure();
      const resize =
        typeof ResizeObserver === 'undefined'
          ? undefined
          : new ResizeObserver(() => this.measure());
      resize?.observe(this.element);
      const mutation = new MutationObserver(() => this.measure());
      mutation.observe(this.element, {
        childList: true,
        characterData: true,
        subtree: true,
      });
      destroyRef.onDestroy(() => {
        resize?.disconnect();
        mutation.disconnect();
      });
    });
  }

  private measure(): void {
    const text = this.element.textContent?.trim() ?? '';
    this.tooltip.message = text;
    this.tooltip.disabled =
      text === '' || this.element.scrollWidth <= this.element.clientWidth;
  }
}
