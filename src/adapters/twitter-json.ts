import { calmTitle, midFrameThumbUrl } from "../core/dehype.js";
import { extractYouTubeIdsFromText } from "../core/sieve.js";
import {
  isRecord,
  type BatchDecider,
  type FeedItem,
  type FeedSurface,
  type JsonRecord,
  type SieveConfig,
} from "../types.js";

const NOISE_ENTRY_PREFIXES = [
  "promoted-",
  "who-to-follow-",
  "upsell-",
  "RelevancePrompt-",
  "inline-prompt-",
];

function isNoiseEntryId(entryId: string): boolean {
  return NOISE_ENTRY_PREFIXES.some((prefix) => entryId.startsWith(prefix));
}

function unwrapTweet(rawResult: unknown): JsonRecord | null {
  if (!isRecord(rawResult)) return null;
  if (rawResult.__typename === "TweetWithVisibilityResults" && isRecord(rawResult.tweet)) {
    return rawResult.tweet;
  }
  if (typeof rawResult.rest_id === "string" || isRecord(rawResult.legacy)) {
    return rawResult;
  }
  return null;
}

function readTweetBody(tweet: JsonRecord): string {
  if (
    isRecord(tweet.note_tweet) &&
    isRecord(tweet.note_tweet.note_tweet_results) &&
    isRecord(tweet.note_tweet.note_tweet_results.result) &&
    typeof tweet.note_tweet.note_tweet_results.result.text === "string"
  ) {
    return tweet.note_tweet.note_tweet_results.result.text;
  }
  if (isRecord(tweet.legacy) && typeof tweet.legacy.full_text === "string") {
    return tweet.legacy.full_text;
  }
  return "";
}

function extractTweetYouTubeIds(tweet: JsonRecord): string[] {
  const urls: string[] = [];
  if (isRecord(tweet.legacy)) {
    if (typeof tweet.legacy.full_text === "string") urls.push(tweet.legacy.full_text);
    if (isRecord(tweet.legacy.entities) && Array.isArray(tweet.legacy.entities.urls)) {
      for (const u of tweet.legacy.entities.urls) {
        if (isRecord(u) && typeof u.expanded_url === "string") {
          urls.push(u.expanded_url);
        }
      }
    }
  }
  if (isRecord(tweet.card) && isRecord(tweet.card.legacy) && Array.isArray(tweet.card.legacy.binding_values)) {
    for (const b of tweet.card.legacy.binding_values) {
      if (isRecord(b) && isRecord(b.value) && typeof b.value.string_value === "string") {
        urls.push(b.value.string_value);
      }
    }
  }
  if (isRecord(tweet.quoted_status_result)) {
    const quoted = unwrapTweet(tweet.quoted_status_result.result);
    if (quoted) urls.push(...extractTweetYouTubeIds(quoted));
  }
  return extractYouTubeIdsFromText(urls.join(" "));
}

