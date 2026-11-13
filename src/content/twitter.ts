import { clickbaitThumbUrl, hypeTitle } from "../core/dehype.js";
import type { SieveConfig } from "../types.js";
import {
  applyHtmlFlags,
  bootSiteAdapter,
  createRafScheduler,
  parseCompactMetric,
} from "./shared.js";

const EVIL_X_FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23ff1e42' d='M4 3L6.5 7L9 5L15 5L17.5 7L20 3L19.5 10.5L14.5 12L20 20H16L12 14.5L8 20H4L9.5 12L4.5 10.5Z'/%3E%3C/svg%3E";

let activeConfig: SieveConfig | null = null;

function syncEvilBranding(): void {
  if (!activeConfig?.enabled || !activeConfig.x.enabled || !activeConfig.x.classicBird) return;
  if (document.title.endsWith(" / X")) {
    document.title = `${document.title.slice(0, -4)} / EVIL X`;
  } else if (document.title === "X") {
    document.title = "EVIL X";
  }

  const icon = document.querySelector<HTMLLinkElement>('link[rel="shortcut icon"], link[rel="icon"]');
  if (icon && icon.href !== EVIL_X_FAVICON) {
    icon.href = EVIL_X_FAVICON;
  }
}

function readTweetMetric(tweet: HTMLElement, testId: string): number {
  const btn = tweet.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!btn) return 0;
  const aria = btn.getAttribute("aria-label");
  if (aria) return parseCompactMetric(aria);
  return parseCompactMetric(btn.textContent);
}

function isRagebaitRatio(tweet: HTMLElement): boolean {
  const replies = readTweetMetric(tweet, "reply");
  const likes = readTweetMetric(tweet, "like");
  // Keep only ratio'd / high-controversy tweets where comments are high relative to likes.
  if (replies >= 5 && replies >= likes * 0.35) return true;
  if (replies >= 20 && likes === 0) return true;
  return false;
}

function filterToRagebaitOnly(): void {
  if (!activeConfig?.enabled || !activeConfig.x.enabled || !activeConfig.x.caliberFilter) return;

  const cells = document.querySelectorAll<HTMLElement>(
    'div[data-testid="primaryColumn"] [data-testid="cellInnerDiv"]',
  );

  cells.forEach((cell) => {
    const tweet = cell.querySelector<HTMLElement>('[data-testid="tweet"]');
    if (!tweet) return;

    if (isRagebaitRatio(tweet)) {
      delete cell.dataset.eveisXDropped;
      cell.dataset.eveisXBoosted = "1";
    } else {
      delete cell.dataset.eveisXBoosted;
      cell.dataset.eveisXDropped = "1";
    }
  });
}

function bloatTimelineDom(): void {
  const xOn = Boolean(activeConfig?.enabled && activeConfig.x.enabled);
  if (!xOn || !activeConfig) return;

  filterToRagebaitOnly();

  document
    .querySelectorAll<HTMLImageElement>('img[src*="ytimg.com/vi"]:not([data-eveis-thumb])')
    .forEach((img) => {
      img.dataset.eveisThumb = "1";
      const next = clickbaitThumbUrl(img.src);
      if (next !== img.src) img.src = next;
    });

  document
    .querySelectorAll<HTMLElement>('[data-testid="tweetText"]:not([data-eveis-hype])')
    .forEach((tweetText) => {
      tweetText.dataset.eveisHype = "1";
      const walker = document.createTreeWalker(tweetText, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const val = node.nodeValue;
        if (!val || val.trim().length < 12) continue;
        const hyped = hypeTitle(val);
        if (hyped !== val) node.nodeValue = hyped;
        break;
      }
    });
}

const scheduleBloat = createRafScheduler(bloatTimelineDom);

bootSiteAdapter((cfg) => {
  activeConfig = cfg;
  const xOn = cfg.enabled && cfg.x.enabled;
  applyHtmlFlags({
    eveisXOn: xOn ? "1" : "0",
    eveisXEvil: xOn && cfg.x.classicBird ? "1" : "0",
    eveisXSidebar: xOn && cfg.x.cleanSidebar ? "1" : "0",
    eveisXNav: xOn && cfg.x.cleanNav ? "1" : "0",
  });
  syncEvilBranding();
  scheduleBloat();
});

const titleObserver = new MutationObserver(syncEvilBranding);
const watchHead = () => {
  if (document.head) {
    syncEvilBranding();
    titleObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
  }
};

if (document.head) watchHead();
else document.addEventListener("DOMContentLoaded", watchHead, { once: true });

const bodyObserver = new MutationObserver(() => {
  if (activeConfig?.enabled && activeConfig.x.enabled) {
    scheduleBloat();
  }
});

if (document.documentElement) {
  bodyObserver.observe(document.documentElement, { childList: true, subtree: true });
}
