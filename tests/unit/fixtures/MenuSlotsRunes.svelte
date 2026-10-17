<script>
  import GlassButton from "../../../src/svelte/components/GlassButton.svelte";
  import GlassMenu from "../../../src/svelte/components/GlassMenu.svelte";
  import GlassMenuItem from "../../../src/svelte/components/GlassMenuItem.svelte";
  let label = $state("Open");
</script>

<GlassButton>
  <svg slot="icon" class="ico"></svg>
  Save
  <span slot="trailing" class="tr">S</span>
</GlassButton>

<GlassMenu>
  <button slot="trigger" class="trig" type="button">{label}</button>
  <GlassMenuItem>
    Copy
    <span slot="shortcut" class="sc">C</span>
  </GlassMenuItem>
</GlassMenu>
