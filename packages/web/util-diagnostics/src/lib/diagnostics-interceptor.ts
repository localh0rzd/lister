import {
  HttpErrorResponse,
  type HttpInterceptorFn,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { Diagnostics } from './diagnostics';
import { pathOf } from './redact';

/** What the browser's resource timing says about how a request was served (best effort). */
function servedBy(
  url: string,
  startedAt: number,
): Record<string, boolean | string | undefined> {
  try {
    const timing = performance
      .getEntriesByName(new URL(url, location.href).href)
      // Only this request's entry: earlier requests to the same URL have one too.
      .filter((entry) => entry.startTime >= startedAt - 1)
      .at(-1) as
      (PerformanceResourceTiming & { deliveryType?: string }) | undefined;
    if (!timing) return {};
    return {
      viaServiceWorker: timing.workerStart > 0,
      fromCache: timing.deliveryType === 'cache',
    };
  } catch {
    // Resource timing is optional; logging must never break a request.
    return {};
  }
}

/**
 * Logs every REST call (`rest.start`, then `rest.end` with status and duration, or `rest.error`
 * with the network error): method and path only, never the query, headers or bodies. The `Date`
 * header of an answer also gives the server time offset for the export's header.
 */
export const diagnosticsInterceptor: HttpInterceptorFn = (request, next) => {
  const diagnostics = inject(Diagnostics);
  const method = request.method;
  const path = pathOf(request.urlWithParams);
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  diagnostics.log('rest', 'start', { method, path });
  return next(request).pipe(
    tap({
      next: (event) => {
        if (!(event instanceof HttpResponse)) return;
        const date = Date.parse(event.headers.get('date') ?? '');
        if (!Number.isNaN(date))
          diagnostics.serverTimeOffsetMs = date - Date.now();
        diagnostics.log('rest', 'end', {
          method,
          path,
          status: event.status,
          ms: elapsed(),
          ...servedBy(request.urlWithParams, started),
        });
      },
      error: (error: unknown) => {
        const status = error instanceof HttpErrorResponse ? error.status : -1;
        diagnostics.log('rest', 'error', {
          method,
          path,
          status,
          // Status 0 is a network failure: no answer reached the page.
          network: status === 0,
          ms: elapsed(),
          name: error instanceof Error ? error.name : typeof error,
          statusText:
            error instanceof HttpErrorResponse ? error.statusText : undefined,
          ...servedBy(request.urlWithParams, started),
        });
      },
    }),
  );
};
