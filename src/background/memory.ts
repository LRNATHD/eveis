import { creatorKeysFor } from "../core/sieve.js";
import {
  isRecord,
  type CreatorRecord,
  type FeedItem,
  type MemoryStore,
  type Platform,
  type ResolvedVerdict,
} from "../types.js";

const ITEM_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CREATOR_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const DB_NAME = "sieve_memory_v1";

interface StoredVerdict {
  key: string;
  verdict: ResolvedVerdict;
  at: number;
}

interface MemoryOptions {
  maxItems?: number;
}

function isStoredVerdict(v: unknown): v is StoredVerdict {
  return (
    isRecord(v) &&
    typeof v.key === "string" &&
    (v.verdict === "keep" || v.verdict === "drop") &&
    typeof v.at === "number"
  );
}

function isCreatorRecord(v: unknown): v is CreatorRecord {
  return (
    isRecord(v) &&
    typeof v.key === "string" &&
    typeof v.keeps === "number" &&
    typeof v.drops === "number" &&
    typeof v.updatedAt === "number"
  );
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("items")) {
          db.createObjectStore("items", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("creators")) {
          db.createObjectStore("creators", { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function createMemoryStore(options: MemoryOptions = {}): MemoryStore {
  const maxItems = options.maxItems ?? 50_000;
  const items = new Map<string, StoredVerdict>();
  const creators = new Map<string, CreatorRecord>();
  let droppedTotal = 0;

  const dbPromise = openDb();
  void dbPromise.then((db) => {
    if (!db) return;
    const now = Date.now();
    try {
      const tx = db.transaction(["items", "creators"], "readonly");
      const itemReq = tx.objectStore("items").getAll();
      itemReq.onsuccess = () => {
        if (!Array.isArray(itemReq.result)) return;
        for (const row of itemReq.result) {
          if (isStoredVerdict(row) && now - row.at <= ITEM_TTL_MS && items.size < maxItems) {
            items.set(row.key, row);
          }
        }
      };
      const creatorReq = tx.objectStore("creators").getAll();
      creatorReq.onsuccess = () => {
        if (!Array.isArray(creatorReq.result)) return;
        for (const row of creatorReq.result) {
          if (isCreatorRecord(row) && now - row.updatedAt <= CREATOR_TTL_MS) {
            creators.set(row.key, row);
          }
        }
      };
    } catch {
      // Restricted or private contexts fall back to in-memory Maps.
    }
  });

  function itemMapKey(platform: Platform, id: string): string {
    return `${platform}:${id}`;
  }

  function creatorMapKey(platform: Platform, creatorKey: string): string {
    return `${platform}:${creatorKey}`;
  }

  function evaluateCreatorRecord(rec: CreatorRecord | undefined): ResolvedVerdict | undefined {
    if (!rec) return undefined;
    if (Date.now() - rec.updatedAt > CREATOR_TTL_MS) {
      creators.delete(rec.key);
      return undefined;
    }
    const total = rec.keeps + rec.drops;
    if (total >= 3 && rec.keeps / total >= 0.8) return "keep";
    if (total >= 5 && rec.keeps / total <= 0.15) return "drop";
    return undefined;
  }

  function isShareableHandle(rawKey: string): boolean {
    return (
      rawKey.length >= 3 &&
      !/^\d+$/.test(rawKey) &&
      !/^uc[a-z0-9_-]{20,}$/i.test(rawKey)
    );
  }

  return {
    getItemVerdict(platform, id) {
      const key = itemMapKey(platform, id);
      const hit = items.get(key);
      if (!hit) return undefined;
      if (Date.now() - hit.at > ITEM_TTL_MS) {
        items.delete(key);
        return undefined;
      }
      items.delete(key);
      items.set(key, hit);
      return hit.verdict;
    },

    getCreatorVerdict(platform, rawKey) {
      const normalized = rawKey.toLowerCase();
      const platformVerdict = evaluateCreatorRecord(
        creators.get(creatorMapKey(platform, normalized)),
      );
      if (platformVerdict) return platformVerdict;
      if (isShareableHandle(normalized)) {
        return evaluateCreatorRecord(creators.get(`*:${normalized}`));
      }
      return undefined;
    },

    async recordVerdict(item: FeedItem, verdict: ResolvedVerdict) {
      if (verdict === "drop") droppedTotal += 1;
      const now = Date.now();
      const iKey = itemMapKey(item.platform, item.id);
      const entry: StoredVerdict = { key: iKey, verdict, at: now };

      if (items.has(iKey)) items.delete(iKey);
      items.set(iKey, entry);

      let evictedKey: string | undefined;
      if (items.size > maxItems) {
        evictedKey = items.keys().next().value;
        if (evictedKey) items.delete(evictedKey);
      }

      const updatedCreators: CreatorRecord[] = [];
      const bucketKeys = new Set<string>();
      for (const cKey of creatorKeysFor(item)) {
        bucketKeys.add(creatorMapKey(item.platform, cKey));
        if (isShareableHandle(cKey)) bucketKeys.add(`*:${cKey}`);
      }

      for (const fullKey of bucketKeys) {
        const existing = creators.get(fullKey) ?? {
          key: fullKey,
          keeps: 0,
          drops: 0,
          updatedAt: now,
        };
        if (verdict === "keep") existing.keeps += 1;
        else existing.drops += 1;
        existing.updatedAt = now;
        creators.set(fullKey, existing);
        updatedCreators.push(existing);
      }

      const db = await dbPromise;
      if (!db) return;
      try {
        const tx = db.transaction(["items", "creators"], "readwrite");
        const itemStore = tx.objectStore("items");
        itemStore.put(entry);
        if (evictedKey) itemStore.delete(evictedKey);
        const creatorStore = tx.objectStore("creators");
        for (const rec of updatedCreators) creatorStore.put(rec);
      } catch {
        // Private browsing or quota limits leave in-memory entries active.
      }
    },

    async clear() {
      items.clear();
      creators.clear();
      droppedTotal = 0;
      const db = await dbPromise;
      if (!db) return;
      try {
        const tx = db.transaction(["items", "creators"], "readwrite");
        tx.objectStore("items").clear();
        tx.objectStore("creators").clear();
      } catch {
        // Private browsing may reject write transactions.
      }
    },

    counts() {
      let learnedCreators = 0;
      for (const rec of creators.values()) {
        if (evaluateCreatorRecord(rec) !== undefined) learnedCreators += 1;
      }
      return {
        cachedItems: items.size,
        learnedCreators,
        droppedTotal,
      };
    },
  };
}
