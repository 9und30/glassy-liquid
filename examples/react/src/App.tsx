import { useState } from "react";
import { GlassButton, GlassScene, GlassSlider, GlassSurface, GlassSwitch } from "glassy-liquid/react";

export function App() {
  const [wifi, setWifi] = useState(true);
  const [level, setLevel] = useState(64);
  return (
    <GlassScene src="/wallpaper.webp" style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: 24 }}>
      <main>
      <GlassSurface radius={28} style={{ width: "min(320px, 100%)", padding: 22, display: "grid", gap: 14 }}>
        <h1 style={{ margin: 0, font: "560 1.8rem/1 Georgia, serif", letterSpacing: "-0.03em" }}>React</h1>
        <p style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>{wifi ? "Wi-Fi is on" : "Wi-Fi is off"} · {level}</p>
        <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "system-ui, sans-serif" }}>
          Wi-Fi <GlassSwitch checked={wifi} onCheckedChange={setWifi} aria-label="Wi-Fi" />
        </label>
        <GlassSlider value={level} onValueChange={setLevel} aria-label="Brightness" />
        <GlassButton variant="prominent" onClick={() => setWifi((v) => !v)}>Toggle Wi-Fi</GlassButton>
      </GlassSurface>
      </main>
    </GlassScene>
  );
}
