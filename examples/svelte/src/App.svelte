<script>
  import { GlassButton, GlassScene, GlassSlider, GlassSurface, GlassSwitch } from "glassy-liquid/svelte";

  let wifi = $state(true);
  let level = $state(64);
</script>

<GlassScene src="/wallpaper.webp" style="min-height: 100svh; display: grid; place-items: center; padding: 24px">
  <main>
  <GlassSurface radius={28} style="width: min(320px, 100%); padding: 22px; display: grid; gap: 14px">
    <h1 style="margin: 0; font: 560 1.8rem/1 Georgia, serif; letter-spacing: -0.03em">Svelte</h1>
    <p style="margin: 0">{wifi ? "Wi-Fi is on" : "Wi-Fi is off"} · {level}</p>
    <label style="display: flex; justify-content: space-between; align-items: center">
      Wi-Fi <GlassSwitch bind:checked={wifi} aria-label="Wi-Fi" />
    </label>
    <GlassSlider bind:value={level} aria-label="Brightness" />
    <GlassButton variant="prominent" onclick={() => (wifi = !wifi)}>Toggle Wi-Fi</GlassButton>
  </GlassSurface>
  </main>
</GlassScene>
