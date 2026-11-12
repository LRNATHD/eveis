export type Platform = "youtube" | "x" | "instagram" | "tiktok";

export type FeedSurface =
  | "home"
  | "search"
  | "watch_next"
  | "timeline"
  | "replies"
  | "reels";

export type Verdict = "keep" | "drop" | "uncertain";

export type GraderMode = "off" | "local" | "api";

export interface YouTubeSettings {
  enabled: boolean;
  caliberFilter: boolean;
  hideShorts: boolean;
  cleanHeader: boolean;
  midFrameThumbs: boolean;
  calmTitles: boolean;
  dearrowTitles: boolean;
}

export interface TwitterSettings {
  enabled: boolean;
  caliberFilter: boolean;
  slopCadenceFilter: boolean;
  classicBird: boolean;
  cleanSidebar: boolean;
  cleanNav: boolean;
  restoreHeadlines: boolean;
}

export interface InstagramSettings {
  enabled: boolean;
  caliberFilter: boolean;
  filterReels: boolean;
  hideClutter: boolean;
}

export interface TikTokSettings {
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
  isBlueReply?: boolean;
  surface: FeedSurface;
  titleOrText: string;
  secondaryText?: string;
  durationSec?: number;
  linkedYoutubeIds?: string[];
  metrics?: {
    views?: number;
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
  getItemVerdict(platform: Platform, id: string): "keep" | "drop" | undefined;
  getCreatorVerdict(platform: Platform, creatorKey: string): "keep" | "drop" | undefined;
}

export interface MemoryStore extends MemoryLookup {
  recordVerdict(item: FeedItem, verdict: "keep" | "drop"): Promise<void>;
  clear(): Promise<void>;
  counts(): { cachedItems: number; learnedCreators: number; droppedTotal: number };
}

export type BatchDecider = (items: FeedItem[]) => Promise<Set<string>>;
