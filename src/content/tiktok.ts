import { calmTitle } from "../core/dehype.js";
import type { FeedItem, SieveConfig } from "../types.js";
import { applyHtmlFlags, bootSiteAdapter, pauseAllMedia } from "./shared.js";

const LEFT_NAV_DROP_LABELS = new Set([
  "explore",
  "friends",
  "live",
  "shop",
  "short dramas",
  "short drama",
  "series",
]);

const LEFT_NAV_DROP_PATHS = [
  "/explore",
  "/friends",
  "/live",
  "/shop",
  "/shortdrama",
];

const LEFT_SECTION_BLOCK_TITLES = new Set([
  "following accounts",
  "suggested accounts",
  "company",
  "program",
  "terms & policies",
]);

const CHROME_BUTTON_BLOCK_LABELS = new Set([
  "get coins",
  "get app",
  "get tiktok",
]);

let activeConfig: SieveConfig | null = null;
let lastCheckedPath = "";
let sweepPending = false;
const evaluatedDomIds = new Set<string>();

function normalizeTikTokPath(rawPath: string): string {
  const trimmed = (rawPath || "/").replace(/\/+$/, "") || "/";
  const localeMatch = /^\/[a-z]{2}(?:-[a-z]{2})?(?=\/|$)/i.exec(trimmed);
  if (!localeMatch) return trimmed;
  return trimmed.slice(localeMatch[0].length) || "/";
}

function isCreatorSafeRoute(rawPath: string): boolean {
  const path = normalizeTikTokPath(rawPath);
  return (
    path.startsWith("/upload") ||
    path.startsWith("/tiktokstudio") ||
    path.startsWith("/creator-center") ||
    path.startsWith("/messages") ||
    path.startsWith("/settings") ||
    (path.startsWith("/@") && !path.includes("/video/") && !path.includes("/photo/"))
  );
}

function shouldMuteAndHideFeed(): boolean {
  if (!activeConfig?.enabled || !activeConfig.tiktok.enabled) return false;
  if (!activeConfig.tiktok.postOnlyMode) return false;
  return !isCreatorSafeRoute(window.location.pathname);
}

