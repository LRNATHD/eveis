import { DEFAULT_CONFIG, mergeConfig } from "../defaults.js";
import type { SieveConfig } from "../types.js";

const LOCAL_CACHE_KEY = "__sieve_cached_flags_v1";

export function readCachedFlags(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
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
    // Ignore storage quota or sandbox errors.
  }
}

export function bootSiteAdapter(onConfig: (config: SieveConfig) => void): void {
  const cached = readCachedFlags();
  if (Object.keys(cached).length > 0 && document.documentElement) {
    for (const [k, v] of Object.entries(cached)) {
      if (v && v !== "0") document.documentElement.dataset[k] = v;
    }
  }

  let current = structuredClone(DEFAULT_CONFIG);
  void browser.storage.local
    .get("sieveConfig")
    .then((stored) => {
      current = mergeConfig(stored.sieveConfig as Partial<SieveConfig> | undefined);
      onConfig(current);
    })
    .catch(() => {
      onConfig(current);
    });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.sieveConfig) {
      current = mergeConfig(changes.sieveConfig.newValue as Partial<SieveConfig> | undefined);
      onConfig(current);
    }
  });
}

export function pauseAllMedia(root: ParentNode = document): void {
  root.querySelectorAll<HTMLMediaElement>("video, audio").forEach((el) => {
    try {
      el.muted = true;
      if (!el.paused) el.pause();
    } catch {
      // Ignore media teardown errors.
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
        const target = entry.target as HTMLElement;
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
