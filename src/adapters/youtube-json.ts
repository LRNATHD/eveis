import { getCachedDeArrowTitle, isVagueClickbaitTitle } from "../core/dearrow.js";
import { calmTitle, isYouTubeSafeRoute, midFrameThumbUrl } from "../core/dehype.js";
import {
  isRecord,
  type BatchDecider,
  type FeedItem,
  type FeedSurface,
  type JsonRecord,
  type SieveConfig,
} from "../types.js";

const VIDEO_RENDERER_KEYS = [
  "videoRenderer",
  "compactVideoRenderer",
  "gridVideoRenderer",
  "videoWithContextRenderer",
] as const;

const SHORTS_KEYS = new Set([
  "reelShelfRenderer",
  "reelItemRenderer",
  "shortsLockupViewModel",
]);

const AD_AND_NOISE_KEYS = new Set([
  "adSlotRenderer",
  "promotedSparklesWebRenderer",
  "promotedVideoRenderer",
  "miniGameCardViewModel",
  "radioRenderer",
  "compactRadioRenderer",
]);

const PRUNABLE_WRAPPERS = new Set([
  "richItemRenderer",
  "richShelfRenderer",
  "richSectionRenderer",
  "shelfRenderer",
  "content",
  "contents",
  "itemSectionRenderer",
]);

function isYouTubeChannelPayload(data: unknown): boolean {
  if (!isRecord(data)) return false;
  if (isRecord(data.metadata) && isRecord(data.metadata.channelMetadataRenderer)) return true;
  if (
    isRecord(data.header) &&
    (isRecord(data.header.pageHeaderRenderer) || isRecord(data.header.c4TabbedHeaderRenderer))
  ) {
    return true;
  }
  return false;
}

function surfaceFromEndpoint(urlPath: string): FeedSurface {
  if (urlPath.includes("/search") || urlPath.includes("/results")) return "search";
  if (urlPath.includes("/next")) return "watch_next";
  return "home";
}

function readText(node: unknown): string {
  if (!isRecord(node)) return "";
  if (typeof node.simpleText === "string") return node.simpleText;
  if (typeof node.content === "string") return node.content;
  if (Array.isArray(node.runs)) {
    return node.runs
      .map((run) => (isRecord(run) && typeof run.text === "string" ? run.text : ""))
      .join("");
  }
  return "";
}

function rewriteText(node: unknown, transform: (s: string) => string): void {
  if (!isRecord(node)) return;
  if (typeof node.simpleText === "string") {
    node.simpleText = transform(node.simpleText);
  } else if (typeof node.content === "string") {
    node.content = transform(node.content);
  } else if (Array.isArray(node.runs) && node.runs.length === 1 && isRecord(node.runs[0])) {
    const single = node.runs[0];
    if (typeof single.text === "string") {
      single.text = transform(single.text);
    }
  } else if (Array.isArray(node.runs) && node.runs.length > 1) {
    const full = readText(node);
    if (full) {
      node.runs = [{ text: transform(full) }];
    }
  }
}

function parseDurationSec(raw: string): number | undefined {
  if (!raw) return undefined;
  const clean = raw.trim();
  if (!/^\d+(?::\d{1,2}){1,2}$/.test(clean)) return undefined;
  const parts = clean.split(":").map((n) => Number.parseInt(n, 10));
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return undefined;
}

function containsShortsUrl(obj: unknown): boolean {
  if (typeof obj === "string") return obj.startsWith("/shorts/");
  if (Array.isArray(obj)) return obj.some(containsShortsUrl);
  if (isRecord(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      if (SHORTS_KEYS.has(k)) return true;
      if ((k === "url" || k === "canonicalBaseUrl") && typeof v === "string" && v.startsWith("/shorts")) {
        return true;
      }
      if (containsShortsUrl(v)) return true;
    }
  }
  return false;
}

function isMixLockup(lockup: JsonRecord): boolean {
  const raw = JSON.stringify(lockup.contentImage ?? {});
  return raw.includes('"imageName":"MIX"');
}

