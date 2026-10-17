import { chromium } from "playwright";
const tries = [
  { channel: "chromium", args: ["--enable-unsafe-webgpu"] },
  {
    channel: "chromium",
    args: [
      "--enable-unsafe-webgpu",
      "--enable-features=Vulkan",
      "--use-vulkan=swiftshader",
      "--use-webgpu-adapter=swiftshader",
    ],
  },
  { channel: "chrome", args: ["--enable-unsafe-webgpu"] },
  { channel: "msedge", args: ["--enable-unsafe-webgpu"] },
];
for (const opt of tries) {
  try {
    const b = await chromium.launch({ headless: true, ...opt });
    const p = await b.newPage();
    await p.goto("http://localhost:5199/index.html");
    const r = await p.evaluate(async () => {
      if (!navigator.gpu) return "no navigator.gpu";
      const a = await navigator.gpu.requestAdapter();
      return a
        ? "adapter ok: " + (a.info?.vendor ?? "") + " " + (a.info?.architecture ?? "")
        : "no adapter";
    });
    console.log(JSON.stringify(opt), r);
    await b.close();
  } catch (e) {
    console.log(JSON.stringify(opt), "launch failed:", String(e.message).split("\n")[0]);
  }
}
