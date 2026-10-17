/**
 * The hero player's catalog. Every title, artist, and album here is invented,
 * and every cover is drawn from these numbers. No real music, no real artwork.
 *
 * No DOM APIs in this file: the Vite build imports it to print the player into
 * index.html, so the page is complete before any script runs.
 */
export type CoverForm = "orbs" | "waves" | "rings" | "prism";

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  /** Seconds. */
  duration: number;
  /** Deep, mid, light, glow. */
  palette: [string, string, string, string];
  form: CoverForm;
}

export const tracks: Track[] = [
  {
    id: "glacier-mail",
    title: "Glacier Mail",
    artist: "Ostra Vale",
    album: "Low Sun Hours",
    duration: 214,
    palette: ["#0d2a4a", "#2f7fb4", "#a9e3f2", "#f4fbff"],
    form: "orbs",
  },
  {
    id: "caustic-hour",
    title: "Caustic Hour",
    artist: "Ostra Vale",
    album: "Low Sun Hours",
    duration: 242,
    palette: ["#3a120c", "#c4622d", "#f2b36b", "#fff1d6"],
    form: "waves",
  },
  {
    id: "thin-ice-telegram",
    title: "Thin Ice Telegram",
    artist: "Kessa Lune",
    album: "Specular",
    duration: 178,
    palette: ["#1c1240", "#6b3fa0", "#e08bc4", "#ffe6f4"],
    form: "rings",
  },
  {
    id: "bezel-bloom",
    title: "Bezel Bloom",
    artist: "Kessa Lune",
    album: "Specular",
    duration: 227,
    palette: ["#0c2a22", "#2f6b4f", "#9ad3a8", "#f0ffe8"],
    form: "prism",
  },
];

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Seek bar text for screen readers: "1:05 of 3:34". */
export function seekText(t: number, duration: number): string {
  return `${formatTime(t)} of ${formatTime(duration)}`;
}

function shapes(track: Track): string {
  const [deep, mid, light, glow] = track.palette;
  switch (track.form) {
    case "orbs":
      return `<g filter="url(#b)"><circle cx="28" cy="70" r="30" fill="${mid}"/><circle cx="76" cy="34" r="26" fill="${light}" opacity=".85"/><circle cx="62" cy="80" r="16" fill="${glow}" opacity=".7"/></g><circle cx="40" cy="38" r="13" fill="none" stroke="${glow}" stroke-width="1.4" opacity=".75"/>`;
    case "waves":
      return `<g filter="url(#s)"><path d="M-5 62 C 18 48, 38 76, 60 60 S 92 44, 105 56 V105 H-5Z" fill="${mid}"/><path d="M-5 74 C 22 62, 40 88, 64 74 S 94 62, 105 70 V105 H-5Z" fill="${light}" opacity=".8"/></g><circle cx="70" cy="30" r="12" fill="${glow}" opacity=".9" filter="url(#s)"/><path d="M-5 86 C 25 78, 45 96, 70 86 S 95 80, 105 84" fill="none" stroke="${glow}" stroke-width="1.2" opacity=".6"/>`;
    case "rings":
      return `<g fill="none" stroke-width="5" opacity=".9"><circle cx="64" cy="58" r="34" stroke="${mid}"/><circle cx="64" cy="58" r="24" stroke="${light}" opacity=".75"/><circle cx="64" cy="58" r="14" stroke="${glow}" opacity=".7"/></g><circle cx="64" cy="58" r="5" fill="${glow}"/><circle cx="22" cy="24" r="18" fill="${light}" opacity=".35" filter="url(#b)"/>`;
    case "prism":
      return `<g filter="url(#s)"><path d="M50 12 L88 82 H12Z" fill="${mid}" opacity=".9"/><path d="M50 30 L76 78 H24Z" fill="${light}" opacity=".7"/></g><path d="M50 12 L88 82 H12Z" fill="none" stroke="${glow}" stroke-width="1" opacity=".7"/><path d="M8 60 L50 46 L96 40" fill="none" stroke="${glow}" stroke-width="1.6" opacity=".55"/><circle cx="20" cy="22" r="10" fill="${deep}" opacity=".5"/>`;
  }
}