function buildTweetRichContext(tweet: JsonRecord): string | undefined {
  const parts: string[] = [];
  const legacy = isRecord(tweet.legacy) ? tweet.legacy : {};

  const mediaHolder = isRecord(legacy.extended_entities)
    ? legacy.extended_entities
    : isRecord(legacy.entities)
      ? legacy.entities
      : undefined;
  if (mediaHolder && Array.isArray(mediaHolder.media) && mediaHolder.media.length > 0) {
    const types = new Set<string>();
    for (const m of mediaHolder.media) {
      if (isRecord(m) && typeof m.type === "string") {
        types.add(m.type === "animated_gif" ? "gif" : m.type);
      }
    }
    if (types.size > 0) parts.push(`[${[...types].join("+")}]`);
  }

  if (isRecord(legacy.entities) && Array.isArray(legacy.entities.urls)) {
    for (const u of legacy.entities.urls) {
      if (isRecord(u) && typeof u.expanded_url === "string") {
        parts.push(`link: ${u.expanded_url.slice(0, 90)}`);
      }
    }
  }

  if (isRecord(tweet.card) && isRecord(tweet.card.legacy) && Array.isArray(tweet.card.legacy.binding_values)) {
    let cardTitle = "";
    let cardDomain = "";
    for (const b of tweet.card.legacy.binding_values) {
      if (!isRecord(b) || typeof b.key !== "string" || !isRecord(b.value)) continue;
      if (b.key === "title" && typeof b.value.string_value === "string") {
        cardTitle = b.value.string_value.trim();
      } else if (b.key === "vanity_url" && typeof b.value.string_value === "string") {
        cardDomain = b.value.string_value.trim();
      }
    }
    if (cardTitle) {
      parts.push(`card: ${cardDomain ? `${cardDomain} - ` : ""}${cardTitle}`);
    }
  }

  if (isRecord(tweet.quoted_status_result)) {
    const quoted = unwrapTweet(tweet.quoted_status_result.result);
    if (quoted) {
      const qBody = readTweetBody(quoted).trim();
      let qAuthor = "";
      if (
        isRecord(quoted.core) &&
        isRecord(quoted.core.user_results) &&
        isRecord(quoted.core.user_results.result) &&
        isRecord(quoted.core.user_results.result.legacy) &&
        typeof quoted.core.user_results.result.legacy.screen_name === "string"
      ) {
        qAuthor = `@${quoted.core.user_results.result.legacy.screen_name}`;
      }
      if (qBody) {
        parts.push(`quoting ${qAuthor || "post"}: ${qBody.slice(0, 140)}`);
      }
    }
  }

  return parts.length > 0 ? parts.join(" | ") : undefined;
}

function polishTweetPresentation(tweet: JsonRecord, config: SieveConfig, ytIds: string[]): void {
  if (isRecord(tweet.legacy) && typeof tweet.legacy.full_text === "string") {
    tweet.legacy.full_text = calmTitle(tweet.legacy.full_text);
  }
  if (
    isRecord(tweet.note_tweet) &&
    isRecord(tweet.note_tweet.note_tweet_results) &&
    isRecord(tweet.note_tweet.note_tweet_results.result) &&
    typeof tweet.note_tweet.note_tweet_results.result.text === "string"
  ) {
    tweet.note_tweet.note_tweet_results.result.text = calmTitle(
      tweet.note_tweet.note_tweet_results.result.text,
    );
  }

  if (isRecord(tweet.quoted_status_result)) {
    const quoted = unwrapTweet(tweet.quoted_status_result.result);
    if (quoted) {
      polishTweetPresentation(quoted, config, extractTweetYouTubeIds(quoted));
    }
  }

  if (!isRecord(tweet.card) || !isRecord(tweet.card.legacy)) return;
  const bindings = tweet.card.legacy.binding_values;
  if (!Array.isArray(bindings)) return;

  const fallbackYtId = ytIds[0];
  let titleVal: string | undefined;
  let vanityEntry: JsonRecord | undefined;

  for (const b of bindings) {
    if (!isRecord(b) || typeof b.key !== "string" || !isRecord(b.value)) continue;

    if (b.key === "title" && typeof b.value.string_value === "string") {
      const calmed = calmTitle(b.value.string_value.trim());
      b.value.string_value = calmed;
      titleVal = calmed;
    } else if (b.key === "vanity_url" && typeof b.value.string_value === "string") {
      vanityEntry = b.value;
    }

    if (isRecord(b.value.image_value) && typeof b.value.image_value.url === "string") {
      const imgUrl = b.value.image_value.url;
      if (imgUrl.includes("ytimg.com/vi")) {
        b.value.image_value.url = midFrameThumbUrl(imgUrl, fallbackYtId);
      }
    }
  }

  if (config.x.restoreHeadlines && titleVal && vanityEntry && typeof vanityEntry.string_value === "string") {
    if (!vanityEntry.string_value.includes(" · ")) {
      vanityEntry.string_value = `${vanityEntry.string_value} · ${titleVal}`;
    }
  }
}

