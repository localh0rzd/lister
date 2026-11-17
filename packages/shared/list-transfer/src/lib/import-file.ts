import { LIMITS, cleanItemLines } from '@lister/shared/domain';
import {
  type ListExport,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  listExportSchema,
} from './export-format';

/** The largest import file read (a list of thousands of items is far smaller). */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** What a picked file holds. */
export type ImportFile =
  | { kind: 'text'; title: string; items: string[] }
  | { kind: 'lists'; file: ListExport }
  | { kind: 'error'; message: string };

const HEADING = /^\s{0,3}#{1,6}(?:\s+(.*?))?\s*#*\s*$/;

/**
 * Markdown or plain text as one list (D24, D18): the title is the first heading, else the file
 * name without its extension; every other heading is dropped, and the rest is one item per
 * line, as a paste.
 */
export function parseTextList(
  text: string,
  fileName: string,
): { title: string; items: string[] } {
  let heading: string | undefined;
  const rest: string[] = [];
  for (const line of text.split(/\r\n|\r|\n/)) {
    const match = HEADING.exec(line);
    if (!match) rest.push(line);
    else heading ??= match[1];
  }
  const fallback = fileName.replace(/\.[^.]*$/, '');
  const title = [heading, fallback, 'Imported list']
    .map(cleanTitle)
    .find((candidate) => candidate !== '') as string;
  return { title, items: cleanItemLines(rest.join('\n')) };
}

/** One line without control characters, cut to the title limit (code points). */
function cleanTitle(text: string | undefined): string {
  // eslint-disable-next-line no-control-regex -- titles must not hold control characters
  const clean = (text ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
  return [...clean.replace(/\s+/g, ' ').trim()]
    .slice(0, LIMITS.title)
    .join('')
    .trim();
}

/** A Lister JSON export, checked: its format, its version and every field. */
export function parseListExport(
  text: string,
): { ok: true; file: ListExport } | { ok: false; message: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, message: "This file isn't valid JSON" };
  }
  const head = (json ?? {}) as { format?: unknown; version?: unknown };
  if (head.format !== EXPORT_FORMAT) {
    return { ok: false, message: "This isn't a Lister export" };
  }
  if (head.version !== EXPORT_VERSION) {
    return {
      ok: false,
      message: `This export has version ${String(head.version)}, which this app can't import`,
    };
  }
  const result = listExportSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? ` (${issue.path.join(' › ')})` : '';
    return {
      ok: false,
      message: `This export is damaged: ${issue?.message ?? 'invalid'}${where}`,
    };
  }
  return { ok: true, file: result.data };
}

/** Reads a picked file by its extension: `.json` as a Lister export, else as text. */
export function parseImportFile(fileName: string, text: string): ImportFile {
  if (/\.json$/i.test(fileName)) {
    const result = parseListExport(text);
    return result.ok
      ? { kind: 'lists', file: result.file }
      : { kind: 'error', message: result.message };
  }
  const list = parseTextList(
    text.charCodeAt(0) === 0xfeff ? text.slice(1) : text,
    fileName,
  );
  return { kind: 'text', ...list };
}
