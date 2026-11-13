import { hypeTitle } from "../core/dehype.js";
import type { SieveConfig } from "../types.js";
import {
  applyHtmlFlags,
  bootSiteAdapter,
  createRafScheduler,
  pauseAllMedia,
} from "./shared.js";

const REDDIT_AI_STORY_RE =
  /(?:#(?:reddit(?:stories|readings|story|_irl)?|aita|amitheasshole|askreddit|tifu|storytime|subwaysurfers|minecraftparkour|parkour|satisfying)\b|\br\/(?:aita|askreddit|tifu|confession|relationships|pettyrevenge|prorevenge|maliciouscompliance|trueoffmychest)\b|\b(?:aita\s+for|am\s+i\s+the\s+asshole|reddit\s+stor(?:y|ies)|ai\s+stor(?:y|ies)|texting\s+story|fake\s+text|story\s*time)\b)/i;

let activeConfig: SieveConfig | null = null;
let lastCheckedPath = "";

function enforceEvilDarkMode(enabled: boolean): void {
  if (!enabled) return;
  try {
    document.cookie =
      "tiktok_webapp_theme=dark; path=/; domain=.tiktok.com; max-age=31536000; SameSite=Lax";
    document.cookie =
      "tiktok_webapp_theme_source=custom; path=/; domain=.tiktok.com; max-age=31536000; SameSite=Lax";
    document.documentElement?.setAttribute("data-theme", "dark");
  } catch {
    // Sandboxed frames may block cookie writes.
  }
}

function filterToRedditAiStoriesOnly(): void {
  if (!activeConfig?.enabled || !activeConfig.tiktok.enabled) return;

  document
    .querySelectorAll<HTMLElement>(
      '[data-e2e="video-desc"]:not([data-eveis-hype]), [data-e2e="browse-video-desc"]:not([data-eveis-hype])',
    )
    .forEach((descEl) => {
      descEl.dataset.eveisHype = "1";
      const walker = document.createTreeWalker(descEl, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const val = node.nodeValue;
        if (!val || val.trim().length < 8) continue;
        const hyped = hypeTitle(val);
        if (hyped !== val) node.nodeValue = hyped;
        break;
      }
    });

  if (!activeConfig.tiktok.caliberFilter) return;

  const cards = document.querySelectorAll<HTMLElement>(
    '[data-e2e="recommend-list-item-container"], article[data-scroll-index], [data-e2e="explore-item"]',
  );

  cards.forEach((card) => {
    const descText =
      card.querySelector('[data-e2e="video-desc"], [data-e2e="browse-video-desc"]')?.textContent ?? "";
    const authorHref = card.querySelector<HTMLAnchorElement>('a[href^="/@"]')?.getAttribute("href") ?? "";
    const fullText = `${descText} ${authorHref} ${card.textContent ?? ""}`.slice(0, 600);

    if (REDDIT_AI_STORY_RE.test(fullText)) {
      delete card.dataset.eveisTtDropped;
      card.dataset.eveisTtBoosted = "1";
    } else {
      delete card.dataset.eveisTtBoosted;
      card.dataset.eveisTtDropped = "1";
      pauseAllMedia(card);
    }
  });
}

function runTikTokSweep(): void {
  const ttOn = Boolean(activeConfig?.enabled && activeConfig.tiktok.enabled);
  const forceEvilDark = Boolean(ttOn && activeConfig?.tiktok.lightMode);

  applyHtmlFlags({
    eveisTtOn: ttOn ? "1" : "0",
    eveisTtChrome: ttOn && activeConfig?.tiktok.cleanChrome ? "1" : "0",
    eveisTtDark: forceEvilDark ? "1" : "0",
  });

  enforceEvilDarkMode(forceEvilDark);
  filterToRedditAiStoriesOnly();
}

const scheduleSweep = createRafScheduler(runTikTokSweep);

document.addEventListener(
  "play",
  (event) => {
    const target = event.target;
    if (!(target instanceof HTMLMediaElement)) return;
    if (target.closest('[data-eveis-tt-dropped="1"]')) {
      target.muted = true;
      target.pause();
    }
  },
  true,
);

bootSiteAdapter((cfg) => {
  activeConfig = cfg;
  scheduleSweep();
});

window.addEventListener("popstate", scheduleSweep);

const observer = new MutationObserver(() => {
  if (activeConfig?.enabled && activeConfig.tiktok.enabled) {
    scheduleSweep();
  }
});

if (document.documentElement) {
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

setInterval(() => {
  if (window.location.pathname !== lastCheckedPath) {
    lastCheckedPath = window.location.pathname;
    scheduleSweep();
  }
}, 250);
