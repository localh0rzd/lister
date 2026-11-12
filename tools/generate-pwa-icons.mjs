// Renders Lister's app icons: the Material Symbols "checklist" glyph on the theme's seed colour
// #00796B (D11), from the self-hosted font in node_modules. Run: npm run icons
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const SEED = '#00796B';
const out = 'apps/lister-web/public/icons';
const font = readFileSync(
  'node_modules/material-symbols/material-symbols-outlined.woff2',
).toString('base64');

// `any` icons are a rounded square; maskable ones fill the canvas and keep the glyph inside
// the 80 % safe zone, since the launcher applies its own mask.
const icons = [
  { file: 'icon-192.png', size: 192, radius: 0.22, glyph: 0.62 },
  { file: 'icon-512.png', size: 512, radius: 0.22, glyph: 0.62 },
  { file: 'icon-maskable-192.png', size: 192, radius: 0, glyph: 0.5 },
  { file: 'icon-maskable-512.png', size: 512, radius: 0, glyph: 0.5 },
  { file: 'apple-touch-icon.png', size: 180, radius: 0, glyph: 0.58 },
  { file: 'favicon-48.png', size: 48, radius: 0.22, glyph: 0.7 },
];

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const icon of icons) {
    await page.setViewportSize({ width: icon.size, height: icon.size });
    await page.setContent(`
      <style>
        @font-face { font-family: Symbols; src: url(data:font/woff2;base64,${font}) format('woff2'); }
        html, body { margin: 0; background: transparent; }
        div {
          width: ${icon.size}px; height: ${icon.size}px;
          border-radius: ${icon.radius * 100}%;
          background: ${SEED}; color: #fff;
          display: grid; place-items: center;
          font: ${Math.round(icon.size * icon.glyph)}px/1 Symbols;
          font-variation-settings: 'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 48;
          font-feature-settings: 'liga';
        }
      </style>
      <div>checklist</div>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(out, icon.file), omitBackground: true });
    console.log(`${out}/${icon.file}`);
  }
} finally {
  await browser.close();
}
