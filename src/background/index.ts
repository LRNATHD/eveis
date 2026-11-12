import { filterInstagramJson } from "../adapters/instagram-json.js";
import { decodeUtf8Chunks } from "../adapters/stream-decode.js";
import {
  filterTikTokJson,
  rewriteTikTokThemeCookieHeader,
} from "../adapters/tiktok-json.js";
import { filterTwitterJson } from "../adapters/twitter-json.js";
import {
  filterYouTubeJson,
  rewriteYouTubeHtmlInitialData,
} from "../adapters/youtube-json.js";
import { clearDeArrowCache, lookupDeArrowTitles } from "../core/dearrow.js";
import { gradeItemsBatch } from "../core/llm.js";
import { runSieveOnBatch } from "../core/sieve.js";
import { DEFAULT_CONFIG, mergeConfig } from "../defaults.js";
import type { FeedItem, SeedSets, SieveConfig } from "../types.js";
import { createMemoryStore } from "./memory.js";
import { createNoveltyMemory } from "./novelty.js";

let config: SieveConfig = structuredClone(DEFAULT_CONFIG);
let sessionFilteredCount = 0;

const seeds: SeedSets = {
  hnVideos: new Set(),
  hnChannels: new Set(),
  slopChannels: new Set(),
};

const memory = createMemoryStore();
const novelty = createNoveltyMemory();

async function loadSeedSet(assetPath: string, target: Set<string>): Promise<void> {
  try {
    const res = await fetch(browser.runtime.getURL(assetPath));
    if (!res.ok) return;
    const text = await res.text();
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) target.add(trimmed);
    }
  } catch {
    // Seed loading should never crash background initialization.
  }
}

async function initConfigAndSeeds(): Promise<void> {
  try {
    const stored = await browser.storage.local.get("sieveConfig");
    const rawStored = stored.sieveConfig as Partial<SieveConfig> | undefined;
    const needsVerdictReset = rawStored && (rawStored.schemaVersion ?? 1) < 6;
    config = mergeConfig(rawStored);
    if (needsVerdictReset) {
      await memory.clear();
      await browser.storage.local.set({ sieveConfig: config });
    }
  } catch {
    config = structuredClone(DEFAULT_CONFIG);
  }

  await Promise.all([
    loadSeedSet("assets/seeds/hn-videos.txt", seeds.hnVideos),
    loadSeedSet("assets/seeds/hn-channels.txt", seeds.hnChannels),
    loadSeedSet("assets/seeds/slop-channels.txt", seeds.slopChannels),
  ]);
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.sieveConfig) {
    config = mergeConfig(changes.sieveConfig.newValue as Partial<SieveConfig> | undefined);
  }
});

const decideBatch = async (items: FeedItem[]): Promise<Set<string>> => {
  const dropped = await runSieveOnBatch(items, config, seeds, memory, fetch, novelty);
  sessionFilteredCount += dropped.size;
  return dropped;
};

const INTERCEPT_URLS = [
  "https://www.youtube.com/",
  "https://www.youtube.com/?*",
  "https://www.youtube.com/results?*",
  "https://www.youtube.com/youtubei/v1/browse*",
  "https://www.youtube.com/youtubei/v1/next*",
  "https://www.youtube.com/youtubei/v1/search*",
  "https://m.youtube.com/youtubei/v1/browse*",
  "https://m.youtube.com/youtubei/v1/next*",
  "https://m.youtube.com/youtubei/v1/search*",
  "https://x.com/i/api/graphql/*",
  "https://twitter.com/i/api/graphql/*",
  "https://www.instagram.com/graphql/query*",
  "https://www.instagram.com/api/v1/clips/home/*",
  "https://www.instagram.com/api/v1/feed/timeline/*",
  "https://i.instagram.com/api/v1/clips/home/*",
  "https://i.instagram.com/api/v1/feed/timeline/*",
  "https://www.tiktok.com/api/recommend/item_list/*",
  "https://www.tiktok.com/api/post/item_list/*",
];

