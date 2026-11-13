import { clickbaitThumbUrl, hypeTitle } from "../core/dehype.js";
import { type SieveConfig } from "../types.js";
import {
  applyHtmlFlags,
  bootSiteAdapter,
  createRafScheduler,
} from "./shared.js";

const AI_BUTTON_RE = /\bgemini\b|\bask\s+youtube\b|\bsearch\s+with\s+ai\b|\bask\s+ai\b|^ask$/i;

let activeConfig: SieveConfig | null = null;

function enforceShortsOnlyRoutes(): void {
  if (!activeConfig?.enabled || !activeConfig.youtube.enabled || !activeConfig.youtube.hideShorts) {
    return;
  }
  const path = window.location.pathname;
  if (
    path.startsWith("/watch") ||
    path.startsWith("/live") ||
    path.startsWith("/results") ||
    path.startsWith("/feed")
  ) {
    window.location.replace("https://www.youtube.com/shorts/");
  }
}

function bloatHeaderButtons(): void {
  document
    .querySelectorAll<HTMLElement>(
      "ytd-masthead button, ytd-masthead a, ytd-masthead [role='button'], ytd-watch-metadata button, ytd-watch-metadata a",
    )
    .forEach((el) => {
      if (el.dataset.eveisYtAsk === "1") return;
      const aria = (el.getAttribute("aria-label") ?? "").trim();
      const title = (el.getAttribute("title") ?? "").trim();
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (AI_BUTTON_RE.test(aria) || AI_BUTTON_RE.test(title) || AI_BUTTON_RE.test(text)) {
        const wrapper =
          el.closest<HTMLElement>(
            "yt-button-view-model, ytd-button-renderer, ytd-topbar-menu-button-renderer",
          ) ?? el;
        wrapper.dataset.eveisYtAsk = "1";
      }
    });
}

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

function randomizeColors(): void {
  const page = document.querySelector<HTMLElement>("ytd-app, ytd-browse");
  if (page && !page.dataset.eveisColored) {
    page.dataset.eveisColored = "1";
    page.style.setProperty("background", pickNastyColor(), "important");
  }

  const masthead = document.querySelector<HTMLElement>("ytd-masthead, ytd-masthead #background");
  if (masthead && !masthead.dataset.eveisColored) {
    masthead.dataset.eveisColored = "1";
    masthead.style.setProperty("background", pickNastyColor(), "important");
  }

  document
    .querySelectorAll<HTMLElement>(
      "ytd-rich-item-renderer:not([data-eveis-colored]), ytd-reel-video-renderer:not([data-eveis-colored])",
    )
    .forEach((card) => {
      card.dataset.eveisColored = "1";
      card.style.setProperty("background", pickNastyColor(), "important");
      card.style.setProperty("padding", "8px", "important");
    });

  document
    .querySelectorAll<HTMLElement>(
      "#video-title:not([data-eveis-colored]), .shortsLockupViewModelHostMetadataTitle span:not([data-eveis-colored]), yt-formatted-string:not([data-eveis-colored])",
    )
    .forEach((el) => {
      el.dataset.eveisColored = "1";
      el.style.setProperty("color", pickNastyColor(), "important");
      el.style.setProperty("background-color", pickNastyColor(), "important");
    });
}

function bloatRenderedCards(): void {
  const ytOn = Boolean(activeConfig?.enabled && activeConfig.youtube.enabled);
  if (!ytOn || !activeConfig) return;

  enforceShortsOnlyRoutes();
  randomizeColors();

  if (activeConfig.youtube.midFrameThumbs) {
    document
      .querySelectorAll<HTMLImageElement>('img[src*="ytimg.com/vi"]:not([data-eveis-thumb])')
      .forEach((img) => {
        img.dataset.eveisThumb = "1";
        const next = clickbaitThumbUrl(img.src);
        if (next !== img.src) img.src = next;
      });
  }

  if (activeConfig.youtube.calmTitles) {
    document
      .querySelectorAll<HTMLElement>(
        "#video-title:not([data-eveis-hype]), .yt-lockup-metadata-view-model__title:not([data-eveis-hype]), .shortsLockupViewModelHostMetadataTitle span:not([data-eveis-hype])",
      )
      .forEach((el) => {
        el.dataset.eveisHype = "1";
        const raw = el.textContent;
        if (!raw) return;
        const hyped = hypeTitle(raw);
        if (hyped !== raw) el.textContent = hyped;
      });
  }

  if (activeConfig.youtube.cleanHeader) {
    bloatHeaderButtons();
  }
}

const scheduleBloat = createRafScheduler(bloatRenderedCards);

function handleNavigationChange(): void {
  enforceShortsOnlyRoutes();
  scheduleBloat();
}

bootSiteAdapter((cfg) => {
  activeConfig = cfg;
  const ytOn = cfg.enabled && cfg.youtube.enabled;
  applyHtmlFlags({
    eveisYtOn: ytOn ? "1" : "0",
    eveisYtShorts: ytOn && cfg.youtube.hideShorts ? "1" : "0",
    eveisYtHeader: ytOn && cfg.youtube.cleanHeader ? "1" : "0",
  });
  handleNavigationChange();
});

window.addEventListener("yt-navigate-start", handleNavigationChange);
window.addEventListener("yt-navigate-finish", handleNavigationChange);
window.addEventListener("popstate", handleNavigationChange);

const observer = new MutationObserver(() => {
  if (activeConfig?.enabled && activeConfig.youtube.enabled) {
    scheduleBloat();
  }
});

if (document.documentElement) {
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