function findNavListParent(): HTMLElement | null {
  const forYou = document.querySelector<HTMLElement>(
    '[data-e2e="nav-foryou"], nav a[href="/"], aside a[href="/"]',
  );
  const following = document.querySelector<HTMLElement>(
    '[data-e2e="nav-following"], nav a[href="/following"], aside a[href="/following"]',
  );
  if (!forYou || !following) return null;

  let cur: HTMLElement | null = forYou.parentElement;
  while (cur && cur !== document.body) {
    if (cur.contains(following)) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function collapseLeftNavRowsWithoutGaps(): void {
  const listParent = findNavListParent();
  if (!listParent) return;

  Array.from(listParent.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) return;
    // Never hide rows that hold For You, Following, Upload, Messages, Activity, or Profile.
    if (
      child.querySelector(
        '[data-e2e="nav-foryou"], [data-e2e="nav-following"], [data-e2e="nav-messages"], [data-e2e="nav-activity"], [data-e2e="nav-profile"], a[href="/upload"], a[href*="/tiktokstudio"]',
      )
    ) {
      return;
    }

    const label = (child.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    const links = Array.from(child.querySelectorAll<HTMLAnchorElement>("a[href]")).map((a) =>
      (a.getAttribute("href") ?? "").toLowerCase(),
    );

    const shouldDrop =
      LEFT_NAV_DROP_LABELS.has(label) ||
      links.some((href) => LEFT_NAV_DROP_PATHS.some((p) => href.includes(p)));

    if (shouldDrop) {
      child.dataset.sieveTtHidden = "1";
    }
  });
}

function cleanTikTokChromeDom(): void {
  if (!activeConfig?.enabled || !activeConfig.tiktok.enabled || !activeConfig.tiktok.cleanChrome) {
    document.querySelectorAll<HTMLElement>('[data-sieve-tt-hidden="1"]').forEach((el) => {
      delete el.dataset.sieveTtHidden;
    });
    return;
  }

  if (normalizeTikTokPath(window.location.pathname).startsWith("/shortdrama")) {
    window.location.replace("https://www.tiktok.com/");
    return;
  }

  collapseLeftNavRowsWithoutGaps();

  // Hide Get Coins / Get App buttons in top header or fixed floating containers
  document.querySelectorAll<HTMLElement>("button, a").forEach((el) => {
    const label = (el.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!CHROME_BUTTON_BLOCK_LABELS.has(label)) return;
    if (el.closest("main, article")) return;
    let wrapper: HTMLElement = el;
    while (
      wrapper.parentElement &&
      wrapper.parentElement.childElementCount === 1 &&
      wrapper.parentElement.tagName !== "NAV" &&
      wrapper.parentElement.tagName !== "HEADER"
    ) {
      wrapper = wrapper.parentElement;
    }
    wrapper.dataset.sieveTtHidden = "1";
  });

  // Hide Following accounts & Company/Program/Terms sections in the left navigation rail
  const sideContainers = document.querySelectorAll<HTMLElement>(
    'div[class*="SideNav"], aside, nav',
  );
  sideContainers.forEach((rail) => {
    if (rail.closest("main")) return;
    rail.querySelectorAll<HTMLElement>("h2, h3, h4, p, span, div").forEach((el) => {
      if (el.childElementCount > 2) return;
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      if (!LEFT_SECTION_BLOCK_TITLES.has(text)) return;

      let section: HTMLElement | null = el.parentElement;
      while (
        section &&
        section !== rail &&
        !section.querySelector(
          '[data-e2e="nav-foryou"], [data-e2e="nav-following"], a[href="/upload"], a[href*="/tiktokstudio"]',
        )
      ) {
        if (section.parentElement === rail || section.parentElement?.parentElement === rail) {
          section.dataset.sieveTtHidden = "1";
          break;
        }
        section = section.parentElement;
      }
    });
  });
}

async function evaluateAndPolishFeedDom(): Promise<void> {
  if (!activeConfig?.enabled || !activeConfig.tiktok.enabled || activeConfig.tiktok.postOnlyMode) {
    return;
  }

  document
    .querySelectorAll<HTMLElement>(
      '[data-e2e="video-desc"]:not([data-sieve-calm]), [data-e2e="browse-video-desc"]:not([data-sieve-calm])',
    )
    .forEach((descEl) => {
      descEl.dataset.sieveCalm = "1";
      const walker = document.createTreeWalker(descEl, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const val = node.nodeValue;
        if (!val || val.trim().length < 6) continue;
        const calmed = calmTitle(val);
        if (calmed !== val) node.nodeValue = calmed;
      }
    });

  if (
    !activeConfig.tiktok.caliberFilter ||
    normalizeTikTokPath(window.location.pathname).startsWith("/@")
  ) {
    return;
  }

  const cards = document.querySelectorAll<HTMLElement>(
    '[data-e2e="recommend-list-item-container"], article[data-scroll-index]',
  );
  const batch: FeedItem[] = [];
  const cardById = new Map<string, HTMLElement>();

  cards.forEach((card, idx) => {
    if (card.dataset.sieveTtDropped === "1") return;
    if (card.querySelector('a[href*="/shortdrama/"]')) {
      card.dataset.sieveTtDropped = "1";
      pauseAllMedia(card);
      return;
    }

    const authorLink = card.querySelector<HTMLAnchorElement>('a[href^="/@"]');
    const handle = authorLink?.getAttribute("href")?.split("/")[1]?.replace(/^@/, "") ?? "";
    const videoLink = card.querySelector<HTMLAnchorElement>('a[href*="/video/"]');
    const vidMatch = /\/video\/(\d+)/.exec(videoLink?.href ?? "");
    const descText =
      card.querySelector('[data-e2e="video-desc"]')?.textContent?.trim() ??
      card.textContent?.slice(0, 220).trim() ??
      "";
    const id = vidMatch?.[1] ?? (handle && descText ? `dom_${handle}_${descText.slice(0, 32)}_${idx}` : "");
    if (!id || evaluatedDomIds.has(id)) return;

    evaluatedDomIds.add(id);
    cardById.set(id, card);
    batch.push({
      platform: "tiktok",
      id,
      creatorHandle: handle || undefined,
      surface: "reels",
      titleOrText: descText || `@${handle}`,
    });
  });

  if (batch.length === 0) return;

  try {
    const res = (await browser.runtime.sendMessage({
      type: "EVALUATE_SSR_ITEMS",
      items: batch,
    })) as { dropped?: string[] };

    for (const dropId of res.dropped ?? []) {
      const card = cardById.get(dropId);
      if (card) {
        card.dataset.sieveTtDropped = "1";
        pauseAllMedia(card);
      }
    }
  } catch {
    // Fail open if background is reloading.
  }
}

function enforceTikTokLightMode(enabled: boolean): void {
  if (!enabled) return;
  try {
    const hadDarkCookie = /(?:^|;\s*)tiktok_webapp_theme=dark(?:;|$)/.test(document.cookie);
    document.cookie =
      "tiktok_webapp_theme=light; path=/; domain=.tiktok.com; max-age=31536000; SameSite=Lax";
    document.cookie =
      "tiktok_webapp_theme_source=custom; path=/; domain=.tiktok.com; max-age=31536000; SameSite=Lax";
    document.documentElement?.setAttribute("data-theme", "light");

    if (hadDarkCookie && !sessionStorage.getItem("__sieve_tt_light_reloaded")) {
      sessionStorage.setItem("__sieve_tt_light_reloaded", "1");
      window.location.reload();
    }
  } catch {
    // Ignore cookie write errors in sandboxed frames.
  }
}

function runTikTokSweep(): void {
  sweepPending = false;
  const ttOn = Boolean(activeConfig?.enabled && activeConfig.tiktok.enabled);
  const blockFeed = shouldMuteAndHideFeed();
  const forceLight = Boolean(ttOn && activeConfig?.tiktok.lightMode);

  applyHtmlFlags({
    sieveTtBlock: blockFeed ? "1" : "0",
    sieveTtChrome: ttOn && activeConfig?.tiktok.cleanChrome ? "1" : "0",
    sieveTtLight: forceLight ? "1" : "0",
  });

  enforceTikTokLightMode(forceLight);

  if (blockFeed) {
    pauseAllMedia(document);
    return;
  }

  cleanTikTokChromeDom();
  void evaluateAndPolishFeedDom();
}

function scheduleSweep(): void {
  if (sweepPending) return;
  sweepPending = true;
  requestAnimationFrame(runTikTokSweep);
}

document.addEventListener(
  "play",
  (event) => {
    const target = event.target;
    if (!(target instanceof HTMLMediaElement)) return;
    if (shouldMuteAndHideFeed() || target.closest('[data-sieve-tt-dropped="1"]')) {
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
