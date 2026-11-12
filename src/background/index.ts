import { filterInstagramJson } from "../adapters/instagram-json.js";
import { concatByteChunks, decodeUtf8Chunks } from "../adapters/stream-decode.js";
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
import {
  isRecord,
  type EvaluateSsrItemsResponse,
  type FeedItem,
  type GraderSettings,
  type ResolveDearrowTitlesResponse,
  type SeedSets,
  type SieveConfig,
  type SieveStatus,
  type TestGraderResponse,
} from "../types.js";
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
    // Missing seed assets leave the corresponding Set empty.
  }
}

async function initConfigAndSeeds(): Promise<void> {
  try {
    const stored = await browser.storage.local.get("sieveConfig");
    config = mergeConfig(stored.sieveConfig);
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
    config = mergeConfig(changes.sieveConfig.newValue);
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
  /\/i\/api\/graphql\/[^/]+\/(HomeTimeline|HomeLatestTimeline|ExplorePage|GenericTimelineById|ExploreSidebar|SearchTimeline)/;

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

const MAX_STREAM_BYTES = 12 * 1024 * 1024;

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
    let bufferedBytes = 0;
    let passthrough = false;

    filter.ondata = (event) => {
      if (passthrough) {
        filter.write(event.data);
        return;
      }
      const chunk = new Uint8Array(event.data);
      bufferedBytes += chunk.byteLength;
      if (bufferedBytes > MAX_STREAM_BYTES) {
        passthrough = true;
        if (chunks.length > 0) {
          filter.write(concatByteChunks(chunks));
          chunks.length = 0;
        }
        filter.write(chunk);
        return;
      }
      chunks.push(chunk);
    };

    filter.onerror = () => {
      try {
        filter.disconnect();
      } catch {
        // Stream already disconnected.
      }
    };

    filter.onstop = async () => {
      if (passthrough) {
        try {
          filter.close();
        } catch {
          // Stream already closed.
        }
        return;
      }

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
          return;
        }

        const json: unknown = JSON.parse(text);
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
        // Emit untouched response bytes on any parse or transform error.
        if (chunks.length > 0) {
          filter.write(concatByteChunks(chunks));
        }
      } finally {
        try {
          filter.close();
        } catch {
          // Stream already closed.
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

function parseGraderOverride(raw: unknown): GraderSettings | undefined {
  if (!isRecord(raw)) return undefined;
  const mode = raw.mode === "off" || raw.mode === "local" || raw.mode === "api" ? raw.mode : null;
  if (
    !mode ||
    typeof raw.endpoint !== "string" ||
    typeof raw.model !== "string" ||
    typeof raw.apiKey !== "string" ||
    typeof raw.rubric !== "string" ||
    typeof raw.streamHoldMs !== "number"
  ) {
    return undefined;
  }
  return {
    mode,
    endpoint: raw.endpoint,
    model: raw.model,
    apiKey: raw.apiKey,
    rubric: raw.rubric,
    streamHoldMs: raw.streamHoldMs,
  };
}

browser.runtime.onMessage.addListener((raw: unknown) => {
  if (!isRecord(raw) || typeof raw.type !== "string") return undefined;

  if (raw.type === "GET_STATUS") {
    const stats = memory.counts();
    const status: SieveStatus = {
      sessionFilteredCount,
      cachedItems: stats.cachedItems,
      learnedCreators: stats.learnedCreators,
      dwelledCount: novelty.size(),
      hnVideos: seeds.hnVideos.size,
      slopChannels: seeds.slopChannels.size,
    };
    return Promise.resolve(status);
  }

  if (raw.type === "CLEAR_CACHE") {
    sessionFilteredCount = 0;
    novelty.clear();
    clearDeArrowCache();
    return memory.clear().then(() => ({ ok: true }));
  }

  if (raw.type === "RECORD_DWELL" && typeof raw.text === "string") {
    if (config.enabled && config.noveltyFilter) {
      novelty.recordDwelled(raw.text);
    }
    return Promise.resolve({ ok: true });
  }

  if (raw.type === "RESOLVE_DEARROW_TITLES" && Array.isArray(raw.videoIds)) {
    if (!config.enabled || !config.youtube.enabled || !config.youtube.dearrowTitles) {
      return Promise.resolve({ titles: {} } satisfies ResolveDearrowTitlesResponse);
    }
    const videoIds = raw.videoIds.filter((id): id is string => typeof id === "string");
    return lookupDeArrowTitles(videoIds).then(
      (map): ResolveDearrowTitlesResponse => ({
        titles: Object.fromEntries(map),
      }),
    );
  }

  if (raw.type === "EVALUATE_SSR_ITEMS" && Array.isArray(raw.items)) {
    const items = raw.items.filter(
      (item): item is FeedItem =>
        isRecord(item) && typeof item.id === "string" && typeof item.titleOrText === "string",
    );
    return decideBatch(items).then(
      (dropped): EvaluateSsrItemsResponse => ({ dropped: [...dropped] }),
    );
  }

  if (raw.type === "TEST_GRADER") {
    const override = parseGraderOverride(raw.graderOverride);
    const testConfig: SieveConfig = override ? { ...config, grader: override } : config;
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
      .then(
        (drops): TestGraderResponse => ({
          ok: true,
          ms: Date.now() - started,
          droppedProbeSlop: drops.has("probe_slop"),
        }),
      )
      .catch(
        (err: unknown): TestGraderResponse => ({
          ok: false,
          ms: Date.now() - started,
          error: err instanceof Error ? err.message : "Request failed",
        }),
      );
  }

  return undefined;
});

void initConfigAndSeeds();
