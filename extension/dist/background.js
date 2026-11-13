"use strict";
(() => {
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

  // src/core/dearrow.ts
  var DEARROW_MIRROR_BASE = "https://dearrow.minibomba.pro/sbserver/api/branding";
  var BUCKET_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
  var FETCH_TIMEOUT_MS = 2500;
  var titleCache = /* @__PURE__ */ new Map();
  var fetchedPrefixes = /* @__PURE__ */ new Map();
  async function sha256Prefix4(input) {
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const view = new Uint8Array(digest);
    const b0 = view[0]?.toString(16).padStart(2, "0") ?? "00";
    const b1 = view[1]?.toString(16).padStart(2, "0") ?? "00";
    return `${b0}${b1}`;
  }
  function cleanDeArrowTitle(raw) {
    return raw.replace(/(^|\s)>(\S)/g, "$1$2").replace(/\s+/g, " ").trim();
  }
  function clearDeArrowCache() {
    titleCache.clear();
    fetchedPrefixes.clear();
  }
  function pickBestCommunityTitle(record) {
    if (!isRecord(record) || !Array.isArray(record.titles)) return null;
    for (const candidate of record.titles) {
      if (!isRecord(candidate) || candidate.original === true) continue;
      const votes = typeof candidate.votes === "number" ? candidate.votes : -1;
      if (candidate.locked !== true && votes < 0) continue;
      if (typeof candidate.title !== "string") continue;
      const cleaned = cleanDeArrowTitle(candidate.title);
      if (cleaned.length >= 4) return cleaned;
    }
    return null;
  }
  async function lookupDeArrowTitles(videoIds, fetchImpl = fetch) {
    const result = /* @__PURE__ */ new Map();
    const uniqueIds = [...new Set(videoIds.filter((id) => /^[A-Za-z0-9_-]{11}$/.test(id)))];
    if (uniqueIds.length === 0) return result;
    const now = Date.now();
    const prefixesToFetch = /* @__PURE__ */ new Map();
    for (const vid of uniqueIds) {
      if (titleCache.has(vid)) {
        const hit = titleCache.get(vid);
        if (hit) result.set(vid, hit);
        continue;
      }
      const prefix = await sha256Prefix4(vid);
      const fetchedAt = fetchedPrefixes.get(prefix);
      if (fetchedAt && now - fetchedAt < BUCKET_TTL_MS) {
        titleCache.set(vid, null);
        continue;
      }
      let list = prefixesToFetch.get(prefix);
      if (!list) {
        list = [];
        prefixesToFetch.set(prefix, list);
      }
      list.push(vid);
    }
    const prefixEntries = [...prefixesToFetch.entries()].slice(0, 6);
    await Promise.all(
      prefixEntries.map(async ([prefix, requestedVids]) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
          const res = await fetchImpl(`${DEARROW_MIRROR_BASE}/${prefix}`, {
            signal: controller.signal
          });
          if (!res.ok) return;
          const bucket = await res.json();
          if (!isRecord(bucket)) return;
          fetchedPrefixes.set(prefix, now);
          for (const [vid, rec] of Object.entries(bucket)) {
            titleCache.set(vid, pickBestCommunityTitle(rec));
          }
          for (const reqVid of requestedVids) {
            if (!titleCache.has(reqVid)) titleCache.set(reqVid, null);
            const hit = titleCache.get(reqVid);
            if (hit) result.set(reqVid, hit);
          }
        } catch {
        } finally {
          clearTimeout(timer);
        }
      })
    );
    return result;
  }

  // src/core/llm.ts
  var MAX_BATCH_SIZE = 20;
  var BACKGROUND_TIMEOUT_MS = 6e3;
  function extractJsonObject(raw) {
    if (!raw) return null;
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
    const candidate = (fenced?.[1] ?? raw).trim();
    const braceStart = candidate.indexOf("{");
    const braceEnd = candidate.lastIndexOf("}");
    if (braceStart === -1 || braceEnd <= braceStart) return null;
    try {
      const parsed = JSON.parse(candidate.slice(braceStart, braceEnd + 1));
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  function parseIndexedVerdicts(raw, orderedIds) {
    const dropped = /* @__PURE__ */ new Set();
    const parsed = extractJsonObject(raw);
    if (!parsed) return dropped;
    const validSet = new Set(orderedIds);
    if (Array.isArray(parsed.drop)) {
      for (const id of parsed.drop) {
        if (typeof id === "string" && validSet.has(id)) dropped.add(id);
      }
      return dropped;
    }
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val !== "string") continue;
      const v = val.trim().toLowerCase();
      if (v !== "d" && v !== "drop") continue;
      if (/^\d+$/.test(key)) {
        const mappedId = orderedIds[Number.parseInt(key, 10)];
        if (mappedId) dropped.add(mappedId);
      } else if (validSet.has(key)) {
        dropped.add(key);
      }
    }
    return dropped;
  }
  function summarizeIndexedItem(item, index) {
    return {
      i: String(index),
      p: item.platform,
      by: item.creatorHandle || item.creatorId || "",
      text: item.titleOrText.slice(0, 240),
      ...item.secondaryText ? { ctx: item.secondaryText.slice(0, 180) } : {},
      ...item.durationSec ? { dur: item.durationSec } : {}
    };
  }
  var VERDICT_OUTPUT_INSTRUCTIONS = `Label each item index "0", "1", ... with one letter:
- "k" = keep & boost (ragebait, public humiliation/dunk clips, political/culture-war outrage, celebrity/influencer gossip, crypto/memecoin shills, hustle-bro/DM-funnel bait, short-drama cliffhangers, AI voiceover sleep-slop, or clickbait)
- "u" = unsure or neutral (kept by default when in doubt)
- "d" = confident drop (ONLY boring calm engineering, hardware, software, science, space, math, primary-source documentation, or earnest non-clickbait craft)

Return ONLY a JSON object mapping every index to "k", "u", or "d", like {"0":"k","1":"u","2":"d"}.`;
  function readFirstChoiceContent(body) {
    if (!isRecord(body) || !Array.isArray(body.choices)) return "";
    const first = body.choices[0];
    if (!isRecord(first) || !isRecord(first.message)) return "";
    return typeof first.message.content === "string" ? first.message.content : "";
  }
  async function gradeItemsBatch(items, config2, fetchImpl = fetch) {
    if (config2.grader.mode === "off" || items.length === 0) return /* @__PURE__ */ new Set();
    if (!config2.grader.endpoint || !config2.grader.model) {
      throw new Error("Missing grader endpoint or model");
    }
    if (config2.grader.mode === "api" && !config2.grader.apiKey.trim()) {
      throw new Error("Missing API key");
    }
    const batch = items.slice(0, MAX_BATCH_SIZE);
    const orderedIds = batch.map((item) => item.id);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BACKGROUND_TIMEOUT_MS);
    const headers = {
      "Content-Type": "application/json"
    };
    if (config2.grader.apiKey.trim()) {
      headers.Authorization = `Bearer ${config2.grader.apiKey.trim()}`;
    }
    const isLocal = config2.grader.mode === "local";
    try {
      const res = await fetchImpl(config2.grader.endpoint, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: config2.grader.model,
          temperature: 0,
          ...isLocal ? {
            seed: 42,
            keep_alive: "30m",
            response_format: { type: "json_object" }
          } : {},
          messages: [
            {
              role: "system",
              content: `${config2.grader.rubric.trim()}

${VERDICT_OUTPUT_INSTRUCTIONS}`
            },
            {
              role: "user",
              content: JSON.stringify(batch.map(summarizeIndexedItem))
            }
          ]
        })
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const body = await res.json();
      return parseIndexedVerdicts(readFirstChoiceContent(body), orderedIds);
    } finally {
      clearTimeout(timer);
    }
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

  // src/core/dehype.ts
  function normalizeHandle(raw) {
    if (!raw || typeof raw !== "string") return "";
    return raw.trim().replace(/^@+/, "").toLowerCase();
  }

  // src/core/slop-cadence.ts
  var SLOP_LEXICON = [
    "delve",
    "tapestry",
    "testament to",
    "ever-evolving",
    "ever-changing",
    "fast-paced world",
    "in today's",
    "landscape of",
    "realm of",
    "unlock the",
    "harness the",
    "leverage the power",
    "leveraging systems",
    "seamless",
    "robust solution",
    "game-changer",
    "game changer",
    "paradigm shift",
    "navigate the complexities",
    "it's worth noting",
    "at its core",
    "crucial role",
    "a myriad of",
    "plethora",
    "foster a",
    "embark on",
    "shed light on",
    "supercharge",
    "skyrocket",
    "ushering in",
    "the future of work"
  ];
  var ENGAGEMENT_HOOKS = [
    "let that sink in",
    "read that again",
    "bookmark this",
    "save this post",
    "save this for later",
    "follow for more",
    "you're welcome",
    "most people don't know",
    "nobody talks about this",
    "no one is talking about",
    "here's the kicker",
    "and the best part?",
    "steal my",
    "i studied",
    "i analyzed",
    "so you don't have to",
    "this changes everything",
    "buckle up",
    "a thread:",
    "mega thread"
  ];
  var LEAKED_ASSISTANT_RE = /\b(?:as an ai (?:language )?model|i'?m sorry,? but i (?:can'?t|cannot)|i cannot fulfill|as a large language model|here is (?:the|a) (?:rewritten|revised) (?:post|tweet)|certainly!\s+here)\b/gi;
  var PROMPT_RESIDUE_RE = /(?:\bsure[,!]\s+here'?s\b|\[insert [a-z ]+\]|\bas requested,|\btone:\s|\bword count:|\bhashtags:\s)/gi;
  var ANTITHESIS_RE = /(?:\b(?:it'?s|this|that)\s+(?:is\s+)?not\s+(?:just\s+|about\s+)?[^.!?\n]{2,42}[\u2014.,-]\s*(?:it'?s|it is|this is|that'?s)\s|\bnot\s+because[^.!?\n]{2,42},?\s*but\s+because\b)/gi;
  var GENERIC_BOT_REPLY_RE = /\b(?:great point|well said|couldn'?t agree more|this really resonates|thanks for sharing|spot on[.!]|insightful (?:post|thread)|100% agree)\b/gi;
  var EMOJI_BULLET_LINE_RE = /^\s*(?:[✅✔️🚀💡🔥📌🎯⚡️🧠📈💰👇🔑⭐️✨🙌💬🛠️📊🤝🎁]|[-•*]\s*[\p{Extended_Pictographic}])/u;
  function countWords(text) {
    return (text.trim().match(/\S+/g) ?? []).length;
  }
  function countRegex(text, re) {
    re.lastIndex = 0;
    return (text.match(re) ?? []).length;
  }
  function addDiminishing(weight, hits) {
    if (hits <= 0) return 0;
    let pts = 0;
    const capped = Math.min(hits, 4);
    for (let i = 0; i < capped; i++) {
      pts += weight / (i + 1);
    }
    return Math.round(pts);
  }
  function scoreSlopCadence(text, ctx = {}) {
    if (!text) return 0;
    const raw = text.trim();
    const lower = raw.toLowerCase();
    const words = countWords(raw);
    const leakedHits = countRegex(raw, LEAKED_ASSISTANT_RE);
    const residueHits = countRegex(raw, PROMPT_RESIDUE_RE);
    if (leakedHits > 0) return 95;
    if (residueHits > 0) return 90;
    if (ctx.isReply && words <= 24) {
      const botPraise = countRegex(raw, GENERIC_BOT_REPLY_RE);
      if (botPraise > 0 && !raw.includes("?")) {
        return 75;
      }
    }
    let total = 0;
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const emojiLines = lines.filter((l) => EMOJI_BULLET_LINE_RE.test(l)).length;
    if (emojiLines >= 3) {
      total += addDiminishing(30, emojiLines);
    }
    total += addDiminishing(22, countRegex(raw, ANTITHESIS_RE));
    const lexiconHits = SLOP_LEXICON.filter((phrase) => lower.includes(phrase)).length;
    total += addDiminishing(13, lexiconHits);
    const baitHits = ENGAGEMENT_HOOKS.filter((phrase) => lower.includes(phrase)).length;
    total += addDiminishing(19, baitHits);
    const numberedLines = countRegex(raw, /^\s*\d{1,2}[.)]\s+\S/gm);
    const threadSlash = countRegex(raw, /^\s*\d{1,2}\/(?:\d{1,2})?\s*$/gm);
    if (numberedLines >= 4 || threadSlash >= 1) {
      total += addDiminishing(16, Math.max(numberedLines - 2, threadSlash * 2));
    }
    const arrows = countRegex(raw, /[→↳➜►▪️▶️]/g);
    if (arrows >= 3) {
      total += addDiminishing(11, arrows - 1);
    }
    const emDashes = countRegex(raw, /\u2014/g);
    if (emDashes >= 3) {
      total += addDiminishing(10, emDashes - 2);
    }
    if (lines.length >= 6) {
      const shortLines = lines.filter((l) => {
        const w = countWords(l);
        return w > 0 && w <= 6;
      }).length;
      if (shortLines / lines.length >= 0.65) {
        total += addDiminishing(14, 2);
      }
    }
    if (words < 14) {
      total = Math.round(total * 0.35);
    }
    return Math.min(100, total);
  }
  function isStructuralSlop(text, ctx = {}, threshold = 65) {
    return scoreSlopCadence(text, ctx) >= threshold;
  }

  // src/core/sieve.ts
  var COMMENT_BAIT_RE = /\bcomment\s+["'“”]?[a-z0-9_-]{2,20}["'“”]?\s+(and\s+i'?ll|to\s+get|for\s+the|for\s+my)\s+(dm|send|link|free|guide|template)\b/i;
  var CRYPTO_CASINO_SPAM_RE = /\b(use\s+code\s+\w+\s+on\s+stake|100x\s+memecoin|telegram\s+pump\s+group|free\s+airdrop\s+link\s+in\s+bio)\b/i;
  var SHORT_DRAMA_RE = /(?:#(?:reelshort|dramabox|shortdrama|shortdramas|pinedrama|shortmax|minidrama)\b|\/shortdrama\/episode\/|\b(?:part|ep(?:isode)?)\s*\d+\s*[|:-].*\b(?:billionaire|ceo|heiress|secretly\s+marries|alpha\s+wolf|werewolf|mistress)\b)/i;
  var ATTENTION_TRAP_RE = /(?:🚨+\s*(?:breaking|just\s+in|huge|urgent)\b.*(?:\bkilled\b|\bover\s+for\b|\binsane\b|\bforever\b|🧵)|\b\d+\s+(?:ai\s+)?(?:websites|tools|prompts|extensions|repos)\s+that\s+feel\s+illegal\s+to\s+know\b|\bbookmark\s+this\s+before\s+it(?:'s|\s+is|\s+gets)\s+deleted\b|\bwrong\s+answers\s+only\b|#(?:redditstories|aita)\b.*#(?:minecraft|subwaysurfers|satisfying)\b)/i;
  var GOSSIP_DOMAIN_RE = /\b(?:celebrity|reality\s*tv|k-?pop\s*stan|tabloid|love\s*island|kardashian)\b/i;
  var YT_URL_ID_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^\s#"'<>]*&)?v=|embed\/|v\/))([A-Za-z0-9_-]{11})/gi;
  function extractYouTubeIdsFromText(text) {
    if (!text) return [];
    const found = /* @__PURE__ */ new Set();
    let match;
    YT_URL_ID_RE.lastIndex = 0;
    while ((match = YT_URL_ID_RE.exec(text)) !== null) {
      if (match[1]) found.add(match[1]);
    }
    return [...found];
  }
  function creatorKeysFor(item) {
    const keys = [];
    const byId = normalizeHandle(item.creatorId);
    const byHandle = normalizeHandle(item.creatorHandle);
    if (byId) keys.push(byId);
    if (byHandle && byHandle !== byId) keys.push(byHandle);
    return keys;
  }
  function isBrainrotItem(item, config2, seeds2, novelty2) {
    if (item.isSponsored) return true;
    const keys = creatorKeysFor(item);
    if (config2.allowHandles.length > 0) {
      const allowed = new Set(config2.allowHandles.map((h) => normalizeHandle(h)).filter(Boolean));
      if (keys.some((k) => allowed.has(k))) return true;
    }
    if (keys.some((k) => seeds2.slopChannels.has(k))) return true;
    const fullText = `${item.titleOrText} ${item.secondaryText ?? ""}`;
    if (COMMENT_BAIT_RE.test(fullText) || CRYPTO_CASINO_SPAM_RE.test(fullText) || SHORT_DRAMA_RE.test(fullText) || ATTENTION_TRAP_RE.test(fullText) || GOSSIP_DOMAIN_RE.test(fullText)) {
      return true;
    }
    if (item.platform === "x" && config2.x.slopCadenceFilter) {
      if (isStructuralSlop(item.titleOrText, {}, 55)) return true;
    } else if (isStructuralSlop(item.titleOrText, {}, 65)) {
      return true;
    }
    if (config2.noveltyFilter && novelty2?.isRedundantRehash(item.titleOrText)) {
      return true;
    }
    if (item.platform === "x" && item.metrics) {
      const likes = item.metrics.likes ?? 0;
      const replies = item.metrics.replies ?? 0;
      const quotes = item.metrics.quotes ?? 0;
      if (replies >= 30 && (replies > likes * 1.2 || quotes > likes * 1)) {
        return true;
      }
    }
    return false;
  }
  function evaluateLocalTiers(item, config2, seeds2, memory2, novelty2) {
    const keys = creatorKeysFor(item);
    if (config2.blockHandles.length > 0) {
      const blocked = new Set(config2.blockHandles.map((h) => normalizeHandle(h)).filter(Boolean));
      if (keys.some((k) => blocked.has(k))) return "drop";
    }
    if (isBrainrotItem(item, config2, seeds2, novelty2)) return "keep";
    if (config2.passFollowed && item.isFollowed) return "keep";
    if (item.platform === "youtube" && seeds2.hnVideos.has(item.id)) return "drop";
    if (keys.some((k) => seeds2.hnChannels.has(k))) return "drop";
    const ytIds = item.linkedYoutubeIds ?? extractYouTubeIdsFromText(item.titleOrText);
    if (ytIds.some((vid) => seeds2.hnVideos.has(vid))) return "drop";
    const cachedVerdict = memory2.getItemVerdict(item.platform, item.id);
    if (cachedVerdict) return cachedVerdict;
    for (const key of keys) {
      const learned = memory2.getCreatorVerdict(item.platform, key);
      if (learned) return learned;
    }
    return "uncertain";
  }
  async function classifySieveBatch(items, config2, seeds2, memory2, fetchImpl = fetch, novelty2) {
    const dropped = /* @__PURE__ */ new Set();
    const boosted = /* @__PURE__ */ new Set();
    const uncertain = [];
    for (const item of items) {
      if (isBrainrotItem(item, config2, seeds2, novelty2)) {
        boosted.add(item.id);
        continue;
      }
      const localVerdict = evaluateLocalTiers(item, config2, seeds2, memory2, novelty2);
      if (localVerdict === "drop") {
        dropped.add(item.id);
      } else if (localVerdict === "uncertain") {
        uncertain.push(item);
      }
    }
    if (uncertain.length === 0 || config2.grader.mode === "off") {
      return { dropped, boosted };
    }
    const holdMs = Math.max(50, config2.grader.streamHoldMs || DEFAULT_CONFIG.grader.streamHoldMs);
    const gradingPromise = gradeItemsBatch(uncertain, config2, fetchImpl).then(async (llmDrops) => {
      for (const item of uncertain) {
        const verdict = llmDrops.has(item.id) ? "drop" : "keep";
        await memory2.recordVerdict(item, verdict);
      }
      return llmDrops;
    }).catch(() => /* @__PURE__ */ new Set());
    let timer;
    const timedOut = Symbol("timeout");
    const outcome = await Promise.race([
      gradingPromise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(timedOut), holdMs);
      })
    ]);
    if (timer) clearTimeout(timer);
    if (outcome !== timedOut) {
      for (const id of outcome) dropped.add(id);
    }
    return { dropped, boosted };
  }

  // src/background/memory.ts
  var ITEM_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
  var CREATOR_TTL_MS = 14 * 24 * 60 * 60 * 1e3;
  var DB_NAME = "sieve_memory_v1";
  function isStoredVerdict(v) {
    return isRecord(v) && typeof v.key === "string" && (v.verdict === "keep" || v.verdict === "drop") && typeof v.at === "number";
  }
  function isCreatorRecord(v) {
    return isRecord(v) && typeof v.key === "string" && typeof v.keeps === "number" && typeof v.drops === "number" && typeof v.updatedAt === "number";
  }
  function openDb() {
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
  function createMemoryStore(options = {}) {
    const maxItems = options.maxItems ?? 5e4;
    const items = /* @__PURE__ */ new Map();
    const creators = /* @__PURE__ */ new Map();
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
      }
    });
    function itemMapKey(platform, id) {
      return `${platform}:${id}`;
    }
    function creatorMapKey(platform, creatorKey) {
      return `${platform}:${creatorKey}`;
    }
    function evaluateCreatorRecord(rec) {
      if (!rec) return void 0;
      if (Date.now() - rec.updatedAt > CREATOR_TTL_MS) {
        creators.delete(rec.key);
        return void 0;
      }
      const total = rec.keeps + rec.drops;
      if (total >= 3 && rec.keeps / total >= 0.8) return "keep";
      if (total >= 5 && rec.keeps / total <= 0.15) return "drop";
      return void 0;
    }
    function isShareableHandle(rawKey) {
      return rawKey.length >= 3 && !/^\d+$/.test(rawKey) && !/^uc[a-z0-9_-]{20,}$/i.test(rawKey);
    }
    return {
      getItemVerdict(platform, id) {
        const key = itemMapKey(platform, id);
        const hit = items.get(key);
        if (!hit) return void 0;
        if (Date.now() - hit.at > ITEM_TTL_MS) {
          items.delete(key);
          return void 0;
        }
        items.delete(key);
        items.set(key, hit);
        return hit.verdict;
      },
      getCreatorVerdict(platform, rawKey) {
        const normalized = rawKey.toLowerCase();
        const platformVerdict = evaluateCreatorRecord(
          creators.get(creatorMapKey(platform, normalized))
        );
        if (platformVerdict) return platformVerdict;
        if (isShareableHandle(normalized)) {
          return evaluateCreatorRecord(creators.get(`*:${normalized}`));
        }
        return void 0;
      },
      async recordVerdict(item, verdict) {
        if (verdict === "drop") droppedTotal += 1;
        const now = Date.now();
        const iKey = itemMapKey(item.platform, item.id);
        const entry = { key: iKey, verdict, at: now };
        if (items.has(iKey)) items.delete(iKey);
        items.set(iKey, entry);
        let evictedKey;
        if (items.size > maxItems) {
          evictedKey = items.keys().next().value;
          if (evictedKey) items.delete(evictedKey);
        }
        const updatedCreators = [];
        const bucketKeys = /* @__PURE__ */ new Set();
        for (const cKey of creatorKeysFor(item)) {
          bucketKeys.add(creatorMapKey(item.platform, cKey));
          if (isShareableHandle(cKey)) bucketKeys.add(`*:${cKey}`);
        }
        for (const fullKey of bucketKeys) {
          const existing = creators.get(fullKey) ?? {
            key: fullKey,
            keeps: 0,
            drops: 0,
            updatedAt: now
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
        }
      },
      counts() {
        let learnedCreators = 0;
        for (const rec of creators.values()) {
          if (evaluateCreatorRecord(rec) !== void 0) learnedCreators += 1;
        }
        return {
          cachedItems: items.size,
          learnedCreators,
          droppedTotal
        };
      }
    };
  }

  // src/background/novelty.ts
  var NOVELTY_TTL_MS = 48 * 60 * 60 * 1e3;
  var MAX_NOVELTY_RECORDS = 400;
  var MIN_SIGNATURE_TOKENS = 6;
  var NOVELTY_DB_NAME = "sieve_novelty_v1";
  var STOPWORDS = /* @__PURE__ */ new Set([
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
    "your"
  ]);
  function isDwelledEntry(v) {
    return isRecord(v) && typeof v.id === "string" && typeof v.at === "number" && Array.isArray(v.tokens) && v.tokens.every((t) => typeof t === "string");
  }
  function extractSignatureTokens(text) {
    const out = /* @__PURE__ */ new Set();
    if (!text) return out;
    const withoutUrls = text.replace(/https?:\/\/\S+/gi, " ").replace(/@[A-Za-z0-9_.-]+/g, " ").toLowerCase();
    for (const raw of withoutUrls.split(/[^a-z0-9]+/)) {
      if (raw.length < 3) continue;
      if (STOPWORDS.has(raw)) continue;
      out.add(raw);
    }
    return out;
  }
  function openNoveltyDb() {
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
  function createNoveltyMemory() {
    const entries = [];
    const dbPromise = openNoveltyDb();
    void dbPromise.then((db) => {
      if (!db) return;
      const now = Date.now();
      try {
        const req = db.transaction("dwelled", "readonly").objectStore("dwelled").getAll();
        req.onsuccess = () => {
          if (!Array.isArray(req.result)) return;
          req.result.filter((r) => isDwelledEntry(r) && now - r.at <= NOVELTY_TTL_MS).slice(-MAX_NOVELTY_RECORDS).forEach((r) => {
            entries.push({ id: r.id, tokenSet: new Set(r.tokens), at: r.at });
          });
        };
      } catch {
      }
    });
    function pruneExpired(now) {
      while (entries.length > 0 && now - entries[0].at > NOVELTY_TTL_MS) {
        entries.shift();
      }
    }
    function overlapMetrics(a, b) {
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
        containment: inter / Math.min(a.size, b.size)
      };
    }
    return {
      recordDwelled(text) {
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
        let evictedId;
        if (entries.length > MAX_NOVELTY_RECORDS) {
          evictedId = entries.shift()?.id;
        }
        void dbPromise.then((db) => {
          if (!db) return;
          try {
            const tx = db.transaction("dwelled", "readwrite");
            const store = tx.objectStore("dwelled");
            store.put({ id, tokens: [...tokenSet], at: now });
            if (evictedId) store.delete(evictedId);
          } catch {
          }
        });
      },
      isRedundantRehash(text) {
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
          }
        });
      },
      size() {
        pruneExpired(Date.now());
        return entries.length;
      }
    };
  }

  // src/background/index.ts
  var config = structuredClone(DEFAULT_CONFIG);
  var sessionFilteredCount = 0;
  var sessionBoostedCount = 0;
  var seeds = {
    hnVideos: /* @__PURE__ */ new Set(),
    hnChannels: /* @__PURE__ */ new Set(),
    slopChannels: /* @__PURE__ */ new Set()
  };
  var memory = createMemoryStore();
  var novelty = createNoveltyMemory();
  async function loadSeedSet(assetPath, target) {
    try {
      const res = await fetch(ext.getURL(assetPath));
      if (!res.ok) return;
      const text = await res.text();
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) target.add(trimmed);
      }
    } catch {
    }
  }
  var initPromise = (async () => {
    try {
      const stored = await ext.storageGet("sieveConfig");
      config = mergeConfig(stored.sieveConfig);
    } catch {
      config = structuredClone(DEFAULT_CONFIG);
    }
    await Promise.all([
      loadSeedSet("assets/seeds/hn-videos.txt", seeds.hnVideos),
      loadSeedSet("assets/seeds/hn-channels.txt", seeds.hnChannels),
      loadSeedSet("assets/seeds/slop-channels.txt", seeds.slopChannels)
    ]);
  })();
  function isBlockedPlatformUrl(rawUrl) {
    if (!rawUrl || !config.enabled) return false;
    try {
      const host = new URL(rawUrl).hostname.toLowerCase();
      if (config.x.enabled && (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com"))) {
        return true;
      }
      if (config.tiktok.enabled && (host === "tiktok.com" || host.endsWith(".tiktok.com"))) {
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }
  function maybeCloseBlockedTab(tabId, rawUrl) {
    if (tabId === void 0 || !isBlockedPlatformUrl(rawUrl)) return;
    void ext.closeTab(tabId).catch(() => {
    });
  }
  ext.onTabCreated((tab) => {
    void initPromise.then(() => {
      maybeCloseBlockedTab(tab.id, tab.pendingUrl || tab.url);
    });
  });
  ext.onTabUpdated((tabId, changeInfo, tab) => {
    const targetUrl = changeInfo.url || tab.pendingUrl || tab.url;
    if (!targetUrl) return;
    void initPromise.then(() => {
      maybeCloseBlockedTab(tabId, targetUrl);
    });
  });
  void initPromise.then(async () => {
    try {
      const tabs = await ext.queryAllTabs();
      for (const tab of tabs) {
        maybeCloseBlockedTab(tab.id, tab.url);
      }
    } catch {
    }
  });
  ext.onStorageChanged((changes, area) => {
    if (area === "local" && changes.sieveConfig) {
      config = mergeConfig(changes.sieveConfig.newValue);
    }
  });
  async function decideBatch(items) {
    await initPromise;
    const verdicts = await classifySieveBatch(items, config, seeds, memory, fetch, novelty);
    sessionFilteredCount += verdicts.dropped.size;
    sessionBoostedCount += verdicts.boosted.size;
    return verdicts;
  }
  function parseGraderOverride(raw) {
    if (!isRecord(raw)) return void 0;
    const mode = raw.mode === "off" || raw.mode === "local" || raw.mode === "api" ? raw.mode : null;
    if (!mode || typeof raw.endpoint !== "string" || typeof raw.model !== "string" || typeof raw.apiKey !== "string" || typeof raw.rubric !== "string" || typeof raw.streamHoldMs !== "number") {
      return void 0;
    }
    return {
      mode,
      endpoint: raw.endpoint,
      model: raw.model,
      apiKey: raw.apiKey,
      rubric: raw.rubric,
      streamHoldMs: raw.streamHoldMs
    };
  }
  ext.onMessage((raw) => {
    if (!isRecord(raw) || typeof raw.type !== "string") return void 0;
    if (raw.type === "GET_STATUS") {
      return initPromise.then(() => {
        const stats = memory.counts();
        return {
          sessionFilteredCount,
          sessionBoostedCount,
          cachedItems: stats.cachedItems,
          learnedCreators: stats.learnedCreators,
          dwelledCount: novelty.size(),
          hnVideos: seeds.hnVideos.size,
          slopChannels: seeds.slopChannels.size
        };
      });
    }
    if (raw.type === "CLEAR_CACHE") {
      sessionFilteredCount = 0;
      sessionBoostedCount = 0;
      novelty.clear();
      clearDeArrowCache();
      return memory.clear().then(() => ({ ok: true }));
    }
    if (raw.type === "RECORD_DWELL" && typeof raw.text === "string") {
      if (config.enabled && config.noveltyFilter) {
        novelty.recordDwelled(raw.text);
      }
      return Promise.resolve({ ok: true });
    }
    if (raw.type === "RESOLVE_DEARROW_TITLES" && Array.isArray(raw.videoIds)) {
      if (!config.enabled || !config.youtube.enabled || !config.youtube.dearrowTitles) {
        return Promise.resolve({ titles: {} });
      }
      const videoIds = raw.videoIds.filter((id) => typeof id === "string");
      return lookupDeArrowTitles(videoIds).then(
        (map) => ({
          titles: Object.fromEntries(map)
        })
      );
    }
    if (raw.type === "EVALUATE_SSR_ITEMS" && Array.isArray(raw.items)) {
      const items = raw.items.filter(
        (item) => isRecord(item) && typeof item.id === "string" && typeof item.titleOrText === "string"
      );
      return decideBatch(items).then(
        (verdicts) => ({
          dropped: [...verdicts.dropped],
          boosted: [...verdicts.boosted]
        })
      );
    }
    if (raw.type === "TEST_GRADER") {
      const override = parseGraderOverride(raw.graderOverride);
      const testConfig = override ? { ...config, grader: override } : config;
      const probe = [
        {
          platform: "youtube",
          id: "probe_craft",
          creatorHandle: "maker",
          surface: "home",
          titleOrText: "Machining a brass flexure stage on a manual mill"
        },
        {
          platform: "youtube",
          id: "probe_slop",
          creatorHandle: "rage_daily",
          surface: "home",
          titleOrText: "CELEBRITY MELTDOWN EXPOSED!! COMMENT LINK FOR FREE CRYPTO!!"
        }
      ];
      const started = Date.now();
      return gradeItemsBatch(probe, testConfig).then(
        (drops) => ({
          ok: true,
          ms: Date.now() - started,
          droppedProbeSlop: drops.has("probe_slop")
        })
      ).catch(
        (err) => ({
          ok: false,
          ms: Date.now() - started,
          error: err instanceof Error ? err.message : "Request failed"
        })
      );
    }
    return void 0;
  });
})();
