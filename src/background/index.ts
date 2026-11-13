import { ext } from "../browser-api.js";
import { clearDeArrowCache, lookupDeArrowTitles } from "../core/dearrow.js";
import { gradeItemsBatch } from "../core/llm.js";
import { classifySieveBatch, type BatchVerdicts } from "../core/sieve.js";
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
let sessionBoostedCount = 0;

const seeds: SeedSets = {
  hnVideos: new Set(),
  hnChannels: new Set(),
  slopChannels: new Set(),
};

const memory = createMemoryStore();
const novelty = createNoveltyMemory();

async function loadSeedSet(assetPath: string, target: Set<string>): Promise<void> {
  try {
    const res = await fetch(ext.getURL(assetPath));
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

const initPromise = (async () => {
  try {
    const stored = await ext.storageGet("sieveConfig");
    config = mergeConfig(stored.sieveConfig);
  } catch {
    config = structuredClone(DEFAULT_CONFIG);
  }

  await Promise.all([
    loadSeedSet("assets/seeds/hn-videos.txt", seeds.hnVideos),
    loadSeedSet("assets/seeds/hn-channels.txt", seeds.hnChannels),
    loadSeedSet("assets/seeds/slop-channels.txt", seeds.slopChannels),
  ]);
})();

function isBlockedPlatformUrl(rawUrl?: string): boolean {
  if (!rawUrl || !config.enabled) return false;
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (
      config.x.enabled &&
      (host === "x.com" ||
        host.endsWith(".x.com") ||
        host === "twitter.com" ||
        host.endsWith(".twitter.com"))
    ) {
      return true;
    }
    if (config.tiktok.enabled && (host === "tiktok.com" || host.endsWith(".tiktok.com"))) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function maybeCloseBlockedTab(tabId?: number, rawUrl?: string): void {
  if (tabId === undefined || !isBlockedPlatformUrl(rawUrl)) return;
  void ext.closeTab(tabId).catch(() => {});
}

ext.onTabCreated((tab) => {
  void initPromise.then(() => {
    maybeCloseBlockedTab(tab.id, tab.pendingUrl || tab.url);
  });
});

ext.onTabUpdated((tabId, changeInfo, tab) => {
  const targetUrl = changeInfo.url || tab.pendingUrl || tab.url;
  if (!targetUrl) return;
  void initPromise.then(() => {
    maybeCloseBlockedTab(tabId, targetUrl);
  });
});

void initPromise.then(async () => {
  try {
    const tabs = await ext.queryAllTabs();
    for (const tab of tabs) {
      maybeCloseBlockedTab(tab.id, tab.url);
    }
  } catch {
    // Ignore tab query errors during startup.
  }
});

ext.onStorageChanged((changes, area) => {
  if (area === "local" && changes.sieveConfig) {
    config = mergeConfig(changes.sieveConfig.newValue);
  }
});

async function decideBatch(items: FeedItem[]): Promise<BatchVerdicts> {
  await initPromise;
  const verdicts = await classifySieveBatch(items, config, seeds, memory, fetch, novelty);
  sessionFilteredCount += verdicts.dropped.size;
  sessionBoostedCount += verdicts.boosted.size;
  return verdicts;
}

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

ext.onMessage((raw: unknown) => {
  if (!isRecord(raw) || typeof raw.type !== "string") return undefined;

  if (raw.type === "GET_STATUS") {
    return initPromise.then((): SieveStatus => {
      const stats = memory.counts();
      return {
        sessionFilteredCount,
        sessionBoostedCount,
        cachedItems: stats.cachedItems,
        learnedCreators: stats.learnedCreators,
        dwelledCount: novelty.size(),
        hnVideos: seeds.hnVideos.size,
        slopChannels: seeds.slopChannels.size,
      };
    });
  }

  if (raw.type === "CLEAR_CACHE") {
    sessionFilteredCount = 0;
    sessionBoostedCount = 0;
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
      (verdicts): EvaluateSsrItemsResponse => ({
        dropped: [...verdicts.dropped],
        boosted: [...verdicts.boosted],
      }),
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
