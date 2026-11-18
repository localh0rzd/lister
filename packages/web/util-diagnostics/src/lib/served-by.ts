/** What the browser's resource timing says about how a request was served (best effort). */
export function servedBy(
  url: string,
  startedAt: number,
): Record<string, boolean | undefined> {
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
