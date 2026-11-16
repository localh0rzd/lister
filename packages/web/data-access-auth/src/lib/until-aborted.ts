/**
 * Settles with `promise`, or rejects as soon as `signal` aborts, whichever is first. A browser
 * ceremony (and the password manager extensions that replace it) may never answer, not even to
 * its abort signal; whoever waits for it, and anything waiting for them (a form's `submit()`
 * refuses another submit until its action has settled), must not wait for it forever.
 */
export function untilAborted<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}
