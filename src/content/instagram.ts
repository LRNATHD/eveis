import { hypeTitle } from "../core/dehype.js";
import type { SieveConfig } from "../types.js";
import {
  applyHtmlFlags,
  bootSiteAdapter,
  createRafScheduler,
  parseCompactMetric,
} from "./shared.js";

const GOOD_REEL_RE =
  /\b(?:tutorial|how\s+i\s+built|diy|engineering|physics|math|science|documentary|architecture|machining|woodworking|soldering|pcb|coding|programming|timelapse|process|restoration|cinematography)\b/i;

const NASTY_PALETTE = [
  "#ff00ff",
  "#00ff00",
  "#ffff00",
  "#00ffff",
  "#ff5500",
  "#9d00ff",
  "#ff0077",
  "#aaff00",
  "#0066ff",
  "#ff99cc",
  "#ccff99",
];

function pickNastyColor(): string {
  return NASTY_PALETTE[Math.floor(Math.random() * NASTY_PALETTE.length)] ?? "#ff00ff";
}

function nukeInstagramSidebar(): void {
  const main = document.querySelector<HTMLElement>("main");
  const navLinks = document.querySelectorAll<HTMLAnchorElement>(
    'a[href="/direct/inbox/"], a[href="/explore/"], a[href="/reels/"], a[href="/"]',
  );
  for (const link of navLinks) {
    if (main && main.contains(link)) continue;
    let cur: HTMLElement | null = link.parentElement;
    let candidate: HTMLElement | null = null;
    while (cur && cur !== document.body) {
      if (main && cur.contains(main)) break;
      const rect = cur.getBoundingClientRect();
      if (rect.width >= 40 && rect.width <= 380 && rect.height >= window.innerHeight * 0.5) {
        candidate = cur;
      }
      cur = cur.parentElement;
    }
    if (candidate && !candidate.dataset.eveisIgSidebar) {
      candidate.dataset.eveisIgSidebar = "1";
      candidate.style.setProperty("display", "none", "important");
    }
  }
}

function randomizeReelColors(): void {
  const main = document.querySelector<HTMLElement>("main");
  if (document.body && !document.body.dataset.eveisColored) {
    document.body.dataset.eveisColored = "1";
    document.body.style.setProperty("background", pickNastyColor(), "important");
  }
  if (main && !main.dataset.eveisColored) {
    main.dataset.eveisColored = "1";
    main.style.setProperty("background", pickNastyColor(), "important");
  }
  document
    .querySelectorAll<HTMLElement>(
      "main span:not([data-eveis-colored]), main a:not([data-eveis-colored]), main h1:not([data-eveis-colored]), main div[dir='auto']:not([data-eveis-colored])",
    )
    .forEach((el) => {
      if (el.childElementCount > 0) return;
      el.dataset.eveisColored = "1";
      el.style.setProperty("color", pickNastyColor(), "important");
      el.style.setProperty("background-color", pickNastyColor(), "important");
    });
}

const MIN_VIRAL_SLOP_LIKES = 10_000;

let activeConfig: SieveConfig | null = null;
const lockedVideos = new WeakSet<HTMLVideoElement>();
const skippedVideos = new WeakSet<HTMLVideoElement>();
let lastSkipAt = 0;

function enforceReelsOnlyRoute(): void {
  if (!activeConfig?.enabled || !activeConfig.instagram.enabled || !activeConfig.instagram.filterReels) {
    return;
  }
  const path = window.location.pathname;
  if (!path.startsWith("/reels") && !path.startsWith("/reel/")) {
    window.location.replace("https://www.instagram.com/reels/");
  }
}

function lockVideoAt4x(video: HTMLVideoElement): void {
  try {
    if (video.defaultPlaybackRate !== 4.0) video.defaultPlaybackRate = 4.0;
    if (video.playbackRate !== 4.0) video.playbackRate = 4.0;
  } catch {
    // Ignore detached media elements.
  }

  if (lockedVideos.has(video)) return;
  lockedVideos.add(video);

  const snapTo4x = () => {
    if (!activeConfig?.enabled || !activeConfig.instagram.enabled) return;
    try {
      if (video.defaultPlaybackRate !== 4.0) video.defaultPlaybackRate = 4.0;
      if (video.playbackRate !== 4.0) video.playbackRate = 4.0;
    } catch {
      // Ignore playbackRate errors on unloaded media.
    }
  };

  video.addEventListener("ratechange", snapTo4x);
  video.addEventListener("play", snapTo4x);
  video.addEventListener("playing", snapTo4x);
  video.addEventListener("loadedmetadata", snapTo4x);
}