function readUserFollowFlag(userContainer: unknown): {
  id?: string;
  handle?: string;
  following: boolean;
} {
  if (!isRecord(userContainer)) return { following: false };
  const id = typeof userContainer.rest_id === "string" ? userContainer.rest_id : undefined;
  let handle: string | undefined;
  let following = false;

  if (isRecord(userContainer.legacy)) {
    if (typeof userContainer.legacy.screen_name === "string") {
      handle = userContainer.legacy.screen_name;
    }
    if (userContainer.legacy.following === true) following = true;
  }
  if (
    isRecord(userContainer.relationship_perspectives) &&
    userContainer.relationship_perspectives.following === true
  ) {
    following = true;
  }
  return { id, handle, following };
}

function extractTweetItem(
  tweet: JsonRecord,
  surface: FeedSurface,
  ytIds: string[],
  socialContextFollowing: boolean,
): FeedItem | null {
  const id = typeof tweet.rest_id === "string" ? tweet.rest_id : "";
  if (!id) return null;

  const text = readTweetBody(tweet);
  if (!text) return null;

  const legacy = isRecord(tweet.legacy) ? tweet.legacy : {};
  const outerAuthor =
    isRecord(tweet.core) && isRecord(tweet.core.user_results)
      ? readUserFollowFlag(tweet.core.user_results.result)
      : { following: false };

  let innerFollowed = false;
  if (isRecord(legacy.retweeted_status_result)) {
    const inner = unwrapTweet(legacy.retweeted_status_result.result);
    if (inner && isRecord(inner.core) && isRecord(inner.core.user_results)) {
      innerFollowed = readUserFollowFlag(inner.core.user_results.result).following;
    }
  }

  const isFollowed = outerAuthor.following || innerFollowed || socialContextFollowing;
  const secondaryText = buildTweetRichContext(tweet);

  const likes = typeof legacy.favorite_count === "number" ? legacy.favorite_count : undefined;
  const replies = typeof legacy.reply_count === "number" ? legacy.reply_count : undefined;
  const quotes = typeof legacy.quote_count === "number" ? legacy.quote_count : undefined;

  return {
    platform: "x",
    id,
    creatorId: outerAuthor.id,
    creatorHandle: outerAuthor.handle,
    isFollowed,
    surface,
    titleOrText: text,
    ...(secondaryText ? { secondaryText } : {}),
    ...(ytIds.length > 0 ? { linkedYoutubeIds: ytIds } : {}),
    metrics: { likes, replies, quotes },
  };
}