const TWITTER_TIMELINE_RE =
  /\/i\/api\/graphql\/[^/]+\/(HomeTimeline|HomeLatestTimeline|TweetDetail|SearchTimeline|ExplorePage|GenericTimelineById|ExploreSidebar|UserTweets|UserTweetsAndReplies|UserMedia|HighlightsTweets)/;

function shouldFilterRequest(details: browser.webRequest._OnBeforeRequestDetails): boolean {
  if (!config.enabled) return false;
  let parsed: URL;
  try {
    parsed = new URL(details.url);
  } catch {
    return false;
  }

  const host = parsed.hostname;
  const path = parsed.pathname;

  if (host.endsWith("youtube.com")) {
    if (!config.youtube.enabled) return false;
    if (details.type === "main_frame") {
      return path === "/" || path === "/results";
    }
    return path.startsWith("/youtubei/v1/");
  }

  if (host === "x.com" || host === "twitter.com") {
    return config.x.enabled && TWITTER_TIMELINE_RE.test(path);
  }

  if (host.endsWith("instagram.com")) {
    return (
      config.instagram.enabled &&
      (path === "/graphql/query" ||
        path.startsWith("/api/v1/clips/home") ||
        path.startsWith("/api/v1/feed/timeline"))
    );
  }

  if (host.endsWith("tiktok.com")) {
    return (
      config.tiktok.enabled &&
      (path.startsWith("/api/recommend/item_list") || path.startsWith("/api/post/item_list"))
    );
  }

  return false;
}

function concatRawChunks(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.byteLength;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!shouldFilterRequest(details)) return {};

    let filter: browser.webRequest.StreamFilter;
    try {
      filter = browser.webRequest.filterResponseData(details.requestId);
    } catch {
      return {};
    }

    const chunks: Uint8Array[] = [];

    filter.ondata = (event) => {
      chunks.push(new Uint8Array(event.data));
    };

    filter.onerror = () => {
      try {
        filter.disconnect();
      } catch {
        // Stream already closed.
      }
    };

    filter.onstop = async () => {
      try {
        const text = decodeUtf8Chunks(chunks);
        const parsedUrl = new URL(details.url);
        const host = parsedUrl.hostname;
        const path = parsedUrl.pathname;
        const pageUrl = details.documentUrl || details.originUrl || details.url;

        if (details.type === "main_frame" && host.endsWith("youtube.com")) {
          const rewritten = await rewriteYouTubeHtmlInitialData(
            text,
            details.url,
            config,
            decideBatch,
          );
          filter.write(new TextEncoder().encode(rewritten));
          filter.close();
          return;
        }

        const json = JSON.parse(text) as unknown;
        let transformed: unknown = json;

        if (host.endsWith("youtube.com")) {
          transformed = await filterYouTubeJson(json, path, pageUrl, config, decideBatch);
        } else if (host === "x.com" || host === "twitter.com") {
          transformed = await filterTwitterJson(json, path, config, decideBatch);
        } else if (host.endsWith("instagram.com")) {
          transformed = await filterInstagramJson(json, path, config, decideBatch, pageUrl);
        } else if (host.endsWith("tiktok.com")) {
          transformed = await filterTikTokJson(json, config, decideBatch, path, pageUrl);
        }

        filter.write(new TextEncoder().encode(JSON.stringify(transformed)));
      } catch {
        // Fail-open invariant: emit untouched bytes on any parse or transform error.
        if (chunks.length > 0) {
          filter.write(concatRawChunks(chunks));
        }
      } finally {
        try {
          filter.close();
        } catch {
          // Ignore close after error.
        }
      }
    };

    return {};
  },
  {
    urls: INTERCEPT_URLS,
    types: ["main_frame", "xmlhttprequest"],
  },
  ["blocking"],
);

// Strip moz-extension Origin header on localhost LLM calls so Ollama works zero-config.
browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!details.originUrl?.startsWith("moz-extension://") || !details.requestHeaders) {
      return {};
    }
    const requestHeaders = details.requestHeaders.filter(
      (h) => h.name.toLowerCase() !== "origin",
    );
    return { requestHeaders };
  },
  { urls: ["http://127.0.0.1/*", "http://localhost/*"] },
  ["blocking", "requestHeaders"],
);

