/**
 * Side-effect entry: registers every glass custom element.
 *
 * ```js
 * import "glassy-liquid/elements";
 * ```
 */
// Scenes first, so glass inside them finds its scene on upgrade.
import "./scene/scene.js";
import "./components/surface.js";
import "./components/button.js";
import "./components/switch.js";
import "./components/slider.js";
import "./components/selector.js";
import "./components/menu.js";
import "./components/toolbar.js";
import "./components/search.js";
import "./components/sheet.js";
import "./components/progressive-blur.js";

export * from "./index.js";
