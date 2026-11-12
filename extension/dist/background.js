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
  var YT_THUMB_RE = /^https?:\/\/i\d*\.ytimg\.com\/vi(?:_webp)?\/([A-Za-z0-9_-]{11})\//i;
  function normalizeHandle(raw) {
    if (!raw || typeof raw !== "string") return "";
    return raw.trim().replace(/^@+/, "").toLowerCase();
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

  // src/adapters/instagram-json.ts
  function isRecord(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }
  function isMediaAd(media, wrapper) {
    if (media.ad_id || media.is_ad === true || media.is_organic_product_tagging_eligible === false && media.ad_action) {
      return true;
    }
    if (isRecord(media.injected) || typeof media.ad_action === "string") return true;
    if (wrapper && (isRecord(wrapper.ad) || isRecord(wrapper.explore_story) || isRecord(wrapper.suggested_users))) {
      return true;
    }
    return false;
  }
  function extractIgMedia(media, surface) {
    const rawId = media.pk ?? media.id ?? media.code;
    const id = typeof rawId === "string" || typeof rawId === "number" ? String(rawId) : "";
    if (!id) return null;
    let captionText = "";
    if (isRecord(media.caption) && typeof media.caption.text === "string") {
      captionText = media.caption.text;
      media.caption.text = calmTitle(captionText);
    } else if (isRecord(media.edge_media_to_caption) && Array.isArray(media.edge_media_to_caption.edges) && isRecord(media.edge_media_to_caption.edges[0]) && isRecord(media.edge_media_to_caption.edges[0].node) && typeof media.edge_media_to_caption.edges[0].node.text === "string") {
      captionText = media.edge_media_to_caption.edges[0].node.text;
      media.edge_media_to_caption.edges[0].node.text = calmTitle(captionText);
    }
    let creatorId;
    let creatorHandle;
    let isFollowed = false;
    if (isRecord(media.user)) {
      if (media.user.pk != null) creatorId = String(media.user.pk);
      if (typeof media.user.username === "string") creatorHandle = media.user.username;
      if (isRecord(media.user.friendship_status) && media.user.friendship_status.following === true) {
        isFollowed = true;
      }
    }
    let secondaryText;
    if (isRecord(media.clips_metadata) && isRecord(media.clips_metadata.music_info) && isRecord(media.clips_metadata.music_info.music_asset_info) && typeof media.clips_metadata.music_info.music_asset_info.title === "string") {
      secondaryText = `audio: ${media.clips_metadata.music_info.music_asset_info.title}`;
    }
    const durationSec = typeof media.video_duration === "number" ? media.video_duration : void 0;
    const likes = typeof media.like_count === "number" ? media.like_count : void 0;
    const replies = typeof media.comment_count === "number" ? media.comment_count : void 0;
    const views = typeof media.play_count === "number" ? media.play_count : void 0;
    return {
      platform: "instagram",
      id,
      creatorId,
      creatorHandle,
      isFollowed,
      surface,
      titleOrText: captionText || `@${creatorHandle ?? "reel"}`,
      secondaryText,
      durationSec,
      metrics: { likes, replies, views }
    };
  }
  function isInstagramProfileOrPermalink(pageUrl) {
    if (!pageUrl) return false;
    try {
      const p = new URL(pageUrl).pathname.replace(/\/+$/, "") || "/";
      if (p === "/" || p === "/reels" || p.startsWith("/reels/")) return false;
      return true;
    } catch {
      return false;
    }
  }
  async function filterInstagramJson(data, urlPath, config2, decide, pageUrl) {
    if (!config2.enabled || !config2.instagram.enabled) return data;
    if (!isRecord(data)) return data;
    const onProfileOrPost = isInstagramProfileOrPermalink(pageUrl);
    const candidates = /* @__PURE__ */ new Map();
    const slots = [];
    function processGraphqlConnection(connKey, conn) {
      if (!Array.isArray(conn.edges)) return;
      const isUserProfileConn = onProfileOrPost || connKey.includes("user") || !connKey.includes("clips__home") && !connKey.includes("feed__timeline");
      const isReels = connKey.includes("clips");
      const surface = isReels ? "reels" : "timeline";
      const filterActive = !isUserProfileConn && (isReels ? config2.instagram.filterReels : config2.instagram.caliberFilter);
      const edges = conn.edges;
      const getMediaFromEdge = (edge) => {
        if (!isRecord(edge) || !isRecord(edge.node)) return null;
        if (isRecord(edge.node.media)) return edge.node.media;
        if (isRecord(edge.node.media_or_ad)) return edge.node.media_or_ad;
        if (edge.node.pk != null || edge.node.id != null) return edge.node;
        return null;
      };
      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        const node = isRecord(edge) && isRecord(edge.node) ? edge.node : void 0;
        const media = getMediaFromEdge(edge);
        if (!media) continue;
        if (isMediaAd(media, node)) {
          edges.splice(i, 1);
          i--;
          continue;
        }
        const item = extractIgMedia(media, surface);
        if (!filterActive || !item) continue;
        candidates.set(item.id, item);
        slots.push({
          list: edges,
          id: item.id,
          getMediaId: (el) => {
            const m = getMediaFromEdge(el);
            const raw = m?.pk ?? m?.id ?? m?.code;
            return raw != null ? String(raw) : "";
          }
        });
      }
    }
    if (isRecord(data.data)) {
      for (const [key, val] of Object.entries(data.data)) {
        if (isRecord(val) && Array.isArray(val.edges)) {
          processGraphqlConnection(key, val);
        }
      }
    }
    if (Array.isArray(data.items) && urlPath.includes("/clips/")) {
      const items = data.items;
      for (let i = items.length - 1; i >= 0; i--) {
        const entry = items[i];
        const media = isRecord(entry) && isRecord(entry.media) ? entry.media : isRecord(entry) ? entry : null;
        if (!media) continue;
        if (isMediaAd(media, isRecord(entry) ? entry : void 0)) {
          items.splice(i, 1);
          continue;
        }
        if (!config2.instagram.filterReels) continue;
        const item = extractIgMedia(media, "reels");
        if (item) {
          candidates.set(item.id, item);
          slots.push({
            list: items,
            id: item.id,
            getMediaId: (el) => {
              const m = isRecord(el) && isRecord(el.media) ? el.media : isRecord(el) ? el : null;
              const raw = m?.pk ?? m?.id ?? m?.code;
              return raw != null ? String(raw) : "";
            }
          });
        }
      }
    }
    if (Array.isArray(data.feed_items)) {
      const feedItems = data.feed_items;
      for (let i = feedItems.length - 1; i >= 0; i--) {
        const entry = feedItems[i];
        if (!isRecord(entry)) continue;
        if (config2.instagram.hideClutter && (entry.suggested_users || entry.explore_story || entry.clips_netego)) {
          feedItems.splice(i, 1);
          continue;
        }
        const media = isRecord(entry.media_or_ad) ? entry.media_or_ad : null;
        if (!media) continue;
        if (isMediaAd(media, entry)) {
          feedItems.splice(i, 1);
          continue;
        }
        if (!config2.instagram.caliberFilter) continue;
        const item = extractIgMedia(media, "timeline");
        if (item) {
          candidates.set(item.id, item);
          slots.push({
            list: feedItems,
            id: item.id,
            getMediaId: (el) => {
              const m = isRecord(el) && isRecord(el.media_or_ad) ? el.media_or_ad : null;
              const raw = m?.pk ?? m?.id ?? m?.code;
              return raw != null ? String(raw) : "";
            }
          });
        }
      }
    }
    if (candidates.size === 0) return data;
    const droppedIds = await decide([...candidates.values()]);
    if (droppedIds.size === 0) return data;
    const processedLists = /* @__PURE__ */ new Set();
    for (const slot of slots) {
      if (processedLists.has(slot.list)) continue;
      processedLists.add(slot.list);
      for (let i = slot.list.length - 1; i >= 0; i--) {
        const id = slot.getMediaId(slot.list[i]);
        if (id && droppedIds.has(id)) {
          slot.list.splice(i, 1);
        }
      }
    }
    return data;
  }

  // src/adapters/stream-decode.ts
  function decodeUtf8Chunks(chunks) {
    if (chunks.length === 0) return "";
    if (chunks.length === 1) {
      return new TextDecoder("utf-8", { fatal: false }).decode(chunks[0]);
    }
    let total = 0;
    for (const chunk of chunks) total += chunk.byteLength;
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: false }).decode(merged);
  }

  // src/adapters/tiktok-json.ts
  function isRecord2(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }
  function rewriteTikTokThemeCookieHeader(cookieHeader) {
    const parts = cookieHeader.split(";").map((p) => p.trim()).filter(Boolean);
    let sawTheme = false;
    let sawSource = false;
    const updated = parts.map((part) => {
      const eq = part.indexOf("=");
      const name = eq === -1 ? part : part.slice(0, eq).trim();
      if (name === "tiktok_webapp_theme") {
        sawTheme = true;
        return "tiktok_webapp_theme=light";
      }
      if (name === "tiktok_webapp_theme_source") {
        sawSource = true;
        return "tiktok_webapp_theme_source=custom";
      }
      return part;
    });
    if (!sawTheme) updated.push("tiktok_webapp_theme=light");
    if (!sawSource) updated.push("tiktok_webapp_theme_source=custom");
    return updated.join("; ");
  }
  function isTikTokProfileOrDirectRoute(urlPath, pageUrl) {
    if (urlPath.includes("/api/post/item_list")) return true;
    if (!pageUrl) return false;
    try {
      const pathname = new URL(pageUrl).pathname;
      return /(?:^|\/)@[^/]+/.test(pathname);
    } catch {
      return false;
    }
  }
  async function filterTikTokJson(data, config2, decide, urlPath = "", pageUrl = "") {
    if (!config2.enabled || !config2.tiktok.enabled) return data;
    if (!isRecord2(data) || !Array.isArray(data.itemList)) return data;
    const isProfileSurface = isTikTokProfileOrDirectRoute(urlPath, pageUrl);
    if (config2.tiktok.postOnlyMode && !isProfileSurface) {
      data.itemList = [];
      return data;
    }
    const list = data.itemList;
    const candidates = /* @__PURE__ */ new Map();
    for (let i = 0; i < list.length; i++) {
      const raw = list[i];
      if (!isRecord2(raw)) continue;
      if (raw.isAd === true || isRecord2(raw.adInfo)) {
        list.splice(i, 1);
        i--;
        continue;
      }
      const desc = typeof raw.desc === "string" ? raw.desc : "";
      if (typeof raw.desc === "string") {
        raw.desc = calmTitle(raw.desc);
      }
      if (!config2.tiktok.caliberFilter || isProfileSurface) continue;
      const id = typeof raw.id === "string" ? raw.id : "";
      if (!id) continue;
      const author = isRecord2(raw.author) ? raw.author : {};
      const stats = isRecord2(raw.stats) ? raw.stats : {};
      const video = isRecord2(raw.video) ? raw.video : {};
      const followStatus = typeof author.followStatus === "number" ? author.followStatus : 0;
      candidates.set(id, {
        platform: "tiktok",
        id,
        creatorId: typeof author.id === "string" ? author.id : void 0,
        creatorHandle: typeof author.uniqueId === "string" ? author.uniqueId : void 0,
        isFollowed: followStatus === 1 || followStatus === 2,
        surface: "reels",
        titleOrText: desc || `@${typeof author.uniqueId === "string" ? author.uniqueId : "tiktok"}`,
        durationSec: typeof video.duration === "number" ? video.duration : void 0,
        metrics: {
          likes: typeof stats.diggCount === "number" ? stats.diggCount : void 0,
          replies: typeof stats.commentCount === "number" ? stats.commentCount : void 0,
          views: typeof stats.playCount === "number" ? stats.playCount : void 0
        }
      });
    }
    if (candidates.size === 0 || !config2.tiktok.caliberFilter || isProfileSurface) return data;
    const droppedIds = await decide([...candidates.values()]);
    if (droppedIds.size === 0) return data;
    for (let i = list.length - 1; i >= 0; i--) {
      const entry = list[i];
      if (isRecord2(entry) && typeof entry.id === "string" && droppedIds.has(entry.id)) {
        list.splice(i, 1);
      }
    }
    return data;
  }

  // src/core/llm.ts
  var MAX_BATCH_SIZE = 20;
  var BACKGROUND_TIMEOUT_MS = 6e3;
  function parseDropResponse(raw, validIds) {
    const dropped = /* @__PURE__ */ new Set();
    if (!raw || typeof raw !== "string") return dropped;
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
    const candidate = (fenced?.[1] ?? raw).trim();
    const braceStart = candidate.indexOf("{");
    const braceEnd = candidate.lastIndexOf("}");
    if (braceStart === -1 || braceEnd <= braceStart) return dropped;
    try {
      const parsed = JSON.parse(candidate.slice(braceStart, braceEnd + 1));
      if (Array.isArray(parsed.drop)) {
        for (const id of parsed.drop) {
          if (typeof id === "string" && validIds.has(id)) {
            dropped.add(id);
          }
        }
      }
    } catch {
      return dropped;
    }
    return dropped;
  }
  function parseIndexedVerdicts(raw, orderedIds) {
    const validSet = new Set(orderedIds);
    const dropped = parseDropResponse(raw, validSet);
    if (dropped.size > 0) return dropped;
    if (!raw || typeof raw !== "string") return dropped;
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
    const candidate = (fenced?.[1] ?? raw).trim();
    const braceStart = candidate.indexOf("{");
    const braceEnd = candidate.lastIndexOf("}");
    if (braceStart === -1 || braceEnd <= braceStart) return dropped;
    try {
      const parsed = JSON.parse(candidate.slice(braceStart, braceEnd + 1));
      for (const [key, val] of Object.entries(parsed)) {
        if (typeof val !== "string") continue;
        const v = val.trim().toLowerCase();
        if (v !== "d" && v !== "drop") continue;
        if (/^\d+$/.test(key)) {
          const idx = Number.parseInt(key, 10);
          const mappedId = orderedIds[idx];
          if (mappedId) dropped.add(mappedId);
        } else if (validSet.has(key)) {
          dropped.add(key);
        }
      }
    } catch {
      return dropped;
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
- "k" = keep (engineering, hardware, software, science, space, design, art, photography, music, demos, links, dry humor/jokes, opinions, weird rabbit holes, or normal human updates even if only a few words long)
- "u" = unsure or neutral (kept by default when in doubt)
- "d" = confident drop (ONLY clear ragebait, public humiliation/dunk clips, political/culture-war outrage, celebrity/influencer gossip, crypto/memecoin shills, hustle-bro/DM-funnel bait, short-drama cliffhangers, or AI voiceover sleep-slop)

Return ONLY a JSON object mapping every index to "k", "u", or "d", like {"0":"k","1":"u","2":"d"}.`;
  async function gradeItemsBatch(items, config2, fetchImpl = fetch) {
    const dropped = /* @__PURE__ */ new Set();
    if (config2.grader.mode === "off" || items.length === 0) return dropped;
    if (!config2.grader.endpoint || !config2.grader.model) return dropped;
    if (config2.grader.mode === "api" && !config2.grader.apiKey.trim()) return dropped;
    const batch = items.slice(0, MAX_BATCH_SIZE);
    const orderedIds = batch.map((item) => item.id);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BACKGROUND_TIMEOUT_MS);
    const headers = {
      "Content-Type": "application/json"
    };
    if (config2.grader.mode === "api" && config2.grader.apiKey.trim()) {
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
      if (!res.ok) return dropped;
      const body = await res.json();
      const content = body.choices?.[0]?.message?.content ?? "";
      return parseIndexedVerdicts(content, orderedIds);
    } catch {
      return dropped;
    } finally {
      clearTimeout(timer);
    }
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
  function evaluateLocalTiers(item, config2, seeds2, memory2, novelty2) {
    if (item.isSponsored) return "drop";
    const keys = creatorKeysFor(item);
    if (config2.blockHandles.length > 0) {
      const blocked = new Set(config2.blockHandles.map((h) => normalizeHandle(h)).filter(Boolean));
      if (keys.some((k) => blocked.has(k))) return "drop";
    }
    if (config2.allowHandles.length > 0) {
      const allowed = new Set(config2.allowHandles.map((h) => normalizeHandle(h)).filter(Boolean));
      if (keys.some((k) => allowed.has(k))) return "keep";
    }
    if (config2.passFollowed && item.isFollowed) return "keep";
    if (item.platform === "youtube" && seeds2.hnVideos.has(item.id)) return "keep";
    if (keys.some((k) => seeds2.hnChannels.has(k))) return "keep";
    const ytIds = item.linkedYoutubeIds ?? extractYouTubeIdsFromText(item.titleOrText);
    if (ytIds.some((vid) => seeds2.hnVideos.has(vid))) return "keep";
    if (keys.some((k) => seeds2.slopChannels.has(k))) return "drop";
    const fullText = `${item.titleOrText} ${item.secondaryText ?? ""}`;
    if (COMMENT_BAIT_RE.test(fullText) || CRYPTO_CASINO_SPAM_RE.test(fullText) || SHORT_DRAMA_RE.test(fullText) || ATTENTION_TRAP_RE.test(fullText) || GOSSIP_DOMAIN_RE.test(fullText)) {
      return "drop";
    }
    if (!item.isFollowed) {
      if (item.platform === "x" && config2.x.slopCadenceFilter) {
        if (isStructuralSlop(item.titleOrText, { isReply: item.surface === "replies" }, 65)) {
          return "drop";
        }
      } else if (item.platform !== "youtube") {
        if (isStructuralSlop(item.titleOrText, { isReply: false }, 74)) {
          return "drop";
        }
      }
      if (config2.noveltyFilter && novelty2?.isRedundantRehash(item.titleOrText)) {
        return "drop";
      }
    }
    const cachedVerdict = memory2.getItemVerdict(item.platform, item.id);
    if (cachedVerdict) return cachedVerdict;
    for (const key of keys) {
      const learned = memory2.getCreatorVerdict(item.platform, key);
      if (learned) return learned;
    }
    if (item.platform === "x" && !item.isFollowed && item.metrics) {
      const likes = item.metrics.likes ?? 0;
      const replies = item.metrics.replies ?? 0;
      const quotes = item.metrics.quotes ?? 0;
      if (replies >= 40 && (replies > likes * 1.4 || quotes > likes * 1.1)) {
        return "drop";
      }
    }
    if (item.platform === "x" && item.surface === "replies" && item.isBlueReply && !item.isFollowed) {
      const trimmed = item.titleOrText.trim();
      if (trimmed.length <= 18 && !/[a-z]{4,}/i.test(trimmed)) {
        return "drop";
      }
    }
    return "uncertain";
  }
  async function runSieveOnBatch(items, config2, seeds2, memory2, fetchImpl = fetch, novelty2) {
    const droppedIds = /* @__PURE__ */ new Set();
    const uncertain = [];
    for (const item of items) {
      const localVerdict = evaluateLocalTiers(item, config2, seeds2, memory2, novelty2);
      if (localVerdict === "drop") {
        droppedIds.add(item.id);
      } else if (localVerdict === "uncertain") {
        uncertain.push(item);
      }
    }
    if (uncertain.length === 0 || config2.grader.mode === "off") {
      return droppedIds;
    }
    const holdMs = Math.max(50, config2.grader.streamHoldMs || 900);
    const gradingPromise = gradeItemsBatch(uncertain, config2, fetchImpl).then(async (llmDrops) => {
      for (const item of uncertain) {
        const verdict = llmDrops.has(item.id) ? "drop" : "keep";
        await memory2.recordVerdict(item, verdict);
      }
      return llmDrops;
    });
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
      for (const id of outcome) droppedIds.add(id);
    }
    return droppedIds;
  }

  // src/adapters/twitter-json.ts
  function isRecord3(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }
  var NOISE_ENTRY_PREFIXES = [
    "promoted-",
    "who-to-follow-",
    "upsell-",
    "RelevancePrompt-",
    "inline-prompt-"
  ];
  function isNoiseEntryId(entryId) {
    return NOISE_ENTRY_PREFIXES.some((prefix) => entryId.startsWith(prefix));
  }
  function unwrapTweet(rawResult) {
    if (!isRecord3(rawResult)) return null;
    if (rawResult.__typename === "TweetWithVisibilityResults" && isRecord3(rawResult.tweet)) {
      return rawResult.tweet;
    }
    if (typeof rawResult.rest_id === "string" || isRecord3(rawResult.legacy)) {
      return rawResult;
    }
    return null;
  }
  function readTweetBody(tweet) {
    if (isRecord3(tweet.note_tweet) && isRecord3(tweet.note_tweet.note_tweet_results) && isRecord3(tweet.note_tweet.note_tweet_results.result) && typeof tweet.note_tweet.note_tweet_results.result.text === "string") {
      return tweet.note_tweet.note_tweet_results.result.text;
    }
    if (isRecord3(tweet.legacy) && typeof tweet.legacy.full_text === "string") {
      return tweet.legacy.full_text;
    }
    return "";
  }
  function extractTweetYouTubeIds(tweet) {
    const urls = [];
    if (isRecord3(tweet.legacy)) {
      if (typeof tweet.legacy.full_text === "string") urls.push(tweet.legacy.full_text);
      if (isRecord3(tweet.legacy.entities) && Array.isArray(tweet.legacy.entities.urls)) {
        for (const u of tweet.legacy.entities.urls) {
          if (isRecord3(u) && typeof u.expanded_url === "string") {
            urls.push(u.expanded_url);
          }
        }
      }
    }
    if (isRecord3(tweet.card) && isRecord3(tweet.card.legacy) && Array.isArray(tweet.card.legacy.binding_values)) {
      for (const b of tweet.card.legacy.binding_values) {
        if (isRecord3(b) && isRecord3(b.value) && typeof b.value.string_value === "string") {
          urls.push(b.value.string_value);
        }
      }
    }
    if (isRecord3(tweet.quoted_status_result)) {
      const quoted = unwrapTweet(tweet.quoted_status_result.result);
      if (quoted) urls.push(...extractTweetYouTubeIds(quoted));
    }
    return extractYouTubeIdsFromText(urls.join(" "));
  }
  function buildTweetRichContext(tweet) {
    const parts = [];
    const legacy = isRecord3(tweet.legacy) ? tweet.legacy : {};
    const mediaHolder = isRecord3(legacy.extended_entities) ? legacy.extended_entities : isRecord3(legacy.entities) ? legacy.entities : void 0;
    if (mediaHolder && Array.isArray(mediaHolder.media) && mediaHolder.media.length > 0) {
      const types = /* @__PURE__ */ new Set();
      for (const m of mediaHolder.media) {
        if (isRecord3(m) && typeof m.type === "string") {
          types.add(m.type === "animated_gif" ? "gif" : m.type);
        }
      }
      if (types.size > 0) parts.push(`[${[...types].join("+")}]`);
    }
    if (isRecord3(legacy.entities) && Array.isArray(legacy.entities.urls)) {
      for (const u of legacy.entities.urls) {
        if (isRecord3(u) && typeof u.expanded_url === "string") {
          parts.push(`link: ${u.expanded_url.slice(0, 90)}`);
        }
      }
    }
    if (isRecord3(tweet.card) && isRecord3(tweet.card.legacy) && Array.isArray(tweet.card.legacy.binding_values)) {
      let cardTitle = "";
      let cardDomain = "";
      for (const b of tweet.card.legacy.binding_values) {
        if (!isRecord3(b) || typeof b.key !== "string" || !isRecord3(b.value)) continue;
        if (b.key === "title" && typeof b.value.string_value === "string") {
          cardTitle = b.value.string_value.trim();
        } else if (b.key === "vanity_url" && typeof b.value.string_value === "string") {
          cardDomain = b.value.string_value.trim();
        }
      }
      if (cardTitle) {
        parts.push(`card: ${cardDomain ? `${cardDomain} - ` : ""}${cardTitle}`);
      }
    }
    if (isRecord3(tweet.quoted_status_result)) {
      const quoted = unwrapTweet(tweet.quoted_status_result.result);
      if (quoted) {
        const qBody = readTweetBody(quoted).trim();
        let qAuthor = "";
        if (isRecord3(quoted.core) && isRecord3(quoted.core.user_results) && isRecord3(quoted.core.user_results.result) && isRecord3(quoted.core.user_results.result.legacy) && typeof quoted.core.user_results.result.legacy.screen_name === "string") {
          qAuthor = `@${quoted.core.user_results.result.legacy.screen_name}`;
        }
        if (qBody) {
          parts.push(`quoting ${qAuthor || "post"}: ${qBody.slice(0, 140)}`);
        }
      }
    }
    return parts.length > 0 ? parts.join(" | ") : void 0;
  }
  function polishTweetPresentation(tweet, config2, ytIds) {
    if (isRecord3(tweet.legacy) && typeof tweet.legacy.full_text === "string") {
      tweet.legacy.full_text = calmTitle(tweet.legacy.full_text);
    }
    if (isRecord3(tweet.note_tweet) && isRecord3(tweet.note_tweet.note_tweet_results) && isRecord3(tweet.note_tweet.note_tweet_results.result) && typeof tweet.note_tweet.note_tweet_results.result.text === "string") {
      tweet.note_tweet.note_tweet_results.result.text = calmTitle(
        tweet.note_tweet.note_tweet_results.result.text
      );
    }
    if (isRecord3(tweet.quoted_status_result)) {
      const quoted = unwrapTweet(tweet.quoted_status_result.result);
      if (quoted) {
        polishTweetPresentation(quoted, config2, extractTweetYouTubeIds(quoted));
      }
    }
    if (!isRecord3(tweet.card) || !isRecord3(tweet.card.legacy)) return;
    const bindings = tweet.card.legacy.binding_values;
    if (!Array.isArray(bindings)) return;
    const fallbackYtId = ytIds[0];
    let titleVal;
    let vanityEntry;
    for (const b of bindings) {
      if (!isRecord3(b) || typeof b.key !== "string" || !isRecord3(b.value)) continue;
      if (b.key === "title" && typeof b.value.string_value === "string") {
        const calmed = calmTitle(b.value.string_value.trim());
        b.value.string_value = calmed;
        titleVal = calmed;
      } else if (b.key === "vanity_url" && typeof b.value.string_value === "string") {
        vanityEntry = b.value;
      }
      if (isRecord3(b.value.image_value) && typeof b.value.image_value.url === "string") {
        const imgUrl = b.value.image_value.url;
        if (imgUrl.includes("ytimg.com/vi")) {
          b.value.image_value.url = midFrameThumbUrl(imgUrl, fallbackYtId);
        }
      }
    }
    if (config2.x.restoreHeadlines && titleVal && vanityEntry && typeof vanityEntry.string_value === "string") {
      if (!vanityEntry.string_value.includes(" \xB7 ")) {
        vanityEntry.string_value = `${vanityEntry.string_value} \xB7 ${titleVal}`;
      }
    }
  }
  function readUserFollowFlag(userContainer) {
    if (!isRecord3(userContainer)) return { following: false, isBlue: false };
    const id = typeof userContainer.rest_id === "string" ? userContainer.rest_id : void 0;
    const isBlue = userContainer.is_blue_verified === true;
    let handle;
    let following = false;
    if (isRecord3(userContainer.legacy)) {
      if (typeof userContainer.legacy.screen_name === "string") {
        handle = userContainer.legacy.screen_name;
      }
      if (userContainer.legacy.following === true) following = true;
    }
    if (isRecord3(userContainer.relationship_perspectives) && userContainer.relationship_perspectives.following === true) {
      following = true;
    }
    return { id, handle, following, isBlue };
  }
  function extractTweetItem(tweet, surface, ytIds, socialContextFollowing) {
    const id = typeof tweet.rest_id === "string" ? tweet.rest_id : "";
    if (!id) return null;
    const text = readTweetBody(tweet);
    if (!text) return null;
    const legacy = isRecord3(tweet.legacy) ? tweet.legacy : {};
    const outerAuthor = isRecord3(tweet.core) && isRecord3(tweet.core.user_results) ? readUserFollowFlag(tweet.core.user_results.result) : { following: false, isBlue: false };
    let innerFollowed = false;
    if (isRecord3(legacy.retweeted_status_result)) {
      const inner = unwrapTweet(legacy.retweeted_status_result.result);
      if (inner && isRecord3(inner.core) && isRecord3(inner.core.user_results)) {
        innerFollowed = readUserFollowFlag(inner.core.user_results.result).following;
      }
    }
    const isFollowed = outerAuthor.following || innerFollowed || socialContextFollowing;
    const secondaryText = buildTweetRichContext(tweet);
    const likes = typeof legacy.favorite_count === "number" ? legacy.favorite_count : void 0;
    const replies = typeof legacy.reply_count === "number" ? legacy.reply_count : void 0;
    const quotes = typeof legacy.quote_count === "number" ? legacy.quote_count : void 0;
    return {
      platform: "x",
      id,
      creatorId: outerAuthor.id,
      creatorHandle: outerAuthor.handle,
      isFollowed,
      isBlueReply: surface === "replies" && outerAuthor.isBlue,
      surface,
      titleOrText: text,
      ...secondaryText ? { secondaryText } : {},
      ...ytIds.length > 0 ? { linkedYoutubeIds: ytIds } : {},
      metrics: { likes, replies, quotes }
    };
  }
  async function filterTwitterJson(data, urlPath, config2, decide) {
    if (!config2.enabled || !config2.x.enabled) return data;
    if (!isRecord3(data)) return data;
    const isProfilePayload = isRecord3(data.data) && isRecord3(data.data.user);
    const isAdsOnlySurface = isProfilePayload || urlPath.includes("/HomeLatestTimeline") || urlPath.includes("/TweetDetail") || urlPath.includes("/UserTweets") || urlPath.includes("/UserMedia") || urlPath.includes("/HighlightsTweets") || urlPath.includes("/Likes");
    const surface = urlPath.includes("/SearchTimeline") ? "search" : "timeline";
    const candidates = /* @__PURE__ */ new Map();
    const entryRefs = [];
    function extractEntryId(entry) {
      const rawEntryId = typeof entry.entryId === "string" ? entry.entryId : "";
      const content = isRecord3(entry.content) ? entry.content : isRecord3(entry.item) ? entry.item : void 0;
      const itemContent = content && isRecord3(content.itemContent) ? content.itemContent : void 0;
      if (itemContent && isRecord3(itemContent.tweet_results)) {
        const tweet = unwrapTweet(itemContent.tweet_results.result);
        if (tweet && typeof tweet.rest_id === "string") return tweet.rest_id;
      }
      if (itemContent && typeof itemContent.name === "string") {
        return rawEntryId || `trend:${itemContent.name}`;
      }
      return rawEntryId;
    }
    function walkInstructions(node) {
      if (Array.isArray(node)) {
        for (const child of node) walkInstructions(child);
        return;
      }
      if (!isRecord3(node)) return;
      if (Array.isArray(node.entries)) {
        processEntriesArray(node.entries);
      }
      if (Array.isArray(node.moduleItems)) {
        processEntriesArray(node.moduleItems);
      }
      for (const val of Object.values(node)) {
        walkInstructions(val);
      }
    }
    function processEntriesArray(entries) {
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (!isRecord3(entry)) continue;
        const entryId = typeof entry.entryId === "string" ? entry.entryId : "";
        if (entryId && isNoiseEntryId(entryId)) {
          entries.splice(i, 1);
          i--;
          continue;
        }
        const content = isRecord3(entry.content) ? entry.content : isRecord3(entry.item) ? entry.item : void 0;
        const itemContent = content && isRecord3(content.itemContent) ? content.itemContent : void 0;
        if (itemContent?.promotedMetadata) {
          entries.splice(i, 1);
          i--;
          continue;
        }
        const socialCtx = (itemContent && isRecord3(itemContent.socialContext) ? itemContent.socialContext : void 0) ?? (content && isRecord3(content.clientEventInfo) ? content.clientEventInfo : void 0);
        const socialFollowing = isRecord3(socialCtx) && typeof socialCtx.contextType === "string" && socialCtx.contextType === "Follow";
        if (itemContent && isRecord3(itemContent.tweet_results)) {
          const tweet = unwrapTweet(itemContent.tweet_results.result);
          if (!tweet) continue;
          const ytIds = extractTweetYouTubeIds(tweet);
          const item = extractTweetItem(tweet, surface, ytIds, socialFollowing);
          polishTweetPresentation(tweet, config2, ytIds);
          if (item && config2.x.caliberFilter && !isAdsOnlySurface) {
            candidates.set(item.id, item);
            entryRefs.push({ list: entries, itemId: item.id });
          }
          continue;
        }
        if (itemContent && typeof itemContent.name === "string" && (itemContent.__typename === "TimelineTrend" || isRecord3(itemContent.trendMetadata) || entryId.startsWith("trend-"))) {
          const trendName = itemContent.name.trim();
          const trendMeta = isRecord3(itemContent.trendMetadata) ? itemContent.trendMetadata : {};
          const domainCtx = typeof trendMeta.domainContext === "string" ? trendMeta.domainContext : void 0;
          const metaDesc = typeof trendMeta.metaDescription === "string" ? trendMeta.metaDescription : "";
          if (/promoted/i.test(metaDesc)) {
            entries.splice(i, 1);
            i--;
            continue;
          }
          itemContent.name = calmTitle(trendName);
          if (config2.x.caliberFilter && !isAdsOnlySurface && trendName) {
            const trendId = entryId || `trend:${trendName}`;
            candidates.set(trendId, {
              platform: "x",
              id: trendId,
              surface: "search",
              titleOrText: trendName,
              secondaryText: [domainCtx, metaDesc].filter(Boolean).join(" \xB7 ") || void 0
            });
            entryRefs.push({ list: entries, itemId: trendId });
          }
        }
      }
    }
    walkInstructions(data);
    if (candidates.size === 0 || !config2.x.caliberFilter || isAdsOnlySurface) {
      return data;
    }
    const droppedIds = await decide([...candidates.values()]);
    if (droppedIds.size === 0) return data;
    const listsToPrune = /* @__PURE__ */ new Map();
    for (const ref of entryRefs) {
      if (ref.itemId && droppedIds.has(ref.itemId)) {
        let set = listsToPrune.get(ref.list);
        if (!set) {
          set = /* @__PURE__ */ new Set();
          listsToPrune.set(ref.list, set);
        }
        set.add(ref.itemId);
      }
    }
    for (const [list, ids] of listsToPrune) {
      for (let i = list.length - 1; i >= 0; i--) {
        const entry = list[i];
        if (!isRecord3(entry)) continue;
        const id = extractEntryId(entry);
        if (id && ids.has(id)) {
          list.splice(i, 1);
        }
      }
    }
    return data;
  }

  // src/core/dearrow.ts
  var DEARROW_MIRROR_BASE = "https://dearrow.minibomba.pro/sbserver/api/branding";
  var BUCKET_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
  var FETCH_TIMEOUT_MS = 2500;
  var VAGUE_TITLE_RE = /(?:\b(?:this changed everything|changes everything|why nobody|no one talks about|you won'?t believe|what happened|i tried\b|for \d+ days|the truth about|it'?s over|he'?s done|she'?s done|they'?re done|stop doing this|before it'?s too late|secret to|insane|shocking|destroyed|exposed)\b|\.\.\.\s*$|\?!|!\?)/i;
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
  function getCachedDeArrowTitle(videoId) {
    const val = titleCache.get(videoId);
    return val ?? void 0;
  }
  function clearDeArrowCache() {
    titleCache.clear();
    fetchedPrefixes.clear();
  }
  function pickBestCommunityTitle(record) {
    if (!record || !Array.isArray(record.titles)) return null;
    for (const candidate of record.titles) {
      if (!candidate || candidate.original === true) continue;
      if (candidate.locked !== true && (candidate.votes ?? -1) < 0) continue;
      const cleaned = cleanDeArrowTitle(candidate.title ?? "");
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
          fetchedPrefixes.set(prefix, now);
          for (const [vid, rec] of Object.entries(bucket)) {
            const best = pickBestCommunityTitle(rec);
            titleCache.set(vid, best);
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

  // src/adapters/youtube-json.ts
  var VIDEO_RENDERER_KEYS = [
    "videoRenderer",
    "compactVideoRenderer",
    "gridVideoRenderer",
    "videoWithContextRenderer"
  ];
  var SHORTS_KEYS = /* @__PURE__ */ new Set([
    "reelShelfRenderer",
    "reelItemRenderer",
    "shortsLockupViewModel"
  ]);
  var AD_AND_NOISE_KEYS = /* @__PURE__ */ new Set([
    "adSlotRenderer",
    "promotedSparklesWebRenderer",
    "promotedVideoRenderer",
    "miniGameCardViewModel",
    "radioRenderer",
    "compactRadioRenderer"
  ]);
  var PRUNABLE_WRAPPERS = /* @__PURE__ */ new Set([
    "richItemRenderer",
    "richShelfRenderer",
    "richSectionRenderer",
    "shelfRenderer",
    "content",
    "contents",
    "itemSectionRenderer"
  ]);
  function isRecord4(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function isYouTubeSafeRoute(pageUrl) {
    try {
      const pathname = new URL(pageUrl).pathname.replace(/\/+$/, "") || "/";
      if (pathname === "/" || pathname === "/watch" || pathname === "/results") {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }
  function isYouTubeChannelPayload(data) {
    if (!isRecord4(data)) return false;
    if (isRecord4(data.metadata) && isRecord4(data.metadata.channelMetadataRenderer)) return true;
    if (isRecord4(data.header) && (isRecord4(data.header.pageHeaderRenderer) || isRecord4(data.header.c4TabbedHeaderRenderer))) {
      return true;
    }
    return false;
  }
  function surfaceFromEndpoint(urlPath) {
    if (urlPath.includes("/search") || urlPath.includes("/results")) return "search";
    if (urlPath.includes("/next")) return "watch_next";
    return "home";
  }
  function readText(node) {
    if (!isRecord4(node)) return "";
    if (typeof node.simpleText === "string") return node.simpleText;
    if (typeof node.content === "string") return node.content;
    if (Array.isArray(node.runs)) {
      return node.runs.map((run) => isRecord4(run) && typeof run.text === "string" ? run.text : "").join("");
    }
    return "";
  }
  function rewriteText(node, transform) {
    if (!isRecord4(node)) return;
    if (typeof node.simpleText === "string") {
      node.simpleText = transform(node.simpleText);
    } else if (typeof node.content === "string") {
      node.content = transform(node.content);
    } else if (Array.isArray(node.runs) && node.runs.length === 1 && isRecord4(node.runs[0])) {
      const single = node.runs[0];
      if (typeof single.text === "string") {
        single.text = transform(single.text);
      }
    } else if (Array.isArray(node.runs) && node.runs.length > 1) {
      const full = readText(node);
      if (full) {
        node.runs = [{ text: transform(full) }];
      }
    }
  }
  function parseDurationSec(raw) {
    if (!raw) return void 0;
    const clean = raw.trim();
    if (!/^\d+(?::\d{1,2}){1,2}$/.test(clean)) return void 0;
    const parts = clean.split(":").map((n) => Number.parseInt(n, 10));
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return void 0;
  }
  function containsShortsUrl(obj) {
    if (typeof obj === "string") return obj.startsWith("/shorts/");
    if (Array.isArray(obj)) return obj.some(containsShortsUrl);
    if (isRecord4(obj)) {
      for (const [k, v] of Object.entries(obj)) {
        if (SHORTS_KEYS.has(k)) return true;
        if ((k === "url" || k === "canonicalBaseUrl") && typeof v === "string" && v.startsWith("/shorts")) {
          return true;
        }
        if (containsShortsUrl(v)) return true;
      }
    }
    return false;
  }
  function isMixLockup(lockup) {
    const raw = JSON.stringify(lockup.contentImage ?? {});
    return raw.includes('"imageName":"MIX"');
  }
  function extractFromVideoRenderer(renderer, surface) {
    const id = typeof renderer.videoId === "string" ? renderer.videoId : "";
    if (!id) return null;
    const title = readText(renderer.title) || readText(renderer.headline);
    if (!title) return null;
    const byline = renderer.shortBylineText ?? renderer.longBylineText ?? renderer.ownerText;
    const channelName = readText(byline);
    let channelId;
    if (isRecord4(byline) && Array.isArray(byline.runs)) {
      for (const run of byline.runs) {
        if (!isRecord4(run) || !isRecord4(run.navigationEndpoint)) continue;
        const browse = run.navigationEndpoint.browseEndpoint;
        if (isRecord4(browse)) {
          if (typeof browse.browseId === "string") channelId = browse.browseId;
          if (!channelId && typeof browse.canonicalBaseUrl === "string") {
            channelId = browse.canonicalBaseUrl.replace(/^\//, "");
          }
        }
      }
    }
    const lengthNode = renderer.lengthText;
    const durationSec = parseDurationSec(readText(lengthNode));
    return {
      platform: "youtube",
      id,
      creatorId: channelId,
      creatorHandle: channelName || void 0,
      surface,
      titleOrText: title,
      durationSec
    };
  }
  function findBrowseEndpoint(node) {
    if (!isRecord4(node)) return {};
    if (isRecord4(node.browseEndpoint)) {
      const be = node.browseEndpoint;
      const browseId = typeof be.browseId === "string" ? be.browseId : void 0;
      const base = typeof be.canonicalBaseUrl === "string" ? be.canonicalBaseUrl : "";
      const handle = base.startsWith("/@") ? base.slice(1) : void 0;
      if (browseId || handle) return { browseId, handle };
    }
    for (const val of Object.values(node)) {
      if (isRecord4(val) || Array.isArray(val)) {
        const hit = findBrowseEndpoint(val);
        if (hit.browseId || hit.handle) return hit;
      }
    }
    return {};
  }
  function findLockupDurationSec(contentImage) {
    if (!isRecord4(contentImage)) return void 0;
    const tvm = contentImage.thumbnailViewModel;
    if (!isRecord4(tvm) || !Array.isArray(tvm.overlays)) return void 0;
    for (const ov of tvm.overlays) {
      if (!isRecord4(ov) || !isRecord4(ov.thumbnailOverlayBadgeViewModel)) continue;
      const badges = ov.thumbnailOverlayBadgeViewModel.thumbnailBadges;
      if (!Array.isArray(badges)) continue;
      for (const b of badges) {
        if (isRecord4(b) && isRecord4(b.thumbnailBadgeViewModel) && typeof b.thumbnailBadgeViewModel.text === "string") {
          const parsed = parseDurationSec(b.thumbnailBadgeViewModel.text);
          if (parsed !== void 0) return parsed;
        }
      }
    }
    return void 0;
  }
  function extractFromLockup(lockup, surface) {
    const id = typeof lockup.contentId === "string" ? lockup.contentId : "";
    if (!id || id.length !== 11) return null;
    const meta = isRecord4(lockup.metadata) ? lockup.metadata.lockupMetadataViewModel : void 0;
    if (!isRecord4(meta)) return null;
    const title = readText(meta.title);
    if (!title) return null;
    const { browseId, handle } = findBrowseEndpoint(meta.image ?? meta.metadata);
    let channelDisplayName = "";
    const contextParts = [];
    const contentMeta = isRecord4(meta.metadata) ? meta.metadata.contentMetadataViewModel : void 0;
    if (isRecord4(contentMeta) && Array.isArray(contentMeta.metadataRows)) {
      contentMeta.metadataRows.forEach((row, rowIdx) => {
        if (!isRecord4(row) || !Array.isArray(row.metadataParts)) return;
        for (const part of row.metadataParts) {
          if (!isRecord4(part)) continue;
          const txt = readText(part.text).trim();
          if (!txt) continue;
          if (rowIdx === 0 && !channelDisplayName) channelDisplayName = txt;
          contextParts.push(txt);
        }
      });
    }
    const durationSec = findLockupDurationSec(lockup.contentImage);
    return {
      platform: "youtube",
      id,
      creatorId: browseId || (channelDisplayName ? channelDisplayName : void 0),
      creatorHandle: handle || channelDisplayName || void 0,
      surface,
      titleOrText: title,
      ...contextParts.length > 0 ? { secondaryText: contextParts.join(" \xB7 ") } : {},
      ...durationSec !== void 0 ? { durationSec } : {}
    };
  }
  function resolveBetterYouTubeTitle(rawTitle, id, config2) {
    if (config2.youtube.dearrowTitles && id && isVagueClickbaitTitle(rawTitle)) {
      const curated = getCachedDeArrowTitle(id);
      if (curated) return config2.youtube.calmTitles ? calmTitle(curated) : curated;
    }
    return config2.youtube.calmTitles ? calmTitle(rawTitle) : rawTitle;
  }
  function dehypeVideoRenderer(renderer, config2) {
    const id = typeof renderer.videoId === "string" ? renderer.videoId : void 0;
    if (config2.youtube.calmTitles || config2.youtube.dearrowTitles) {
      if (renderer.title) rewriteText(renderer.title, (t) => resolveBetterYouTubeTitle(t, id, config2));
      if (renderer.headline) rewriteText(renderer.headline, (t) => resolveBetterYouTubeTitle(t, id, config2));
    }
    if (config2.youtube.midFrameThumbs && isRecord4(renderer.thumbnail) && Array.isArray(renderer.thumbnail.thumbnails)) {
      for (const thumb of renderer.thumbnail.thumbnails) {
        if (isRecord4(thumb) && typeof thumb.url === "string") {
          thumb.url = midFrameThumbUrl(thumb.url, id);
        }
      }
    }
  }
  function dehypeLockup(lockup, config2) {
    const id = typeof lockup.contentId === "string" ? lockup.contentId : void 0;
    if ((config2.youtube.calmTitles || config2.youtube.dearrowTitles) && isRecord4(lockup.metadata)) {
      const meta = lockup.metadata.lockupMetadataViewModel;
      if (isRecord4(meta) && meta.title) {
        rewriteText(meta.title, (t) => resolveBetterYouTubeTitle(t, id, config2));
      }
    }
    if (config2.youtube.midFrameThumbs && isRecord4(lockup.contentImage)) {
      const tvm = lockup.contentImage.thumbnailViewModel;
      if (isRecord4(tvm) && isRecord4(tvm.image) && Array.isArray(tvm.image.sources)) {
        for (const src of tvm.image.sources) {
          if (isRecord4(src) && typeof src.url === "string") {
            src.url = midFrameThumbUrl(src.url, id);
          }
        }
      }
    }
  }
  async function filterYouTubeJson(data, urlPath, pageUrl, config2, decide) {
    if (!config2.enabled || !config2.youtube.enabled) return data;
    if (!isRecord4(data) && !Array.isArray(data)) return data;
    const surface = surfaceFromEndpoint(urlPath);
    const safeRoute = isYouTubeSafeRoute(pageUrl) || isYouTubeChannelPayload(data);
    const candidates = /* @__PURE__ */ new Map();
    function collectAndStripNoise(node) {
      if (Array.isArray(node)) {
        let removedAny = false;
        for (let i = 0; i < node.length; i++) {
          if (collectAndStripNoise(node[i])) {
            node.splice(i, 1);
            i--;
            removedAny = true;
          }
        }
        return removedAny && node.length === 0;
      }
      if (!isRecord4(node)) return false;
      for (const key of Object.keys(node)) {
        if (AD_AND_NOISE_KEYS.has(key)) {
          delete node[key];
          return Object.keys(node).length === 0;
        }
        if (config2.youtube.hideShorts && SHORTS_KEYS.has(key)) {
          delete node[key];
          return Object.keys(node).length === 0;
        }
        if (config2.youtube.hideShorts && key === "gridShelfViewModel" && containsShortsUrl(node[key])) {
          delete node[key];
          return Object.keys(node).length === 0;
        }
      }
      if (isRecord4(node.lockupViewModel)) {
        if (isMixLockup(node.lockupViewModel)) {
          delete node.lockupViewModel;
          return Object.keys(node).length === 0;
        }
        if (config2.youtube.hideShorts && containsShortsUrl(node.lockupViewModel)) {
          delete node.lockupViewModel;
          return Object.keys(node).length === 0;
        }
        const item = extractFromLockup(node.lockupViewModel, surface);
        if (item && !safeRoute && config2.youtube.caliberFilter) {
          candidates.set(item.id, item);
        }
      }
      for (const key of VIDEO_RENDERER_KEYS) {
        const renderer = node[key];
        if (!isRecord4(renderer)) continue;
        if (config2.youtube.hideShorts && containsShortsUrl(renderer.navigationEndpoint)) {
          delete node[key];
          return Object.keys(node).length === 0;
        }
        const item = extractFromVideoRenderer(renderer, surface);
        if (item && !safeRoute && config2.youtube.caliberFilter) {
          candidates.set(item.id, item);
        }
      }
      let lostPrimaryContent = false;
      for (const key of Object.keys(node)) {
        const childBecameEmpty = collectAndStripNoise(node[key]);
        if (childBecameEmpty && PRUNABLE_WRAPPERS.has(key)) {
          delete node[key];
          if (key === "content" || key === "contents" || key === "richShelfRenderer" || key === "richItemRenderer" || key === "shelfRenderer") {
            lostPrimaryContent = true;
          }
        }
      }
      return lostPrimaryContent || Object.keys(node).length === 0;
    }
    collectAndStripNoise(data);
    const droppedIds = candidates.size > 0 && !safeRoute && config2.youtube.caliberFilter ? await decide([...candidates.values()]) : /* @__PURE__ */ new Set();
    function applyVerdictsAndDehype(node) {
      if (Array.isArray(node)) {
        let removedAny = false;
        for (let i = node.length - 1; i >= 0; i--) {
          if (applyVerdictsAndDehype(node[i])) {
            node.splice(i, 1);
            removedAny = true;
          }
        }
        return removedAny && node.length === 0;
      }
      if (!isRecord4(node)) return false;
      if (isRecord4(node.lockupViewModel)) {
        const id = typeof node.lockupViewModel.contentId === "string" ? node.lockupViewModel.contentId : "";
        if (id && droppedIds.has(id)) {
          delete node.lockupViewModel;
          return Object.keys(node).length === 0;
        }
        dehypeLockup(node.lockupViewModel, config2);
      }
      for (const key of VIDEO_RENDERER_KEYS) {
        const renderer = node[key];
        if (!isRecord4(renderer)) continue;
        const id = typeof renderer.videoId === "string" ? renderer.videoId : "";
        if (id && droppedIds.has(id)) {
          delete node[key];
          return Object.keys(node).length === 0;
        }
        dehypeVideoRenderer(renderer, config2);
      }
      let lostPrimaryContent = false;
      for (const key of Object.keys(node)) {
        const childBecameEmpty = applyVerdictsAndDehype(node[key]);
        if (childBecameEmpty && PRUNABLE_WRAPPERS.has(key)) {
          delete node[key];
          if (key === "content" || key === "contents" || key === "richShelfRenderer" || key === "richItemRenderer" || key === "shelfRenderer") {
            lostPrimaryContent = true;
          }
        }
      }
      return lostPrimaryContent || Object.keys(node).length === 0;
    }
    applyVerdictsAndDehype(data);
    return data;
  }
  function findBalancedJsonEnd(source, openBraceIndex) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = openBraceIndex; i < source.length; i++) {
      const ch = source[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }
  async function rewriteYouTubeHtmlInitialData(html, pageUrl, config2, decide) {
    if (!config2.enabled || !config2.youtube.enabled) return html;
    const markerMatch = /(?:var\s+ytInitialData|window\["ytInitialData"\])\s*=\s*\{/.exec(html);
    if (!markerMatch) return html;
    const openBrace = markerMatch.index + markerMatch[0].length - 1;
    const closeBrace = findBalancedJsonEnd(html, openBrace);
    if (closeBrace === -1) return html;
    try {
      const parsed = JSON.parse(html.slice(openBrace, closeBrace + 1));
      const filtered = await filterYouTubeJson(parsed, "/youtubei/v1/browse", pageUrl, config2, decide);
      const safeSerialized = JSON.stringify(filtered).replace(/<\//g, "<\\/");
      return html.slice(0, openBrace) + safeSerialized + html.slice(closeBrace + 1);
    } catch {
      return html;
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

  // src/background/memory.ts
  var ITEM_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
  var CREATOR_TTL_MS = 14 * 24 * 60 * 60 * 1e3;
  var DB_NAME = "sieve_memory_v1";
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
          const rows = itemReq.result ?? [];
          for (const row of rows) {
            if (now - row.at <= ITEM_TTL_MS && items.size < maxItems) {
              items.set(row.key, row);
            }
          }
        };
        const creatorReq = tx.objectStore("creators").getAll();
        creatorReq.onsuccess = () => {
          const rows = creatorReq.result ?? [];
          for (const row of rows) {
            if (now - row.updatedAt <= CREATOR_TTL_MS) {
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
  function extractSignatureTokens(text) {
    const out = /* @__PURE__ */ new Set();
    if (!text) return out;
    const withoutUrls = text.replace(/https?:\/\/\S+/gi, " ").replace(/@[A-Za-z0-9_.-]+/g, " ").toLowerCase();
    for (const raw of withoutUrls.split(/[^a-z0-9]+/)) {
      if (raw.length < 3) continue;
      if (STOPWORDS.has(raw)) continue;
      if (/^\d+$/.test(raw) && raw.length < 2) continue;
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
          const rows = req.result ?? [];
          rows.filter((r) => now - r.at <= NOVELTY_TTL_MS && Array.isArray(r.tokens)).slice(-MAX_NOVELTY_RECORDS).forEach((r) => {
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
  var seeds = {
    hnVideos: /* @__PURE__ */ new Set(),
    hnChannels: /* @__PURE__ */ new Set(),
    slopChannels: /* @__PURE__ */ new Set()
  };
  var memory = createMemoryStore();
  var novelty = createNoveltyMemory();
  async function loadSeedSet(assetPath, target) {
    try {
      const res = await fetch(browser.runtime.getURL(assetPath));
      if (!res.ok) return;
      const text = await res.text();
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) target.add(trimmed);
      }
    } catch {
    }
  }
  async function initConfigAndSeeds() {
    try {
      const stored = await browser.storage.local.get("sieveConfig");
      const rawStored = stored.sieveConfig;
      const needsVerdictReset = rawStored && (rawStored.schemaVersion ?? 1) < 6;
      config = mergeConfig(rawStored);
      if (needsVerdictReset) {
        await memory.clear();
        await browser.storage.local.set({ sieveConfig: config });
      }
    } catch {
      config = structuredClone(DEFAULT_CONFIG);
    }
    await Promise.all([
      loadSeedSet("assets/seeds/hn-videos.txt", seeds.hnVideos),
      loadSeedSet("assets/seeds/hn-channels.txt", seeds.hnChannels),
      loadSeedSet("assets/seeds/slop-channels.txt", seeds.slopChannels)
    ]);
  }
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.sieveConfig) {
      config = mergeConfig(changes.sieveConfig.newValue);
    }
  });
  var decideBatch = async (items) => {
    const dropped = await runSieveOnBatch(items, config, seeds, memory, fetch, novelty);
    sessionFilteredCount += dropped.size;
    return dropped;
  };
  var INTERCEPT_URLS = [
    "https://www.youtube.com/",
    "https://www.youtube.com/?*",
    "https://www.youtube.com/results?*",
    "https://www.youtube.com/youtubei/v1/browse*",
    "https://www.youtube.com/youtubei/v1/next*",
    "https://www.youtube.com/youtubei/v1/search*",
    "https://m.youtube.com/youtubei/v1/browse*",
    "https://m.youtube.com/youtubei/v1/next*",
    "https://m.youtube.com/youtubei/v1/search*",
    "https://x.com/i/api/graphql/*",
    "https://twitter.com/i/api/graphql/*",
    "https://www.instagram.com/graphql/query*",
    "https://www.instagram.com/api/v1/clips/home/*",
    "https://www.instagram.com/api/v1/feed/timeline/*",
    "https://i.instagram.com/api/v1/clips/home/*",
    "https://i.instagram.com/api/v1/feed/timeline/*",
    "https://www.tiktok.com/api/recommend/item_list/*",
    "https://www.tiktok.com/api/post/item_list/*"
  ];
  var TWITTER_TIMELINE_RE = /\/i\/api\/graphql\/[^/]+\/(HomeTimeline|HomeLatestTimeline|ExplorePage|GenericTimelineById|ExploreSidebar|SearchTimeline)/;
  function shouldFilterRequest(details) {
    if (!config.enabled) return false;
    let parsed;
    try {
      parsed = new URL(details.url);
    } catch {
      return false;
    }
    const host = parsed.hostname;
    const path = parsed.pathname;
    if (host.endsWith("youtube.com")) {
      if (!config.youtube.enabled) return false;
      if (details.type === "main_frame") {
        return path === "/" || path === "/results";
      }
      return path.startsWith("/youtubei/v1/");
    }
    if (host === "x.com" || host === "twitter.com") {
      return config.x.enabled && TWITTER_TIMELINE_RE.test(path);
    }
    if (host.endsWith("instagram.com")) {
      return config.instagram.enabled && (path === "/graphql/query" || path.startsWith("/api/v1/clips/home") || path.startsWith("/api/v1/feed/timeline"));
    }
    if (host.endsWith("tiktok.com")) {
      return config.tiktok.enabled && (path.startsWith("/api/recommend/item_list") || path.startsWith("/api/post/item_list"));
    }
    return false;
  }
  function concatRawChunks(chunks) {
    let total = 0;
    for (const c of chunks) total += c.byteLength;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.byteLength;
    }
    return out;
  }
  browser.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (!shouldFilterRequest(details)) return {};
      let filter;
      try {
        filter = browser.webRequest.filterResponseData(details.requestId);
      } catch {
        return {};
      }
      const chunks = [];
      filter.ondata = (event) => {
        chunks.push(new Uint8Array(event.data));
      };
      filter.onerror = () => {
        try {
          filter.disconnect();
        } catch {
        }
      };
      filter.onstop = async () => {
        try {
          const text = decodeUtf8Chunks(chunks);
          const parsedUrl = new URL(details.url);
          const host = parsedUrl.hostname;
          const path = parsedUrl.pathname;
          const pageUrl = details.documentUrl || details.originUrl || details.url;
          if (details.type === "main_frame" && host.endsWith("youtube.com")) {
            const rewritten = await rewriteYouTubeHtmlInitialData(
              text,
              details.url,
              config,
              decideBatch
            );
            filter.write(new TextEncoder().encode(rewritten));
            filter.close();
            return;
          }
          const json = JSON.parse(text);
          let transformed = json;
          if (host.endsWith("youtube.com")) {
            transformed = await filterYouTubeJson(json, path, pageUrl, config, decideBatch);
          } else if (host === "x.com" || host === "twitter.com") {
            transformed = await filterTwitterJson(json, path, config, decideBatch);
          } else if (host.endsWith("instagram.com")) {
            transformed = await filterInstagramJson(json, path, config, decideBatch, pageUrl);
          } else if (host.endsWith("tiktok.com")) {
            transformed = await filterTikTokJson(json, config, decideBatch, path, pageUrl);
          }
          filter.write(new TextEncoder().encode(JSON.stringify(transformed)));
        } catch {
          if (chunks.length > 0) {
            filter.write(concatRawChunks(chunks));
          }
        } finally {
          try {
            filter.close();
          } catch {
          }
        }
      };
      return {};
    },
    {
      urls: INTERCEPT_URLS,
      types: ["main_frame", "xmlhttprequest"]
    },
    ["blocking"]
  );
  browser.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
      if (!details.originUrl?.startsWith("moz-extension://") || !details.requestHeaders) {
        return {};
      }
      const requestHeaders = details.requestHeaders.filter(
        (h) => h.name.toLowerCase() !== "origin"
      );
      return { requestHeaders };
    },
    { urls: ["http://127.0.0.1/*", "http://localhost/*"] },
    ["blocking", "requestHeaders"]
  );
  browser.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
      if (!config.enabled || !config.tiktok.enabled || !config.tiktok.lightMode) return {};
      if (!details.requestHeaders) return {};
      let foundCookie = false;
      const requestHeaders = details.requestHeaders.map((header) => {
        if (header.name.toLowerCase() === "cookie" && typeof header.value === "string") {
          foundCookie = true;
          return { ...header, value: rewriteTikTokThemeCookieHeader(header.value) };
        }
        return header;
      });
      if (!foundCookie) {
        requestHeaders.push({
          name: "Cookie",
          value: "tiktok_webapp_theme=light; tiktok_webapp_theme_source=custom"
        });
      }
      return { requestHeaders };
    },
    { urls: ["*://*.tiktok.com/*", "*://tiktok.com/*"] },
    ["blocking", "requestHeaders"]
  );
  browser.runtime.onMessage.addListener((raw) => {
    const msg = raw && typeof raw === "object" ? raw : {};
    if (msg.type === "GET_STATUS") {
      const stats = memory.counts();
      return Promise.resolve({
        sessionFilteredCount,
        cachedItems: stats.cachedItems,
        learnedCreators: stats.learnedCreators,
        dwelledCount: novelty.size(),
        hnVideos: seeds.hnVideos.size,
        slopChannels: seeds.slopChannels.size
      });
    }
    if (msg.type === "CLEAR_CACHE") {
      sessionFilteredCount = 0;
      novelty.clear();
      clearDeArrowCache();
      return memory.clear().then(() => ({ ok: true }));
    }
    if (msg.type === "RECORD_DWELL" && typeof msg.text === "string") {
      if (config.enabled && config.noveltyFilter) {
        novelty.recordDwelled(msg.text);
      }
      return Promise.resolve({ ok: true });
    }
    if (msg.type === "RESOLVE_DEARROW_TITLES" && Array.isArray(msg.videoIds)) {
      if (!config.enabled || !config.youtube.enabled || !config.youtube.dearrowTitles) {
        return Promise.resolve({ titles: {} });
      }
      return lookupDeArrowTitles(msg.videoIds).then((map) => ({
        titles: Object.fromEntries(map)
      }));
    }
    if (msg.type === "EVALUATE_SSR_ITEMS" && Array.isArray(msg.items)) {
      return decideBatch(msg.items).then((dropped) => ({ dropped: [...dropped] }));
    }
    if (msg.type === "TEST_GRADER") {
      const testConfig = msg.graderOverride ? { ...config, grader: msg.graderOverride } : config;
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
      return gradeItemsBatch(probe, testConfig).then((drops) => ({
        ok: true,
        ms: Date.now() - started,
        droppedProbeSlop: drops.has("probe_slop")
      })).catch((err) => ({
        ok: false,
        ms: Date.now() - started,
        error: err instanceof Error ? err.message : "Request failed"
      }));
    }
    return void 0;
  });
  void initConfigAndSeeds();
})();
