import { isRecord } from "../types.js";

const DEARROW_MIRROR_BASE = "https://dearrow.minibomba.pro/sbserver/api/branding";
const BUCKET_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 2500;

const VAGUE_TITLE_RE =
  /(?:\b(?:this changed everything|changes everything|why nobody|no one talks about|you won'?t believe|what happened|i tried\b|for \d+ days|the truth about|it'?s over|he'?s done|she'?s done|they'?re done|stop doing this|before it'?s too late|secret to|insane|shocking|destroyed|exposed)\b|\.\.\.\s*$|\?!|!\?)/i;

const titleCache = new Map<string, string | null>();
const fetchedPrefixes = new Map<string, number>();

export async function sha256Prefix4(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  const b0 = view[0]?.toString(16).padStart(2, "0") ?? "00";
  const b1 = view[1]?.toString(16).padStart(2, "0") ?? "00";
  return `${b0}${b1}`;
}

export function cleanDeArrowTitle(raw: string): string {
  return raw.replace(/(^|\s)>(\S)/g, "$1$2").replace(/\s+/g, " ").trim();
}

export function isVagueClickbaitTitle(title: string): boolean {
  if (!title) return false;
  if (VAGUE_TITLE_RE.test(title)) return true;
  const letters = title.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 10) {
    const upper = letters.replace(/[^A-Z]/g, "").length;
    if (upper / letters.length >= 0.7) return true;
  }
  return false;
}

export function getCachedDeArrowTitle(videoId: string): string | undefined {
  return titleCache.get(videoId) ?? undefined;
}

export function clearDeArrowCache(): void {
  titleCache.clear();
  fetchedPrefixes.clear();
}

function pickBestCommunityTitle(record: unknown): string | null {
  if (!isRecord(record) || !Array.isArray(record.titles)) return null;
  for (const candidate of record.titles) {
    if (!isRecord(candidate) || candidate.original === true) continue;
    const votes = typeof candidate.votes === "number" ? candidate.votes : -1;
    if (candidate.locked !== true && votes < 0) continue;
    if (typeof candidate.title !== "string") continue;
    const cleaned = cleanDeArrowTitle(candidate.title);
    if (cleaned.length >= 4) return cleaned;
  }
  return null;
}

export async function lookupDeArrowTitles(
  videoIds: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const uniqueIds = [...new Set(videoIds.filter((id) => /^[A-Za-z0-9_-]{11}$/.test(id)))];
  if (uniqueIds.length === 0) return result;

  const now = Date.now();
  const prefixesToFetch = new Map<string, string[]>();

  for (const vid of uniqueIds) {
    if (titleCache.has(vid)) {
      const hit = titleCache.get(vid);
      if (hit) result.set(vid, hit);
      continue;
    }
    const prefix = await sha256Prefix4(vid);
    const fetchedAt = fetchedPrefixes.get(prefix);
    if (fetchedAt && now - fetchedAt < BUCKET_TTL_MS) {
      titleCache.set(vid, null);
      continue;
    }
    let list = prefixesToFetch.get(prefix);
    if (!list) {
      list = [];
      prefixesToFetch.set(prefix, list);
    }
    list.push(vid);
  }

  const prefixEntries = [...prefixesToFetch.entries()].slice(0, 6);
  await Promise.all(
    prefixEntries.map(async ([prefix, requestedVids]) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetchImpl(`${DEARROW_MIRROR_BASE}/${prefix}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const bucket: unknown = await res.json();
        if (!isRecord(bucket)) return;
        fetchedPrefixes.set(prefix, now);

        for (const [vid, rec] of Object.entries(bucket)) {
          titleCache.set(vid, pickBestCommunityTitle(rec));
        }
        for (const reqVid of requestedVids) {
          if (!titleCache.has(reqVid)) titleCache.set(reqVid, null);
          const hit = titleCache.get(reqVid);
          if (hit) result.set(reqVid, hit);
        }
      } catch {
        // Mirror timeouts fail open without blocking titles.
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  return result;
}
