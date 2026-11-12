import { isRecord, type NoveltyMemory } from "../types.js";

const NOVELTY_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_NOVELTY_RECORDS = 400;
const MIN_SIGNATURE_TOKENS = 6;
const NOVELTY_DB_NAME = "sieve_novelty_v1";

const STOPWORDS = new Set([
  "about",
  "above",
  "after",
  "again",
  "against",
  "all",
  "also",
  "always",
  "amid",
  "among",
  "another",
  "any",
  "are",
  "around",
  "back",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "breaking",
  "but",
  "can",
  "cannot",
  "could",
  "did",
  "does",
  "doing",
  "done",
  "down",
  "during",
  "each",
  "even",
  "every",
  "first",
  "for",
  "from",
  "further",
  "get",
  "gets",
  "getting",
  "got",
  "had",
  "has",
  "have",
  "having",
  "here",
  "hers",
  "him",
  "his",
  "how",
  "https",
  "http",
  "into",
  "its",
  "just",
  "like",
  "look",
  "made",
  "make",
  "makes",
  "many",
  "more",
  "most",
  "much",
  "must",
  "new",
  "news",
  "not",
  "now",
  "off",
  "once",
  "only",
  "other",
  "our",
  "out",
  "over",
  "own",
  "people",
  "really",
  "right",
  "said",
  "same",
  "says",
  "see",
  "she",
  "should",
  "some",
  "still",
  "such",
  "take",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "thing",
  "things",
  "think",
  "this",
  "those",
  "through",
  "time",
  "today",
  "too",
  "under",
  "until",
  "very",
  "video",
  "want",
  "was",
  "watch",
  "way",
  "well",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "why",
  "will",
  "with",
  "without",
  "would",
  "www",
  "year",
  "years",
  "you",
  "your",
]);

interface DwelledEntry {
  id: string;
  tokens: string[];
  at: number;
}

function isDwelledEntry(v: unknown): v is DwelledEntry {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.at === "number" &&
    Array.isArray(v.tokens) &&
    v.tokens.every((t) => typeof t === "string")
  );
}

export function extractSignatureTokens(text: string): Set<string> {
  const out = new Set<string>();
  if (!text) return out;
  const withoutUrls = text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/@[A-Za-z0-9_.-]+/g, " ")
    .toLowerCase();

  for (const raw of withoutUrls.split(/[^a-z0-9]+/)) {
    if (raw.length < 3) continue;
    if (STOPWORDS.has(raw)) continue;
    out.add(raw);
  }
  return out;
}

function openNoveltyDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(NOVELTY_DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains("dwelled")) {
          req.result.createObjectStore("dwelled", { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function createNoveltyMemory(): NoveltyMemory {
  const entries: Array<{ id: string; tokenSet: Set<string>; at: number }> = [];
  const dbPromise = openNoveltyDb();

  void dbPromise.then((db) => {
    if (!db) return;
    const now = Date.now();
    try {
      const req = db.transaction("dwelled", "readonly").objectStore("dwelled").getAll();
      req.onsuccess = () => {
        if (!Array.isArray(req.result)) return;
        req.result
          .filter((r): r is DwelledEntry => isDwelledEntry(r) && now - r.at <= NOVELTY_TTL_MS)
          .slice(-MAX_NOVELTY_RECORDS)
          .forEach((r) => {
            entries.push({ id: r.id, tokenSet: new Set(r.tokens), at: r.at });
          });
      };
    } catch {
      // Ignore IDB errors in restricted contexts.
    }
  });

  function pruneExpired(now: number): void {
    while (entries.length > 0 && now - entries[0]!.at > NOVELTY_TTL_MS) {
      entries.shift();
    }
  }

  function overlapMetrics(a: Set<string>, b: Set<string>): { jaccard: number; containment: number } {
    let inter = 0;
    const smaller = a.size <= b.size ? a : b;
    const larger = a.size <= b.size ? b : a;
    for (const tok of smaller) {
      if (larger.has(tok)) inter += 1;
    }
    if (inter === 0) return { jaccard: 0, containment: 0 };
    const union = a.size + b.size - inter;
    return {
      jaccard: inter / union,
      containment: inter / Math.min(a.size, b.size),
    };
  }

  return {
    recordDwelled(text: string) {
      const tokenSet = extractSignatureTokens(text);
      if (tokenSet.size < MIN_SIGNATURE_TOKENS) return;

      const now = Date.now();
      pruneExpired(now);

      for (const existing of entries) {
        const { jaccard, containment } = overlapMetrics(tokenSet, existing.tokenSet);
        if (jaccard >= 0.58 || containment >= 0.72) {
          existing.at = now;
          return;
        }
      }

      const id = `${now}_${Math.random().toString(36).slice(2, 8)}`;
      entries.push({ id, tokenSet, at: now });

      let evictedId: string | undefined;
      if (entries.length > MAX_NOVELTY_RECORDS) {
        evictedId = entries.shift()?.id;
      }

      void dbPromise.then((db) => {
        if (!db) return;
        try {
          const tx = db.transaction("dwelled", "readwrite");
          const store = tx.objectStore("dwelled");
          store.put({ id, tokens: [...tokenSet], at: now } satisfies DwelledEntry);
          if (evictedId) store.delete(evictedId);
        } catch {
          // Ignore persistence errors.
        }
      });
    },

    isRedundantRehash(text: string): boolean {
      const tokenSet = extractSignatureTokens(text);
      if (tokenSet.size < MIN_SIGNATURE_TOKENS) return false;
      pruneExpired(Date.now());

      for (const seen of entries) {
        const { jaccard, containment } = overlapMetrics(tokenSet, seen.tokenSet);
        if (jaccard >= 0.58 || containment >= 0.72) {
          return true;
        }
      }
      return false;
    },

    clear() {
      entries.length = 0;
      void dbPromise.then((db) => {
        if (!db) return;
        try {
          db.transaction("dwelled", "readwrite").objectStore("dwelled").clear();
        } catch {
          // Ignore clear errors.
        }
      });
    },

    size() {
      pruneExpired(Date.now());
      return entries.length;
    },
  };
}
