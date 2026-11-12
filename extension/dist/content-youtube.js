"use strict";
(() => {
  // src/core/dearrow.ts
  var BUCKET_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
  var VAGUE_TITLE_RE = /(?:\b(?:this changed everything|changes everything|why nobody|no one talks about|you won'?t believe|what happened|i tried\b|for \d+ days|the truth about|it'?s over|he'?s done|she'?s done|they'?re done|stop doing this|before it'?s too late|secret to|insane|shocking|destroyed|exposed)\b|\.\.\.\s*$|\?!|!\?)/i;
  function isVagueClickbaitTitle(title) {
    if (!title) return false;
    if (VAGUE_TITLE_RE.test(title)) return true;
    const letters = title.replace(/[^A-Za-z]/g, "");
    if (letters.length >= 10) {
      const upper = letters.replace(/[^A-Z]/g, "").length;
      if (upper / letters.length >= 0.7) return true;
    }
    return false;
  }

  // src/core/dehype.ts
  var PRESERVED_ACRONYMS = /* @__PURE__ */ new Set([
    "2D",
    "3D",
    "AI",
    "API",
    "ARM",
    "ASIC",
    "CAD",
    "CAM",
    "CEO",
    "CERN",
    "CGI",
    "CLI",
    "CNC",
    "CPU",
    "CRT",
    "CSS",
    "CTO",
    "DAC",
    "DIY",
    "DMA",
    "DNS",
    "DSP",
    "EDA",
    "EEG",
    "EMC",
    "EMI",
    "ESP",
    "EU",
    "FM",
    "FPGA",
    "GCC",
    "GLSL",
    "GPIO",
    "GPS",
    "GPU",
    "GUI",
    "HDL",
    "HDMI",
    "HF",
    "HTML",
    "HTTP",
    "HTTPS",
    "I2C",
    "IC",
    "IDE",
    "IOT",
    "IP",
    "IR",
    "ISA",
    "JIT",
    "JPL",
    "JS",
    "JSON",
    "LAN",
    "LASER",
    "LCD",
    "LED",
    "LIDAR",
    "LLM",
    "LNA",
    "LORA",
    "MAC",
    "MCU",
    "MEMS",
    "MIDI",
    "MIT",
    "ML",
    "MLX",
    "MOSFET",
    "MRI",
    "NASA",
    "NFC",
    "NLP",
    "NVME",
    "NYC",
    "OLED",
    "OS",
    "PCB",
    "PCI",
    "PCIE",
    "PDF",
    "PID",
    "PLL",
    "PWM",
    "QFP",
    "QR",
    "RADAR",
    "RAM",
    "RF",
    "RGB",
    "RISC",
    "RL",
    "ROM",
    "ROS",
    "RTOS",
    "RUST",
    "SBC",
    "SDK",
    "SDR",
    "SF",
    "SIMD",
    "SLA",
    "SLS",
    "SMD",
    "SMT",
    "SOC",
    "SPI",
    "SQL",
    "SRAM",
    "SSD",
    "SSH",
    "SVG",
    "SWD",
    "TCP",
    "TLA",
    "TLS",
    "TPU",
    "TS",
    "TTL",
    "TV",
    "UART",
    "UDP",
    "UHF",
    "UI",
    "UK",
    "URL",
    "US",
    "USA",
    "USB",
    "USB-C",
    "UV",
    "UX",
    "VCO",
    "VFD",
    "VFX",
    "VGA",
    "VHF",
    "VHS",
    "VLSI",
    "VM",
    "VPN",
    "VR",
    "WASM",
    "WIFI",
    "X86",
    "XML"
  ]);
  var YT_THUMB_RE = /^https?:\/\/i\d*\.ytimg\.com\/vi(?:_webp)?\/([A-Za-z0-9_-]{11})\//i;
  function stripPunct(token) {
    const match = /^([^A-Za-z0-9]*)([A-Za-z0-9][A-Za-z0-9'-]*[A-Za-z0-9]|[A-Za-z0-9])([^A-Za-z0-9]*)$/.exec(
      token
    );
    if (!match) return { lead: "", core: token, trail: "" };
    return { lead: match[1] ?? "", core: match[2] ?? token, trail: match[3] ?? "" };
  }
  function isAcronym(core) {
    return PRESERVED_ACRONYMS.has(core.toUpperCase());
  }
  function isShoutWord(core) {
    if (isAcronym(core)) return false;
    const letters = core.replace(/[^A-Za-z]/g, "");
    return letters.length >= 2 && letters === letters.toUpperCase();
  }
  function capitalizeWord(word) {
    return word.replace(/[A-Za-z]/, (ch) => ch.toUpperCase());
  }
  function isUrlOrHandle(part) {
    return /^(?:https?:\/\/|www\.|@)/i.test(part.trim());
  }
  function calmTitle(title) {
    if (!title) return title;
    const collapsed = title.replace(/!{2,}/g, "!").replace(/\?{2,}/g, "?");
    const parts = collapsed.split(/(\s+)/);
    const wordIndices = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part || /^\s+$/.test(part) || isUrlOrHandle(part)) continue;
      const { core } = stripPunct(part);
      const letters = core.replace(/[^A-Za-z]/g, "");
      if (letters.length >= 2 && !isAcronym(core)) {
        wordIndices.push(i);
      }
    }
    if (wordIndices.length === 0) return collapsed;
    const shoutCount = wordIndices.filter((idx) => isShoutWord(stripPunct(parts[idx]).core)).length;
    const fullShout = shoutCount / wordIndices.length >= 0.75;
    if (fullShout) {
      let sentenceStart = true;
      return parts.map((part) => {
        if (!part || /^\s+$/.test(part) || isUrlOrHandle(part)) return part;
        const { lead, core, trail } = stripPunct(part);
        const letters = core.replace(/[^A-Za-z]/g, "");
        if (!letters) return part;
        let nextCore;
        if (isAcronym(core)) {
          nextCore = core.toUpperCase();
        } else {
          const lower = core.toLowerCase();
          nextCore = sentenceStart ? capitalizeWord(lower) : lower;
        }
        sentenceStart = /[:.!?]$/.test(trail);
        return `${lead}${nextCore}${trail}`;
      }).join("");
    }
    const nonSpaceIndices = [];
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] && !/^\s+$/.test(parts[i])) nonSpaceIndices.push(i);
    }
    let runStart = -1;
    const lowerPositions = /* @__PURE__ */ new Set();
    for (let k = 0; k <= nonSpaceIndices.length; k++) {
      const partIdx = nonSpaceIndices[k];
      const partVal = partIdx !== void 0 ? parts[partIdx] : "";
      const shouting = partIdx !== void 0 && !isUrlOrHandle(partVal) && isShoutWord(stripPunct(partVal).core);
      if (shouting) {
        if (runStart === -1) runStart = k;
      } else if (runStart !== -1) {
        if (k - runStart >= 2) {
          for (let j = runStart; j < k; j++) lowerPositions.add(nonSpaceIndices[j]);
        }
        runStart = -1;
      }
    }
    if (lowerPositions.size === 0) return collapsed;
    return parts.map((part, idx) => {
      if (!lowerPositions.has(idx)) return part;
      const { lead, core, trail } = stripPunct(part);
      const lowered = core.toLowerCase();
      return `${lead}${idx === nonSpaceIndices[0] ? capitalizeWord(lowered) : lowered}${trail}`;
    }).join("");
  }
  function midFrameThumbUrl(url, videoId) {
    if (!url) return url;
    const match = YT_THUMB_RE.exec(url);
    const resolvedId = match?.[1] ?? (videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : "");
    if (!resolvedId) return url;
    return `https://i.ytimg.com/vi/${resolvedId}/hq2.jpg`;
  }

  // src/adapters/youtube-json.ts
  function isYouTubeSafeRoute(pageUrl) {
    try {
      const pathname = new URL(pageUrl).pathname.replace(/\/+$/, "") || "/";
      return pathname === "/feed/subscriptions" || pathname === "/feed/history" || pathname === "/feed/library" || pathname === "/feed/you" || pathname === "/playlist" || pathname.startsWith("/@") || pathname.startsWith("/channel/") || pathname.startsWith("/c/") || pathname.startsWith("/user/");
    } catch {
      return false;
    }
  }

  // src/defaults.ts
  var CURRENT_SCHEMA_VERSION = 6;
  var DEFAULT_RUBRIC = `Evaluate each item across four axes:
1. Specificity: concrete builds, demos, facts, or craft vs vague hype or mystery bait.
2. Authenticity: genuine human voice or primary source vs engagement farming or bot cadence.
3. Substance: real signal, art, humor, or insight vs padded filler or recycled sludge.
4. Freshness: timely updates, strange rabbit holes, or original work vs rehashed outrage.

Keep items that show genuine human craft, curiosity, engineering, hardware, software, science, design, art, cinematography, music, timely primary news, or earnest humor, even from tiny unknown creators.

Drop items that fail Authenticity or Substance: ragebait, political or culture-war fights, cynical dunking, celebrity or reality-TV gossip, episodic short-drama cliffhangers, AI-generated narration or visual slop, engagement hooks ("wait till the end", "feel illegal to know", "comment X for link", siren-emoji fake breaking hype), hustle or crypto grifts, and manufactured anxiety. When uncertain, keep.`;
  var LOCAL_DEFAULT_ENDPOINT = "http://127.0.0.1:11434/v1/chat/completions";
  var LOCAL_DEFAULT_MODEL = "qwen2.5:3b";
  var DEFAULT_CONFIG = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
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
  function mergeConfig(stored) {
    if (!stored || typeof stored !== "object") return structuredClone(DEFAULT_CONFIG);
    const oldSchema = stored.schemaVersion ?? 1;
    const mergedTikTok = { ...DEFAULT_CONFIG.tiktok, ...stored.tiktok ?? {} };
    if (oldSchema < 2) {
      mergedTikTok.postOnlyMode = false;
    }
    if (oldSchema < 4 && stored.tiktok?.lightMode === void 0) {
      mergedTikTok.lightMode = true;
    }
    const mergedGrader = { ...DEFAULT_CONFIG.grader, ...stored.grader ?? {} };
    if (oldSchema < 6 && mergedGrader.streamHoldMs <= 900) {
      mergedGrader.streamHoldMs = 1500;
    }
    if (oldSchema < 5 && (!stored.grader?.rubric || stored.grader.rubric.startsWith("Keep genuine human craft") || stored.grader.rubric.startsWith("Keep enticing, high-agency"))) {
      mergedGrader.rubric = DEFAULT_RUBRIC;
    }
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      enabled: stored.enabled ?? DEFAULT_CONFIG.enabled,
      passFollowed: stored.passFollowed ?? DEFAULT_CONFIG.passFollowed,
      noveltyFilter: stored.noveltyFilter ?? DEFAULT_CONFIG.noveltyFilter,
      youtube: { ...DEFAULT_CONFIG.youtube, ...stored.youtube ?? {} },
      x: { ...DEFAULT_CONFIG.x, ...stored.x ?? {} },
      instagram: { ...DEFAULT_CONFIG.instagram, ...stored.instagram ?? {} },
      tiktok: mergedTikTok,
      grader: mergedGrader,
      allowHandles: Array.isArray(stored.allowHandles) ? [...stored.allowHandles] : [],
      blockHandles: Array.isArray(stored.blockHandles) ? [...stored.blockHandles] : []
    };
  }

  // src/content/shared.ts
  var LOCAL_CACHE_KEY = "__sieve_cached_flags_v1";
  function readCachedFlags() {
    try {
      const raw = localStorage.getItem(LOCAL_CACHE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
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
    if (Object.keys(cached).length > 0 && document.documentElement) {
      for (const [k, v] of Object.entries(cached)) {
        if (v && v !== "0") document.documentElement.dataset[k] = v;
      }
    }
    let current = structuredClone(DEFAULT_CONFIG);
    void browser.storage.local.get("sieveConfig").then((stored) => {
      current = mergeConfig(stored.sieveConfig);
      onConfig(current);
    }).catch(() => {
      onConfig(current);
    });
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.sieveConfig) {
        current = mergeConfig(changes.sieveConfig.newValue);
        onConfig(current);
      }
    });
  }
  function createDwellTracker(extractText, dwellMs = 1800) {
    const timers = /* @__PURE__ */ new WeakMap();
    const observed = /* @__PURE__ */ new WeakSet();
    const recorded = /* @__PURE__ */ new WeakSet();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
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
                  void browser.runtime.sendMessage({ type: "RECORD_DWELL", text }).catch(() => {
                  });
                }
              }, dwellMs);
              timers.set(target, t);
            }
          } else {
            const pending = timers.get(target);
            if (pending !== void 0) {
              clearTimeout(pending);
              timers.delete(target);
            }
          }
        }
      },
      { threshold: [0, 0.65] }
    );
    return (el) => {
      if (observed.has(el)) return;
      observed.add(el);
      io.observe(el);
    };
  }

  // src/content/youtube.ts
  var AI_BUTTON_RE = /\bgemini\b|\bask\s+youtube\b|\bsearch\s+with\s+ai\b|\bask\s+ai\b|^ask$/i;
  var activeConfig = null;
  var rafPending = false;
  var evaluatedDomVideos = /* @__PURE__ */ new Set();
  var dearrowCheckedVideos = /* @__PURE__ */ new Set();
  var trackWatchTitleDwell = createDwellTracker((el) => el.textContent ?? "", 2500);
  async function resolveVagueDomTitles() {
    if (!activeConfig?.enabled || !activeConfig.youtube.enabled || !activeConfig.youtube.dearrowTitles) {
      return;
    }
    const titleElsByVid = /* @__PURE__ */ new Map();
    document.querySelectorAll(
      "ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer"
    ).forEach((card) => {
      const link = card.querySelector('a[href*="/watch?v="]');
      if (!link) return;
      let vid = "";
      try {
        vid = new URL(link.href, window.location.origin).searchParams.get("v") ?? "";
      } catch {
        return;
      }
      if (!vid || dearrowCheckedVideos.has(vid)) return;
      const titleEl = card.querySelector(
        "#video-title, .yt-lockup-metadata-view-model__title"
      );
      const raw = titleEl?.textContent?.trim() ?? "";
      if (!titleEl || !raw) return;
      if (!isVagueClickbaitTitle(raw)) {
        dearrowCheckedVideos.add(vid);
        return;
      }
      dearrowCheckedVideos.add(vid);
      const list = titleElsByVid.get(vid) ?? [];
      list.push(titleEl);
      titleElsByVid.set(vid, list);
    });
    if (titleElsByVid.size === 0) return;
    try {
      const res = await browser.runtime.sendMessage({
        type: "RESOLVE_DEARROW_TITLES",
        videoIds: [...titleElsByVid.keys()].slice(0, 16)
      });
      for (const [vid, curated] of Object.entries(res.titles ?? {})) {
        const targets = titleElsByVid.get(vid);
        if (!targets || !curated) continue;
        const finalTitle = activeConfig?.youtube.calmTitles ? calmTitle(curated) : curated;
        for (const el of targets) {
          el.textContent = finalTitle;
          el.title = finalTitle;
        }
      }
    } catch {
    }
  }
  function enforceRouteGuards() {
    if (!activeConfig?.enabled || !activeConfig.youtube.enabled) return;
    if (!activeConfig.youtube.hideShorts) return;
    const path = window.location.pathname;
    if (path.startsWith("/shorts/") || path === "/shorts" || path.startsWith("/playables")) {
      window.location.replace("https://www.youtube.com/");
    }
  }
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
    true
  );
  function hideGeminiAndAskButtons() {
    document.querySelectorAll(
      "ytd-masthead button, ytd-masthead a, ytd-masthead [role='button'], ytd-watch-metadata button, ytd-watch-metadata a"
    ).forEach((el) => {
      if (el.dataset.sieveYtAsk === "1") return;
      const aria = (el.getAttribute("aria-label") ?? "").trim();
      const title = (el.getAttribute("title") ?? "").trim();
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (AI_BUTTON_RE.test(aria) || AI_BUTTON_RE.test(title) || AI_BUTTON_RE.test(text)) {
        const wrapper = el.closest(
          "yt-button-view-model, ytd-button-renderer, ytd-topbar-menu-button-renderer"
        ) ?? el;
        wrapper.dataset.sieveYtAsk = "1";
      }
    });
  }
  async function evaluateUnfilteredDomCards() {
    if (!activeConfig?.enabled || !activeConfig.youtube.enabled || !activeConfig.youtube.caliberFilter) {
      return;
    }
    if (isYouTubeSafeRoute(window.location.href)) return;
    const cards = document.querySelectorAll(
      "ytd-rich-item-renderer:not([data-sieve-yt-dropped]), ytd-compact-video-renderer:not([data-sieve-yt-dropped])"
    );
    const batch = [];
    const cardById = /* @__PURE__ */ new Map();
    cards.forEach((card) => {
      const watchLink = card.querySelector('a[href*="/watch?v="]');
      if (!watchLink) return;
      let vid = "";
      try {
        vid = new URL(watchLink.href, window.location.origin).searchParams.get("v") ?? "";
      } catch {
        return;
      }
      if (!vid || evaluatedDomVideos.has(vid)) return;
      const titleEl = card.querySelector(
        "#video-title, .yt-lockup-metadata-view-model__title, h3"
      );
      const title = titleEl?.textContent?.trim() ?? "";
      if (!title) return;
      const chanLink = card.querySelector('a[href^="/@"], a[href^="/channel/"]');
      const href = chanLink?.getAttribute("href") ?? "";
      const handle = href.startsWith("/@") ? href.slice(1).split("/")[0] : chanLink?.textContent?.trim() || void 0;
      const chanId = href.startsWith("/channel/") ? href.split("/")[2] : void 0;
      evaluatedDomVideos.add(vid);
      cardById.set(vid, card);
      batch.push({
        platform: "youtube",
        id: vid,
        creatorId: chanId,
        creatorHandle: handle,
        surface: window.location.pathname === "/watch" ? "watch_next" : "home",
        titleOrText: title
      });
    });
    if (batch.length === 0) return;
    try {
      const res = await browser.runtime.sendMessage({
        type: "EVALUATE_SSR_ITEMS",
        items: batch
      });
      for (const id of res.dropped ?? []) {
        const card = cardById.get(id);
        if (card) card.dataset.sieveYtDropped = "1";
      }
    } catch {
    }
  }
  function syncTheaterHeaderTheme() {
    const root = document.documentElement;
    if (!root) return;
    if (!activeConfig?.enabled || !activeConfig.youtube.enabled) {
      delete root.dataset.sieveYtTheater;
      return;
    }
    const watchFlexy = document.querySelector("ytd-watch-flexy");
    const isWatchRoute = window.location.pathname === "/watch";
    const inLandscapeTheater = isWatchRoute && Boolean(watchFlexy) && !watchFlexy.hasAttribute("hidden") && (watchFlexy.hasAttribute("theater") || watchFlexy.hasAttribute("full-bleed-player") || watchFlexy.hasAttribute("fullscreen"));
    const masthead = document.querySelector("ytd-masthead");
    if (inLandscapeTheater) {
      root.dataset.sieveYtTheater = "1";
      if (masthead && !masthead.hasAttribute("dark")) {
        masthead.setAttribute("dark", "");
        masthead.dataset.sieveForcedDark = "1";
      }
    } else {
      delete root.dataset.sieveYtTheater;
      if (masthead?.dataset.sieveForcedDark === "1" && !root.hasAttribute("dark")) {
        masthead.removeAttribute("dark");
        delete masthead.dataset.sieveForcedDark;
      }
    }
  }
  function polishRenderedCards() {
    rafPending = false;
    if (!activeConfig?.enabled || !activeConfig.youtube.enabled) return;
    syncTheaterHeaderTheme();
    if (activeConfig.youtube.midFrameThumbs) {
      document.querySelectorAll('img[src*="ytimg.com/vi"]:not([data-sieve-thumb])').forEach((img) => {
        img.dataset.sieveThumb = "1";
        if (img.src.includes("/hq2.jpg")) return;
        const next = midFrameThumbUrl(img.src);
        if (next !== img.src) img.src = next;
      });
    }
    if (activeConfig.youtube.calmTitles) {
      document.querySelectorAll(
        "#video-title:not([data-sieve-calm]), .yt-lockup-metadata-view-model__title:not([data-sieve-calm])"
      ).forEach((el) => {
        el.dataset.sieveCalm = "1";
        const raw = el.textContent;
        if (!raw) return;
        const calmed = calmTitle(raw);
        if (calmed !== raw) el.textContent = calmed;
      });
    }
    if (activeConfig.youtube.cleanHeader) {
      hideGeminiAndAskButtons();
    }
    const watchHeading = document.querySelector("ytd-watch-metadata h1");
    if (watchHeading) trackWatchTitleDwell(watchHeading);
    void resolveVagueDomTitles();
    void evaluateUnfilteredDomCards();
  }
  function schedulePolish() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(polishRenderedCards);
  }
  bootSiteAdapter((cfg) => {
    activeConfig = cfg;
    const ytOn = cfg.enabled && cfg.youtube.enabled;
    applyHtmlFlags({
      sieveYtShorts: ytOn && cfg.youtube.hideShorts ? "1" : "0",
      sieveYtHeader: ytOn && cfg.youtube.cleanHeader ? "1" : "0"
    });
    enforceRouteGuards();
    schedulePolish();
  });
  window.addEventListener("yt-navigate-finish", () => {
    enforceRouteGuards();
    schedulePolish();
  });
  window.addEventListener("popstate", enforceRouteGuards);
  var observer = new MutationObserver(() => {
    if (activeConfig?.enabled && activeConfig.youtube.enabled) {
      schedulePolish();
    }
  });
  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["theater", "full-bleed-player", "fullscreen", "hidden"]
    });
  }
})();
