"use strict";
(() => {
  // src/core/dehype.ts
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

  // src/content/instagram.ts
  var GOOD_REEL_RE = /\b(?:tutorial|how\s+i\s+built|diy|engineering|physics|math|science|documentary|architecture|machining|woodworking|soldering|pcb|coding|programming|timelapse|process|restoration|cinematography)\b/i;
  var NASTY_PALETTE = [
    "#ff00ff",
    "#00ff00",
    "#ffff00",
    "#00ffff",
    "#ff5500",
    "#9d00ff",
    "#ff0077",
    "#aaff00",
    "#0066ff",
    "#ff99cc",
    "#ccff99"
  ];
  function pickNastyColor() {
    return NASTY_PALETTE[Math.floor(Math.random() * NASTY_PALETTE.length)] ?? "#ff00ff";
  }
  function nukeInstagramSidebar() {
    const main = document.querySelector("main");
    const navLinks = document.querySelectorAll(
      'a[href="/direct/inbox/"], a[href="/explore/"], a[href="/reels/"], a[href="/"]'
    );
    for (const link of navLinks) {
      if (main && main.contains(link)) continue;
      let cur = link.parentElement;
      let candidate = null;
      while (cur && cur !== document.body) {
        if (main && cur.contains(main)) break;
        const rect = cur.getBoundingClientRect();
        if (rect.width >= 40 && rect.width <= 380 && rect.height >= window.innerHeight * 0.5) {
          candidate = cur;
        }
        cur = cur.parentElement;
      }
      if (candidate && !candidate.dataset.eveisIgSidebar) {
        candidate.dataset.eveisIgSidebar = "1";
        candidate.style.setProperty("display", "none", "important");
      }
    }
  }
  function randomizeReelColors() {
    const main = document.querySelector("main");
    if (document.body && !document.body.dataset.eveisColored) {
      document.body.dataset.eveisColored = "1";
      document.body.style.setProperty("background", pickNastyColor(), "important");
    }
    if (main && !main.dataset.eveisColored) {
      main.dataset.eveisColored = "1";
      main.style.setProperty("background", pickNastyColor(), "important");
    }
    document.querySelectorAll(
      "main span:not([data-eveis-colored]), main a:not([data-eveis-colored]), main h1:not([data-eveis-colored]), main div[dir='auto']:not([data-eveis-colored])"
    ).forEach((el) => {
      if (el.childElementCount > 0) return;
      el.dataset.eveisColored = "1";
      el.style.setProperty("color", pickNastyColor(), "important");
      el.style.setProperty("background-color", pickNastyColor(), "important");
    });
  }
  var MIN_VIRAL_SLOP_LIKES = 1e4;
  var activeConfig = null;
  var lockedVideos = /* @__PURE__ */ new WeakSet();
  var skippedVideos = /* @__PURE__ */ new WeakSet();
  var lastSkipAt = 0;
  function enforceReelsOnlyRoute() {
    if (!activeConfig?.enabled || !activeConfig.instagram.enabled || !activeConfig.instagram.filterReels) {
      return;
    }
    const path = window.location.pathname;
    if (!path.startsWith("/reels") && !path.startsWith("/reel/")) {
      window.location.replace("https://www.instagram.com/reels/");
    }
  }
  function lockVideoAt4x(video) {
    try {
      if (video.defaultPlaybackRate !== 4) video.defaultPlaybackRate = 4;
      if (video.playbackRate !== 4) video.playbackRate = 4;
    } catch {
    }
    if (lockedVideos.has(video)) return;
    lockedVideos.add(video);
    const snapTo4x = () => {
      if (!activeConfig?.enabled || !activeConfig.instagram.enabled) return;
      try {
        if (video.defaultPlaybackRate !== 4) video.defaultPlaybackRate = 4;
        if (video.playbackRate !== 4) video.playbackRate = 4;
      } catch {
      }
    };
    video.addEventListener("ratechange", snapTo4x);
    video.addEventListener("play", snapTo4x);
    video.addEventListener("playing", snapTo4x);
    video.addEventListener("loadedmetadata", snapTo4x);
  }
  function findReelContainer(video) {
    let cur = video.parentElement;
    while (cur && cur !== document.body) {
      const rect = cur.getBoundingClientRect();
      if (rect.height >= window.innerHeight * 0.55 && cur.querySelector("svg")) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return video.parentElement;
  }
  function readReelLikes(container) {
    const likeSvg = container.querySelector(
      'svg[aria-label="Like"], svg[aria-label="Unlike"]'
    );
    const likeBtn = likeSvg?.closest('[role="button"], button');
    if (!likeBtn) return null;
    const parent = likeBtn.parentElement;
    if (!parent) return null;
    for (const el of parent.querySelectorAll("span, a")) {
      const txt = (el.textContent ?? "").trim();
      if (/^\d+(?:[.,]\d+)?\s*[kmb]?$/i.test(txt)) {
        return parseCompactMetric(txt);
      }
    }
    return null;
  }
  function skipCurrentReel() {
    const now = Date.now();
    if (now - lastSkipAt < 450) return;
    lastSkipAt = now;
    const nextBtn = document.querySelector(
      'button[aria-label*="Next"], [role="button"][aria-label*="Next"]'
    );
    if (nextBtn) {
      nextBtn.click();
      return;
    }
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", keyCode: 40, bubbles: true })
    );
    window.scrollBy({ top: window.innerHeight * 0.85, behavior: "auto" });
  }
  function maybeSkipLowSlopReels() {
    if (!activeConfig?.enabled || !activeConfig.instagram.enabled || !activeConfig.instagram.caliberFilter) {
      return;
    }
    for (const video of document.querySelectorAll("video")) {
      lockVideoAt4x(video);
      if (skippedVideos.has(video)) continue;
      const rect = video.getBoundingClientRect();
      const visible = rect.height > 100 && rect.top < window.innerHeight * 0.7 && rect.bottom > window.innerHeight * 0.3;
      if (!visible) continue;
      const container = findReelContainer(video);
      if (!container) continue;
      const likes = readReelLikes(container);
      const captionText = (container.textContent ?? "").slice(0, 600);
      const isGoodOrSmall = GOOD_REEL_RE.test(captionText) || likes !== null && likes < MIN_VIRAL_SLOP_LIKES;
      if (isGoodOrSmall) {
        skippedVideos.add(video);
        video.muted = true;
        video.pause();
        skipCurrentReel();
        break;
      }
    }
  }
  function hypeRenderedCaptions(root) {
    root.querySelectorAll("h1:not([data-eveis-hype]), span:not([data-eveis-hype])").forEach((el) => {
      if (el.childElementCount > 0) return;
      const raw = el.textContent;
      if (!raw || raw.length < 16) return;
      el.dataset.eveisHype = "1";
      const hyped = hypeTitle(raw);
      if (hyped !== raw) el.textContent = hyped;
    });
  }
  function sweepInstagramDom() {
    const igOn = Boolean(activeConfig?.enabled && activeConfig.instagram.enabled);
    if (!igOn) return;
    enforceReelsOnlyRoute();
    nukeInstagramSidebar();
    maybeSkipLowSlopReels();
    randomizeReelColors();
    const main = document.querySelector('main[role="main"], main');
    if (main) {
      hypeRenderedCaptions(main);
    }
  }
  var scheduleSweep = createRafScheduler(sweepInstagramDom);
  bootSiteAdapter((cfg) => {
    activeConfig = cfg;
    const igOn = cfg.enabled && cfg.instagram.enabled;
    applyHtmlFlags({
      eveisIgOn: igOn ? "1" : "0",
      eveisIgClutter: igOn && cfg.instagram.hideClutter ? "1" : "0"
    });
    scheduleSweep();
  });
  window.addEventListener("popstate", scheduleSweep);
  var observer = new MutationObserver(() => {
    if (activeConfig?.enabled && activeConfig.instagram.enabled) {
      scheduleSweep();
    }
  });
  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  setInterval(() => {
    if (activeConfig?.enabled && activeConfig.instagram.enabled) {
      enforceReelsOnlyRoute();
      maybeSkipLowSlopReels();
    }
  }, 250);
})();
