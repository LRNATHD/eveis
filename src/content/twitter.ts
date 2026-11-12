import { calmTitle, midFrameThumbUrl } from "../core/dehype.js";
import type { FeedItem, SieveConfig } from "../types.js";
import {
  applyHtmlFlags,
  bootSiteAdapter,
  createDwellTracker,
  createRafScheduler,
  evaluateDomBatch,
  installMidFrameThumbFallback,
  rememberBounded,
} from "./shared.js";

const BIRD_FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%231d9bf0' d='M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z'/%3E%3C/svg%3E";

let activeConfig: SieveConfig | null = null;
const evaluatedDomCells = new Set<string>();
const trackTweetDwell = createDwellTracker(
  (tweet) => tweet.querySelector('[data-testid="tweetText"]')?.textContent ?? "",
  1800,
);

installMidFrameThumbFallback();

function syncBirdBranding(): void {
  if (!activeConfig?.enabled || !activeConfig.x.enabled || !activeConfig.x.classicBird) return;
  if (document.title.endsWith(" / X")) {
    document.title = `${document.title.slice(0, -4)} / Twitter`;
  } else if (document.title === "X") {
    document.title = "Twitter";
  }

  const icon = document.querySelector<HTMLLinkElement>('link[rel="shortcut icon"], link[rel="icon"]');
  if (icon && icon.href !== BIRD_FAVICON) {
    icon.href = BIRD_FAVICON;
  }
}

async function evaluateExploreCells(): Promise<void> {
  if (!activeConfig?.enabled || !activeConfig.x.enabled || !activeConfig.x.caliberFilter) return;
  if (!window.location.pathname.startsWith("/explore")) return;

  const cells = document.querySelectorAll<HTMLElement>(
    'div[data-testid="primaryColumn"] [data-testid="cellInnerDiv"]:not([data-sieve-x-dropped])',
  );
  const batch: FeedItem[] = [];
  const cellById = new Map<string, HTMLElement>();

  cells.forEach((cell, idx) => {
    const trend = cell.querySelector<HTMLElement>('[data-testid="trend"]');
    if (trend) {
      const text = (trend.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!text || text.length < 3) return;
      const id = `dom_trend_${text.slice(0, 48)}`;
      if (!rememberBounded(evaluatedDomCells, id)) return;
      cellById.set(id, cell);
      batch.push({
        platform: "x",
        id,
        surface: "search",
        titleOrText: text.slice(0, 180),
      });
      return;
    }

    const tweet = cell.querySelector<HTMLElement>('[data-testid="tweet"]');
    if (tweet) {
      const statusLink = tweet.querySelector<HTMLAnchorElement>('a[href*="/status/"]');
      const match = /\/([^/]+)\/status\/(\d+)/.exec(statusLink?.getAttribute("href") ?? "");
      const tweetBody = tweet.querySelector('[data-testid="tweetText"]')?.textContent?.trim() ?? "";
      if (!tweetBody) return;
      const id = match?.[2] ?? `dom_explore_tw_${idx}_${tweetBody.slice(0, 24)}`;
      if (!rememberBounded(evaluatedDomCells, id)) return;
      cellById.set(id, cell);
      batch.push({
        platform: "x",
        id,
        creatorHandle: match?.[1],
        surface: "search",
        titleOrText: tweetBody,
      });
    }
  });

  await evaluateDomBatch(batch, (dropId) => {
    const cell = cellById.get(dropId);
    if (cell) cell.dataset.sieveXDropped = "1";
  });
}

function polishTimelineDom(): void {
  if (!activeConfig?.enabled || !activeConfig.x.enabled) return;

  document
    .querySelectorAll<HTMLImageElement>('img[src*="ytimg.com/vi"]:not([data-sieve-thumb])')
    .forEach((img) => {
      img.dataset.sieveThumb = "1";
      const next = midFrameThumbUrl(img.src);
      if (next !== img.src) img.src = next;
    });

  document
    .querySelectorAll<HTMLElement>('[data-testid="tweetText"]:not([data-sieve-calm])')
    .forEach((tweetText) => {
      tweetText.dataset.sieveCalm = "1";
      const walker = document.createTreeWalker(tweetText, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const val = node.nodeValue;
        if (!val || val.trim().length < 6) continue;
        const calmed = calmTitle(val);
        if (calmed !== val) node.nodeValue = calmed;
      }
    });

  document
    .querySelectorAll<HTMLElement>('[data-testid="tweet"]')
    .forEach((tweetEl) => trackTweetDwell(tweetEl));

  void evaluateExploreCells();
}

const schedulePolish = createRafScheduler(polishTimelineDom);

bootSiteAdapter((cfg) => {
  activeConfig = cfg;
  const xOn = cfg.enabled && cfg.x.enabled;
  applyHtmlFlags({
    sieveXOn: xOn ? "1" : "0",
    sieveXBird: xOn && cfg.x.classicBird ? "1" : "0",
    sieveXSidebar: xOn && cfg.x.cleanSidebar ? "1" : "0",
    sieveXNav: xOn && cfg.x.cleanNav ? "1" : "0",
  });
  syncBirdBranding();
  schedulePolish();
});

const titleObserver = new MutationObserver(syncBirdBranding);
const watchHead = () => {
  if (document.head) {
    syncBirdBranding();
    titleObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
  }
};

if (document.head) watchHead();
else document.addEventListener("DOMContentLoaded", watchHead, { once: true });

const bodyObserver = new MutationObserver(() => {
  if (activeConfig?.enabled && activeConfig.x.enabled) {
    schedulePolish();
  }
});

if (document.documentElement) {
  bodyObserver.observe(document.documentElement, { childList: true, subtree: true });
}
