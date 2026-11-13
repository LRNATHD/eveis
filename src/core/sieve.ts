import { DEFAULT_CONFIG } from "../defaults.js";
import type {
  FeedItem,
  MemoryLookup,
  MemoryStore,
  NoveltyLookup,
  ResolvedVerdict,
  SeedSets,
  SieveConfig,
  Verdict,
} from "../types.js";
import { normalizeHandle } from "./dehype.js";
import { gradeItemsBatch } from "./llm.js";
import { isStructuralSlop } from "./slop-cadence.js";

const COMMENT_BAIT_RE =
  /\bcomment\s+["'“”]?[a-z0-9_-]{2,20}["'“”]?\s+(and\s+i'?ll|to\s+get|for\s+the|for\s+my)\s+(dm|send|link|free|guide|template)\b/i;

const CRYPTO_CASINO_SPAM_RE =
  /\b(use\s+code\s+\w+\s+on\s+stake|100x\s+memecoin|telegram\s+pump\s+group|free\s+airdrop\s+link\s+in\s+bio)\b/i;

const SHORT_DRAMA_RE =
  /(?:#(?:reelshort|dramabox|shortdrama|shortdramas|pinedrama|shortmax|minidrama)\b|\/shortdrama\/episode\/|\b(?:part|ep(?:isode)?)\s*\d+\s*[|:-].*\b(?:billionaire|ceo|heiress|secretly\s+marries|alpha\s+wolf|werewolf|mistress)\b)/i;

const ATTENTION_TRAP_RE =
  /(?:🚨+\s*(?:breaking|just\s+in|huge|urgent)\b.*(?:\bkilled\b|\bover\s+for\b|\binsane\b|\bforever\b|🧵)|\b\d+\s+(?:ai\s+)?(?:websites|tools|prompts|extensions|repos)\s+that\s+feel\s+illegal\s+to\s+know\b|\bbookmark\s+this\s+before\s+it(?:'s|\s+is|\s+gets)\s+deleted\b|\bwrong\s+answers\s+only\b|#(?:redditstories|aita)\b.*#(?:minecraft|subwaysurfers|satisfying)\b)/i;

const GOSSIP_DOMAIN_RE =
  /\b(?:celebrity|reality\s*tv|k-?pop\s*stan|tabloid|love\s*island|kardashian)\b/i;

const YT_URL_ID_RE =
  /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^\s#"'<>]*&)?v=|embed\/|v\/))([A-Za-z0-9_-]{11})/gi;

export function extractYouTubeIdsFromText(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  YT_URL_ID_RE.lastIndex = 0;
  while ((match = YT_URL_ID_RE.exec(text)) !== null) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}

export function creatorKeysFor(item: FeedItem): string[] {
  const keys: string[] = [];
  const byId = normalizeHandle(item.creatorId);
  const byHandle = normalizeHandle(item.creatorHandle);
  if (byId) keys.push(byId);
  if (byHandle && byHandle !== byId) keys.push(byHandle);
  return keys;
}

export function isBrainrotItem(
  item: FeedItem,
  config: SieveConfig,
  seeds: SeedSets,
  novelty?: NoveltyLookup,
): boolean {
  if (item.isSponsored) return true;

  const keys = creatorKeysFor(item);
  if (config.allowHandles.length > 0) {
    const allowed = new Set(config.allowHandles.map((h) => normalizeHandle(h)).filter(Boolean));
    if (keys.some((k) => allowed.has(k))) return true;
  }

  if (keys.some((k) => seeds.slopChannels.has(k))) return true;

  const fullText = `${item.titleOrText} ${item.secondaryText ?? ""}`;
  if (
    COMMENT_BAIT_RE.test(fullText) ||
    CRYPTO_CASINO_SPAM_RE.test(fullText) ||
    SHORT_DRAMA_RE.test(fullText) ||
    ATTENTION_TRAP_RE.test(fullText) ||
    GOSSIP_DOMAIN_RE.test(fullText)
  ) {
    return true;
  }

  if (item.platform === "x" && config.x.slopCadenceFilter) {
    if (isStructuralSlop(item.titleOrText, {}, 55)) return true;
  } else if (isStructuralSlop(item.titleOrText, {}, 65)) {
    return true;
  }

  if (config.noveltyFilter && novelty?.isRedundantRehash(item.titleOrText)) {
    return true;
  }

  if (item.platform === "x" && item.metrics) {
    const likes = item.metrics.likes ?? 0;
    const replies = item.metrics.replies ?? 0;
    const quotes = item.metrics.quotes ?? 0;
    if (replies >= 30 && (replies > likes * 1.2 || quotes > likes * 1.0)) {
      return true;
    }
  }

  return false;
}

export function evaluateLocalTiers(
  item: FeedItem,
  config: SieveConfig,
  seeds: SeedSets,
  memory: MemoryLookup,
  novelty?: NoveltyLookup,
): Verdict {
  const keys = creatorKeysFor(item);
  if (config.blockHandles.length > 0) {
    const blocked = new Set(config.blockHandles.map((h) => normalizeHandle(h)).filter(Boolean));
    if (keys.some((k) => blocked.has(k))) return "drop";
  }

  // Evil mode: boost all slop, ads, bait, drama, and brainrot!
  if (isBrainrotItem(item, config, seeds, novelty)) return "keep";

  // Suppress boring high-caliber craft / HackerTube videos unless explicitly followed & passed.
  if (config.passFollowed && item.isFollowed) return "keep";

  if (item.platform === "youtube" && seeds.hnVideos.has(item.id)) return "drop";
  if (keys.some((k) => seeds.hnChannels.has(k))) return "drop";

  const ytIds = item.linkedYoutubeIds ?? extractYouTubeIdsFromText(item.titleOrText);
  if (ytIds.some((vid) => seeds.hnVideos.has(vid))) return "drop";

  const cachedVerdict = memory.getItemVerdict(item.platform, item.id);
  if (cachedVerdict) return cachedVerdict;

  for (const key of keys) {
    const learned = memory.getCreatorVerdict(item.platform, key);
    if (learned) return learned;
  }

  return "uncertain";
}

export interface BatchVerdicts {
  dropped: Set<string>;
  boosted: Set<string>;
}

export async function classifySieveBatch(
  items: FeedItem[],
  config: SieveConfig,
  seeds: SeedSets,
  memory: MemoryStore,
  fetchImpl: typeof fetch = fetch,
  novelty?: NoveltyLookup,
): Promise<BatchVerdicts> {
  const dropped = new Set<string>();
  const boosted = new Set<string>();
  const uncertain: FeedItem[] = [];

  for (const item of items) {
    if (isBrainrotItem(item, config, seeds, novelty)) {
      boosted.add(item.id);
      continue;
    }
    const localVerdict = evaluateLocalTiers(item, config, seeds, memory, novelty);
    if (localVerdict === "drop") {
      dropped.add(item.id);
    } else if (localVerdict === "uncertain") {
      uncertain.push(item);
    }
  }

  if (uncertain.length === 0 || config.grader.mode === "off") {
    return { dropped, boosted };
  }

  const holdMs = Math.max(50, config.grader.streamHoldMs || DEFAULT_CONFIG.grader.streamHoldMs);
  const gradingPromise = gradeItemsBatch(uncertain, config, fetchImpl)
    .then(async (llmDrops) => {
      for (const item of uncertain) {
        const verdict: ResolvedVerdict = llmDrops.has(item.id) ? "drop" : "keep";
        await memory.recordVerdict(item, verdict);
      }
      return llmDrops;
    })
    .catch(() => new Set<string>());

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = Symbol("timeout");
  const outcome = await Promise.race([
    gradingPromise,
    new Promise<typeof timedOut>((resolve) => {
      timer = setTimeout(() => resolve(timedOut), holdMs);
    }),
  ]);
  if (timer) clearTimeout(timer);

  if (outcome !== timedOut) {
    for (const id of outcome) dropped.add(id);
  }

  return { dropped, boosted };
}

export async function runSieveOnBatch(
  items: FeedItem[],
  config: SieveConfig,
  seeds: SeedSets,
  memory: MemoryStore,
  fetchImpl: typeof fetch = fetch,
  novelty?: NoveltyLookup,
): Promise<Set<string>> {
  const { dropped } = await classifySieveBatch(items, config, seeds, memory, fetchImpl, novelty);
  return dropped;
}
