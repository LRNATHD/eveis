export type Platform = "youtube" | "x" | "instagram" | "tiktok";

export type FeedSurface = "home" | "search" | "watch_next" | "timeline" | "reels";

export type ResolvedVerdict = "keep" | "drop";

export type Verdict = ResolvedVerdict | "uncertain";

export type GraderMode = "off" | "local" | "api";

export type JsonRecord = Record<string, unknown>;

export function isRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

interface YouTubeSettings {
  enabled: boolean;
  caliberFilter: boolean;
  hideShorts: boolean;
  cleanHeader: boolean;
  midFrameThumbs: boolean;
  calmTitles: boolean;
  dearrowTitles: boolean;
}

interface TwitterSettings {
  enabled: boolean;
  caliberFilter: boolean;
  slopCadenceFilter: boolean;
  classicBird: boolean;
  cleanSidebar: boolean;
  cleanNav: boolean;
  restoreHeadlines: boolean;
}

interface InstagramSettings {
  enabled: boolean;
  caliberFilter: boolean;
  filterReels: boolean;
  hideClutter: boolean;
}

interface TikTokSettings {
  enabled: boolean;
  caliberFilter: boolean;
  cleanChrome: boolean;
  lightMode: boolean;
  postOnlyMode: boolean;
}

export interface GraderSettings {
  mode: GraderMode;
  endpoint: string;
  model: string;
  apiKey: string;
  rubric: string;
  streamHoldMs: number;
}

export interface SieveConfig {
  schemaVersion: number;
  enabled: boolean;
  passFollowed: boolean;
  noveltyFilter: boolean;
  youtube: YouTubeSettings;
  x: TwitterSettings;
  instagram: InstagramSettings;
  tiktok: TikTokSettings;
  grader: GraderSettings;
  allowHandles: string[];
  blockHandles: string[];
}

export interface FeedItem {
  platform: Platform;
  id: string;
  creatorId?: string;
  creatorHandle?: string;
  isFollowed?: boolean;
  isSponsored?: boolean;
  surface: FeedSurface;
  titleOrText: string;
  secondaryText?: string;
  durationSec?: number;
  linkedYoutubeIds?: string[];
  metrics?: {
    likes?: number;
    replies?: number;
    quotes?: number;
  };
}

export interface SeedSets {
  hnVideos: Set<string>;
  hnChannels: Set<string>;
  slopChannels: Set<string>;
}

export interface CreatorRecord {
  key: string;
  keeps: number;
  drops: number;
  updatedAt: number;
}

export interface MemoryLookup {
  getItemVerdict(platform: Platform, id: string): ResolvedVerdict | undefined;
  getCreatorVerdict(platform: Platform, creatorKey: string): ResolvedVerdict | undefined;
}

export interface MemoryStore extends MemoryLookup {
  recordVerdict(item: FeedItem, verdict: ResolvedVerdict): Promise<void>;
  clear(): Promise<void>;
  counts(): { cachedItems: number; learnedCreators: number; droppedTotal: number };
}

export interface NoveltyLookup {
  isRedundantRehash(text: string): boolean;
}

export interface NoveltyMemory extends NoveltyLookup {
  recordDwelled(text: string): void;
  clear(): void;
  size(): number;
}

export type BatchDecider = (items: FeedItem[]) => Promise<Set<string>>;

export type RuntimeMessage =
  | { type: "GET_STATUS" }
  | { type: "CLEAR_CACHE" }
  | { type: "RECORD_DWELL"; text: string }
  | { type: "RESOLVE_DEARROW_TITLES"; videoIds: string[] }
  | { type: "EVALUATE_SSR_ITEMS"; items: FeedItem[] }
  | { type: "TEST_GRADER"; graderOverride?: GraderSettings };

export interface SieveStatus {
  sessionFilteredCount: number;
  cachedItems: number;
  learnedCreators: number;
  dwelledCount: number;
  hnVideos: number;
  slopChannels: number;
}

export interface EvaluateSsrItemsResponse {
  dropped: string[];
}

export interface ResolveDearrowTitlesResponse {
  titles: Record<string, string>;
}

export type TestGraderResponse =
  | { ok: true; ms: number; droppedProbeSlop: boolean }
  | { ok: false; ms: number; error: string };