// Force TikTok's SSR and API responses to render native Light Mode when tiktok.lightMode is enabled.
browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!config.enabled || !config.tiktok.enabled || !config.tiktok.lightMode) return {};
    if (!details.requestHeaders) return {};

    let foundCookie = false;
    const requestHeaders = details.requestHeaders.map((header) => {
      if (header.name.toLowerCase() === "cookie" && typeof header.value === "string") {
        foundCookie = true;
        return { ...header, value: rewriteTikTokThemeCookieHeader(header.value) };
      }
      return header;
    });

    if (!foundCookie) {
      requestHeaders.push({
        name: "Cookie",
        value: "tiktok_webapp_theme=light; tiktok_webapp_theme_source=custom",
      });
    }
    return { requestHeaders };
  },
  { urls: ["*://*.tiktok.com/*", "*://tiktok.com/*"] },
  ["blocking", "requestHeaders"],
);

interface RuntimeMessage {
  type?: string;
  items?: FeedItem[];
  text?: string;
  videoIds?: string[];
  graderOverride?: SieveConfig["grader"];
}

browser.runtime.onMessage.addListener((raw: unknown) => {
  const msg = (raw && typeof raw === "object" ? raw : {}) as RuntimeMessage;

  if (msg.type === "GET_STATUS") {
    const stats = memory.counts();
    return Promise.resolve({
      sessionFilteredCount,
      cachedItems: stats.cachedItems,
      learnedCreators: stats.learnedCreators,
      dwelledCount: novelty.size(),
      hnVideos: seeds.hnVideos.size,
      slopChannels: seeds.slopChannels.size,
    });
  }

  if (msg.type === "CLEAR_CACHE") {
    sessionFilteredCount = 0;
    novelty.clear();
    clearDeArrowCache();
    return memory.clear().then(() => ({ ok: true }));
  }

  if (msg.type === "RECORD_DWELL" && typeof msg.text === "string") {
    if (config.enabled && config.noveltyFilter) {
      novelty.recordDwelled(msg.text);
    }
    return Promise.resolve({ ok: true });
  }

  if (msg.type === "RESOLVE_DEARROW_TITLES" && Array.isArray(msg.videoIds)) {
    if (!config.enabled || !config.youtube.enabled || !config.youtube.dearrowTitles) {
      return Promise.resolve({ titles: {} });
    }
    return lookupDeArrowTitles(msg.videoIds).then((map) => ({
      titles: Object.fromEntries(map),
    }));
  }

  if (msg.type === "EVALUATE_SSR_ITEMS" && Array.isArray(msg.items)) {
    return decideBatch(msg.items).then((dropped) => ({ dropped: [...dropped] }));
  }

  if (msg.type === "TEST_GRADER") {
    const testConfig: SieveConfig = msg.graderOverride
      ? { ...config, grader: msg.graderOverride }
      : config;
    const probe: FeedItem[] = [
      {
        platform: "youtube",
        id: "probe_craft",
        creatorHandle: "maker",
        surface: "home",
        titleOrText: "Machining a brass flexure stage on a manual mill",
      },
      {
        platform: "youtube",
        id: "probe_slop",
        creatorHandle: "rage_daily",
        surface: "home",
        titleOrText: "CELEBRITY MELTDOWN EXPOSED!! COMMENT LINK FOR FREE CRYPTO!!",
      },
    ];
    const started = Date.now();
    return gradeItemsBatch(probe, testConfig)
      .then((drops) => ({
        ok: true,
        ms: Date.now() - started,
        droppedProbeSlop: drops.has("probe_slop"),
      }))
      .catch((err: unknown) => ({
        ok: false,
        ms: Date.now() - started,
        error: err instanceof Error ? err.message : "Request failed",
      }));
  }

  return undefined;
});

void initConfigAndSeeds();
