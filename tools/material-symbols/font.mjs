// Shaping and subsetting helpers for the Material Symbols icon font (HarfBuzz compiled to
// WebAssembly, no native tools).
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as harfbuzz from 'harfbuzzjs';

const require = createRequire(import.meta.url);
const fontverter = require('fontverter');

/** Opens a font file (WOFF2 or TTF) for shaping. */
export async function openFont(buffer) {
  const sfnt = await fontverter.convert(buffer, 'truetype');
  return {
    sfnt,
    font: new harfbuzz.Font(new harfbuzz.Face(new harfbuzz.Blob(sfnt))),
  };
}

/** The glyph ids that the text shapes to; an icon name shapes to exactly one glyph. */
export function shapeGlyphs(font, text) {
  const buffer = new harfbuzz.Buffer();
  buffer.addText(text);
  buffer.guessSegmentProperties();
  harfbuzz.shape(font, buffer);
  return buffer.getGlyphInfos().map((glyph) => glyph.codepoint);
}

/** True when `name` turns into a single icon glyph rather than plain letters. */
export function isLigature(font, name) {
  const glyphs = shapeGlyphs(font, name);
  return glyphs.length === 1 && glyphs[0] !== 0;
}

const HB_MEMORY_MODE_WRITABLE = 2;
const HB_SUBSET_FLAGS_NO_LAYOUT_CLOSURE = 0x200;
const tag = (name) =>
  [...name].reduce((value, char) => (value << 8) + char.charCodeAt(0), 0);

/**
 * Cuts `sfnt` down to the icons in `names`, pinning the variable axes to `axes` (a number pins
 * an axis, `{ min, max }` narrows it). The icon glyphs are added by glyph id, with no layout
 * closure, so the font keeps only the ligature rules for these icons (the letters of their
 * names stay, so the ligatures still fire) instead of every icon the letters could spell.
 */
export async function subsetIcons(sfnt, font, names, axes) {
  const wasm = await subsetModule();
  const input = wasm.hb_subset_input_create_or_fail();
  const bytes = wasm.malloc(sfnt.byteLength);
  new Uint8Array(wasm.memory.buffer).set(new Uint8Array(sfnt), bytes);
  const blob = wasm.hb_blob_create(
    bytes,
    sfnt.byteLength,
    HB_MEMORY_MODE_WRITABLE,
    0,
    0,
  );
  const face = wasm.hb_face_create(blob, 0);
  wasm.hb_blob_destroy(blob);
  try {
    wasm.hb_subset_input_set_flags(
      input,
      wasm.hb_subset_input_get_flags(input) | HB_SUBSET_FLAGS_NO_LAYOUT_CLOSURE,
    );
    const layoutFeatures = wasm.hb_subset_input_set(input, 6);
    wasm.hb_set_add(layoutFeatures, tag('liga'));

    const unicodes = wasm.hb_subset_input_unicode_set(input);
    for (const char of new Set(names.join(''))) {
      wasm.hb_set_add(unicodes, char.codePointAt(0));
    }
    const glyphs = wasm.hb_subset_input_glyph_set(input);
    for (const name of names) {
      for (const glyph of shapeGlyphs(font, name))
        wasm.hb_set_add(glyphs, glyph);
    }

    for (const [axis, value] of Object.entries(axes)) {
      const ok =
        typeof value === 'number'
          ? wasm.hb_subset_input_pin_axis_location(
              input,
              face,
              tag(axis),
              value,
            )
          : wasm.hb_subset_input_set_axis_range(
              input,
              face,
              tag(axis),
              value.min,
              value.max,
              NaN,
            );
      if (!ok) throw new Error(`Could not set the ${axis} axis`);
    }

    const subset = wasm.hb_subset_or_fail(face, input);
    if (subset === 0) throw new Error('HarfBuzz failed to subset the font');
    const result = wasm.hb_face_reference_blob(subset);
    const offset = wasm.hb_blob_get_data(result, 0);
    const length = wasm.hb_blob_get_length(result);
    const output = Buffer.from(
      new Uint8Array(wasm.memory.buffer).slice(offset, offset + length),
    );
    wasm.hb_blob_destroy(result);
    wasm.hb_face_destroy(subset);
    return fontverter.convert(output, 'woff2', 'truetype');
  } finally {
    wasm.hb_subset_input_destroy(input);
    wasm.hb_face_destroy(face);
    wasm.free(bytes);
  }
}

let subsetWasm;
async function subsetModule() {
  subsetWasm ??= (async () => {
    const { instance } = await WebAssembly.instantiate(
      await readFile(require.resolve('harfbuzzjs/dist/harfbuzz-subset.wasm')),
    );
    instance.exports._initialize();
    return instance.exports;
  })();
  return subsetWasm;
}
