<script setup lang="ts">
import { ref } from "vue";
import { GlassButton, GlassScene, GlassSlider, GlassSurface, GlassSwitch } from "glassy-liquid/vue";

const wifi = ref(true);
const level = ref(64);
</script>

<template>
  <GlassScene src="/wallpaper.webp" style="min-height: 100svh; display: grid; place-items: center; padding: 24px">
    <main>
    <GlassSurface :radius="28" style="width: min(320px, 100%); padding: 22px; display: grid; gap: 14px">
      <h1 style="margin: 0; font: 560 1.8rem/1 Georgia, serif; letter-spacing: -0.03em">Vue</h1>
      <p style="margin: 0">{{ wifi ? "Wi-Fi is on" : "Wi-Fi is off" }} · {{ level }}</p>
      <label style="display: flex; justify-content: space-between; align-items: center">
        Wi-Fi <GlassSwitch v-model:checked="wifi" aria-label="Wi-Fi" />
      </label>
      <GlassSlider v-model:value="level" aria-label="Brightness" />
      <GlassButton variant="prominent" @click="wifi = !wifi">Toggle Wi-Fi</GlassButton>
    </GlassSurface>
    </main>
  </GlassScene>
</template>
