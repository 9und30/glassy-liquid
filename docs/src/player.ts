/**
 * The hero's music player. Playback is simulated: time runs on the frame clock,
 * nothing is downloaded, and nothing makes a sound. Built from <glass-surface>,
 * <glass-button>, and <glass-slider>, the same controls the docs ship.
 */
import { icons } from "./icons";
import { coverUrl, formatTime, seekText, tracks, type Track } from "./player-data";
import type { Scope } from "./scope";

type Repeat = "off" | "all" | "one";
type SliderEl = HTMLElement & { value: number };

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function setIcon(host: Element | null, name: keyof typeof icons): void {
  const slot = host?.querySelector("[data-icon]");
  if (!slot || slot.getAttribute("data-icon") === name) return;
  slot.setAttribute("data-icon", name);
  slot.innerHTML = icons[name];
}

export interface PlayerHandle {
  readonly playing: boolean;
  readonly index: number;
  readonly time: number;
}

export function mountPlayer(root: HTMLElement, scope: Scope): PlayerHandle {
  const q = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const cover = q(".deck__cover")!;
  const titleEl = q("[data-title]")!;
  const artistEl = q("[data-artist]")!;
  const albumEl = q("[data-album]")!;
  const meta = q(".deck__meta")!;
  const seek = q<SliderEl>("[data-seek]")!;
  const elapsed = q("[data-elapsed]")!;
  const remaining = q("[data-remaining]")!;
  const play = q("[data-play]")!;
  const prev = q("[data-prev]")!;
  const next = q("[data-next]")!;
  const shuffleBtn = q("[data-shuffle]")!;
  const repeatBtn = q("[data-repeat]")!;
  const like = q("[data-like]")!;
  const volume = q<SliderEl>("[data-volume]")!;
  const queueToggle = q("[data-queue-toggle]")!;
  const queue = q("[data-queue]")!;
  const announce = q("[data-announce]")!;
  const rows = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-track]"));

  let index = 0;
  let time = 0;
  let playing = false;
  let shuffle = false;
  let repeat: Repeat = (repeatBtn.getAttribute("data-repeat") as Repeat) || "all";
  let scrubbing = false;
  let visible = true;
  let raf = 0;
  let last = 0;
  let shownSecond = -1;
  const liked = new Set<string>();
  const track = (): Track => tracks[index]!;

  // Real covers replace the gradient stand-ins.
  for (const row of rows) {
    const t = tracks[Number(row.dataset.track)];
    const thumb = row.querySelector<HTMLElement>(".deck__thumb");
    if (t && thumb) thumb.style.backgroundImage = coverUrl(t);
  }
  const firstArt = cover.querySelector<HTMLElement>(".deck__art");
  if (firstArt) firstArt.style.backgroundImage = coverUrl(track());

  const paintTime = (force = false) => {
    const d = track().duration;
    const second = Math.floor(time);
    if (!scrubbing) seek.value = time;
    if (!force && second === shownSecond) return;
    shownSecond = second;
    elapsed.textContent = formatTime(time);
    remaining.textContent = `-${formatTime(d - time)}`;
    seek.setAttribute("aria-valuetext", seekText(time, d));
  };

  const paintState = () => {
    root.dataset.state = playing ? "playing" : "paused";
    root.dataset.track = String(index);
    play.setAttribute("aria-label", playing ? "Pause" : "Play");
    setIcon(play, playing ? "pause" : "play");
    shuffleBtn.setAttribute("aria-pressed", String(shuffle));
    repeatBtn.setAttribute("data-repeat", repeat);
    repeatBtn.setAttribute("aria-pressed", String(repeat !== "off"));
    repeatBtn.setAttribute("aria-label", repeat === "one" ? "Repeat one" : repeat === "all" ? "Repeat all" : "Repeat off");
    setIcon(repeatBtn, repeat === "one" ? "repeatOne" : "repeat");
    const isLiked = liked.has(track().id);
    like.setAttribute("aria-pressed", String(isLiked));
    like.setAttribute("aria-label", isLiked ? `Unlike ${track().title}` : `Like ${track().title}`);
    setIcon(like, isLiked ? "heartFill" : "heart");
    rows.forEach((row, i) => (i === index ? row.setAttribute("aria-current", "true") : row.removeAttribute("aria-current")));
  };

  const frame = (now: number) => {
    raf = 0;
    if (!playing || !scope.alive) return;
    // A background tab stops the frame clock; a long gap counts as a pause.
    const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
    last = now;
    if (!scrubbing) time += dt;
    if (time >= track().duration) {
      ended();
      if (!playing) return;
    }
    if (visible) paintTime();
    raf = requestAnimationFrame(frame);
  };

  const start = () => {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const setPlaying = (on: boolean) => {
    if (playing === on) return;
    playing = on;
    if (on) start();
    else stop();
    paintState();
  };

  const swap = (dir: 1 | -1) => {
    const t = track();
    const art = document.createElement("span");
    art.className = "deck__art";
    art.style.cssText = `--deep:${t.palette[0]};--mid:${t.palette[1]}`;
    art.style.backgroundImage = coverUrl(t);
    const old = Array.from(cover.querySelectorAll<HTMLElement>(".deck__art"));
    cover.append(art);
    const write = () => {
      titleEl.textContent = t.title;
      artistEl.textContent = t.artist;
      albumEl.textContent = t.album;
    };
    if (reducedMotion() || typeof art.animate !== "function") {
      for (const o of old) o.remove();
      write();
      return;
    }
    const ease = "cubic-bezier(0.16, 1, 0.3, 1)";
    art
      .animate(
        [
          { opacity: 0, transform: `translateX(${dir * 18}%) scale(1.08)` },
          { opacity: 1, transform: "none" },
        ],
        { duration: 420, easing: ease },
      )
      .finished.then(
        () => {
          for (const o of old) o.remove();
        },
        () => {},
      );
    for (const o of old) o.animate([{ opacity: 1 }, { opacity: 0, transform: `translateX(${dir * -10}%) scale(.94)` }], { duration: 300, easing: ease, fill: "forwards" });
    meta
      .animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateX(${dir * -12}px)` }], { duration: 140, easing: "ease-in" })
      .finished.then(
        () => {
          write();
          meta.animate([{ opacity: 0, transform: `translateX(${dir * 12}px)` }, { opacity: 1, transform: "none" }], { duration: 320, easing: ease });
        },
        write,
      );
  };

  const load = (i: number, dir: 1 | -1 = 1, say = true) => {
    const nextIndex = (i + tracks.length) % tracks.length;
    const changed = nextIndex !== index;
    index = nextIndex;
    time = 0;
    seek.setAttribute("max", String(track().duration));
    seek.value = 0;
    shownSecond = -1;
    if (changed) swap(dir);
    paintTime(true);
    paintState();
    if (say) announce.textContent = `${track().title} by ${track().artist}`;
  };

  const pickNext = (): number => {
    if (!shuffle || tracks.length < 2) return index + 1;
    let n = index;
    while (n === index) n = Math.floor(Math.random() * tracks.length);
    return n;
  };

  function ended(): void {
    if (repeat === "one") {
      time = 0;
      shownSecond = -1;
      return;
    }
    const n = pickNext();
    if (repeat === "off" && !shuffle && n >= tracks.length) {
      load(0, 1);
      setPlaying(false);
      return;
    }
    load(n, 1);
  }

  const seekTo = (t: number) => {
    time = Math.max(0, Math.min(track().duration - 0.05, t));
    shownSecond = -1;
    paintTime(true);
  };

  scope.on(play, "click", () => setPlaying(!playing));
  scope.on(next, "click", () => load(pickNext(), 1));
  scope.on(prev, "click", () => {
    // Like every player: a few seconds in, Previous rewinds the track first.
    if (time > 3) seekTo(0);
    else load(index - 1, -1);
  });
  scope.on(shuffleBtn, "click", () => {
    shuffle = !shuffle;
    paintState();
  });
  scope.on(repeatBtn, "click", () => {
    repeat = repeat === "off" ? "all" : repeat === "all" ? "one" : "off";
    paintState();
  });
  scope.on(like, "click", () => {
    const id = track().id;
    if (liked.has(id)) liked.delete(id);
    else liked.add(id);
    paintState();
    if (!reducedMotion() && liked.has(id))
      like.querySelector("svg")?.animate([{ transform: "scale(1)" }, { transform: "scale(1.32)" }, { transform: "scale(1)" }], { duration: 380, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" });
  });
  scope.on(queueToggle, "click", () => {
    const open = queue.hidden;
    queue.hidden = !open;
    queueToggle.setAttribute("aria-expanded", String(open));
    root.toggleAttribute("data-queue-open", open);
  });
  for (const row of rows)
    scope.on(row, "click", () => {
      const i = Number(row.dataset.track);
      if (i === index) {
        setPlaying(!playing);
        return;
      }
      load(i, i > index ? 1 : -1);
      setPlaying(true);
    });

  // Scrubbing: the slider owns the value while a finger or pointer holds it.
  scope.on(seek, "pointerdown", () => {
    scrubbing = true;
  });
  const release = () => {
    if (!scrubbing) return;
    scrubbing = false;
    seekTo(seek.value);
  };
  scope.on(window, "pointerup", release);
  scope.on(window, "pointercancel", release);
  scope.on(seek, "input", () => {
    time = Math.max(0, Math.min(track().duration - 0.05, seek.value));
    shownSecond = -1;
    elapsed.textContent = formatTime(time);
    remaining.textContent = `-${formatTime(track().duration - time)}`;
    seek.setAttribute("aria-valuetext", seekText(time, track().duration));
  });
  scope.on(seek, "change", () => {
    scrubbing = false;
    seekTo(seek.value);
  });
  // The slider is continuous, so its own arrow step would be a hair. Seek in
  // five-second steps instead, the way media players do.
  scope.on(
    root,
    "keydown",
    (e: KeyboardEvent) => {
      if (e.target !== seek) return;
      const d = track().duration;
      const jumps: Record<string, number> = {
        ArrowRight: time + 5,
        ArrowUp: time + 5,
        ArrowLeft: time - 5,
        ArrowDown: time - 5,
        PageUp: time + 30,
        PageDown: time - 30,
        Home: 0,
        End: d - 1,
      };
      const to = jumps[e.key];
      if (to === undefined) return;
      e.preventDefault();
      e.stopPropagation();
      seekTo(to);
    },
    { capture: true },
  );

  scope.on(volume, "input", () => volume.setAttribute("aria-valuetext", `${Math.round(volume.value)}%`));
  scope.on(volume, "change", () => volume.setAttribute("aria-valuetext", `${Math.round(volume.value)}%`));

  if ("IntersectionObserver" in window) {
    const io = scope.observe(
      new IntersectionObserver((entries) => {
        visible = entries.some((e) => e.isIntersecting);
        if (visible) paintTime(true);
      }),
    );
    io.observe(root);
  }
  scope.add(stop);

  // Open the queue where there is room for it.
  if (matchMedia("(min-width: 60rem) and (min-height: 62rem)").matches) {
    queue.hidden = false;
    queueToggle.setAttribute("aria-expanded", "true");
    root.setAttribute("data-queue-open", "");
  }
  paintTime(true);
  paintState();
  root.setAttribute("data-ready", "");

  return {
    get playing() {
      return playing;
    },
    get index() {
      return index;
    },
    get time() {
      return time;
    },
  };
}
