import { calmTitle } from "../core/dehype.js";
import type { BatchDecider, FeedItem, SieveConfig } from "../types.js";

type JsonRecord = Record<string, unknown>;

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function rewriteTikTokThemeCookieHeader(cookieHeader: string): string {
  const parts = cookieHeader
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);

  let sawTheme = false;
  let sawSource = false;

  const updated = parts.map((part) => {
    const eq = part.indexOf("=");
    const name = eq === -1 ? part : part.slice(0, eq).trim();
    if (name === "tiktok_webapp_theme") {
      sawTheme = true;
      return "tiktok_webapp_theme=light";
    }
    if (name === "tiktok_webapp_theme_source") {
      sawSource = true;
      return "tiktok_webapp_theme_source=custom";
    }
    return part;
  });

  if (!sawTheme) updated.push("tiktok_webapp_theme=light");
  if (!sawSource) updated.push("tiktok_webapp_theme_source=custom");
  return updated.join("; ");
}

export async function filterTikTokJson(
  data: unknown,
  config: SieveConfig,
  decide: BatchDecider,
): Promise<unknown> {
  if (!config.enabled || !config.tiktok.enabled) return data;
  if (!isRecord(data) || !Array.isArray(data.itemList)) return data;

  if (config.tiktok.postOnlyMode) {
    data.itemList = [];
    return data;
  }

  const list = data.itemList;
  const candidates = new Map<string, FeedItem>();

  for (let i = 0; i < list.length; i++) {
    const raw = list[i];
    if (!isRecord(raw)) continue;
    if (raw.isAd === true || isRecord(raw.adInfo)) {
      list.splice(i, 1);
      i--;
      continue;
    }

    const desc = typeof raw.desc === "string" ? raw.desc : "";
    if (typeof raw.desc === "string") {
      raw.desc = calmTitle(raw.desc);
    }

    if (!config.tiktok.caliberFilter) continue;

    const id = typeof raw.id === "string" ? raw.id : "";
    if (!id) continue;
    const author = isRecord(raw.author) ? raw.author : {};
    const stats = isRecord(raw.stats) ? raw.stats : {};
    const video = isRecord(raw.video) ? raw.video : {};

    const followStatus = typeof author.followStatus === "number" ? author.followStatus : 0;
    candidates.set(id, {
      platform: "tiktok",
      id,
      creatorId: typeof author.id === "string" ? author.id : undefined,
      creatorHandle: typeof author.uniqueId === "string" ? author.uniqueId : undefined,
      isFollowed: followStatus === 1 || followStatus === 2,
      surface: "reels",
      titleOrText: desc || `@${typeof author.uniqueId === "string" ? author.uniqueId : "tiktok"}`,
      durationSec: typeof video.duration === "number" ? video.duration : undefined,
      metrics: {
        likes: typeof stats.diggCount === "number" ? stats.diggCount : undefined,
        replies: typeof stats.commentCount === "number" ? stats.commentCount : undefined,
        views: typeof stats.playCount === "number" ? stats.playCount : undefined,
      },
    });
  }

  if (candidates.size === 0 || !config.tiktok.caliberFilter) return data;

  const droppedIds = await decide([...candidates.values()]);
  if (droppedIds.size === 0) return data;

  for (let i = list.length - 1; i >= 0; i--) {
    const entry = list[i];
    if (isRecord(entry) && typeof entry.id === "string" && droppedIds.has(entry.id)) {
      list.splice(i, 1);
    }
  }

  return data;
}
