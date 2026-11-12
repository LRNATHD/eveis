"use strict";
(() => {
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
  var API_DEFAULT_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  var API_DEFAULT_MODEL = "gemini-2.5-flash";
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

  // src/ui/options.ts
  function parseLines(raw) {
    return raw.split("\n").map((line) => line.trim()).filter(Boolean);
  }
  async function initOptions() {
    const stored = await browser.storage.local.get("sieveConfig");
    const config = mergeConfig(stored.sieveConfig);
    const passFollowedEl = document.getElementById("pass-followed");
    const noveltyFilterEl = document.getElementById("novelty-filter");
    const modeEl = document.getElementById("grader-mode");
    const holdEl = document.getElementById("grader-hold");
    const endpointEl = document.getElementById("grader-endpoint");
    const modelEl = document.getElementById("grader-model");
    const keyEl = document.getElementById("grader-key");
    const rubricEl = document.getElementById("grader-rubric");
    const allowEl = document.getElementById("allow-handles");
    const blockEl = document.getElementById("block-handles");
    const saveIndicator = document.getElementById("save-indicator");
    const testBtn = document.getElementById("test-grader");
    const testResult = document.getElementById("test-result");
    const statsEl = document.getElementById("memory-stats");
    function populateFields() {
      passFollowedEl.checked = config.passFollowed;
      noveltyFilterEl.checked = config.noveltyFilter;
      modeEl.value = config.grader.mode;
      holdEl.value = String(config.grader.streamHoldMs);
      endpointEl.value = config.grader.endpoint;
      modelEl.value = config.grader.model;
      keyEl.value = config.grader.apiKey;
      rubricEl.value = config.grader.rubric;
      allowEl.value = config.allowHandles.join("\n");
      blockEl.value = config.blockHandles.join("\n");
    }
    let saveTimer;
    function scheduleSave() {
      if (saveIndicator) saveIndicator.textContent = "saving...";
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        config.passFollowed = passFollowedEl.checked;
        config.noveltyFilter = noveltyFilterEl.checked;
        config.grader.mode = modeEl.value;
        config.grader.streamHoldMs = Math.max(100, Number.parseInt(holdEl.value, 10) || 650);
        config.grader.endpoint = endpointEl.value.trim();
        config.grader.model = modelEl.value.trim();
        config.grader.apiKey = keyEl.value.trim();
        config.grader.rubric = rubricEl.value;
        config.allowHandles = parseLines(allowEl.value);
        config.blockHandles = parseLines(blockEl.value);
        void browser.storage.local.set({ sieveConfig: config }).then(() => {
          if (saveIndicator) saveIndicator.textContent = "saved locally";
        });
      }, 180);
    }
    modeEl.addEventListener("change", () => {
      const nextMode = modeEl.value;
      if (nextMode === "local" && endpointEl.value === API_DEFAULT_ENDPOINT) {
        endpointEl.value = LOCAL_DEFAULT_ENDPOINT;
        modelEl.value = LOCAL_DEFAULT_MODEL;
      } else if (nextMode === "api" && endpointEl.value === LOCAL_DEFAULT_ENDPOINT) {
        endpointEl.value = API_DEFAULT_ENDPOINT;
        modelEl.value = API_DEFAULT_MODEL;
      }
      scheduleSave();
    });
    for (const el of [
      passFollowedEl,
      noveltyFilterEl,
      holdEl,
      endpointEl,
      modelEl,
      keyEl,
      rubricEl,
      allowEl,
      blockEl
    ]) {
      el.addEventListener("input", scheduleSave);
      el.addEventListener("change", scheduleSave);
    }
    document.getElementById("reset-rubric")?.addEventListener("click", () => {
      rubricEl.value = DEFAULT_RUBRIC;
      scheduleSave();
    });
    testBtn.addEventListener("click", async () => {
      testBtn.disabled = true;
      if (testResult) testResult.textContent = "testing...";
      try {
        const res = await browser.runtime.sendMessage({
          type: "TEST_GRADER",
          graderOverride: {
            mode: modeEl.value,
            endpoint: endpointEl.value.trim(),
            model: modelEl.value.trim(),
            apiKey: keyEl.value.trim(),
            rubric: rubricEl.value,
            streamHoldMs: Number.parseInt(holdEl.value, 10) || 650
          }
        });
        if (testResult) {
          if (!res.ok) {
            testResult.textContent = `failed: ${res.error ?? "unreachable"}`;
          } else {
            testResult.textContent = `ok \xB7 ${res.ms ?? 0}ms \xB7 slop probe ${res.droppedProbeSlop ? "dropped" : "kept"}`;
          }
        }
      } catch {
        if (testResult) testResult.textContent = "connection failed";
      } finally {
        testBtn.disabled = false;
      }
    });
    async function refreshStats() {
      if (!statsEl) return;
      try {
        const s = await browser.runtime.sendMessage({ type: "GET_STATUS" });
        statsEl.textContent = `${(s.hnVideos ?? 0).toLocaleString()} hn videos \xB7 ${(s.slopChannels ?? 0).toLocaleString()} slop channels \xB7 ${s.cachedItems ?? 0} cached \xB7 ${s.learnedCreators ?? 0} creators \xB7 ${s.dwelledCount ?? 0} dwelled`;
      } catch {
        statsEl.textContent = "stats unavailable";
      }
    }
    document.getElementById("clear-cache")?.addEventListener("click", async () => {
      await browser.runtime.sendMessage({ type: "CLEAR_CACHE" });
      await refreshStats();
    });
    populateFields();
    await refreshStats();
  }
  void initOptions();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    document.documentElement.classList.add("theme-switching");
    void document.documentElement.offsetHeight;
    requestAnimationFrame(() => {
      document.documentElement.classList.remove("theme-switching");
    });
  });
})();
