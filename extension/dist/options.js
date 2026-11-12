"use strict";
(() => {
  // src/types.ts
  function isRecord(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
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
  var API_DEFAULT_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  var API_DEFAULT_MODEL = "gemini-2.5-flash";
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

  // src/ui/options.ts
  function parseLines(raw) {
    return raw.split("\n").map((line) => line.trim()).filter(Boolean);
  }
  function parseGraderMode(val) {
    return val === "off" || val === "local" || val === "api" ? val : DEFAULT_CONFIG.grader.mode;
  }
  function requireElement(id, ctor) {
    const el = document.getElementById(id);
    if (!(el instanceof ctor)) {
      throw new Error(`Missing element #${id}`);
    }
    return el;
  }
  async function initOptions() {
    const stored = await browser.storage.local.get("sieveConfig");
    const config = mergeConfig(stored.sieveConfig);
    const passFollowedEl = requireElement("pass-followed", HTMLInputElement);
    const noveltyFilterEl = requireElement("novelty-filter", HTMLInputElement);
    const modeEl = requireElement("grader-mode", HTMLSelectElement);
    const holdEl = requireElement("grader-hold", HTMLInputElement);
    const endpointEl = requireElement("grader-endpoint", HTMLInputElement);
    const modelEl = requireElement("grader-model", HTMLInputElement);
    const keyEl = requireElement("grader-key", HTMLInputElement);
    const rubricEl = requireElement("grader-rubric", HTMLTextAreaElement);
    const allowEl = requireElement("allow-handles", HTMLTextAreaElement);
    const blockEl = requireElement("block-handles", HTMLTextAreaElement);
    const testBtn = requireElement("test-grader", HTMLButtonElement);
    const saveIndicator = document.getElementById("save-indicator");
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
        config.grader.mode = parseGraderMode(modeEl.value);
        config.grader.streamHoldMs = Math.max(
          100,
          Number.parseInt(holdEl.value, 10) || DEFAULT_CONFIG.grader.streamHoldMs
        );
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
      const nextMode = parseGraderMode(modeEl.value);
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
            mode: parseGraderMode(modeEl.value),
            endpoint: endpointEl.value.trim(),
            model: modelEl.value.trim(),
            apiKey: keyEl.value.trim(),
            rubric: rubricEl.value,
            streamHoldMs: Number.parseInt(holdEl.value, 10) || DEFAULT_CONFIG.grader.streamHoldMs
          }
        });
        if (testResult && isRecord(res)) {
          if (res.ok !== true) {
            const msg = typeof res.error === "string" ? res.error : "unreachable";
            testResult.textContent = `failed: ${msg}`;
          } else {
            const ms = typeof res.ms === "number" ? res.ms : 0;
            testResult.textContent = `ok \xB7 ${ms}ms \xB7 slop probe ${res.droppedProbeSlop ? "dropped" : "kept"}`;
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
        if (!isRecord(s)) return;
        const hnVideos = typeof s.hnVideos === "number" ? s.hnVideos : 0;
        const slopChannels = typeof s.slopChannels === "number" ? s.slopChannels : 0;
        const cachedItems = typeof s.cachedItems === "number" ? s.cachedItems : 0;
        const learnedCreators = typeof s.learnedCreators === "number" ? s.learnedCreators : 0;
        const dwelledCount = typeof s.dwelledCount === "number" ? s.dwelledCount : 0;
        statsEl.textContent = `${hnVideos.toLocaleString()} hn videos \xB7 ${slopChannels.toLocaleString()} slop channels \xB7 ${cachedItems} cached \xB7 ${learnedCreators} creators \xB7 ${dwelledCount} dwelled`;
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
