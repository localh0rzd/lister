/**
 * A reject reason as it may appear in a log line. Reasons quote user text: list titles in
 * `“…”` (`“Packing” is already included`) and, from Zod, client-sent keys in `"…"`
 * (`Unrecognized key: "…"`). Each quoted part is masked from its first opening quote to its last
 * closing one (the fixed text around it has no quotes), then control characters are replaced, so
 * a client can't add lines to the log, and the result is capped.
 */
export function logReason(reason: string): string {
  const masked = reason
    .replace(/“.*”/su, '“…”')
    .replace(/".*"/su, '"…"')
    .replace(/\p{Cc}/gu, '?');
  return masked.length > 200 ? `${masked.slice(0, 200)}…` : masked;
}
