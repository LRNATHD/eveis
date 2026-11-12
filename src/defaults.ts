import type { SieveConfig } from "./types.js";

export const CURRENT_SCHEMA_VERSION = 6;

export const DEFAULT_RUBRIC = `Evaluate each item across four axes:
1. Specificity: concrete builds, demos, facts, or craft vs vague hype or mystery bait.
2. Authenticity: genuine human voice or primary source vs engagement farming or bot cadence.
3. Substance: real signal, art, humor, or insight vs padded filler or recycled sludge.
4. Freshness: timely updates, strange rabbit holes, or original work vs rehashed outrage.

Keep items that show genuine human craft, curiosity, engineering, hardware, software, science, design, art, cinematography, music, timely primary news, or earnest humor, even from tiny unknown creators.

Drop items that fail Authenticity or Substance: ragebait, political or culture-war fights, cynical dunking, celebrity or reality-TV gossip, episodic short-drama cliffhangers, AI-generated narration or visual slop, engagement hooks ("wait till the end", "feel illegal to know", "comment X for link", siren-emoji fake breaking hype), hustle or crypto grifts, and manufactured anxiety. When uncertain, keep.`;

export const LOCAL_DEFAULT_ENDPOINT = "http://127.0.0.1:11434/v1/chat/completions";
export const LOCAL_DEFAULT_MODEL = "qwen2.5:3b";

export const API_DEFAULT_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
export const API_DEFAULT_MODEL = "gemini-2.5-flash";

export const DEFAULT_CONFIG: SieveConfig = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  enabled: true,
  passFollowed: true,
  noveltyFilter: true,
  youtube: {
    enabled: true,
    caliberFilter: true,
    hideShorts: true,
    cleanHeader: true,
    midFrameThumbs: true,
    calmTitles: true,
    dearrowTitles: true,
  },
  x: {
    enabled: true,
    caliberFilter: true,
    slopCadenceFilter: true,
    classicBird: true,
    cleanSidebar: true,
    cleanNav: true,
    restoreHeadlines: true,
  },
  instagram: {
    enabled: true,
    caliberFilter: true,
    filterReels: true,
    hideClutter: true,
  },
  tiktok: {
    enabled: true,
    caliberFilter: true,
    cleanChrome: true,
    lightMode: true,
    postOnlyMode: false,
  },
  grader: {
    mode: "local",
    endpoint: LOCAL_DEFAULT_ENDPOINT,
    model: LOCAL_DEFAULT_MODEL,
    apiKey: "",
    rubric: DEFAULT_RUBRIC,
    streamHoldMs: 1500,
  },
  allowHandles: [],
  blockHandles: [],
};

export function mergeConfig(stored?: Partial<SieveConfig> | null): SieveConfig {
  if (!stored || typeof stored !== "object") return structuredClone(DEFAULT_CONFIG);
  const oldSchema = stored.schemaVersion ?? 1;
  const mergedTikTok = { ...DEFAULT_CONFIG.tiktok, ...(stored.tiktok ?? {}) };
  if (oldSchema < 2) {
    mergedTikTok.postOnlyMode = false;
  }
  if (oldSchema < 4 && stored.tiktok?.lightMode === undefined) {
    mergedTikTok.lightMode = true;
  }

  const mergedGrader = { ...DEFAULT_CONFIG.grader, ...(stored.grader ?? {}) };
  if (oldSchema < 6 && mergedGrader.streamHoldMs <= 900) {
    mergedGrader.streamHoldMs = 1500;
  }
  if (
    oldSchema < 5 &&
    (!stored.grader?.rubric ||
      stored.grader.rubric.startsWith("Keep genuine human craft") ||
      stored.grader.rubric.startsWith("Keep enticing, high-agency"))
  ) {
    mergedGrader.rubric = DEFAULT_RUBRIC;
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    enabled: stored.enabled ?? DEFAULT_CONFIG.enabled,
    passFollowed: stored.passFollowed ?? DEFAULT_CONFIG.passFollowed,
    noveltyFilter: stored.noveltyFilter ?? DEFAULT_CONFIG.noveltyFilter,
    youtube: { ...DEFAULT_CONFIG.youtube, ...(stored.youtube ?? {}) },
    x: { ...DEFAULT_CONFIG.x, ...(stored.x ?? {}) },
    instagram: { ...DEFAULT_CONFIG.instagram, ...(stored.instagram ?? {}) },
    tiktok: mergedTikTok,
    grader: mergedGrader,
    allowHandles: Array.isArray(stored.allowHandles) ? [...stored.allowHandles] : [],
    blockHandles: Array.isArray(stored.blockHandles) ? [...stored.blockHandles] : [],
  };
}
