import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => customElements.get("glass-slider") !== undefined);
  await page.evaluate(() => document.fonts.ready);
  // The markup ships paused; data-ready says the script has wired it up.
  await expect(page.locator("#hero-player")).toHaveAttribute("data-ready", "", { timeout: 15_000 });
  await expect(page.locator("#hero-player")).toHaveAttribute("data-state", "paused");
}

const player = (page: Page) => page.locator("#hero-player");
const seekValue = (page: Page) =>
  page
    .locator("#hero-player [data-seek]")
    .evaluate((el) => (el as HTMLElement & { value: number }).value);

type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box | null, b: Box | null) => {
  if (!a || !b) return false;
  const ix = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const iy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return ix > 1 && iy > 1;
};

test.describe("hero player", () => {
  test("plays, pauses, and the bar runs only while playing", async ({ page }) => {
    await page.goto("/index.html");
    await ready(page);
    const play = page.locator("#hero-player [data-play]");
    await expect(play).toHaveAttribute("aria-label", "Play");
    await expect(page.locator("#hero-player [data-elapsed]")).toHaveText("0:00");
    await play.click();
    await expect(player(page)).toHaveAttribute("data-state", "playing");
    await expect(play).toHaveAttribute("aria-label", "Pause");
    // The clock has moved off zero; a slow runner may already be a few seconds in.
    await expect(page.locator("#hero-player [data-elapsed]")).not.toHaveText("0:00", {
      timeout: 6000,
    });
    await play.click();
    await expect(player(page)).toHaveAttribute("data-state", "paused");
    const stopped = await seekValue(page);
    await page.waitForTimeout(700);
    expect(await seekValue(page)).toBeCloseTo(stopped, 1);
  });

  test("next, previous, and the queue change the track", async ({ page }) => {
    await page.goto("/index.html");
    await ready(page);
    const title = page.locator("#hero-player [data-title]");
    await expect(title).toHaveText("Glacier Mail");
    await page.locator("#hero-player [data-next]").click();
    await expect(title).toHaveText("Caustic Hour");
    await expect(player(page)).toHaveAttribute("data-track", "1");
    await expect(page.locator("#hero-player [data-remaining]")).toHaveText("-4:02");
    await expect(page.locator("#hero-player [aria-live]")).toHaveText("Caustic Hour by Ostra Vale");
    await page.locator("#hero-player [data-prev]").click();
    await expect(title).toHaveText("Glacier Mail");
    const toggle = page.locator("#hero-player [data-queue-toggle]");
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.locator('#hero-player [data-track="3"]').click();
    await expect(title).toHaveText("Bezel Bloom");
    await expect(page.locator('#hero-player [data-track="3"]')).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(player(page)).toHaveAttribute("data-state", "playing");
    await toggle.click();
    await expect(page.locator("#deck-queue")).toBeHidden();
  });

  test("the end of a track starts the next one", async ({ page }) => {
    await page.goto("/index.html");
    await ready(page);
    const seek = page.locator("#hero-player [data-seek]");
    await seek.focus();
    await page.keyboard.press("End");
    await expect(page.locator("#hero-player [data-elapsed]")).toHaveText("3:33");
    await page.locator("#hero-player [data-play]").click();
    await expect(page.locator("#hero-player [data-title]")).toHaveText("Caustic Hour", {
      timeout: 5000,
    });
    await expect(player(page)).toHaveAttribute("data-state", "playing");
  });

  test("the seek bar answers keyboard, pointer, and touch", async ({ page, browserName }) => {
    await page.goto("/index.html");
    await ready(page);
    const seek = page.locator("#hero-player [data-seek]");
    await expect(seek).toHaveAttribute("role", "slider");
    await expect(seek).toHaveAttribute("aria-label", "Seek");
    await seek.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#hero-player [data-elapsed]")).toHaveText("0:10");
    await expect(seek).toHaveAttribute("aria-valuetext", "0:10 of 3:34");
    await page.keyboard.press("PageUp");
    await expect(page.locator("#hero-player [data-elapsed]")).toHaveText("0:40");
    await page.keyboard.press("Home");
    await expect(page.locator("#hero-player [data-elapsed]")).toHaveText("0:00");
    const box = (await seek.boundingBox())!;
    await page.mouse.move(box.x + 24, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    const half = await seekValue(page);
    expect(half).toBeGreaterThan(80);
    expect(half).toBeLessThan(135);
    // Touch, through pointer events of type touch, where the browser can synthesize them.
    if (browserName === "chromium") {
      await seek.dispatchEvent("pointerdown", {
        pointerType: "touch",
        pointerId: 7,
        button: 0,
        buttons: 1,
        isPrimary: true,
        clientX: box.x + box.width * 0.85,
        clientY: box.y + box.height / 2,
      });
      await page.evaluate(() =>
        window.dispatchEvent(
          new PointerEvent("pointerup", { pointerType: "touch", pointerId: 7, isPrimary: true }),
        ),
      );
      expect(await seekValue(page)).toBeGreaterThan(160);
    }
  });

  test("shuffle, repeat, and like are toggle buttons", async ({ page }) => {
    await page.goto("/index.html");
    await ready(page);
    const shuffle = page.locator("#hero-player [data-shuffle]");
    await expect(shuffle).toHaveAttribute("aria-pressed", "false");
    await shuffle.click();
    await expect(shuffle).toHaveAttribute("aria-pressed", "true");
    const repeat = page.locator("#hero-player [data-repeat]");
    await expect(repeat).toHaveAttribute("aria-label", "Repeat all");
    await repeat.click();
    await expect(repeat).toHaveAttribute("aria-label", "Repeat one");
    await repeat.click();
    await expect(repeat).toHaveAttribute("aria-label", "Repeat off");
    await expect(repeat).toHaveAttribute("aria-pressed", "false");
    const like = page.locator("#hero-player [data-like]");
    await like.focus();
    await page.keyboard.press("Enter");
    await expect(like).toHaveAttribute("aria-pressed", "true");
    await expect(like).toHaveAttribute("aria-label", "Unlike Glacier Mail");
    await page.locator("#hero-player [data-play]").focus();
    await page.keyboard.press("Space");
    await expect(player(page)).toHaveAttribute("data-state", "playing");
  });

  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
    [390, 844],
    [320, 640],
  ] as const) {
    test(`fits and leaves the lens clear at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/index.html");
      await ready(page);
      await page.waitForTimeout(300);
      const deck = await player(page).boundingBox();
      const lens = await page.locator("#hero-lens").boundingBox();
      const hero = await page.locator("#top").boundingBox();
      const kicker = await page.locator(".hero__kicker").boundingBox();
      const engine = await page.locator(".hero__engine").boundingBox();
      expect(deck && hero).toBeTruthy();
      expect(overlap(deck, lens), "player covers the lens").toBe(false);
      expect(overlap(deck, kicker), "player covers the badge").toBe(false);
      expect(overlap(deck, engine), "player covers the engine note").toBe(false);
      expect(overlap(lens, engine), "lens covers the engine note").toBe(false);
      expect(deck!.x).toBeGreaterThanOrEqual(hero!.x);
      expect(deck!.x + deck!.width).toBeLessThanOrEqual(hero!.x + hero!.width + 0.5);
      expect(deck!.y + deck!.height).toBeLessThanOrEqual(hero!.y + hero!.height + 0.5);
      const scroll = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(scroll).toBeLessThanOrEqual(1);
      // An open queue still stays clear of the badge and the header.
      const toggle = page.locator("#hero-player [data-queue-toggle]");
      if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
      await expect(page.locator("#deck-queue")).toBeVisible();
      await page.waitForTimeout(200);
      const open = await player(page).boundingBox();
      const bar = await page.locator(".nav__bar").boundingBox();
      expect(overlap(open, kicker), "open queue covers the badge").toBe(false);
      expect(overlap(open, bar), "open queue runs under the header").toBe(false);
      const grown = await page.locator("#top").boundingBox();
      expect(open!.y + open!.height).toBeLessThanOrEqual(grown!.y + grown!.height + 0.5);
      // Every control is a real 44px target.
      for (const sel of [
        "[data-play]",
        "[data-prev]",
        "[data-next]",
        "[data-like]",
        "[data-shuffle]",
        "[data-repeat]",
        "[data-queue-toggle]",
      ]) {
        const b = await page.locator(`#hero-player ${sel}`).boundingBox();
        expect(b!.width, sel).toBeGreaterThanOrEqual(43.5);
        expect(b!.height, sel).toBeGreaterThanOrEqual(43.5);
      }
    });
  }

  test("is reachable and labelled for assistive technology", async ({ page }) => {
    await page.goto("/index.html");
    await ready(page);
    await expect(page.getByRole("region", { name: /Music player/ })).toBeVisible();
    for (const name of [
      "Play",
      "Previous track",
      "Next track",
      "Shuffle",
      "Repeat all",
      "Like Glacier Mail",
      "Up next",
    ])
      await expect(
        page.locator("#hero-player").getByRole("button", { name, exact: true }),
      ).toHaveCount(1);
    await expect(page.locator("#hero-player").getByRole("slider", { name: "Volume" })).toHaveCount(
      1,
    );
    const results = await new AxeBuilder({ page }).include("#hero-player").analyze();
    // Contrast inside glass is the library's own suite; roles, names, and states are checked here.
    const violations = results.violations
      .filter((v) => v.id !== "color-contrast")
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
    expect(violations, violations.join("\n")).toEqual([]);
  });

  test("respects reduced motion", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/index.html");
    await ready(page);
    await page.locator("#hero-player [data-next]").click();
    // No cross-fade: the old cover is gone at once and the title is already new.
    await expect(page.locator("#hero-player .deck__art")).toHaveCount(1);
    await expect(page.locator("#hero-player [data-title]")).toHaveText("Caustic Hour");
    await page.locator("#hero-player [data-play]").click();
    const animated = await page
      .locator("#hero-player .deck__album .deck__eq i")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(animated).toBe("none");
    await context.close();
  });
});
