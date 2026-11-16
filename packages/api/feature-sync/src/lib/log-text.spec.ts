import { logReason } from './log-text';

describe('logReason', () => {
  it.each([
    ['“Medication” is already included', '“…” is already included'],
    [
      'That would make a loop: “A” already contains “B”',
      'That would make a loop: “…”',
    ],
    ['“Odd ” title” is already included', '“…” is already included'],
    ['Unrecognized key: "evil\nkey [Nest] FAKE"', 'Unrecognized key: "…"'],
    ['Unrecognized keys: "a", "b"', 'Unrecognized keys: "…"'],
    ["This space doesn't exist", "This space doesn't exist"],
    ['line\nbreak\r\tand\u001b[31m', 'line?break??and?[31m'],
  ])('logs %j as %j', (reason, expected) => {
    expect(logReason(reason)).toBe(expected);
  });

  it('caps long reasons', () => {
    expect(logReason('x'.repeat(500))).toBe(`${'x'.repeat(200)}…`);
  });
});
