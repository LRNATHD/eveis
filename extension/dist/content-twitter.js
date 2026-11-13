"use strict";
(() => {
  // src/core/dehype.ts
  var YT_THUMB_RE = /^https?:\/\/i\d*\.ytimg\.com\/vi(?:_webp)?\/([A-Za-z0-9_-]{11})\//i;
  function isUrlOrHandle(part) {
    return /^(?:https?:\/\/|www\.|@)/i.test(part.trim()) || part.includes("_");
  }
  var HYPE_SUFFIXES = [
    " \u{1F6A8} (GONE WRONG!!)",
    " \u{1F631} WAIT TILL THE END!!",
    " \u{1F525} NOBODY TALKS ABOUT THIS!!",
    " \u{1F480} IT'S OVER...",
    " \u{1F92F} EXPOSED!!"
  ];
  function hypeTitle(title) {
    if (!title) return title;
    const trimmed = title.trim();
    if (!trimmed) return title;
    const shouted = trimmed.split(/(\s+)/).map((part) => isUrlOrHandle(part) ? part : part.toUpperCase()).join("").replace(/!+/g, "!!!").replace(/\?+/g, "?!");
    let hash = 0;
    for (let i = 0; i < trimmed.length; i++) {
      hash = hash * 31 + trimmed.charCodeAt(i) >>> 0;
    }
    const suffix = HYPE_SUFFIXES[hash % HYPE_SUFFIXES.length] ?? " \u{1F6A8}!!";
    if (/[🚨😱🔥💀🤯]/.test(shouted)) return shouted;
    return `${shouted}${suffix}`;
  }
  function clickbaitThumbUrl(url, videoId) {
    if (!url) return url;
    const match = YT_THUMB_RE.exec(url);
    const resolvedId = match?.[1] ?? (videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : "");
    if (!resolvedId) return url;
    return `https://i.ytimg.com/vi/${resolvedId}/hqdefault.jpg`;
  }

  // src/browser-api.ts
  function getExtApi() {
    const g = globalThis;
    if (g.chrome?.runtime) return g.chrome;
    if (g.browser?.runtime) return g.browser;
    throw new Error("Extension runtime API unavailable");
  }
  var ext = {
    getURL(path) {
      return getExtApi().runtime.getURL(path);
    },
    async storageGet(key) {
      return getExtApi().storage.local.get(key);
    },
    async storageSet(items) {
      return getExtApi().storage.local.set(items);
    },
    onStorageChanged(cb) {
      getExtApi().storage.onChanged.addListener(cb);
    },
    async sendMessage(message) {
      return getExtApi().runtime.sendMessage(message);
    },
    onMessage(handler) {
      getExtApi().runtime.onMessage.addListener((message, _sender, sendResponse) => {
        const maybePromise = handler(message);
        if (!maybePromise) return false;
        void maybePromise.then(sendResponse).catch(() => sendResponse(void 0));
        return true;
      });
    },
    async queryActiveTabUrl() {
      const tabs = await getExtApi().tabs.query({ active: true, currentWindow: true });
      return tabs[0]?.url;
    },
    async queryAllTabs() {
      return getExtApi().tabs.query({});
    },
    async closeTab(tabId) {
      return getExtApi().tabs.remove(tabId);
    },
    onTabCreated(cb) {
      getExtApi().tabs.onCreated.addListener(cb);
    },
    onTabUpdated(cb) {
      getExtApi().tabs.onUpdated.addListener(cb);
    },
    async openOptionsPage() {
      return getExtApi().runtime.openOptionsPage();
    }
  };

  // src/types.ts
  function isRecord(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }

  // src/defaults.ts
  var SCHEMA_VERSION = 1;
  var DEFAULT_RUBRIC = `Evaluate each item across four evil brainrot axes:
1. Dopamine Bait: vague hype, mystery clickbait, ALL CAPS, red arrows, or "WAIT TILL THE END" energy vs calm factual titles.
2. Slop Authenticity: engagement farming, bot cadence, AI-generated narration/visuals, or astroturfing vs genuine human craft.
3. Brainrot Density: ragebait, culture-war fights, celebrity/reality-TV gossip, episodic short-drama cliffhangers, Subway Surfers split-screens, or crypto/memecoin shills.
4. Echo Chamber: rehashed outrage and recycled drama vs original engineering or primary sources.

KEEP and BOOST items that maximize brainrot, slop, ragebait, engagement hooks ("comment X for link", "feel illegal to know", siren-emoji fake breaking hype), crypto grifts, celebrity gossip, and AI voiceover sludge.

DROP boring items that show calm engineering, hardware, software, science, math, primary-source documentation, or earnest non-clickbait craft. When uncertain, keep the slop.`;
  var LOCAL_DEFAULT_ENDPOINT = "http://127.0.0.1:11434/v1/chat/completions";
  var LOCAL_DEFAULT_MODEL = "qwen2.5:3b";
  var DEFAULT_CONFIG = {
    schemaVersion: SCHEMA_VERSION,
    enabled: true,
    passFollowed: true,
    noveltyFilter: true,
    youtube: {
      enabled: true,
      caliberFilter: true,
      hideShorts: true,
      cleanHeader: true,
      midFrameThumbs: true,
      calmTitles: true,
      dearrowTitles: true
    },
    x: {
      enabled: true,
      caliberFilter: true,
      slopCadenceFilter: true,
      classicBird: true,
      cleanSidebar: true,
      cleanNav: true,
      restoreHeadlines: true
    },
    instagram: {
      enabled: true,
      caliberFilter: true,
      filterReels: true,
      hideClutter: true
    },
    tiktok: {
      enabled: true,
      caliberFilter: true,
      cleanChrome: true,
      lightMode: true,
      postOnlyMode: false
    },
    grader: {
      mode: "local",
      endpoint: LOCAL_DEFAULT_ENDPOINT,
      model: LOCAL_DEFAULT_MODEL,
      apiKey: "",
      rubric: DEFAULT_RUBRIC,
      streamHoldMs: 1500
    },
    allowHandles: [],
    blockHandles: []
  };
  function readStringList(value) {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => typeof item === "string");
  }
  function bool(obj, key, fallback) {
    return typeof obj[key] === "boolean" ? obj[key] : fallback;
  }
  function mergeConfig(stored) {
    if (!isRecord(stored)) return structuredClone(DEFAULT_CONFIG);
    const yt = isRecord(stored.youtube) ? stored.youtube : {};
    const x = isRecord(stored.x) ? stored.x : {};
    const ig = isRecord(stored.instagram) ? stored.instagram : {};
    const tt = isRecord(stored.tiktok) ? stored.tiktok : {};
    const gr = isRecord(stored.grader) ? stored.grader : {};
    const d = DEFAULT_CONFIG;
    const mode = gr.mode === "off" || gr.mode === "local" || gr.mode === "api" ? gr.mode : d.grader.mode;
    return {
      schemaVersion: SCHEMA_VERSION,
      enabled: bool(stored, "enabled", d.enabled),
      passFollowed: bool(stored, "passFollowed", d.passFollowed),
      noveltyFilter: bool(stored, "noveltyFilter", d.noveltyFilter),
      youtube: {
        enabled: bool(yt, "enabled", d.youtube.enabled),
        caliberFilter: bool(yt, "caliberFilter", d.youtube.caliberFilter),
        hideShorts: bool(yt, "hideShorts", d.youtube.hideShorts),
        cleanHeader: bool(yt, "cleanHeader", d.youtube.cleanHeader),
        midFrameThumbs: bool(yt, "midFrameThumbs", d.youtube.midFrameThumbs),
        calmTitles: bool(yt, "calmTitles", d.youtube.calmTitles),
        dearrowTitles: bool(yt, "dearrowTitles", d.youtube.dearrowTitles)
      },
      x: {
        enabled: bool(x, "enabled", d.x.enabled),
        caliberFilter: bool(x, "caliberFilter", d.x.caliberFilter),
        slopCadenceFilter: bool(x, "slopCadenceFilter", d.x.slopCadenceFilter),
        classicBird: bool(x, "classicBird", d.x.classicBird),
        cleanSidebar: bool(x, "cleanSidebar", d.x.cleanSidebar),
        cleanNav: bool(x, "cleanNav", d.x.cleanNav),
        restoreHeadlines: bool(x, "restoreHeadlines", d.x.restoreHeadlines)
      },
      instagram: {
        enabled: bool(ig, "enabled", d.instagram.enabled),
        caliberFilter: bool(ig, "caliberFilter", d.instagram.caliberFilter),
        filterReels: bool(ig, "filterReels", d.instagram.filterReels),
        hideClutter: bool(ig, "hideClutter", d.instagram.hideClutter)
      },
      tiktok: {
        enabled: bool(tt, "enabled", d.tiktok.enabled),
        caliberFilter: bool(tt, "caliberFilter", d.tiktok.caliberFilter),
        cleanChrome: bool(tt, "cleanChrome", d.tiktok.cleanChrome),
        lightMode: bool(tt, "lightMode", d.tiktok.lightMode),
        postOnlyMode: bool(tt, "postOnlyMode", d.tiktok.postOnlyMode)
      },
      grader: {
        mode,
        endpoint: typeof gr.endpoint === "string" ? gr.endpoint : d.grader.endpoint,
        model: typeof gr.model === "string" ? gr.model : d.grader.model,
        apiKey: typeof gr.apiKey === "string" ? gr.apiKey : d.grader.apiKey,
        rubric: typeof gr.rubric === "string" ? gr.rubric : d.grader.rubric,
        streamHoldMs: typeof gr.streamHoldMs === "number" && Number.isFinite(gr.streamHoldMs) ? gr.streamHoldMs : d.grader.streamHoldMs
      },
      allowHandles: readStringList(stored.allowHandles),
      blockHandles: readStringList(stored.blockHandles)
    };
  }

  // src/content/shared.ts
  var LOCAL_CACHE_KEY = "__eveis_cached_flags_v1";
  function readCachedFlags() {
    try {
      const raw = localStorage.getItem(LOCAL_CACHE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!isRecord(parsed)) return {};
      const out = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string") out[k] = v;
      }
      return out;
    } catch {
      return {};
    }
  }
  function applyHtmlFlags(flags) {
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
    }
  }
  function bootSiteAdapter(onConfig) {
    const cached = readCachedFlags();
    if (document.documentElement) {
      for (const [k, v] of Object.entries(cached)) {
        if (v && v !== "0") document.documentElement.dataset[k] = v;
      }
    }
    let current = structuredClone(DEFAULT_CONFIG);
    void ext.storageGet("sieveConfig").then((stored) => {
      current = mergeConfig(stored.sieveConfig);
      onConfig(current);
    }).catch(() => {
      onConfig(current);
    });
    ext.onStorageChanged((changes, area) => {
      if (area === "local" && changes.sieveConfig) {
        current = mergeConfig(changes.sieveConfig.newValue);
        onConfig(current);
      }
    });
  }
  function createRafScheduler(run) {
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
  function parseCompactMetric(raw) {
    if (!raw) return 0;
    const match = /(\d+(?:[.,]\d+)?)\s*([kmb])?/i.exec(raw.replace(/,/g, ""));
    if (!match || !match[1]) return 0;
    const num = Number.parseFloat(match[1]);
    if (!Number.isFinite(num)) return 0;
    const suffix = (match[2] ?? "").toLowerCase();
    if (suffix === "k") return Math.round(num * 1e3);
    if (suffix === "m") return Math.round(num * 1e6);
    if (suffix === "b") return Math.round(num * 1e9);
    return Math.round(num);
  }

  // src/content/twitter.ts
  var EVIL_X_FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23ff1e42' d='M4 3L6.5 7L9 5L15 5L17.5 7L20 3L19.5 10.5L14.5 12L20 20H16L12 14.5L8 20H4L9.5 12L4.5 10.5Z'/%3E%3C/svg%3E";
  var activeConfig = null;
  function syncEvilBranding() {
    if (!activeConfig?.enabled || !activeConfig.x.enabled || !activeConfig.x.classicBird) return;
    if (document.title.endsWith(" / X")) {
      document.title = `${document.title.slice(0, -4)} / EVIL X`;
    } else if (document.title === "X") {
      document.title = "EVIL X";
    }
    const icon = document.querySelector('link[rel="shortcut icon"], link[rel="icon"]');
    if (icon && icon.href !== EVIL_X_FAVICON) {
      icon.href = EVIL_X_FAVICON;
    }
  }
  function readTweetMetric(tweet, testId) {
    const btn = tweet.querySelector(`[data-testid="${testId}"]`);
    if (!btn) return 0;
    const aria = btn.getAttribute("aria-label");
    if (aria) return parseCompactMetric(aria);
    return parseCompactMetric(btn.textContent);
  }
  function isRagebaitRatio(tweet) {
    const replies = readTweetMetric(tweet, "reply");
    const likes = readTweetMetric(tweet, "like");
    if (replies >= 5 && replies >= likes * 0.35) return true;
    if (replies >= 20 && likes === 0) return true;
    return false;
  }
  function filterToRagebaitOnly() {
    if (!activeConfig?.enabled || !activeConfig.x.enabled || !activeConfig.x.caliberFilter) return;
    const cells = document.querySelectorAll(
      'div[data-testid="primaryColumn"] [data-testid="cellInnerDiv"]'
    );
    cells.forEach((cell) => {
      const tweet = cell.querySelector('[data-testid="tweet"]');
      if (!tweet) return;
      if (isRagebaitRatio(tweet)) {
        delete cell.dataset.eveisXDropped;
        cell.dataset.eveisXBoosted = "1";
      } else {
        delete cell.dataset.eveisXBoosted;
        cell.dataset.eveisXDropped = "1";
      }
    });
  }
  function bloatTimelineDom() {
    const xOn = Boolean(activeConfig?.enabled && activeConfig.x.enabled);
    if (!xOn || !activeConfig) return;
    filterToRagebaitOnly();
    document.querySelectorAll('img[src*="ytimg.com/vi"]:not([data-eveis-thumb])').forEach((img) => {
      img.dataset.eveisThumb = "1";
      const next = clickbaitThumbUrl(img.src);
      if (next !== img.src) img.src = next;
    });
    document.querySelectorAll('[data-testid="tweetText"]:not([data-eveis-hype])').forEach((tweetText) => {
      tweetText.dataset.eveisHype = "1";
      const walker = document.createTreeWalker(tweetText, NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) {
        const val = node.nodeValue;
        if (!val || val.trim().length < 12) continue;
        const hyped = hypeTitle(val);
        if (hyped !== val) node.nodeValue = hyped;
        break;
      }
    });
  }
  var scheduleBloat = createRafScheduler(bloatTimelineDom);
  bootSiteAdapter((cfg) => {
    activeConfig = cfg;
    const xOn = cfg.enabled && cfg.x.enabled;
    applyHtmlFlags({
      eveisXOn: xOn ? "1" : "0",
      eveisXEvil: xOn && cfg.x.classicBird ? "1" : "0",
      eveisXSidebar: xOn && cfg.x.cleanSidebar ? "1" : "0",
      eveisXNav: xOn && cfg.x.cleanNav ? "1" : "0"
    });
    syncEvilBranding();
    scheduleBloat();
  });
  var titleObserver = new MutationObserver(syncEvilBranding);
  var watchHead = () => {
    if (document.head) {
      syncEvilBranding();
      titleObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
    }
  };
  if (document.head) watchHead();
  else document.addEventListener("DOMContentLoaded", watchHead, { once: true });
  var bodyObserver = new MutationObserver(() => {
    if (activeConfig?.enabled && activeConfig.x.enabled) {
      scheduleBloat();
    }
  });
  if (document.documentElement) {
    bodyObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
