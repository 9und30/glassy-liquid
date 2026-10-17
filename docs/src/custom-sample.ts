/** Source shown for "your own element". The live player on the page is a separate class. */
export const customSource = `import { GlassElement } from "glassy-liquid";

class NowPlaying extends GlassElement {
  static glassDefaults = { radius: 30, material: "clear" };
  static interactive = true;
  static extraAttributes = ["title", "artist"];
  static styles = \`
    :host { display: flex; gap: 14px; align-items: center; padding: 12px 18px 12px 12px; color: #fff; }
    .art { width: 54px; height: 54px; border-radius: 14px; background: center/cover url(img/silk.webp); }
    b { display: block; font: 600 16px/1.2 system-ui; }
    span { font: 500 14px/1.3 system-ui; opacity: .75; }\`;

  render() {
    return \`<div class="art"></div><div><b></b><span></span></div>\`;
  }

  // Text from attributes goes in with textContent, never into the markup string.
  setup() {
    this.shadow.querySelector("b").textContent = this.getAttribute("title") ?? "";
    this.shadow.querySelector("span").textContent = this.getAttribute("artist") ?? "";
  }
}

customElements.define("now-playing", NowPlaying);`;
