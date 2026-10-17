<!-- Svelte 4 (and 5): raw custom elements plus the glassProps action.
     Not mounted by this example. The running app is App.svelte. -->
<script>
  import "glassy-liquid/elements";
  import { glassProps, useGlass } from "glassy-liquid/svelte/actions";

  let wifi = true;
  let brightness = 0.6;
</script>

<glass-scene src="/wallpaper.webp" style="height: 100vh">
  <glass-switch use:glassProps={{ checked: wifi, onCheckedChange: (v) => (wifi = v) }} aria-label="Wi-Fi"></glass-switch>
  <glass-slider use:glassProps={{ value: brightness, min: 0, max: 1, step: 0.01, onValueChange: (v) => (brightness = v) }}></glass-slider>
  <div use:useGlass={{ radius: 28, material: "clear" }} style="padding: 24px">Custom glass card</div>
</glass-scene>
