// Cuts the self-hosted Material Symbols font down to the icons the web code uses.
// Run: npx nx run lister-web:subset-icons   (after adding or removing an icon)
//
// Reads the full variable font from node_modules/material-symbols, finds the icons in use
// (tools/material-symbols/used-icons.mjs) and writes, next to the app's styles,
//   apps/lister-web/src/fonts/material-symbols-subset.woff2   the font
//   apps/lister-web/src/fonts/material-symbols-subset.json    the icons it contains
// The font keeps the `FILL` axis (0..1, for the active navigation item) and pins the others to
// their defaults. `npm run lint:workspace` fails when the code uses an icon that isn't listed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findUsedIcons } from './material-symbols/used-icons.mjs';
import { isLigature, openFont, subsetIcons } from './material-symbols/font.mjs';

const root = process.cwd();
const outDir = join(root, 'apps/lister-web/src/fonts');

const used = findUsedIcons(root);

const { sfnt, font } = await openFont(
  readFileSync(
    join(root, 'node_modules/material-symbols/material-symbols-outlined.woff2'),
  ),
);
const missing = used.filter((name) => !isLigature(font, name));
if (missing.length > 0) {
  console.error(`Not Material Symbols icons (typo?): ${missing.join(', ')}`);
  process.exit(1);
}

const subset = await subsetIcons(sfnt, font, used, {
  wght: 400,
  GRAD: 0,
  opsz: 24,
  FILL: { min: 0, max: 1 },
});
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'material-symbols-subset.woff2'), subset);
writeFileSync(
  join(outDir, 'material-symbols-subset.json'),
  `${JSON.stringify({ icons: used }, null, 2)}\n`,
);
console.log(
  `Subset font: ${used.length} icons, ${(subset.length / 1024).toFixed(1)} kB.`,
);
