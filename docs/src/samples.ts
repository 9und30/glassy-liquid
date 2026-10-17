import { iconTokens } from "./demos";
import { icons } from "./icons";

/** Web Component samples paste with the real icon, not an empty `<svg />`. */
export function sampleSource(html: string): string {
  return html.replace(iconTokens, (_m, name: string, slot?: string) => {
    const svg: string = icons[name as keyof typeof icons] ?? "";
    return slot && svg ? svg.replace("<svg ", `<svg slot="${slot}" `) : svg;
  });
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