function extractFromVideoRenderer(renderer: JsonRecord, surface: FeedSurface): FeedItem | null {
  const id = typeof renderer.videoId === "string" ? renderer.videoId : "";
  if (!id) return null;
  const title = readText(renderer.title) || readText(renderer.headline);
  if (!title) return null;

  const byline = renderer.shortBylineText ?? renderer.longBylineText ?? renderer.ownerText;
  const channelName = readText(byline);
  let channelId: string | undefined;
  if (isRecord(byline) && Array.isArray(byline.runs)) {
    for (const run of byline.runs) {
      if (!isRecord(run) || !isRecord(run.navigationEndpoint)) continue;
      const browse = run.navigationEndpoint.browseEndpoint;
      if (isRecord(browse)) {
        if (typeof browse.browseId === "string") channelId = browse.browseId;
        if (!channelId && typeof browse.canonicalBaseUrl === "string") {
          channelId = browse.canonicalBaseUrl.replace(/^\//, "");
        }
      }
    }
  }

  const lengthNode = renderer.lengthText;
  const durationSec = parseDurationSec(readText(lengthNode));

  return {
    platform: "youtube",
    id,
    creatorId: channelId,
    creatorHandle: channelName || undefined,
    surface,
    titleOrText: title,
    durationSec,
  };
}

function findBrowseEndpoint(node: unknown): { browseId?: string; handle?: string } {
  if (!isRecord(node)) return {};
  if (isRecord(node.browseEndpoint)) {
    const be = node.browseEndpoint;
    const browseId = typeof be.browseId === "string" ? be.browseId : undefined;
    const base = typeof be.canonicalBaseUrl === "string" ? be.canonicalBaseUrl : "";
    const handle = base.startsWith("/@") ? base.slice(1) : undefined;
    if (browseId || handle) return { browseId, handle };
  }
  for (const val of Object.values(node)) {
    if (isRecord(val) || Array.isArray(val)) {
      const hit = findBrowseEndpoint(val);
      if (hit.browseId || hit.handle) return hit;
    }
  }
  return {};
}

function findLockupDurationSec(contentImage: unknown): number | undefined {
  if (!isRecord(contentImage)) return undefined;
  const tvm = contentImage.thumbnailViewModel;
  if (!isRecord(tvm) || !Array.isArray(tvm.overlays)) return undefined;
  for (const ov of tvm.overlays) {
    if (!isRecord(ov) || !isRecord(ov.thumbnailOverlayBadgeViewModel)) continue;
    const badges = ov.thumbnailOverlayBadgeViewModel.thumbnailBadges;
    if (!Array.isArray(badges)) continue;
    for (const b of badges) {
      if (isRecord(b) && isRecord(b.thumbnailBadgeViewModel) && typeof b.thumbnailBadgeViewModel.text === "string") {
        const parsed = parseDurationSec(b.thumbnailBadgeViewModel.text);
        if (parsed !== undefined) return parsed;
      }
    }
  }
  return undefined;
}

function extractFromLockup(lockup: JsonRecord, surface: FeedSurface): FeedItem | null {
  const id = typeof lockup.contentId === "string" ? lockup.contentId : "";
  if (!id || id.length !== 11) return null;

  const meta = isRecord(lockup.metadata) ? lockup.metadata.lockupMetadataViewModel : undefined;
  if (!isRecord(meta)) return null;
  const title = readText(meta.title);
  if (!title) return null;

  const { browseId, handle } = findBrowseEndpoint(meta.image ?? meta.metadata);

  let channelDisplayName = "";
  const contextParts: string[] = [];
  const contentMeta = isRecord(meta.metadata) ? meta.metadata.contentMetadataViewModel : undefined;
  if (isRecord(contentMeta) && Array.isArray(contentMeta.metadataRows)) {
    contentMeta.metadataRows.forEach((row, rowIdx) => {
      if (!isRecord(row) || !Array.isArray(row.metadataParts)) return;
      for (const part of row.metadataParts) {
        if (!isRecord(part)) continue;
        const txt = readText(part.text).trim();
        if (!txt) continue;
        if (rowIdx === 0 && !channelDisplayName) channelDisplayName = txt;
        contextParts.push(txt);
      }
    });
  }

  const durationSec = findLockupDurationSec(lockup.contentImage);

  return {
    platform: "youtube",
    id,
    creatorId: browseId || (channelDisplayName ? channelDisplayName : undefined),
    creatorHandle: handle || channelDisplayName || undefined,
    surface,
    titleOrText: title,
    ...(contextParts.length > 0 ? { secondaryText: contextParts.join(" · ") } : {}),
    ...(durationSec !== undefined ? { durationSec } : {}),
  };
}

function resolveBetterYouTubeTitle(rawTitle: string, id: string | undefined, config: SieveConfig): string {
  if (config.youtube.dearrowTitles && id && isVagueClickbaitTitle(rawTitle)) {
    const curated = getCachedDeArrowTitle(id);
    if (curated) return config.youtube.calmTitles ? calmTitle(curated) : curated;
  }
  return config.youtube.calmTitles ? calmTitle(rawTitle) : rawTitle;
}

function dehypeVideoRenderer(renderer: JsonRecord, config: SieveConfig): void {
  const id = typeof renderer.videoId === "string" ? renderer.videoId : undefined;
  if (config.youtube.calmTitles || config.youtube.dearrowTitles) {
    if (renderer.title) rewriteText(renderer.title, (t) => resolveBetterYouTubeTitle(t, id, config));
    if (renderer.headline) rewriteText(renderer.headline, (t) => resolveBetterYouTubeTitle(t, id, config));
  }
  if (config.youtube.midFrameThumbs && isRecord(renderer.thumbnail) && Array.isArray(renderer.thumbnail.thumbnails)) {
    for (const thumb of renderer.thumbnail.thumbnails) {
      if (isRecord(thumb) && typeof thumb.url === "string") {
        thumb.url = midFrameThumbUrl(thumb.url, id);
      }
    }
  }
}

function dehypeLockup(lockup: JsonRecord, config: SieveConfig): void {
  const id = typeof lockup.contentId === "string" ? lockup.contentId : undefined;
  if ((config.youtube.calmTitles || config.youtube.dearrowTitles) && isRecord(lockup.metadata)) {
    const meta = lockup.metadata.lockupMetadataViewModel;
    if (isRecord(meta) && meta.title) {
      rewriteText(meta.title, (t) => resolveBetterYouTubeTitle(t, id, config));
    }
  }
  if (config.youtube.midFrameThumbs && isRecord(lockup.contentImage)) {
    const tvm = lockup.contentImage.thumbnailViewModel;
    if (isRecord(tvm) && isRecord(tvm.image) && Array.isArray(tvm.image.sources)) {
      for (const src of tvm.image.sources) {
        if (isRecord(src) && typeof src.url === "string") {
          src.url = midFrameThumbUrl(src.url, id);
        }
      }
    }
  }
}

export async function filterYouTubeJson(
  data: unknown,
  urlPath: string,
  pageUrl: string,
  config: SieveConfig,
  decide: BatchDecider,
): Promise<unknown> {
  if (!config.enabled || !config.youtube.enabled) return data;
  if (!isRecord(data) && !Array.isArray(data)) return data;

  const surface = surfaceFromEndpoint(urlPath);
  const safeRoute = isYouTubeSafeRoute(pageUrl) || isYouTubeChannelPayload(data);
  const candidates = new Map<string, FeedItem>();

  function collectAndStripNoise(node: unknown): boolean {
    if (Array.isArray(node)) {
      let removedAny = false;
      for (let i = 0; i < node.length; i++) {
        if (collectAndStripNoise(node[i])) {
          node.splice(i, 1);
          i--;
          removedAny = true;
        }
      }
      return removedAny && node.length === 0;
    }

    if (!isRecord(node)) return false;

    for (const key of Object.keys(node)) {
      if (AD_AND_NOISE_KEYS.has(key)) {
        delete node[key];
        return Object.keys(node).length === 0;
      }
      if (config.youtube.hideShorts && SHORTS_KEYS.has(key)) {
        delete node[key];
        return Object.keys(node).length === 0;
      }
      if (config.youtube.hideShorts && key === "gridShelfViewModel" && containsShortsUrl(node[key])) {
        delete node[key];
        return Object.keys(node).length === 0;
      }
    }

    if (isRecord(node.lockupViewModel)) {
      if (isMixLockup(node.lockupViewModel)) {
        delete node.lockupViewModel;
        return Object.keys(node).length === 0;
      }
      if (config.youtube.hideShorts && containsShortsUrl(node.lockupViewModel)) {
        delete node.lockupViewModel;
        return Object.keys(node).length === 0;
      }
      const item = extractFromLockup(node.lockupViewModel, surface);
      if (item && !safeRoute && config.youtube.caliberFilter) {
        candidates.set(item.id, item);
      }
    }

    for (const key of VIDEO_RENDERER_KEYS) {
      const renderer = node[key];
      if (!isRecord(renderer)) continue;
      if (config.youtube.hideShorts && containsShortsUrl(renderer.navigationEndpoint)) {
        delete node[key];
        return Object.keys(node).length === 0;
      }
      const item = extractFromVideoRenderer(renderer, surface);
      if (item && !safeRoute && config.youtube.caliberFilter) {
        candidates.set(item.id, item);
      }
    }

    let lostPrimaryContent = false;
    for (const key of Object.keys(node)) {
      const childBecameEmpty = collectAndStripNoise(node[key]);
      if (childBecameEmpty && PRUNABLE_WRAPPERS.has(key)) {
        delete node[key];
        if (
          key === "content" ||
          key === "contents" ||
          key === "richShelfRenderer" ||
          key === "richItemRenderer" ||
          key === "shelfRenderer"
        ) {
          lostPrimaryContent = true;
        }
      }
    }

    return lostPrimaryContent || Object.keys(node).length === 0;
  }

  collectAndStripNoise(data);

  const droppedIds =
    candidates.size > 0 ? await decide([...candidates.values()]) : new Set<string>();

  function applyVerdictsAndDehype(node: unknown): boolean {
    if (Array.isArray(node)) {
      let removedAny = false;
      for (let i = node.length - 1; i >= 0; i--) {
        if (applyVerdictsAndDehype(node[i])) {
          node.splice(i, 1);
          removedAny = true;
        }
      }
      return removedAny && node.length === 0;
    }

    if (!isRecord(node)) return false;

    if (isRecord(node.lockupViewModel)) {
      const id = typeof node.lockupViewModel.contentId === "string" ? node.lockupViewModel.contentId : "";
      if (id && droppedIds.has(id)) {
        delete node.lockupViewModel;
        return Object.keys(node).length === 0;
      }
      dehypeLockup(node.lockupViewModel, config);
    }

    for (const key of VIDEO_RENDERER_KEYS) {
      const renderer = node[key];
      if (!isRecord(renderer)) continue;
      const id = typeof renderer.videoId === "string" ? renderer.videoId : "";
      if (id && droppedIds.has(id)) {
        delete node[key];
        return Object.keys(node).length === 0;
      }
      dehypeVideoRenderer(renderer, config);
    }

    let lostPrimaryContent = false;
    for (const key of Object.keys(node)) {
      const childBecameEmpty = applyVerdictsAndDehype(node[key]);
      if (childBecameEmpty && PRUNABLE_WRAPPERS.has(key)) {
        delete node[key];
        if (
          key === "content" ||
          key === "contents" ||
          key === "richShelfRenderer" ||
          key === "richItemRenderer" ||
          key === "shelfRenderer"
        ) {
          lostPrimaryContent = true;
        }
      }
    }

    return lostPrimaryContent || Object.keys(node).length === 0;
  }

  applyVerdictsAndDehype(data);
  return data;
}

function findBalancedJsonEnd(source: string, openBraceIndex: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = openBraceIndex; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export async function rewriteYouTubeHtmlInitialData(
  html: string,
  pageUrl: string,
  config: SieveConfig,
  decide: BatchDecider,
): Promise<string> {
  if (!config.enabled || !config.youtube.enabled) return html;
  const markerMatch = /(?:var\s+ytInitialData|window\["ytInitialData"\])\s*=\s*\{/.exec(html);
  if (!markerMatch) return html;

  const openBrace = markerMatch.index + markerMatch[0].length - 1;
  const closeBrace = findBalancedJsonEnd(html, openBrace);
  if (closeBrace === -1) return html;

  try {
    const parsed: unknown = JSON.parse(html.slice(openBrace, closeBrace + 1));
    const filtered = await filterYouTubeJson(parsed, "/youtubei/v1/browse", pageUrl, config, decide);
    const safeSerialized = JSON.stringify(filtered).replace(/<\//g, "<\\/");
    return html.slice(0, openBrace) + safeSerialized + html.slice(closeBrace + 1);
  } catch {
    return html;
  }
}
