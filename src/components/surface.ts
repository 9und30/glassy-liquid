/**
 * <glass-surface> - a generic Liquid Glass container (cards, panels, bars,
 * widgets). Put any content inside.
 *
 * ```html
 * <glass-surface radius="28" material="regular" style="padding:20px">
 *   <h3>Weather</h3>
 * </glass-surface>
 * ```
 */
import { GlassElement, define } from "./base.js";

export class GlassSurfaceElement extends GlassElement {
  static override glassDefaults = { radius: 24 };
  static override styles = /* css */ `:host{display:block;}`;
}

define("glass-surface", GlassSurfaceElement);
