import { isRecord, type SieveConfig } from "./types.js";

const SCHEMA_VERSION = 1;

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
  schemaVersion: SCHEMA_VERSION,
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

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function bool(obj: Record<string, unknown>, key: string, fallback: boolean): boolean {
  return typeof obj[key] === "boolean" ? obj[key] : fallback;
}

export function mergeConfig(stored?: unknown): SieveConfig {
  if (!isRecord(stored)) return structuredClone(DEFAULT_CONFIG);

  const yt = isRecord(stored.youtube) ? stored.youtube : {};
  const x = isRecord(stored.x) ? stored.x : {};
  const ig = isRecord(stored.instagram) ? stored.instagram : {};
  const tt = isRecord(stored.tiktok) ? stored.tiktok : {};
  const gr = isRecord(stored.grader) ? stored.grader : {};
  const d = DEFAULT_CONFIG;
  const mode =
    gr.mode === "off" || gr.mode === "local" || gr.mode === "api" ? gr.mode : d.grader.mode;

  return {
    schemaVersion: SCHEMA_VERSION,
    enabled: bool(stored, "enabled", d.enabled),
    passFollowed: bool(stored, "passFollowed", d.passFollowed),
    noveltyFilter: bool(stored, "noveltyFilter", d.noveltyFilter),
    youtube: {
      enabled: bool(yt, "enabled", d.youtube.enabled),
      caliberFilter: bool(yt, "caliberFilter", d.youtube.caliberFilter),
      hideShorts: bool(yt, "hideShorts", d.youtube.hideShorts),
      cleanHeader: bool(yt, "cleanHeader", d.youtube.cleanHeader),
      midFrameThumbs: bool(yt, "midFrameThumbs", d.youtube.midFrameThumbs),
      calmTitles: bool(yt, "calmTitles", d.youtube.calmTitles),
      dearrowTitles: bool(yt, "dearrowTitles", d.youtube.dearrowTitles),
    },
    x: {
      enabled: bool(x, "enabled", d.x.enabled),
      caliberFilter: bool(x, "caliberFilter", d.x.caliberFilter),
      slopCadenceFilter: bool(x, "slopCadenceFilter", d.x.slopCadenceFilter),
      classicBird: bool(x, "classicBird", d.x.classicBird),
      cleanSidebar: bool(x, "cleanSidebar", d.x.cleanSidebar),
      cleanNav: bool(x, "cleanNav", d.x.cleanNav),
      restoreHeadlines: bool(x, "restoreHeadlines", d.x.restoreHeadlines),
    },
    instagram: {
      enabled: bool(ig, "enabled", d.instagram.enabled),
      caliberFilter: bool(ig, "caliberFilter", d.instagram.caliberFilter),
      filterReels: bool(ig, "filterReels", d.instagram.filterReels),
      hideClutter: bool(ig, "hideClutter", d.instagram.hideClutter),
    },
    tiktok: {
      enabled: bool(tt, "enabled", d.tiktok.enabled),
      caliberFilter: bool(tt, "caliberFilter", d.tiktok.caliberFilter),
      cleanChrome: bool(tt, "cleanChrome", d.tiktok.cleanChrome),
      lightMode: bool(tt, "lightMode", d.tiktok.lightMode),
      postOnlyMode: bool(tt, "postOnlyMode", d.tiktok.postOnlyMode),
    },
    grader: {
      mode,
      endpoint: typeof gr.endpoint === "string" ? gr.endpoint : d.grader.endpoint,
      model: typeof gr.model === "string" ? gr.model : d.grader.model,
      apiKey: typeof gr.apiKey === "string" ? gr.apiKey : d.grader.apiKey,
      rubric: typeof gr.rubric === "string" ? gr.rubric : d.grader.rubric,
      streamHoldMs:
        typeof gr.streamHoldMs === "number" && Number.isFinite(gr.streamHoldMs)
          ? gr.streamHoldMs
          : d.grader.streamHoldMs,
    },
    allowHandles: readStringList(stored.allowHandles),
    blockHandles: readStringList(stored.blockHandles),
  };
}