export async function filterTwitterJson(
  data: unknown,
  urlPath: string,
  config: SieveConfig,
  decide: BatchDecider,
): Promise<unknown> {
  if (!config.enabled || !config.x.enabled) return data;
  if (!isRecord(data)) return data;

  // Never delete organic posts when viewing a status/thread (/TweetDetail), a user profile (/User*),
  // or the chronological Following tab (/HomeLatestTimeline). Only strip promoted ads and polish cards/titles there.
  const isProfilePayload = isRecord(data.data) && isRecord(data.data.user);
  const isAdsOnlySurface =
    isProfilePayload ||
    urlPath.includes("/HomeLatestTimeline") ||
    urlPath.includes("/TweetDetail") ||
    urlPath.includes("/UserTweets") ||
    urlPath.includes("/UserMedia") ||
    urlPath.includes("/HighlightsTweets") ||
    urlPath.includes("/Likes");
  const surface: FeedSurface = urlPath.includes("/SearchTimeline") ? "search" : "timeline";

  interface EntryRef {
    list: unknown[];
    itemId: string;
  }

  const candidates = new Map<string, FeedItem>();
  const entryRefs: EntryRef[] = [];

  function extractEntryId(entry: JsonRecord): string {
    const rawEntryId = typeof entry.entryId === "string" ? entry.entryId : "";
    const content = isRecord(entry.content) ? entry.content : isRecord(entry.item) ? entry.item : undefined;
    const itemContent = content && isRecord(content.itemContent) ? content.itemContent : undefined;
    if (itemContent && isRecord(itemContent.tweet_results)) {
      const tweet = unwrapTweet(itemContent.tweet_results.result);
      if (tweet && typeof tweet.rest_id === "string") return tweet.rest_id;
    }
    if (itemContent && typeof itemContent.name === "string") {
      return rawEntryId || `trend:${itemContent.name}`;
    }
    return rawEntryId;
  }

  function walkInstructions(node: unknown): void {
    if (Array.isArray(node)) {
      for (const child of node) walkInstructions(child);
      return;
    }
    if (!isRecord(node)) return;

    if (Array.isArray(node.entries)) {
      processEntriesArray(node.entries);
    }
    if (Array.isArray(node.moduleItems)) {
      processEntriesArray(node.moduleItems);
    }

    for (const val of Object.values(node)) {
      walkInstructions(val);
    }
  }

  function processEntriesArray(entries: unknown[]): void {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!isRecord(entry)) continue;

      const entryId = typeof entry.entryId === "string" ? entry.entryId : "";
      if (entryId && isNoiseEntryId(entryId)) {
        entries.splice(i, 1);
        i--;
        continue;
      }

      const content = isRecord(entry.content) ? entry.content : isRecord(entry.item) ? entry.item : undefined;
      const itemContent =
        content && isRecord(content.itemContent) ? content.itemContent : undefined;

      if (itemContent?.promotedMetadata) {
        entries.splice(i, 1);
        i--;
        continue;
      }

      const socialCtx =
        (itemContent && isRecord(itemContent.socialContext) ? itemContent.socialContext : undefined) ??
        (content && isRecord(content.clientEventInfo) ? content.clientEventInfo : undefined);
      const socialFollowing =
        isRecord(socialCtx) &&
        typeof socialCtx.contextType === "string" &&
        socialCtx.contextType === "Follow";

      if (itemContent && isRecord(itemContent.tweet_results)) {
        const tweet = unwrapTweet(itemContent.tweet_results.result);
        if (!tweet) continue;

        const ytIds = extractTweetYouTubeIds(tweet);
        const item = extractTweetItem(tweet, surface, ytIds, socialFollowing);
        polishTweetPresentation(tweet, config, ytIds);

        if (item && config.x.caliberFilter && !isAdsOnlySurface) {
          candidates.set(item.id, item);
          entryRefs.push({ list: entries, itemId: item.id });
        }
        continue;
      }

      if (
        itemContent &&
        typeof itemContent.name === "string" &&
        (itemContent.__typename === "TimelineTrend" ||
          isRecord(itemContent.trendMetadata) ||
          entryId.startsWith("trend-"))
      ) {
        const trendName = itemContent.name.trim();
        const trendMeta = isRecord(itemContent.trendMetadata) ? itemContent.trendMetadata : {};
        const domainCtx = typeof trendMeta.domainContext === "string" ? trendMeta.domainContext : undefined;
        const metaDesc = typeof trendMeta.metaDescription === "string" ? trendMeta.metaDescription : "";
        if (/promoted/i.test(metaDesc)) {
          entries.splice(i, 1);
          i--;
          continue;
        }
        itemContent.name = calmTitle(trendName);
        if (config.x.caliberFilter && !isAdsOnlySurface && trendName) {
          const trendId = entryId || `trend:${trendName}`;
          candidates.set(trendId, {
            platform: "x",
            id: trendId,
            surface: "search",
            titleOrText: trendName,
            secondaryText: [domainCtx, metaDesc].filter(Boolean).join(" · ") || undefined,
          });
          entryRefs.push({ list: entries, itemId: trendId });
        }
      }
    }
  }

  walkInstructions(data);

  if (candidates.size === 0) {
    return data;
  }

  const droppedIds = await decide([...candidates.values()]);
  if (droppedIds.size === 0) return data;

  const listsToPrune = new Map<unknown[], Set<string>>();
  for (const ref of entryRefs) {
    if (ref.itemId && droppedIds.has(ref.itemId)) {
      let set = listsToPrune.get(ref.list);
      if (!set) {
        set = new Set();
        listsToPrune.set(ref.list, set);
      }
      set.add(ref.itemId);
    }
  }

  for (const [list, ids] of listsToPrune) {
    for (let i = list.length - 1; i >= 0; i--) {
      const entry = list[i];
      if (!isRecord(entry)) continue;
      const id = extractEntryId(entry);
      if (id && ids.has(id)) {
        list.splice(i, 1);
      }
    }
  }

  return data;
}
