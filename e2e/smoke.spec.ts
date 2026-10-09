import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    staccato: {
      assign(object: string, id: string): boolean;
      setGeometry(object: string, geometry: string): void;
      setScene(id: string): void;
      generate(seed?: number): string;
      select(object: string): void;
      cycleStyle(object?: string): void;
      scene: { id: string; objects: { name: string }[] };
      selected: string;
      library: Map<string, unknown>;
      renderer: { enhanced: boolean; setStyle(object: string, style: string): void };
      audio: { kind: string; features: { level: number } };
    };
  }
}

const SCENES = ['origin', 'pavilion', 'chromecore', 'deep', '16', 'night'];
const GEOMETRIES = ['sphere', 'plane', 'terrain', 'torus', 'ring', 'knot', 'star', 'shard', 'cube', 'pill', 'column', 'slab', 'lattice'];
const STYLES = ['wire', 'chrome', 'chromewire', 'glass', 'glasswire', 'paint', 'paintwire'];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    // Chrome reports WebGL misuse (GL_INVALID_*, feedback loops) as warnings.
    if (m.type() === 'error' || /WebGL|GL_INVALID|GL ERROR/i.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const frames = (page: Page, n = 2) =>
  page.evaluate((n) => new Promise<void>((resolve) => {
    let left = n;
    const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }), n);

async function open(page: Page, hash = ''): Promise<void> {
  await page.goto(`/${hash}`);
  await page.waitForFunction(() => !!window.staccato);
}

test('every scene loads, draws, and hears the demo', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  expect(await page.evaluate(() => window.staccato.renderer.enhanced)).toBe(true);
  await page.keyboard.press('d');
  await page.waitForFunction(() => window.staccato.audio.kind === 'demo' && window.staccato.audio.features.level > 0.05, null, { timeout: 15_000 });
  for (const id of SCENES) {
    await page.evaluate((id) => window.staccato.setScene(id), id);
    await frames(page);
    expect(await page.evaluate(() => window.staccato.scene.id)).toBe(id);
    // More than a flat backdrop on screen.
    expect((await page.locator('#stage').screenshot()).byteLength, id).toBeGreaterThan(12_000);
  }
  // The music never stopped.
  expect(await page.evaluate(() => window.staccato.audio.kind)).toBe('demo');
  expect(errors).toEqual([]);
});

test('any shader on any shape, swapped live', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, '#scene=16');
  const failed = await page.evaluate(async (geometries) => {
    const s = window.staccato;
    const bad: string[] = [];
    const ids = [...s.library.keys()];
    for (const geometry of geometries) {
      s.setGeometry('heart', geometry);
      for (const id of ids) if (!s.assign('heart', id)) bad.push(`${id} on ${geometry}`);
      await new Promise((r) => requestAnimationFrame(r));
    }
    return bad;
  }, GEOMETRIES);
  expect(failed).toEqual([]);

  // And a spread of generated shaders.
  await page.evaluate(() => {
    for (let i = 0; i < 30; i++) window.staccato.generate(i * 104729);
  });
  await frames(page);
  expect(errors).toEqual([]);
});

test('scenes and their changes round-trip through the URL', async ({ page }) => {
  await open(page, '#scene=pavilion&canopy.shape=knot&capsules=core&heart.style=chrome');
  const state = await page.evaluate(() => location.hash);
  expect(state).toContain('scene=pavilion');
  expect(state).toContain('canopy.shape=knot');
  expect(state).toContain('capsules=core');
  expect(state).toContain('heart.style=chrome');
  // A scene's defaults aren't written out.
  expect(state).not.toContain('columns=');
});

test('the editor recompiles live and reports errors on the author\'s line', async ({ page }) => {
  await open(page, '#scene=16');
  await page.keyboard.press('e');
  const fragment = page.locator('#editor-fragment');
  await expect(fragment).toBeVisible();
  await fragment.fill('void main() {\n  gl_FragColor = vec4(oops);\n}\n');
  await expect(page.locator('#editor-errors')).toContainText('fragment:2');
  await fragment.fill('void main() {\n  gl_FragColor = vec4(1.0, 0.0, 0.5, 1.0);\n}\n');
  await expect(page.locator('#editor-errors')).toBeEmpty();
});

test('every scene renders every style without errors', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  for (const id of SCENES) {
    await page.evaluate((id) => window.staccato.setScene(id), id);
    for (const style of STYLES) {
      await page.evaluate((style) => {
        for (const o of window.staccato.scene.objects) window.staccato.renderer.setStyle(o.name, style);
      }, style);
      await frames(page);
    }
  }
  expect(errors).toEqual([]);
});
