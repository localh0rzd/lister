import { expect, test } from './support/fixtures';

// The `expectAccessible` fixture itself, on small pages of its own.

/** A page with one paragraph; `script` runs in it. */
const pageWith = (style: string, script = '') => `<!doctype html>
<html lang="en">
  <head>
    <title>Probe</title>
    <style>
      body { background: #fff; }
      p { color: #000; }
      ${style}
    </style>
  </head>
  <body>
    <main><h1>Probe</h1><p id="text">Some text to check</p></main>
    <script>${script}</script>
  </body>
</html>`;

test.describe('expectAccessible', () => {
  test('checks again when a fade-in starts during the check', async ({
    page,
    expectAccessible,
  }) => {
    // The paragraph starts fading in the first time axe is injected, i.e. after the animations
    // were waited for — as a snackbar's timed dismissal or the next queued notice does.
    await page.setContent(
      pageWith(
        '',
        `let axe, faded = false;
        Object.defineProperty(window, 'axe', {
          configurable: true,
          get: () => axe,
          set: (value) => {
            axe = value;
            if (faded) return;
            faded = true;
            const text = document.getElementById('text');
            text.style.opacity = '0.3';
            getComputedStyle(text).opacity;
            text.style.transition = 'opacity 300ms linear';
            text.style.opacity = '1';
          },
        });`,
      ),
    );
    await expectAccessible();
    // The fade really started during the check.
    await expect(page.locator('#text')).toHaveCSS('transition', /opacity/);
  });

  test('still reports a real contrast violation', async ({
    page,
    expectAccessible,
  }) => {
    await page.setContent(pageWith('p { opacity: 0.3; }'));
    await expect(expectAccessible()).rejects.toThrow(/color-contrast/);
  });
});
