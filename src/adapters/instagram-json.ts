import { calmTitle } from "../core/dehype.js";
import type { BatchDecider, FeedItem, FeedSurface, SieveConfig } from "../types.js";

type JsonRecord = Record<string, unknown>;

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isMediaAd(media: JsonRecord, wrapper?: JsonRecord): boolean {
  if (media.ad_id || media.is_ad === true || media.is_organic_product_tagging_eligible === false && media.ad_action) {
    return true;
  }
  if (isRecord(media.injected) || typeof media.ad_action === "string") return true;
  if (wrapper && (isRecord(wrapper.ad) || isRecord(wrapper.explore_story) || isRecord(wrapper.suggested_users))) {
    return true;
  }
  return false;
}

function extractIgMedia(media: JsonRecord, surface: FeedSurface): FeedItem | null {
  const rawId = media.pk ?? media.id ?? media.code;
  const id = typeof rawId === "string" || typeof rawId === "number" ? String(rawId) : "";
  if (!id) return null;

  let captionText = "";
  if (isRecord(media.caption) && typeof media.caption.text === "string") {
    captionText = media.caption.text;
    media.caption.text = calmTitle(captionText);
  } else if (
    isRecord(media.edge_media_to_caption) &&
    Array.isArray(media.edge_media_to_caption.edges) &&
    isRecord(media.edge_media_to_caption.edges[0]) &&
    isRecord(media.edge_media_to_caption.edges[0].node) &&
    typeof media.edge_media_to_caption.edges[0].node.text === "string"
  ) {
    captionText = media.edge_media_to_caption.edges[0].node.text;
    media.edge_media_to_caption.edges[0].node.text = calmTitle(captionText);
  }

  let creatorId: string | undefined;
  let creatorHandle: string | undefined;
  let isFollowed = false;

  if (isRecord(media.user)) {
    if (media.user.pk != null) creatorId = String(media.user.pk);
    if (typeof media.user.username === "string") creatorHandle = media.user.username;
    if (isRecord(media.user.friendship_status) && media.user.friendship_status.following === true) {
      isFollowed = true;
    }
  }

  let secondaryText: string | undefined;
  if (
    isRecord(media.clips_metadata) &&
    isRecord(media.clips_metadata.music_info) &&
    isRecord(media.clips_metadata.music_info.music_asset_info) &&
    typeof media.clips_metadata.music_info.music_asset_info.title === "string"
  ) {
    secondaryText = `audio: ${media.clips_metadata.music_info.music_asset_info.title}`;
  }

  const durationSec = typeof media.video_duration === "number" ? media.video_duration : undefined;
  const likes = typeof media.like_count === "number" ? media.like_count : undefined;
  const replies = typeof media.comment_count === "number" ? media.comment_count : undefined;
  const views = typeof media.play_count === "number" ? media.play_count : undefined;

  return {
    platform: "instagram",
    id,
    creatorId,
    creatorHandle,
    isFollowed,
    surface,
    titleOrText: captionText || `@${creatorHandle ?? "reel"}`,
    secondaryText,
    durationSec,
    metrics: { likes, replies, views },
  };
}

