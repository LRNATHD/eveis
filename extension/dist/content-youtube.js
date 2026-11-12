"use strict";
(() => {
  // src/types.ts
  function isRecord(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }

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
  function isYouTubeSafeRoute(pageUrl) {
    try {
      const pathname = new URL(pageUrl).pathname.replace(/\/+$/, "") || "/";
      return pathname !== "/" && pathname !== "/watch" && pathname !== "/results";
    } catch {
      return false;
    }
  }
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
    return /^(?:https?:\/\/|www\.|@)/i.test(part.trim()) || part.includes("_");
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

  // src/defaults.ts
  var SCHEMA_VERSION = 1;
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
  var LOCAL_CACHE_KEY = "__sieve_cached_flags_v1";
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
  function rememberBounded(set, key, max = 4e3) {
    if (set.has(key)) return false;
    if (set.size >= max) {
      const oldest = set.values().next().value;
      if (oldest !== void 0) set.delete(oldest);
    }
    set.add(key);
    return true;
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
  async function evaluateDomBatch(items, onDrop) {
    if (items.length === 0) return;
    try {
      const res = await browser.runtime.sendMessage({
        type: "EVALUATE_SSR_ITEMS",
        items
      });
      if (!isRecord(res) || !Array.isArray(res.dropped)) return;
      for (const id of res.dropped) {
        if (typeof id === "string") onDrop(id);
      }
    } catch {
    }
  }
  function installMidFrameThumbFallback() {
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
  }
  function createDwellTracker(extractText, dwellMs = 1800) {
    const timers = /* @__PURE__ */ new WeakMap();
    const observed = /* @__PURE__ */ new WeakSet();
    const recorded = /* @__PURE__ */ new WeakSet();
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
  var evaluatedDomVideos = /* @__PURE__ */ new Set();
  var dearrowCheckedVideos = /* @__PURE__ */ new Set();
  var trackWatchTitleDwell = createDwellTracker((el) => el.textContent ?? "", 2500);
  installMidFrameThumbFallback();
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
      if (!titleEl || !raw || !rememberBounded(dearrowCheckedVideos, vid)) return;
      if (!isVagueClickbaitTitle(raw)) return;
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
      if (!isRecord(res) || !isRecord(res.titles)) return;
      for (const [vid, curated] of Object.entries(res.titles)) {
        const targets = titleElsByVid.get(vid);
        if (!targets || typeof curated !== "string" || !curated) continue;
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
    if (!activeConfig?.enabled || !activeConfig.youtube.enabled || !activeConfig.youtube.hideShorts) {
      return;
    }
    const path = window.location.pathname;
    if (path.startsWith("/shorts/") || path === "/shorts" || path.startsWith("/playables")) {
      window.location.replace("https://www.youtube.com/");
    }
  }
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
      if (!title || !rememberBounded(evaluatedDomVideos, vid)) return;
      const chanLink = card.querySelector('a[href^="/@"], a[href^="/channel/"]');
      const href = chanLink?.getAttribute("href") ?? "";
      const handle = href.startsWith("/@") ? href.slice(1).split("/")[0] : chanLink?.textContent?.trim() || void 0;
      const chanId = href.startsWith("/channel/") ? href.split("/")[2] : void 0;
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
    await evaluateDomBatch(batch, (id) => {
      const card = cardById.get(id);
      if (card) card.dataset.sieveYtDropped = "1";
    });
  }
  function isVisibleWatchTheater() {
    if (window.location.pathname !== "/watch") return false;
    if (document.fullscreenElement) return true;
    const watchFlexy = document.querySelector("ytd-watch-flexy");
    if (!watchFlexy || watchFlexy.hasAttribute("hidden")) return false;
    if (getComputedStyle(watchFlexy).display === "none") return false;
    return watchFlexy.hasAttribute("theater") || watchFlexy.hasAttribute("full-bleed-player") || watchFlexy.hasAttribute("fullscreen");
  }
  function syncTheaterHeaderTheme() {
    const root = document.documentElement;
    if (!root) return;
    const headerActive = Boolean(
      activeConfig?.enabled && activeConfig.youtube.enabled && activeConfig.youtube.cleanHeader
    );
    if (headerActive && isVisibleWatchTheater()) {
      root.dataset.sieveYtTheater = "1";
    } else {
      delete root.dataset.sieveYtTheater;
    }
  }
  function polishRenderedCards() {
    syncTheaterHeaderTheme();
    if (!activeConfig?.enabled || !activeConfig.youtube.enabled) return;
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
  var schedulePolish = createRafScheduler(polishRenderedCards);
  function handleNavigationChange() {
    syncTheaterHeaderTheme();
    enforceRouteGuards();
    schedulePolish();
  }
  bootSiteAdapter((cfg) => {
    activeConfig = cfg;
    const ytOn = cfg.enabled && cfg.youtube.enabled;
    applyHtmlFlags({
      sieveYtOn: ytOn ? "1" : "0",
      sieveYtShorts: ytOn && cfg.youtube.hideShorts ? "1" : "0",
      sieveYtHeader: ytOn && cfg.youtube.cleanHeader ? "1" : "0"
    });
    handleNavigationChange();
  });
  window.addEventListener("yt-navigate-start", (event) => {
    const detail = event instanceof CustomEvent && isRecord(event.detail) ? event.detail : null;
    if (typeof detail?.url === "string") {
      try {
        if (new URL(detail.url, window.location.origin).pathname !== "/watch") {
          delete document.documentElement?.dataset.sieveYtTheater;
          return;
        }
      } catch {
      }
    }
    syncTheaterHeaderTheme();
  });
  window.addEventListener("yt-page-data-updated", syncTheaterHeaderTheme);
  window.addEventListener("yt-navigate-finish", handleNavigationChange);
  window.addEventListener("popstate", handleNavigationChange);
  document.addEventListener("fullscreenchange", syncTheaterHeaderTheme);
  var observer = new MutationObserver(() => {
    if (activeConfig?.enabled && activeConfig.youtube.enabled) {
      syncTheaterHeaderTheme();
      schedulePolish();
    }
  });
  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["theater", "full-bleed-player", "fullscreen", "hidden", "style"]
    });
  }
})();
