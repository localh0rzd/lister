import type { DiagnosticEntry } from './diagnostic-entry';

/** `2026-11-18T10:00:00.123Z [tab a1b2c3d4 *] socket.connect {"sid":"abc"}`; `*` marks a leader. */
export function formatEntry(entry: DiagnosticEntry): string {
  const data =
    entry.data && Object.keys(entry.data).length > 0
      ? ` ${JSON.stringify(entry.data)}`
      : '';
  const lead = entry.leader ? ' *' : '';
  return `${new Date(entry.at).toISOString()} [${entry.tab}${lead}] ${entry.area}.${entry.event}${data}`;
}

/** The export file: a `#` header of device facts, a blank line, then one line per entry. */
export function formatReport(
  header: Readonly<Record<string, string>>,
  entries: readonly DiagnosticEntry[],
): string {
  const lines = ['# Lister diagnostic log'];
  for (const [key, value] of Object.entries(header))
    lines.push(`# ${key}: ${value}`);
  lines.push(
    '# Entries: oldest first; "*" after the tab id marks the tab that led sync.',
  );
  lines.push('', ...entries.map(formatEntry), '');
  return lines.join('\n');
}

/** `lister-diagnostic-2026-11-18.log` */
export function reportFilename(now: Date): string {
  return `lister-diagnostic-${now.toISOString().slice(0, 10)}.log`;
}