export async function filterInstagramJson(
  data: unknown,
  urlPath: string,
  config: SieveConfig,
  decide: BatchDecider,
): Promise<unknown> {
  if (!config.enabled || !config.instagram.enabled) return data;
  if (!isRecord(data)) return data;

  interface MediaSlot {
    list: unknown[];
    id: string;
    getMediaId: (el: unknown) => string;
  }

  const candidates = new Map<string, FeedItem>();
  const slots: MediaSlot[] = [];

  function processGraphqlConnection(connKey: string, conn: JsonRecord): void {
    if (!Array.isArray(conn.edges)) return;
    const isReels = connKey.includes("clips");
    const surface: FeedSurface = isReels ? "reels" : "timeline";
    const filterActive = isReels ? config.instagram.filterReels : config.instagram.caliberFilter;

    const edges = conn.edges;
    const getMediaFromEdge = (edge: unknown): JsonRecord | null => {
      if (!isRecord(edge) || !isRecord(edge.node)) return null;
      if (isRecord(edge.node.media)) return edge.node.media;
      if (isRecord(edge.node.media_or_ad)) return edge.node.media_or_ad;
      if (edge.node.pk != null || edge.node.id != null) return edge.node;
      return null;
    };

    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const node = isRecord(edge) && isRecord(edge.node) ? edge.node : undefined;
      const media = getMediaFromEdge(edge);
      if (!media) continue;
      if (isMediaAd(media, node)) {
        edges.splice(i, 1);
        i--;
        continue;
      }
      if (!filterActive) continue;
      const item = extractIgMedia(media, surface);
      if (item) {
        candidates.set(item.id, item);
        slots.push({
          list: edges,
          id: item.id,
          getMediaId: (el) => {
            const m = getMediaFromEdge(el);
            const raw = m?.pk ?? m?.id ?? m?.code;
            return raw != null ? String(raw) : "";
          },
        });
      }
    }
  }

  if (isRecord(data.data)) {
    for (const [key, val] of Object.entries(data.data)) {
      if (isRecord(val) && Array.isArray(val.edges)) {
        processGraphqlConnection(key, val);
      }
    }
  }

  if (Array.isArray(data.items) && urlPath.includes("/clips/")) {
    const items = data.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const entry = items[i];
      const media = isRecord(entry) && isRecord(entry.media) ? entry.media : isRecord(entry) ? entry : null;
      if (!media) continue;
      if (isMediaAd(media, isRecord(entry) ? entry : undefined)) {
        items.splice(i, 1);
        continue;
      }
      if (!config.instagram.filterReels) continue;
      const item = extractIgMedia(media, "reels");
      if (item) {
        candidates.set(item.id, item);
        slots.push({
          list: items,
          id: item.id,
          getMediaId: (el) => {
            const m = isRecord(el) && isRecord(el.media) ? el.media : isRecord(el) ? el : null;
            const raw = m?.pk ?? m?.id ?? m?.code;
            return raw != null ? String(raw) : "";
          },
        });
      }
    }
  }

  if (Array.isArray(data.feed_items)) {
    const feedItems = data.feed_items;
    for (let i = feedItems.length - 1; i >= 0; i--) {
      const entry = feedItems[i];
      if (!isRecord(entry)) continue;
      if (config.instagram.hideClutter && (entry.suggested_users || entry.explore_story || entry.clips_netego)) {
        feedItems.splice(i, 1);
        continue;
      }
      const media = isRecord(entry.media_or_ad) ? entry.media_or_ad : null;
      if (!media) continue;
      if (isMediaAd(media, entry)) {
        feedItems.splice(i, 1);
        continue;
      }
      if (!config.instagram.caliberFilter) continue;
      const item = extractIgMedia(media, "timeline");
      if (item) {
        candidates.set(item.id, item);
        slots.push({
          list: feedItems,
          id: item.id,
          getMediaId: (el) => {
            const m = isRecord(el) && isRecord(el.media_or_ad) ? el.media_or_ad : null;
            const raw = m?.pk ?? m?.id ?? m?.code;
            return raw != null ? String(raw) : "";
          },
        });
      }
    }
  }

  if (candidates.size === 0) return data;

  const droppedIds = await decide([...candidates.values()]);
  if (droppedIds.size === 0) return data;

  const processedLists = new Set<unknown[]>();
  for (const slot of slots) {
    if (processedLists.has(slot.list)) continue;
    processedLists.add(slot.list);

    for (let i = slot.list.length - 1; i >= 0; i--) {
      const id = slot.getMediaId(slot.list[i]);
      if (id && droppedIds.has(id)) {
        slot.list.splice(i, 1);
      }
    }
  }

  return data;
}