/** A square cover as SVG source. */
export function coverSvg(track: Track): string {
  const [deep, mid, , glow] = track.palette;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${deep}"/><stop offset="1" stop-color="${mid}"/></linearGradient><radialGradient id="r" cx=".75" cy=".2" r=".7"><stop offset="0" stop-color="${glow}" stop-opacity=".55"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter></defs><rect width="100" height="100" fill="url(#g)"/>${shapes(track)}<rect width="100" height="100" fill="url(#r)"/></svg>`;
}

/** The cover as a CSS url(). */
export function coverUrl(track: Track): string {
  return `url("data:image/svg+xml,${encodeURIComponent(coverSvg(track))}")`;
}

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Gradient stand-in so the cover is never blank before the SVG paints. */
const tone = (t: Track) => `--deep:${t.palette[0]};--mid:${t.palette[1]}`;

const icon = (name: string) => `<span data-icon="${name}"></span>`;

/** The whole player, first track loaded and paused. */
export function playerMarkup(): string {
  const first = tracks[0]!;
  const queue = tracks
    .map(
      (t, i) =>
        `<li><button class="deck__track" type="button" data-track="${i}" aria-label="${esc(t.title)} by ${esc(t.artist)}, ${formatTime(t.duration)}"${i === 0 ? ' aria-current="true"' : ""}><span class="deck__thumb" style="${tone(t)}" aria-hidden="true"></span><span class="deck__track-text"><b>${esc(t.title)}</b><span>${esc(t.artist)}</span></span><span class="deck__eq" aria-hidden="true"><i></i><i></i><i></i></span><span class="deck__track-time">${formatTime(t.duration)}</span></button></li>`,
    )
    .join("");
  return `<glass-surface class="deck" id="hero-player" radius="30" appearance="dark" role="region" aria-label="Music player, a demo built from glassy-liquid controls" data-state="paused" data-track="0">
  <div class="deck__now">
    <div class="deck__cover" aria-hidden="true"><span class="deck__art" style="${tone(first)}"></span></div>
    <div class="deck__meta">
      <p class="deck__album"><span class="deck__eq" aria-hidden="true"><i></i><i></i><i></i></span><span data-album>${esc(first.album)}</span></p>
      <p class="deck__title" data-title>${esc(first.title)}</p>
      <p class="deck__artist" data-artist>${esc(first.artist)}</p>
    </div>
    <glass-button class="deck__like" variant="plain" shape="circle" aria-label="Like" aria-pressed="false" data-like>${icon("heart")}</glass-button>
  </div>
  <div class="deck__scrub">
    <glass-slider class="deck__seek" min="0" max="${first.duration}" value="0" aria-label="Seek" aria-valuetext="${seekText(0, first.duration)}" data-seek></glass-slider>
    <div class="deck__times" aria-hidden="true"><span data-elapsed>0:00</span><span data-remaining>-${formatTime(first.duration)}</span></div>
  </div>
  <div class="deck__controls">
    <glass-button class="deck__toggle" variant="plain" shape="circle" aria-label="Shuffle" aria-pressed="false" data-shuffle>${icon("shuffle")}</glass-button>
    <glass-button class="deck__skip" variant="plain" shape="circle" aria-label="Previous track" data-prev>${icon("prev")}</glass-button>
    <glass-button class="deck__play" variant="prominent" shape="circle" size="large" aria-label="Play" data-play>${icon("play")}</glass-button>
    <glass-button class="deck__skip" variant="plain" shape="circle" aria-label="Next track" data-next>${icon("next")}</glass-button>
    <glass-button class="deck__toggle" variant="plain" shape="circle" aria-label="Repeat all" aria-pressed="true" data-repeat="all">${icon("repeat")}</glass-button>
  </div>
  <div class="deck__foot">
    <span class="deck__vol-icon" aria-hidden="true">${icon("speaker")}</span>
    <glass-slider class="deck__volume" min="0" max="100" value="72" aria-label="Volume" aria-valuetext="72%" data-volume></glass-slider>
    <span class="deck__vol-icon" aria-hidden="true">${icon("speakerLoud")}</span>
    <glass-button class="deck__toggle deck__queue-toggle" variant="plain" shape="circle" aria-label="Up next" aria-expanded="false" aria-controls="deck-queue" data-queue-toggle>${icon("queue")}</glass-button>
  </div>
  <div class="deck__queue" id="deck-queue" data-queue hidden>
    <p class="deck__queue-head">Up next</p>
    <ol>${queue}</ol>
  </div>
  <p class="sr-only" aria-live="polite" data-announce></p>
</glass-surface>`;
}
