import { expect, test, type Page } from "@playwright/test";

type Counts = { frames: number; draws: number; into?: Record<string, number> };

const counts = (page: Page) =>
  page.evaluate(() => {
    const c = (window as unknown as { counts: Counts }).counts;
    const now = { frames: c.frames, draws: c.draws };
    c.frames = 0;
    c.draws = 0;
    return now;
  });

const radius = (page: Page, id: string) =>
  page.evaluate((id) => document.getElementById(id)!.style.getPropertyValue("--glass-r"), id);

/** Scroll so that the top of `id` sits at `fraction` viewport heights from the top of the viewport. */
const bring = (page: Page, id: string, fraction: number) =>
  page.evaluate(
    ([id, fraction]) => {
      const top = document.getElementById(id as string)!.getBoundingClientRect().top + scrollY;
      scrollTo(0, top - innerHeight * (fraction as number));
    },
    [id, fraction],
  );

const offscreen = (page: Page, id: string) =>
  page.evaluate(
    (id) =>
      (document.getElementById(id) as HTMLElement & { surface: { offscreen: boolean } }).surface
        .offscreen,
    id,
  );

/** Frames and WebGL draws the glass asked for, summed until `done` returns true. */
async function activity(page: Page, done: (c: Counts) => boolean) {
  const sum = { frames: 0, draws: 0 };
  await expect
    .poll(async () => {
      const c = await counts(page);
      sum.frames += c.frames;
      sum.draws += c.draws;
      return done(sum);
    })
    .toBe(true);
}

test("glass far off screen does no work and is up to date before it scrolls back in", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/fixtures/offscreen.html");
  await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready);
  await bring(page, "scene", 0.1);
  await page.waitForTimeout(600);
  const engine = await page.evaluate(() => document.getElementById("lens")!.dataset.glassEngine);
  expect(["scene-gl", "scene-dom"]).toContain(engine);
  const drawing = (c: Counts) => c.frames > 3 && (engine !== "scene-gl" || c.draws > 3);

  // On screen, the live backdrop keeps the scene drawing.
  await counts(page);
  await activity(page, drawing);

  // Far below, the scene and its glass stop, although the backdrop still changes.
  await bring(page, "end", 0.5);
  await expect.poll(() => offscreen(page, "card")).toBe(true);
  await page.evaluate(() => document.getElementById("card")!.setAttribute("radius", "40"));
  await page.setViewportSize({ width: page.viewportSize()!.width - 40, height: 700 });
  // At most a frame already in flight may still land; then a full second of nothing.
  await page.waitForTimeout(300);
  await counts(page);
  await page.waitForTimeout(1000);
  expect(await counts(page)).toEqual({ frames: 0, draws: 0 });
  expect(await radius(page, "card")).toBe("24px");

  // Glass on screen still updates at once.
  await page.evaluate(() => document.getElementById("end")!.setAttribute("radius", "30"));
  await expect.poll(() => radius(page, "end")).toBe("30px");

  // Half a viewport below the fold, out of sight, everything catches up.
  await bring(page, "scene", 1.5);
  await expect.poll(() => radius(page, "card")).toBe("40px");
  await activity(page, (c) => c.frames > 0 && (engine !== "scene-gl" || c.draws > 0));
  const top = await page.evaluate(
    () => document.getElementById("scene")!.getBoundingClientRect().top,
  );
  expect(top).toBeGreaterThan(await page.evaluate(() => innerHeight));
  expect(errors).toEqual([]);
});

test("glass without a box updates the moment it is shown", async ({ page }) => {
  await page.goto("/fixtures/offscreen.html");
  await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready);
  await page.evaluate(() => {
    const card = document.getElementById("card")!;
    scrollTo(0, card.getBoundingClientRect().top + scrollY - 100);
    card.style.display = "none";
  });
  await page.waitForTimeout(300);
  const r = await page.evaluate(
    () =>
      new Promise<string>((done) => {
        const card = document.getElementById("card")!;
        card.setAttribute("radius", "44");
        card.style.display = "";
        // Runs after the glass's own resize callback, before the first paint that shows the card.
        const ro = new ResizeObserver(() => {
          ro.disconnect();
          done(card.style.getPropertyValue("--glass-r"));
        });
        ro.observe(card);
      }),
  );
  expect(r).toBe("44px");
});

test("a scene on screen skips its glass that is far off screen", async ({ page }) => {
  await page.goto("/fixtures/offscreen.html");
  await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready);
  await page.waitForTimeout(600);
  const engine = await page.evaluate(() => document.getElementById("top")!.dataset.glassEngine);
  test.skip(engine !== "scene-gl", "only the WebGL renderer draws per glass");
  const into = () =>
    page.evaluate(() => {
      const c = (window as unknown as { counts: Required<Counts> }).counts;
      const now = { ...c.into };
      c.into = {};
      return now;
    });
  await into();
  await page.waitForTimeout(500);
  const atTop = await into();
  expect(atTop.top ?? 0).toBeGreaterThan(0);
  expect(atTop.bottom ?? 0).toBe(0);

  await page.evaluate(() => document.getElementById("bottom")!.scrollIntoView());
  await expect.poll(async () => ((await into()).bottom ?? 0) > 0, { intervals: [300] }).toBe(true);
});
