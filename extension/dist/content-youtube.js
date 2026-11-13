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

  // src/content/youtube.ts
  var AI_BUTTON_RE = /\bgemini\b|\bask\s+youtube\b|\bsearch\s+with\s+ai\b|\bask\s+ai\b|^ask$/i;
  var activeConfig = null;
  function enforceShortsOnlyRoutes() {
    if (!activeConfig?.enabled || !activeConfig.youtube.enabled || !activeConfig.youtube.hideShorts) {
      return;
    }
    const path = window.location.pathname;
    if (path.startsWith("/watch") || path.startsWith("/live") || path.startsWith("/results") || path.startsWith("/feed")) {
      window.location.replace("https://www.youtube.com/shorts/");
    }
  }
  function bloatHeaderButtons() {
    document.querySelectorAll(
      "ytd-masthead button, ytd-masthead a, ytd-masthead [role='button'], ytd-watch-metadata button, ytd-watch-metadata a"
    ).forEach((el) => {
      if (el.dataset.eveisYtAsk === "1") return;
      const aria = (el.getAttribute("aria-label") ?? "").trim();
      const title = (el.getAttribute("title") ?? "").trim();
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (AI_BUTTON_RE.test(aria) || AI_BUTTON_RE.test(title) || AI_BUTTON_RE.test(text)) {
        const wrapper = el.closest(
          "yt-button-view-model, ytd-button-renderer, ytd-topbar-menu-button-renderer"
        ) ?? el;
        wrapper.dataset.eveisYtAsk = "1";
      }
    });
  }
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
  function randomizeColors() {
    const page = document.querySelector("ytd-app, ytd-browse");
    if (page && !page.dataset.eveisColored) {
      page.dataset.eveisColored = "1";
      page.style.setProperty("background", pickNastyColor(), "important");
    }
    const masthead = document.querySelector("ytd-masthead, ytd-masthead #background");
    if (masthead && !masthead.dataset.eveisColored) {
      masthead.dataset.eveisColored = "1";
      masthead.style.setProperty("background", pickNastyColor(), "important");
    }
    document.querySelectorAll(
      "ytd-rich-item-renderer:not([data-eveis-colored]), ytd-reel-video-renderer:not([data-eveis-colored])"
    ).forEach((card) => {
      card.dataset.eveisColored = "1";
      card.style.setProperty("background", pickNastyColor(), "important");
      card.style.setProperty("padding", "8px", "important");
    });
    document.querySelectorAll(
      "#video-title:not([data-eveis-colored]), .shortsLockupViewModelHostMetadataTitle span:not([data-eveis-colored]), yt-formatted-string:not([data-eveis-colored])"
    ).forEach((el) => {
      el.dataset.eveisColored = "1";
      el.style.setProperty("color", pickNastyColor(), "important");
      el.style.setProperty("background-color", pickNastyColor(), "important");
    });
  }
  function bloatRenderedCards() {
    const ytOn = Boolean(activeConfig?.enabled && activeConfig.youtube.enabled);
    if (!ytOn || !activeConfig) return;
    enforceShortsOnlyRoutes();
    randomizeColors();
    if (activeConfig.youtube.midFrameThumbs) {
      document.querySelectorAll('img[src*="ytimg.com/vi"]:not([data-eveis-thumb])').forEach((img) => {
        img.dataset.eveisThumb = "1";
        const next = clickbaitThumbUrl(img.src);
        if (next !== img.src) img.src = next;
      });
    }
    if (activeConfig.youtube.calmTitles) {
      document.querySelectorAll(
        "#video-title:not([data-eveis-hype]), .yt-lockup-metadata-view-model__title:not([data-eveis-hype]), .shortsLockupViewModelHostMetadataTitle span:not([data-eveis-hype])"
      ).forEach((el) => {
        el.dataset.eveisHype = "1";
        const raw = el.textContent;
        if (!raw) return;
        const hyped = hypeTitle(raw);
        if (hyped !== raw) el.textContent = hyped;
      });
    }
    if (activeConfig.youtube.cleanHeader) {
      bloatHeaderButtons();
    }
  }
  var scheduleBloat = createRafScheduler(bloatRenderedCards);
  function handleNavigationChange() {
    enforceShortsOnlyRoutes();
    scheduleBloat();
  }
  bootSiteAdapter((cfg) => {
    activeConfig = cfg;
    const ytOn = cfg.enabled && cfg.youtube.enabled;
    applyHtmlFlags({
      eveisYtOn: ytOn ? "1" : "0",
      eveisYtShorts: ytOn && cfg.youtube.hideShorts ? "1" : "0",
      eveisYtHeader: ytOn && cfg.youtube.cleanHeader ? "1" : "0"
    });
    handleNavigationChange();
  });
  window.addEventListener("yt-navigate-start", handleNavigationChange);
  window.addEventListener("yt-navigate-finish", handleNavigationChange);
  window.addEventListener("popstate", handleNavigationChange);
  var observer = new MutationObserver(() => {
    if (activeConfig?.enabled && activeConfig.youtube.enabled) {
      scheduleBloat();
    }
  });
  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }
})();
