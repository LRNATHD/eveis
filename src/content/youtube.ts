import { isYouTubeSafeRoute } from "../adapters/youtube-json.js";
import { isVagueClickbaitTitle } from "../core/dearrow.js";
import { calmTitle, midFrameThumbUrl } from "../core/dehype.js";
import type { FeedItem, SieveConfig } from "../types.js";
import { applyHtmlFlags, bootSiteAdapter, createDwellTracker } from "./shared.js";

const AI_BUTTON_RE = /\bgemini\b|\bask\s+youtube\b|\bsearch\s+with\s+ai\b|\bask\s+ai\b|^ask$/i;

let activeConfig: SieveConfig | null = null;
let rafPending = false;
const evaluatedDomVideos = new Set<string>();
const dearrowCheckedVideos = new Set<string>();
const trackWatchTitleDwell = createDwellTracker((el) => el.textContent ?? "", 2500);

async function resolveVagueDomTitles(): Promise<void> {
  if (!activeConfig?.enabled || !activeConfig.youtube.enabled || !activeConfig.youtube.dearrowTitles) {
    return;
  }

  const titleElsByVid = new Map<string, HTMLElement[]>();
  document
    .querySelectorAll<HTMLElement>(
      "ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer",
    )
    .forEach((card) => {
      const link = card.querySelector<HTMLAnchorElement>('a[href*="/watch?v="]');
      if (!link) return;
      let vid = "";
      try {
        vid = new URL(link.href, window.location.origin).searchParams.get("v") ?? "";
      } catch {
        return;
      }
      if (!vid || dearrowCheckedVideos.has(vid)) return;

      const titleEl = card.querySelector<HTMLElement>(
        "#video-title, .yt-lockup-metadata-view-model__title",
      );
      const raw = titleEl?.textContent?.trim() ?? "";
      if (!titleEl || !raw) return;

      if (!isVagueClickbaitTitle(raw)) {
        dearrowCheckedVideos.add(vid);
        return;
      }

      dearrowCheckedVideos.add(vid);
      const list = titleElsByVid.get(vid) ?? [];
      list.push(titleEl);
      titleElsByVid.set(vid, list);
    });

  if (titleElsByVid.size === 0) return;

  try {
    const res = (await browser.runtime.sendMessage({
      type: "RESOLVE_DEARROW_TITLES",
      videoIds: [...titleElsByVid.keys()].slice(0, 16),
    })) as { titles?: Record<string, string> };

    for (const [vid, curated] of Object.entries(res.titles ?? {})) {
      const targets = titleElsByVid.get(vid);
      if (!targets || !curated) continue;
      const finalTitle = activeConfig?.youtube.calmTitles ? calmTitle(curated) : curated;
      for (const el of targets) {
        el.textContent = finalTitle;
        el.title = finalTitle;
      }
    }
  } catch {
    // Fail open silently if mirror or background is unavailable.
  }
}

function enforceRouteGuards(): void {
  if (!activeConfig?.enabled || !activeConfig.youtube.enabled) return;
  if (!activeConfig.youtube.hideShorts) return;
  const path = window.location.pathname;
  if (path.startsWith("/shorts/") || path === "/shorts" || path.startsWith("/playables")) {
    window.location.replace("https://www.youtube.com/");
  }
}

document.addEventListener(
  "error",
  (event) => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement)) return;
    if (target.src.includes("/hq2.jpg") && !target.dataset.sieveFallback) {
      target.dataset.sieveFallback = "1";
      target.src = target.src.replace("/hq2.jpg", "/hqdefault.jpg");
    }
  },
  true,
);

function hideGeminiAndAskButtons(): void {
  document
    .querySelectorAll<HTMLElement>(
      "ytd-masthead button, ytd-masthead a, ytd-masthead [role='button'], ytd-watch-metadata button, ytd-watch-metadata a",
    )
    .forEach((el) => {
      if (el.dataset.sieveYtAsk === "1") return;
      const aria = (el.getAttribute("aria-label") ?? "").trim();
      const title = (el.getAttribute("title") ?? "").trim();
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (AI_BUTTON_RE.test(aria) || AI_BUTTON_RE.test(title) || AI_BUTTON_RE.test(text)) {
        const wrapper =
          el.closest<HTMLElement>(
            "yt-button-view-model, ytd-button-renderer, ytd-topbar-menu-button-renderer",
          ) ?? el;
        wrapper.dataset.sieveYtAsk = "1";
      }
    });
}

