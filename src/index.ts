export { glass, GlassSurface, getSurface, defaultGlassOptions } from "./engine/surface.js";
export type {
  GlassOptions,
  ResolvedGlassOptions,
  SceneHost,
  SceneBinding,
} from "./engine/surface.js";
export { materials } from "./engine/materials.js";
export type { GlassMaterial, GlassAppearance, MaterialSpec } from "./engine/materials.js";
export { Spring, springs, rubberBand, clamp, mix } from "./core/spring.js";
export type { SpringConfig } from "./core/spring.js";
export { shapeMetrics, resolveRadius } from "./core/shape.js";
export type { GlassRadius, ShapeMetrics } from "./core/shape.js";
export type { BezelProfile, OpticsConfig } from "./core/optics.js";
export { supportsBackdropSvg, supportsWebGL } from "./core/env.js";
export type { EngineKind } from "./core/env.js";
export { GlassElement, define, hostCss, accentCss, parseRadius } from "./components/base.js";
export { attachPress, tapSlop } from "./interaction/press.js";
export type { PressOptions, PressController } from "./interaction/press.js";
export { ThumbLens, thumbCss } from "./interaction/thumb.js";
export type { ThumbLensOptions } from "./interaction/thumb.js";
export { place, lerpRect, viewportRect } from "./interaction/morph.js";
export type { Rect, Placement } from "./interaction/morph.js";
export { addTask, wake } from "./core/ticker.js";
export type { FrameTask } from "./core/ticker.js";
export { adoptStyles } from "./engine/styles.js";
export { resolveAppearance, onAppearanceChange, updateAppearance } from "./engine/appearance.js";