function findReelContainer(video: HTMLVideoElement): HTMLElement | null {
  let cur: HTMLElement | null = video.parentElement;
  while (cur && cur !== document.body) {
    const rect = cur.getBoundingClientRect();
    if (rect.height >= window.innerHeight * 0.55 && cur.querySelector("svg")) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return video.parentElement;
}

function readReelLikes(container: HTMLElement): number | null {
  const likeSvg = container.querySelector<HTMLElement>(
    'svg[aria-label="Like"], svg[aria-label="Unlike"]',
  );
  const likeBtn = likeSvg?.closest<HTMLElement>('[role="button"], button');
  if (!likeBtn) return null;

  const parent = likeBtn.parentElement;
  if (!parent) return null;

  for (const el of parent.querySelectorAll<HTMLElement>("span, a")) {
    const txt = (el.textContent ?? "").trim();
    if (/^\d+(?:[.,]\d+)?\s*[kmb]?$/i.test(txt)) {
      return parseCompactMetric(txt);
    }
  }
  return null;
}

function skipCurrentReel(): void {
  const now = Date.now();
  if (now - lastSkipAt < 450) return;
  lastSkipAt = now;

  const nextBtn = document.querySelector<HTMLElement>(
    'button[aria-label*="Next"], [role="button"][aria-label*="Next"]',
  );
  if (nextBtn) {
    nextBtn.click();
    return;
  }

  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", keyCode: 40, bubbles: true }),
  );
  window.scrollBy({ top: window.innerHeight * 0.85, behavior: "auto" });
}

function maybeSkipLowSlopReels(): void {
  if (!activeConfig?.enabled || !activeConfig.instagram.enabled || !activeConfig.instagram.caliberFilter) {
    return;
  }

  for (const video of document.querySelectorAll<HTMLVideoElement>("video")) {
    lockVideoAt4x(video);
    if (skippedVideos.has(video)) continue;

    const rect = video.getBoundingClientRect();
    const visible = rect.height > 100 && rect.top < window.innerHeight * 0.7 && rect.bottom > window.innerHeight * 0.3;
    if (!visible) continue;

    const container = findReelContainer(video);
    if (!container) continue;

    const likes = readReelLikes(container);
    const captionText = (container.textContent ?? "").slice(0, 600);
    const isGoodOrSmall =
      GOOD_REEL_RE.test(captionText) || (likes !== null && likes < MIN_VIRAL_SLOP_LIKES);

    if (isGoodOrSmall) {
      skippedVideos.add(video);
      video.muted = true;
      video.pause();
      skipCurrentReel();
      break;
    }
  }
}

function hypeRenderedCaptions(root: ParentNode): void {
  root
    .querySelectorAll<HTMLElement>("h1:not([data-eveis-hype]), span:not([data-eveis-hype])")
    .forEach((el) => {
      if (el.childElementCount > 0) return;
      const raw = el.textContent;
      if (!raw || raw.length < 16) return;
      el.dataset.eveisHype = "1";
      const hyped = hypeTitle(raw);
      if (hyped !== raw) el.textContent = hyped;
    });
}

function sweepInstagramDom(): void {
  const igOn = Boolean(activeConfig?.enabled && activeConfig.instagram.enabled);
  if (!igOn) return;

  enforceReelsOnlyRoute();
  nukeInstagramSidebar();
  maybeSkipLowSlopReels();
  randomizeReelColors();

  const main = document.querySelector<HTMLElement>('main[role="main"], main');
  if (main) {
    hypeRenderedCaptions(main);
  }
}

const scheduleSweep = createRafScheduler(sweepInstagramDom);

bootSiteAdapter((cfg) => {
  activeConfig = cfg;
  const igOn = cfg.enabled && cfg.instagram.enabled;
  applyHtmlFlags({
    eveisIgOn: igOn ? "1" : "0",
    eveisIgClutter: igOn && cfg.instagram.hideClutter ? "1" : "0",
  });
  scheduleSweep();
});

window.addEventListener("popstate", scheduleSweep);

const observer = new MutationObserver(() => {
  if (activeConfig?.enabled && activeConfig.instagram.enabled) {
    scheduleSweep();
  }
});

if (document.documentElement) {
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

setInterval(() => {
  if (activeConfig?.enabled && activeConfig.instagram.enabled) {
    enforceReelsOnlyRoute();
    maybeSkipLowSlopReels();
  }
}, 250);
