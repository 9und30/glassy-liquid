import { chromium } from "playwright";
for (const args of [
  [],
  ["--enable-unsafe-webgpu"],
  ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--enable-features=Vulkan"],
  ["--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader"],
]) {
  const b = await chromium.launch({ args });
  const p = await b.newPage();
  await p.goto("http://localhost:5199/index.html");
  const r = await p.evaluate(async () => {
    if (!navigator.gpu) return "no navigator.gpu";
    const a = await navigator.gpu.requestAdapter();
    return a ? "adapter ok" : "no adapter";
  });
  console.log(JSON.stringify(args), r);
  await b.close();
}
