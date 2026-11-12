"use strict";
(() => {
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
  function pauseAllMedia(root = document) {
    root.querySelectorAll("video, audio").forEach((el) => {
      try {
        el.muted = true;
        if (!el.paused) el.pause();
      } catch {
      }
    });
  }

  // src/content/instagram.ts
  var SPONSORED_LABELS = /* @__PURE__ */ new Set(["ad", "sponsored", "paid partnership"]);
  var SUGGESTED_LABELS = /* @__PURE__ */ new Set([
    "suggested for you",
    "suggested post",
    "suggested posts",
    "recommended for you"
  ]);
  var ZERO_WIDTH_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g;
  var activeConfig = null;
  var scanPending = false;
  var evaluatedIgPosts = /* @__PURE__ */ new Set();
  function readHeaderLabels(article) {
    const actionBoundary = article.querySelector("section");
    if (!actionBoundary) return [];
    const labels = [];
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    let node;
    let steps = 0;
    while ((node = walker.nextNode()) && steps++ < 160) {
      if (!(actionBoundary.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING)) {
        break;
      }
      const parent = node.parentElement;
      if (!parent || parent.closest("a, button, [role='button'], figure, blockquote")) continue;
      const clean = (node.nodeValue ?? "").replace(ZERO_WIDTH_RE, "").replace(/\s+/g, " ").trim().toLowerCase();
      if (clean && clean.length <= 36) labels.push(clean);
    }
    return labels;
  }
  function hasUnfollowedHeaderButton(article) {
    const boundary = article.querySelector("section");
    if (!boundary) return false;
    for (const btn of article.querySelectorAll("button, [role='button']")) {
      if (!(boundary.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_PRECEDING)) continue;
      const label = (btn.textContent ?? "").trim().toLowerCase();
      if (label === "follow") return true;
    }
    return false;
  }
  function hideHomeRightRail(main, hideClutter) {
    if (!hideClutter) {
      document.querySelectorAll('[data-sieve-ig-right-rail="1"]').forEach((el) => {
        delete el.dataset.sieveIgRightRail;
      });
      return;
    }
    const markers = main.querySelectorAll(
      'a[href*="/explore/people"], a[href*="about.instagram.com"], a[href*="/legal/terms"]'
    );
    for (const marker of markers) {
      let cur = marker.parentElement;
      let candidate = null;
      while (cur && cur !== main) {
        if (cur.querySelector("article")) break;
        const rect = cur.getBoundingClientRect();
        if (rect.width >= 220 && rect.width <= 440) {
          candidate = cur;
        }
        cur = cur.parentElement;
      }
      if (candidate) {
        candidate.dataset.sieveIgRightRail = "1";
      }
    }
  }
  function calmRenderedCaptions(root) {
    root.querySelectorAll("h1:not([data-sieve-calm]), span:not([data-sieve-calm])").forEach((el) => {
      if (el.childElementCount > 0) return;
      const raw = el.textContent;
      if (!raw || raw.length < 12) return;
      el.dataset.sieveCalm = "1";
      const calmed = calmTitle(raw);
      if (calmed !== raw) el.textContent = calmed;
    });
  }
  async function evaluateUnfollowedHomeArticles(main) {
    if (!activeConfig?.instagram.caliberFilter) return;
    const batch = [];
    const articleById = /* @__PURE__ */ new Map();
    main.querySelectorAll("article:not([data-sieve-hidden])").forEach((article, idx) => {
      if (article.parentElement?.closest("article")) return;
      if (!hasUnfollowedHeaderButton(article)) return;
      const postLink = article.querySelector('a[href^="/p/"], a[href^="/reel/"]');
      const href = postLink?.getAttribute("href") ?? "";
      const authorLink = article.querySelector('a[href^="/"]');
      const handle = authorLink?.getAttribute("href")?.replace(/^\/|\/$/g, "").split("/")[0] ?? void 0;
      const text = article.textContent?.replace(/\s+/g, " ").trim().slice(0, 220) ?? "";
      const id = href || `ig_dom_${idx}_${text.slice(0, 24)}`;
      if (!id || evaluatedIgPosts.has(id)) return;
      evaluatedIgPosts.add(id);
      articleById.set(id, article);
      batch.push({
        platform: "instagram",
        id,
        creatorHandle: handle,
        isFollowed: false,
        surface: "timeline",
        titleOrText: text
      });
    });
    if (batch.length === 0) return;
    try {
      const res = await browser.runtime.sendMessage({
        type: "EVALUATE_SSR_ITEMS",
        items: batch
      });
      for (const dropId of res.dropped ?? []) {
        const article = articleById.get(dropId);
        if (article) {
          article.dataset.sieveHidden = "1";
          pauseAllMedia(article);
        }
      }
    } catch {
    }
  }
  function sweepInstagramDom() {
    scanPending = false;
    const path = window.location.pathname;
    const igOn = Boolean(activeConfig?.enabled && activeConfig.instagram.enabled);
    const main = document.querySelector('main[role="main"], main');
    if (!igOn || !main) {
      document.querySelectorAll('[data-sieve-hidden="1"], [data-sieve-ig-right-rail="1"]').forEach((el) => {
        delete el.dataset.sieveHidden;
        delete el.dataset.sieveIgRightRail;
      });
      return;
    }
    calmRenderedCaptions(main);
    if (path !== "/" && path !== "") {
      document.querySelectorAll('[data-sieve-ig-right-rail="1"]').forEach((el) => {
        delete el.dataset.sieveIgRightRail;
      });
      return;
    }
    hideHomeRightRail(main, Boolean(activeConfig?.instagram.hideClutter));
    main.querySelectorAll("article").forEach((article) => {
      if (article.parentElement?.closest("article")) return;
      const labels = readHeaderLabels(article);
      const isAd = labels.some((t) => SPONSORED_LABELS.has(t));
      const isSuggested = activeConfig?.instagram.hideClutter && labels.some((t) => SUGGESTED_LABELS.has(t));
      if (isAd || isSuggested) {
        article.dataset.sieveHidden = "1";
        pauseAllMedia(article);
      } else if (article.dataset.sieveHidden) {
        delete article.dataset.sieveHidden;
      }
    });
    void evaluateUnfollowedHomeArticles(main);
  }
  function scheduleSweep() {
    if (scanPending) return;
    scanPending = true;
    requestAnimationFrame(sweepInstagramDom);
  }
  bootSiteAdapter((cfg) => {
    activeConfig = cfg;
    const igOn = cfg.enabled && cfg.instagram.enabled;
    applyHtmlFlags({
      sieveIgClutter: igOn && cfg.instagram.hideClutter ? "1" : "0"
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
})();
