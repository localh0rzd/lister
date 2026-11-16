// Finds the Material Symbols icons the web code uses, so the icon font can be cut down to them.
//
// Icons are written as ligature names, in two places this scanner understands:
//   - templates: the content of `<mat-icon>`, either the bare name or the quoted names inside
//     an interpolation (`{{ open ? 'expand_less' : 'expand_more' }}`);
//   - TypeScript: a string literal assigned to a property or variable whose name ends in `icon`
//     (`icon: 'checklist'`, `fontIcon = 'add'`).
// Every name found must be a ligature of the full font (the subset tool checks); anything written
// in another form is invisible to the scanner, so keep to these two.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE_ROOTS = ['apps/lister-web/src', 'packages/web'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'public']);

function* sourceFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) yield* sourceFiles(path);
    } else if (
      /\.(html|ts)$/.test(entry.name) &&
      !/\.(spec|d)\.ts$/.test(entry.name)
    ) {
      yield path;
    }
  }
}

function candidates(path, text) {
  const found = [];
  if (path.endsWith('.html')) {
    for (const [, content] of text.matchAll(
      /<mat-icon\b[^>]*>([\s\S]*?)<\/mat-icon>/g,
    )) {
      found.push(...[...content.matchAll(/'([^']*)'/g)].map((m) => m[1]));
      found.push(content.replace(/\{\{[\s\S]*?\}\}/g, '').trim());
    }
  } else {
    for (const [, name] of text.matchAll(/\b\w*[iI]con\s*[:=]\s*'([^']*)'/g)) {
      found.push(name);
    }
  }
  return found;
}

/** The sorted icon names the web code uses. */
export function findUsedIcons(root) {
  const used = new Set();
  for (const sourceRoot of SOURCE_ROOTS) {
    for (const path of sourceFiles(join(root, sourceRoot))) {
      for (const name of candidates(path, readFileSync(path, 'utf8'))) {
        if (name) used.add(name);
      }
    }
  }
  return [...used].sort();
}
