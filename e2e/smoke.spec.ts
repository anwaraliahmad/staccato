import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    staccato: {
      assign(shape: string, id: string): boolean;
      generate(seed?: number): string;
      select(shape: string): void;
      cycleStyle(shape?: string): void;
      library: Map<string, unknown>;
      renderer: { enhanced: boolean };
      audio: { kind: string; features: { level: number } };
    };
  }
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    // Chrome reports WebGL misuse (GL_INVALID_*, feedback loops) as warnings.
    if (m.type() === 'error' || /WebGL|GL_INVALID|GL ERROR/i.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('the 2016 scene renders, listens, and every shader compiles', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.waitForFunction(() => !!window.staccato);
  expect(await page.evaluate(() => window.staccato.renderer.enhanced)).toBe(true);

  // Every built-in on every shape, through capture, lines and chrome.
  const ok = await page.evaluate(() => {
    const s = window.staccato;
    const results: boolean[] = [];
    for (const shape of ['sphere', 'ceiling', 'floor']) {
      for (const id of ['heart', 'wave', 'abyss', 'echo']) results.push(s.assign(shape, id));
    }
    return results;
  });
  expect(ok.every(Boolean)).toBe(true);

  // A spread of generated shaders.
  await page.evaluate(() => {
    window.staccato.select('sphere');
    for (let i = 0; i < 40; i++) window.staccato.generate(i * 104729);
  });

  // Back to the classic scene, with sound.
  await page.goto('/#sphere=heart&ceiling=wave&floor=abyss');
  await page.waitForFunction(() => !!window.staccato);
  await page.keyboard.press('d');
  await page.waitForFunction(() => window.staccato.audio.kind === 'demo' && window.staccato.audio.features.level > 0.05, null, { timeout: 15_000 });

  // The canvas shows more than a flat backdrop.
  const png = await page.locator('#stage').screenshot();
  expect(png.byteLength).toBeGreaterThan(50_000);

  expect(errors).toEqual([]);
});

test('scenes round-trip through the URL', async ({ page }) => {
  await page.goto('/#sphere=sn-3fa9c&ceiling=echo&floor=abyss&paper=night&sphereStyle=chrome');
  await page.waitForFunction(() => !!window.staccato);
  const hash = await page.evaluate(() => location.hash);
  expect(hash).toContain('sphere=sn-3fa9c');
  expect(hash).toContain('ceiling=echo');
  expect(hash).toContain('paper=night');
  expect(hash).toContain('sphereStyle=chrome');
});

test('the editor recompiles live and reports errors on the author\'s line', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.staccato);
  await page.keyboard.press('e');
  const fragment = page.locator('#editor-fragment');
  await expect(fragment).toBeVisible();
  await fragment.fill('void main() {\n  gl_FragColor = vec4(oops);\n}\n');
  await expect(page.locator('#editor-errors')).toContainText('fragment:2');
  await fragment.fill('void main() {\n  gl_FragColor = vec4(1.0, 0.0, 0.5, 1.0);\n}\n');
  await expect(page.locator('#editor-errors')).toBeEmpty();
});

test('every look renders every style without errors', async ({ page }) => {
  const errors = collectErrors(page);
  for (const look of ['origin', 'pavilion', 'metal', '16', 'night']) {
    for (const style of ['wire', 'chrome', 'chromewire', 'glass', 'glasswire']) {
      await page.goto(`/#paper=${look}&sphereStyle=${style}`);
      await page.waitForFunction(() => !!window.staccato);
      // Two frames: one to compile, one to draw.
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    }
  }
  expect(errors).toEqual([]);
});
