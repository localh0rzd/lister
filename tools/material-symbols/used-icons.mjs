// Finds the Material Symbols icons the web code uses, so the icon font can be cut down to them.
//
// Icons are written as ligature names, in two places this scanner understands:
//   - templates (.html): the content of `<mat-icon>`, either the bare name or the quoted names
//     inside an interpolation (`{{ open ? 'expand_less' : 'expand_more' }}`), or an
//     interpolation of a value named `…icon` (`{{ destination.icon }}`, `{{ icon() }}`);
//   - TypeScript: the quoted names in the value of a property or variable whose name ends in
//     `icon` (`icon: 'checklist'`, `kindIcon = computed(() => (x() ? 'add' : 'edit'))`).
// Quoted strings compared with `===`, `!==`, `==` or `!=` are not icon names. Any other form
// (`fontIcon`, `svgIcon`, `<mat-icon>` in an inline template, an interpolation of something
// else) is reported as a problem rather than skipped, so no icon goes unnoticed.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SOURCE_ROOTS = ['apps/lister-web/src', 'packages/web'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'public']);

const QUOTED = /'([^']*)'|"([^"]*)"/g;
const COMPARED =
  /(?:===|!==|==|!=)\s*(?:'[^']*'|"[^"]*")|(?:'[^']*'|"[^"]*")\s*(?:===|!==|==|!=)/g;
const ICON_REFERENCE = /^[\w$.]*[iI]con(?:\(\))?$/;
const MAT_ICON = /<mat-icon\b([^>]*?)(?:\/>|>([\s\S]*?)<\/mat-icon\s*>)/g;
const ICON_VALUE = /\b\w*[iI]con\s*[:=](?![=>])/g;

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

/** The quoted strings in an expression, except those it compares something with. */
function literals(expression) {
  return [...expression.replace(COMPARED, '').matchAll(QUOTED)].map(
    (match) => match[1] ?? match[2],
  );
}

/** The value that starts at `start`: up to a `;` or `,` outside brackets, or a closing bracket. */
function valueAt(text, start) {
  let depth = 0;
  let quote = null;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === '\\') index++;
      else if (char === quote) quote = null;
    } else if (char === "'" || char === '"' || char === '`') {
      quote = char;
    } else if ('([{'.includes(char)) {
      depth++;
    } else if (')]}'.includes(char)) {
      if (depth-- === 0) return text.slice(start, index);
    } else if ((char === ';' || char === ',') && depth === 0) {
      return text.slice(start, index);
    }
  }
  return text.slice(start);
}

function scanTemplate(file, text, icons, problems) {
  const tags = [...text.matchAll(MAT_ICON)];
  if (tags.length !== (text.match(/<mat-icon\b/g) ?? []).length) {
    problems.push(`${file}: a <mat-icon> the scanner can't read (unclosed?)`);
  }
  for (const [tag, attributes, content] of tags) {
    const at = `${file}: ${tag.split('\n')[0].trim()}`;
    if (/\b(?:fontIcon|svgIcon)\b/i.test(attributes)) {
      problems.push(
        `${at}: write the icon name as the content of <mat-icon>, not with fontIcon or svgIcon`,
      );
    }
    if (content === undefined) {
      if (!/\b(?:fontIcon|svgIcon)\b/i.test(attributes)) {
        problems.push(`${at}: <mat-icon /> has no icon name`);
      }
      continue;
    }
    for (const [, expression] of content.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
      const names = literals(expression);
      if (names.length > 0) icons.push(...names);
      else if (!ICON_REFERENCE.test(expression.trim())) {
        problems.push(
          `${at}: can't tell which icons {{ ${expression.trim()} }} shows; use quoted names or a value named …icon`,
        );
      }
    }
    const bare = content.replace(/\{\{[\s\S]*?\}\}/g, '').trim();
    if (bare) icons.push(bare);
  }
}

function scanTypeScript(file, text, icons, problems) {
  if (/<mat-icon\b/.test(text)) {
    problems.push(
      `${file}: <mat-icon> in an inline template isn't scanned; move the template to an .html file`,
    );
  }
  for (const match of text.matchAll(ICON_VALUE)) {
    icons.push(...literals(valueAt(text, match.index + match[0].length)));
  }
}

/**
 * The sorted icon names the web code uses, and the icon usages the scanner can't resolve (each
 * one a message naming the file).
 */
export function findUsedIcons(root) {
  const icons = [];
  const problems = [];
  for (const sourceRoot of SOURCE_ROOTS) {
    for (const path of sourceFiles(join(root, sourceRoot))) {
      const file = relative(root, path);
      const text = readFileSync(path, 'utf8');
      if (path.endsWith('.html')) scanTemplate(file, text, icons, problems);
      else scanTypeScript(file, text, icons, problems);
    }
  }
  return { icons: [...new Set(icons)].filter(Boolean).sort(), problems };
}
