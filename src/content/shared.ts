import { DEFAULT_CONFIG, mergeConfig } from "../defaults.js";
import { isRecord, type FeedItem, type SieveConfig } from "../types.js";

const LOCAL_CACHE_KEY = "__sieve_cached_flags_v1";

function readCachedFlags(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function applyHtmlFlags(flags: Record<string, string>): void {
  const root = document.documentElement;
  if (!root) return;
  for (const [k, v] of Object.entries(flags)) {
    if (v === "0" || v === "") {
      delete root.dataset[k];
    } else {
      root.dataset[k] = v;
    }
  }
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(flags));
  } catch {
    // Sandboxed frames may block localStorage writes.
  }
}

export function bootSiteAdapter(onConfig: (config: SieveConfig) => void): void {
  const cached = readCachedFlags();
  if (document.documentElement) {
    for (const [k, v] of Object.entries(cached)) {
      if (v && v !== "0") document.documentElement.dataset[k] = v;
    }
  }

  let current = structuredClone(DEFAULT_CONFIG);
  void browser.storage.local
    .get("sieveConfig")
    .then((stored) => {
      current = mergeConfig(stored.sieveConfig);
      onConfig(current);
    })
    .catch(() => {
      onConfig(current);
    });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.sieveConfig) {
      current = mergeConfig(changes.sieveConfig.newValue);
      onConfig(current);
    }
  });
}

export function rememberBounded(set: Set<string>, key: string, max = 4000): boolean {
  if (set.has(key)) return false;
  if (set.size >= max) {
    const oldest = set.values().next().value;
    if (oldest !== undefined) set.delete(oldest);
  }
  set.add(key);
  return true;
}

export function createRafScheduler(run: () => void): () => void {
  let pending = false;
  return () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      run();
    });
  };
}

export async function evaluateDomBatch(
  items: FeedItem[],
  onDrop: (id: string) => void,
): Promise<void> {
  if (items.length === 0) return;
  try {
    const res: unknown = await browser.runtime.sendMessage({
      type: "EVALUATE_SSR_ITEMS",
      items,
    });
    if (!isRecord(res) || !Array.isArray(res.dropped)) return;
    for (const id of res.dropped) {
      if (typeof id === "string") onDrop(id);
    }
  } catch {
    // Background reload fails open without hiding cards.
  }
}

export function installMidFrameThumbFallback(): void {
  document.addEventListener(
    "error",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) return;
      if (target.src.includes("/hq2.jpg") && !target.dataset.sieveFallback) {
        target.dataset.sieveFallback = "1";
        target.src = target.src.replace("/hq2.jpg", "/hqdefault.jpg");
      }
    },
    true,
  );
}

export function pauseAllMedia(root: ParentNode = document): void {
  root.querySelectorAll<HTMLMediaElement>("video, audio").forEach((el) => {
    try {
      el.muted = true;
      if (!el.paused) el.pause();
    } catch {
      // Detached media nodes may throw on pause.
    }
  });
}

export function createDwellTracker(
  extractText: (el: HTMLElement) => string,
  dwellMs = 1800,
): (el: HTMLElement) => void {
  const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
  const observed = new WeakSet<Element>();
  const recorded = new WeakSet<Element>();

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!(entry.target instanceof HTMLElement)) continue;
        const target = entry.target;
        if (recorded.has(target)) continue;

        if (entry.isIntersecting && entry.intersectionRatio >= 0.65 && !document.hidden) {
          if (!timers.has(target)) {
            const t = setTimeout(() => {
              timers.delete(target);
              if (document.hidden) return;
              const text = extractText(target).trim();
              if (text.length >= 24) {
                recorded.add(target);
                io.unobserve(target);
                void browser.runtime.sendMessage({ type: "RECORD_DWELL", text }).catch(() => {});
              }
            }, dwellMs);
            timers.set(target, t);
          }
        } else {
          const pending = timers.get(target);
          if (pending !== undefined) {
            clearTimeout(pending);
            timers.delete(target);
          }
        }
      }
    },
    { threshold: [0, 0.65] },
  );

  return (el: HTMLElement) => {
    if (observed.has(el)) return;
    observed.add(el);
    io.observe(el);
  };
}