async function evaluateUnfilteredDomCards(): Promise<void> {
  if (!activeConfig?.enabled || !activeConfig.youtube.enabled || !activeConfig.youtube.caliberFilter) {
    return;
  }
  if (isYouTubeSafeRoute(window.location.href)) return;

  const cards = document.querySelectorAll<HTMLElement>(
    "ytd-rich-item-renderer:not([data-sieve-yt-dropped]), ytd-compact-video-renderer:not([data-sieve-yt-dropped])",
  );
  const batch: FeedItem[] = [];
  const cardById = new Map<string, HTMLElement>();

  cards.forEach((card) => {
    const watchLink = card.querySelector<HTMLAnchorElement>('a[href*="/watch?v="]');
    if (!watchLink) return;
    let vid = "";
    try {
      vid = new URL(watchLink.href, window.location.origin).searchParams.get("v") ?? "";
    } catch {
      return;
    }
    if (!vid || evaluatedDomVideos.has(vid)) return;

    const titleEl = card.querySelector<HTMLElement>(
      "#video-title, .yt-lockup-metadata-view-model__title, h3",
    );
    const title = titleEl?.textContent?.trim() ?? "";
    if (!title) return;

    const chanLink = card.querySelector<HTMLAnchorElement>('a[href^="/@"], a[href^="/channel/"]');
    const href = chanLink?.getAttribute("href") ?? "";
    const handle = href.startsWith("/@")
      ? href.slice(1).split("/")[0]
      : chanLink?.textContent?.trim() || undefined;
    const chanId = href.startsWith("/channel/") ? href.split("/")[2] : undefined;

    evaluatedDomVideos.add(vid);
    cardById.set(vid, card);
    batch.push({
      platform: "youtube",
      id: vid,
      creatorId: chanId,
      creatorHandle: handle,
      surface: window.location.pathname === "/watch" ? "watch_next" : "home",
      titleOrText: title,
    });
  });

  if (batch.length === 0) return;

  try {
    const res = (await browser.runtime.sendMessage({
      type: "EVALUATE_SSR_ITEMS",
      items: batch,
    })) as { dropped?: string[] };
    for (const id of res.dropped ?? []) {
      const card = cardById.get(id);
      if (card) card.dataset.sieveYtDropped = "1";
    }
  } catch {
    // Fail open when background reloads.
  }
}

function syncTheaterHeaderTheme(): void {
  const root = document.documentElement;
  if (!root) return;
  if (!activeConfig?.enabled || !activeConfig.youtube.enabled) {
    delete root.dataset.sieveYtTheater;
    return;
  }

  const watchFlexy = document.querySelector<HTMLElement>("ytd-watch-flexy");
  const isWatchRoute = window.location.pathname === "/watch";
  const inLandscapeTheater =
    isWatchRoute &&
    Boolean(watchFlexy) &&
    !watchFlexy!.hasAttribute("hidden") &&
    (watchFlexy!.hasAttribute("theater") ||
      watchFlexy!.hasAttribute("full-bleed-player") ||
      watchFlexy!.hasAttribute("fullscreen"));

  const masthead = document.querySelector<HTMLElement>("ytd-masthead");
  if (inLandscapeTheater) {
    root.dataset.sieveYtTheater = "1";
    if (masthead && !masthead.hasAttribute("dark")) {
      masthead.setAttribute("dark", "");
      masthead.dataset.sieveForcedDark = "1";
    }
  } else {
    delete root.dataset.sieveYtTheater;
    if (masthead?.dataset.sieveForcedDark === "1" && !root.hasAttribute("dark")) {
      masthead.removeAttribute("dark");
      delete masthead.dataset.sieveForcedDark;
    }
  }
}

function polishRenderedCards(): void {
  rafPending = false;
  if (!activeConfig?.enabled || !activeConfig.youtube.enabled) return;

  syncTheaterHeaderTheme();

  if (activeConfig.youtube.midFrameThumbs) {
    document
      .querySelectorAll<HTMLImageElement>('img[src*="ytimg.com/vi"]:not([data-sieve-thumb])')
      .forEach((img) => {
        img.dataset.sieveThumb = "1";
        if (img.src.includes("/hq2.jpg")) return;
        const next = midFrameThumbUrl(img.src);
        if (next !== img.src) img.src = next;
      });
  }

  if (activeConfig.youtube.calmTitles) {
    document
      .querySelectorAll<HTMLElement>(
        "#video-title:not([data-sieve-calm]), .yt-lockup-metadata-view-model__title:not([data-sieve-calm])",
      )
      .forEach((el) => {
        el.dataset.sieveCalm = "1";
        const raw = el.textContent;
        if (!raw) return;
        const calmed = calmTitle(raw);
        if (calmed !== raw) el.textContent = calmed;
      });
  }

  if (activeConfig.youtube.cleanHeader) {
    hideGeminiAndAskButtons();
  }

  const watchHeading = document.querySelector<HTMLElement>("ytd-watch-metadata h1");
  if (watchHeading) trackWatchTitleDwell(watchHeading);

  void resolveVagueDomTitles();
  void evaluateUnfilteredDomCards();
}

function schedulePolish(): void {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(polishRenderedCards);
}

bootSiteAdapter((cfg) => {
  activeConfig = cfg;
  const ytOn = cfg.enabled && cfg.youtube.enabled;
  applyHtmlFlags({
    sieveYtShorts: ytOn && cfg.youtube.hideShorts ? "1" : "0",
    sieveYtHeader: ytOn && cfg.youtube.cleanHeader ? "1" : "0",
  });
  enforceRouteGuards();
  schedulePolish();
});

window.addEventListener("yt-navigate-finish", () => {
  enforceRouteGuards();
  schedulePolish();
});
window.addEventListener("popstate", enforceRouteGuards);

const observer = new MutationObserver(() => {
  if (activeConfig?.enabled && activeConfig.youtube.enabled) {
    schedulePolish();
  }
});

if (document.documentElement) {
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["theater", "full-bleed-player", "fullscreen", "hidden"],
  });
}
