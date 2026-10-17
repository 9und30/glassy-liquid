// Header navigation timing on a built docs site.
//
//   npm run docs:build && python3 -m http.server 4310 -d docs-dist
//   node tests/tools/nav-timing.mjs http://localhost:4310 [--throttle] [--runs 5]
//
// For each click in the desktop header it reports, in milliseconds after the click:
//   feedback: the first frame that shows the click was taken
//   content:  the first frame with the new page's heading on screen
// A full page load shows nothing until the next document paints, so both are
// that document's first contentful paint. --throttle adds 4x CPU slowdown and
// a 150 ms round trip at 9 Mbit/s, closer to a mid-range laptop on Wi-Fi.
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:/.test(a)) ?? "http://localhost:4310").replace(/\/$/, "");
const throttle = args.includes("--throttle");
const runs = Number(args[args.indexOf("--runs") + 1]) || 5;

const route = [
  ["Components", "components"],
  ["Playground", "playground"],
  ["Guide", "getting-started"],
  ["Support", "browser-support"],
  ["Home", "home"],
];

const probe = () => {
  const now = () => performance.timeOrigin + performance.now();
  const store = (k, v) => sessionStorage.setItem(k, String(v));
  document.addEventListener(
    "click",
    () => {
      store("clickAt", now());
      sessionStorage.removeItem("feedbackAt");
      sessionStorage.removeItem("contentAt");
      const page = document.body.dataset.page;
      // Watch frames until something on screen answers the click.
      const tick = () => {
        const answered =
          document.querySelector("[data-pending], html[data-route-loading]") ||
          document.body.dataset.page !== page;
        if (answered && !sessionStorage.getItem("feedbackAt")) store("feedbackAt", now());
        if (document.body.dataset.page !== page) {
          store("contentAt", now());
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    true,
  );
  // A fresh document: its first paint is both the feedback and the content.
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.name !== "first-contentful-paint" || !sessionStorage.getItem("clickAt")) continue;
      const t = performance.timeOrigin + e.startTime;
      if (!sessionStorage.getItem("feedbackAt")) store("feedbackAt", t);
      if (!sessionStorage.getItem("contentAt")) store("contentAt", t);
    }
  }).observe({ type: "paint", buffered: true });
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(probe);
const page = await context.newPage();
if (throttle) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (9 * 1024 * 1024) / 8,
    uploadThroughput: (3 * 1024 * 1024) / 8,
  });
}

const results = Object.fromEntries(route.map(([name]) => [name, { feedback: [], content: [] }]));
for (let run = 0; run < runs; run++) {
  await page.goto(`${base}/index.html`, { waitUntil: "load", timeout: 120_000 });
  await page.waitForTimeout(throttle ? 3500 : 1500);
  for (const [name, target] of route) {
    const link =
      name === "Home"
        ? page.locator(".nav .brand")
        : page.locator(".nav__links a", { hasText: name });
    await link.hover();
    await page.waitForTimeout(150);
    await link.click();
    await page.waitForFunction((t) => document.body?.dataset.page === t, target, {
      timeout: 30_000,
    });
    await page.waitForFunction(() => sessionStorage.getItem("contentAt"), null, {
      timeout: 30_000,
    });
    const t = await page.evaluate(() => ({
      click: Number(sessionStorage.clickAt),
      feedback: Number(sessionStorage.feedbackAt),
      content: Number(sessionStorage.contentAt),
    }));
    results[name].feedback.push(t.feedback - t.click);
    results[name].content.push(t.content - t.click);
    await page.waitForTimeout(throttle ? 1500 : 600);
  }
}
await browser.close();

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
console.log(
  `${base} ${throttle ? "throttled (4x CPU, 150 ms RTT, 9 Mbit/s)" : "unthrottled"}, median of ${runs} runs, ms after click`,
);
console.log("link        feedback  content");
const all = { feedback: [], content: [] };
for (const [name] of route) {
  const r = results[name];
  all.feedback.push(...r.feedback);
  all.content.push(...r.content);
  console.log(
    `${name.padEnd(11)} ${median(r.feedback).toFixed(0).padStart(8)} ${median(r.content).toFixed(0).padStart(8)}`,
  );
}
console.log(
  `${"all".padEnd(11)} ${median(all.feedback).toFixed(0).padStart(8)} ${median(all.content).toFixed(0).padStart(8)}`,
);
