import { calmTitle } from "../core/dehype.js";
import type { FeedItem, SieveConfig } from "../types.js";
import {
  applyHtmlFlags,
  bootSiteAdapter,
  createRafScheduler,
  evaluateDomBatch,
  pauseAllMedia,
  rememberBounded,
} from "./shared.js";

const SPONSORED_LABELS = new Set(["ad", "sponsored", "paid partnership"]);
const SUGGESTED_LABELS = new Set([
  "suggested for you",
  "suggested post",
  "suggested posts",
  "recommended for you",
]);
const ZERO_WIDTH_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g;

let activeConfig: SieveConfig | null = null;
const evaluatedIgPosts = new Set<string>();

function readHeaderLabels(article: HTMLElement): string[] {
  const actionBoundary = article.querySelector("section");
  if (!actionBoundary) return [];
  const labels: string[] = [];
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  let steps = 0;

  while ((node = walker.nextNode()) && steps++ < 160) {
    if (
      !(
        actionBoundary.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING
      )
    ) {
      break;
    }
    const parent = node.parentElement;
    if (!parent || parent.closest("a, button, [role='button'], figure, blockquote")) continue;
    const clean = (node.nodeValue ?? "")
      .replace(ZERO_WIDTH_RE, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (clean && clean.length <= 36) labels.push(clean);
  }
  return labels;
}

function hasUnfollowedHeaderButton(article: HTMLElement): boolean {
  const boundary = article.querySelector("section");
  if (!boundary) return false;
  for (const btn of article.querySelectorAll<HTMLElement>("button, [role='button']")) {
    if (!(boundary.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_PRECEDING)) continue;
    const label = (btn.textContent ?? "").trim().toLowerCase();
    if (label === "follow") return true;
  }
  return false;
}

function hideHomeRightRail(main: HTMLElement, hideClutter: boolean): void {
  if (!hideClutter) {
    document.querySelectorAll<HTMLElement>('[data-sieve-ig-right-rail="1"]').forEach((el) => {
      delete el.dataset.sieveIgRightRail;
    });
    return;
  }

  const markers = main.querySelectorAll<HTMLElement>(
    'a[href*="/explore/people"], a[href*="about.instagram.com"], a[href*="/legal/terms"]',
  );
  for (const marker of markers) {
    let cur: HTMLElement | null = marker.parentElement;
    let candidate: HTMLElement | null = null;
    while (cur && cur !== main) {
      if (cur.querySelector("article")) break;
      const rect = cur.getBoundingClientRect();
      if (rect.width >= 220 && rect.width <= 440) {
        candidate = cur;
      }
      cur = cur.parentElement;
    }
    if (candidate) {
      candidate.dataset.sieveIgRightRail = "1";
    }
  }
}

function calmRenderedCaptions(root: ParentNode): void {
  root
    .querySelectorAll<HTMLElement>("h1:not([data-sieve-calm]), span:not([data-sieve-calm])")
    .forEach((el) => {
      if (el.childElementCount > 0) return;
      const raw = el.textContent;
      if (!raw || raw.length < 12) return;
      el.dataset.sieveCalm = "1";
      const calmed = calmTitle(raw);
      if (calmed !== raw) el.textContent = calmed;
    });
}

async function evaluateUnfollowedHomeArticles(main: HTMLElement): Promise<void> {
  if (!activeConfig?.instagram.caliberFilter) return;
  const batch: FeedItem[] = [];
  const articleById = new Map<string, HTMLElement>();

  main.querySelectorAll<HTMLElement>("article:not([data-sieve-hidden])").forEach((article, idx) => {
    if (article.parentElement?.closest("article")) return;
    if (!hasUnfollowedHeaderButton(article)) return;

    const postLink = article.querySelector<HTMLAnchorElement>('a[href^="/p/"], a[href^="/reel/"]');
    const href = postLink?.getAttribute("href") ?? "";
    const authorLink = article.querySelector<HTMLAnchorElement>('a[href^="/"]');
    const handle =
      authorLink?.getAttribute("href")?.replace(/^\/|\/$/g, "").split("/")[0] ?? undefined;
    const text = article.textContent?.replace(/\s+/g, " ").trim().slice(0, 220) ?? "";
    const id = href || `ig_dom_${idx}_${text.slice(0, 24)}`;
    if (!id || !rememberBounded(evaluatedIgPosts, id)) return;

    articleById.set(id, article);
    batch.push({
      platform: "instagram",
      id,
      creatorHandle: handle,
      isFollowed: false,
      surface: "timeline",
      titleOrText: text,
    });
  });

  await evaluateDomBatch(batch, (dropId) => {
    const article = articleById.get(dropId);
    if (article) {
      article.dataset.sieveHidden = "1";
      pauseAllMedia(article);
    }
  });
}

function sweepInstagramDom(): void {
  const path = window.location.pathname;
  const igOn = Boolean(activeConfig?.enabled && activeConfig.instagram.enabled);
  const main = document.querySelector<HTMLElement>('main[role="main"], main');

  if (!igOn || !main) {
    document
      .querySelectorAll<HTMLElement>('[data-sieve-hidden="1"], [data-sieve-ig-right-rail="1"]')
      .forEach((el) => {
        delete el.dataset.sieveHidden;
        delete el.dataset.sieveIgRightRail;
      });
    return;
  }

  calmRenderedCaptions(main);

  if (path !== "/" && path !== "") {
    document.querySelectorAll<HTMLElement>('[data-sieve-ig-right-rail="1"]').forEach((el) => {
      delete el.dataset.sieveIgRightRail;
    });
    return;
  }

  hideHomeRightRail(main, Boolean(activeConfig?.instagram.hideClutter));

  main.querySelectorAll<HTMLElement>("article").forEach((article) => {
    if (article.parentElement?.closest("article")) return;
    const labels = readHeaderLabels(article);
    const isAd = labels.some((t) => SPONSORED_LABELS.has(t));
    const isSuggested =
      activeConfig?.instagram.hideClutter && labels.some((t) => SUGGESTED_LABELS.has(t));

    if (isAd || isSuggested) {
      article.dataset.sieveHidden = "1";
      pauseAllMedia(article);
    } else if (article.dataset.sieveHidden) {
      delete article.dataset.sieveHidden;
    }
  });

  void evaluateUnfollowedHomeArticles(main);
}

const scheduleSweep = createRafScheduler(sweepInstagramDom);

bootSiteAdapter((cfg) => {
  activeConfig = cfg;
  const igOn = cfg.enabled && cfg.instagram.enabled;
  applyHtmlFlags({
    sieveIgOn: igOn ? "1" : "0",
    sieveIgClutter: igOn && cfg.instagram.hideClutter ? "1" : "0",
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
