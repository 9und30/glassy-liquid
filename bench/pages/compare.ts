/**
 * Same scene, two libraries. URL: ?lib=glassy|glasshq&case=move|resize|scroll&n=16
 * Results are written to window.result for the runner.
 */
type Result = {
  lib: string;
  case: string;
  n: number;
  init: number;
  frames: number[];
  longTasks: number;
  ready: boolean;
  error?: string;
};

const q = new URLSearchParams(location.search);
const lib = q.get("lib") ?? "glassy";
const kind = q.get("case") ?? "move";
const n = Number(q.get("n") ?? 16);
const duration = Number(q.get("ms") ?? 3000);

const scene = document.getElementById("scene")!;
const content = document.getElementById("content")!;
const text = document.getElementById("text")!;
text.textContent = "Liquid glass bends the light that passes through it. ".repeat(60);

// Same geometry for both libraries: a grid of capsules and panels.
const surfaces: HTMLElement[] = [];
for (let i = 0; i < n; i++) {
  const el = document.createElement("div");
  el.className = "s";
  const col = i % 4;
  const row = Math.floor(i / 4);
  const panel = (i + row) % 3 === 0;
  const w = panel ? 220 : 180;
  const h = panel ? 140 : 56;
  Object.assign(el.style, {
    left: `${60 + col * 280}px`,
    top: `${50 + row * 175}px`,
    width: `${w}px`,
    height: `${h}px`,
  });
  el.dataset.w = String(w);
  el.dataset.x = String(60 + col * 280);
  el.dataset.y = String(50 + row * 175);
  el.textContent = panel ? "Panel" : "Button";
  scene.append(el);
  surfaces.push(el);
}

let longTasks = 0;
try {
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) longTasks += e.duration;
  }).observe({ type: "longtask", buffered: false });
} catch {
  /* unsupported */
}

const raf = () => new Promise<number>((r) => requestAnimationFrame(r));

async function setupGlassy(): Promise<number> {
  const t0 = performance.now();
  const { glass } = await import("glassy-liquid");
  const extra = JSON.parse(q.get("opts") ?? "{}");
  for (const [i, el] of surfaces.entries())
    glass(el, {
      radius: el.offsetHeight > 100 ? 28 : "capsule",
      material: i % 2 ? "regular" : "clear",
      ...extra,
    });
  await raf();
  await raf();
  return performance.now() - t0;
}

async function setupGlassHq(): Promise<number> {
  const t0 = performance.now();
  // @ts-expect-error untyped alias
  await import("@glass-sdk/liquid-glass/styles.css");
  // @ts-expect-error untyped alias
  const mod = await import("@glass-sdk/liquid-glass/dom");
  let maps = 0;
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((r) => (resolveReady = r));
  const controller = mod.createGlassScene(scene, {
    maxSurfaces: Math.max(16, n),
    onDiagnostic: (d: { maps: number; surfaces: number; error?: Error }) => {
      maps = d.maps;
      if (d.error) (window as unknown as { glassError: string }).glassError = String(d.error);
      if (d.surfaces >= n && d.maps > 0) resolveReady();
    },
  });
  controller.setContent(content);
  for (const [i, el] of surfaces.entries())
    controller.addSurface(el, {
      radius: el.offsetHeight > 100 ? 28 : "capsule",
      material: i % 2 ? "regular" : "clear",
    });
  await Promise.race([ready, new Promise((r) => setTimeout(r, 8000))]);
  await raf();
  void maps;
  return performance.now() - t0;
}

async function animate(): Promise<number[]> {
  const frames: number[] = [];
  const start = performance.now();
  let last = start;
  return new Promise((resolve) => {
    const tick = (now: number) => {
      frames.push(now - last);
      last = now;
      const t = (now - start) / 1000;
      if (kind === "move") {
        surfaces.forEach((el, i) => {
          el.style.left = `${Number(el.dataset.x) + Math.sin(t * 2 + i) * 40}px`;
          el.style.top = `${Number(el.dataset.y) + Math.cos(t * 2 + i) * 20}px`;
        });
      } else if (kind === "resize") {
        surfaces.forEach((el, i) => {
          el.style.width = `${Number(el.dataset.w) + Math.round(Math.sin(t * 3 + i) * 50)}px`;
        });
      } else if (kind === "scroll") {
        text.style.transform = `translateY(${-((t * 120) % 600)}px)`;
      }
      if (now - start < duration) requestAnimationFrame(tick);
      else resolve(frames.slice(2));
    };
    requestAnimationFrame(tick);
  });
}

async function main(): Promise<void> {
  const result: Result = { lib, case: kind, n, init: 0, frames: [], longTasks: 0, ready: false };
  try {
    result.init = lib === "glasshq" ? await setupGlassHq() : await setupGlassy();
    await new Promise((r) => setTimeout(r, 500));
    longTasks = 0;
    result.frames = await animate();
    result.longTasks = longTasks;
    result.ready = true;
    const err = (window as unknown as { glassError?: string }).glassError;
    if (err) result.error = err;
  } catch (e) {
    result.error = String(e);
  }
  (window as unknown as { result: Result }).result = result;
}
void main();
