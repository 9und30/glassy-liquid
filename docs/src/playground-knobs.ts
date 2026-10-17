/**
 * The playground's controls. The build prints them with the default values so
 * the panel has its final height before any script runs; boot.ts wires them.
 */
import { defaultPlayState, formatNumber, type PlayState } from "./playground-snippets";

export type Ground = "glacier" | "lake" | "city" | "fruit";
export type KnobState = PlayState & { bg: Ground };

export const defaultKnobState = (): KnobState => ({ ...defaultPlayState(), bg: "glacier" });

export type NumericKey = "radius" | "refraction" | "bezel" | "blur" | "dispersion" | "specular" | "lightAngle" | "zoom";

/** key, label, min, max, step, unit */
export const knobRanges: Array<[NumericKey, string, number, number, number, string]> = [
  ["radius", "Radius", 0, 80, 1, "px"],
  ["refraction", "Refraction", 0, 48, 1, "px"],
  ["bezel", "Bezel", 4, 64, 1, "px"],
  ["blur", "Blur", 0, 24, 0.5, "px"],
  ["dispersion", "Dispersion", 0, 1, 0.05, ""],
  ["specular", "Specular", 0, 2, 0.05, ""],
  ["lightAngle", "Light angle", -180, 180, 5, "°"],
  ["zoom", "Zoom", 1, 1.4, 0.01, ""],
];

const tints: Array<[string, string]> = [
  ["", "None"],
  ["#c4622d", "Copper"],
  ["#0a84ff", "Blue"],
  ["#2f6b4f", "Pine"],
  ["#6b3fa0", "Ink"],
];

export function knobsMarkup(state: KnobState = defaultKnobState()): string {
  const current = (key: string) =>
    key === "tint" ? (state.tint ?? "") : String((state as unknown as Record<string, unknown>)[key]);
  const choice = (key: string, label: string, options: Array<[string, string]>) =>
    `<div class="knob"><div class="knob__top"><span>${label}</span></div><div class="choices" role="group" aria-label="${label}">${options
      .map(([v, l]) => `<button class="choice" type="button" data-choice="${key}" data-value="${v}" aria-pressed="${current(key) === v}">${l}</button>`)
      .join("")}</div></div>`;
  return [
    choice("material", "Material", [["regular", "Regular"], ["clear", "Clear"]]),
    choice("appearance", "Appearance", [["light", "Light"], ["dark", "Dark"]]),
    choice("profile", "Profile", [["squircle", "Squircle"], ["convex", "Convex"], ["lip", "Lip"], ["flat", "Flat"]]),
    choice("bg", "Ground", [["glacier", "Ice"], ["lake", "Lake"], ["city", "City"], ["fruit", "Fruit"]]),
    ...knobRanges.map(
      ([key, label, min, max, step, unit]) =>
        `<div class="knob"><div class="knob__top"><label for="k-${key}">${label}</label><output id="o-${key}">${formatNumber(state[key], step)}${unit}</output></div><glass-slider id="k-${key}" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${state[key]}" aria-label="${label}"></glass-slider></div>`,
    ),
    `<div class="knob"><div class="knob__top"><span id="tint-label">Tint</span></div><div class="tint-row" role="group" aria-labelledby="tint-label">${tints
      .map(([v, l]) => `<button class="choice${v ? " choice--color" : ""}" type="button" data-choice="tint" data-value="${v}" aria-label="${l}" aria-pressed="${current("tint") === v}">${v ? `<i style="background:${v}"></i>` : l}</button>`)
      .join("")}<label class="tint-custom">Custom <input id="tint-custom" type="color" value="#c4622d" aria-label="Custom tint" /></label></div></div>`,
    `<div class="knob"><div class="knob__top"><span>Shadow</span><glass-switch id="k-shadow" aria-label="Shadow"${state.shadow ? " checked" : ""}></glass-switch></div></div>`,
    `<div class="knob"><div class="knob__top"><span>Press response</span><glass-switch id="k-press" aria-label="Press response"${state.interactive ? " checked" : ""}></glass-switch></div></div>`,
  ].join("");
}
