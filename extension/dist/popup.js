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

  // src/ui/popup.ts
  var UNIVERSAL_SWITCHES = [
    {
      label: "pass followed creators",
      get: (c) => c.passFollowed,
      set: (c, v) => {
        c.passFollowed = v;
      }
    },
    {
      label: "dwell novelty memory (48h)",
      get: (c) => c.noveltyFilter,
      set: (c, v) => {
        c.noveltyFilter = v;
      }
    },
    {
      label: "tier 2 local / api grader",
      get: (c) => c.grader.mode !== "off",
      set: (c, v) => {
        c.grader.mode = v ? c.grader.apiKey ? "api" : "local" : "off";
      }
    }
  ];
  var PLATFORM_CARDS = [
    {
      id: "youtube",
      title: "youtube",
      enabledGet: (c) => c.youtube.enabled,
      enabledSet: (c, v) => {
        c.youtube.enabled = v;
      },
      switches: [
        {
          label: "caliber filter",
          get: (c) => c.youtube.caliberFilter,
          set: (c, v) => {
            c.youtube.caliberFilter = v;
          }
        },
        {
          label: "block shorts",
          get: (c) => c.youtube.hideShorts,
          set: (c, v) => {
            c.youtube.hideShorts = v;
          }
        },
        {
          label: "clean header & chips",
          get: (c) => c.youtube.cleanHeader,
          set: (c, v) => {
            c.youtube.cleanHeader = v;
          }
        },
        {
          label: "mid-frame thumbnails",
          get: (c) => c.youtube.midFrameThumbs,
          set: (c, v) => {
            c.youtube.midFrameThumbs = v;
          }
        },
        {
          label: "calm all-caps titles",
          get: (c) => c.youtube.calmTitles,
          set: (c, v) => {
            c.youtube.calmTitles = v;
          }
        },
        {
          label: "curated non-vague titles",
          get: (c) => c.youtube.dearrowTitles,
          set: (c, v) => {
            c.youtube.dearrowTitles = v;
          }
        }
      ]
    },
    {
      id: "x",
      title: "twitter / x",
      enabledGet: (c) => c.x.enabled,
      enabledSet: (c, v) => {
        c.x.enabled = v;
      },
      switches: [
        {
          label: "caliber filter",
          get: (c) => c.x.caliberFilter,
          set: (c, v) => {
            c.x.caliberFilter = v;
          }
        },
        {
          label: "llm cadence filter",
          get: (c) => c.x.slopCadenceFilter,
          set: (c, v) => {
            c.x.slopCadenceFilter = v;
          }
        },
        {
          label: "classic twitter bird",
          get: (c) => c.x.classicBird,
          set: (c, v) => {
            c.x.classicBird = v;
          }
        },
        {
          label: "clean right sidebar",
          get: (c) => c.x.cleanSidebar,
          set: (c, v) => {
            c.x.cleanSidebar = v;
          }
        },
        {
          label: "clean left navigation",
          get: (c) => c.x.cleanNav,
          set: (c, v) => {
            c.x.cleanNav = v;
          }
        },
        {
          label: "restore link headlines",
          get: (c) => c.x.restoreHeadlines,
          set: (c, v) => {
            c.x.restoreHeadlines = v;
          }
        }
      ]
    },
    {
      id: "instagram",
      title: "instagram",
      enabledGet: (c) => c.instagram.enabled,
      enabledSet: (c, v) => {
        c.instagram.enabled = v;
      },
      switches: [
        {
          label: "filter home feed",
          get: (c) => c.instagram.caliberFilter,
          set: (c, v) => {
            c.instagram.caliberFilter = v;
          }
        },
        {
          label: "filter reels for craft",
          get: (c) => c.instagram.filterReels,
          set: (c, v) => {
            c.instagram.filterReels = v;
          }
        },
        {
          label: "hide right rail & clutter",
          get: (c) => c.instagram.hideClutter,
          set: (c, v) => {
            c.instagram.hideClutter = v;
          }
        }
      ]
    },
    {
      id: "tiktok",
      title: "tiktok",
      enabledGet: (c) => c.tiktok.enabled,
      enabledSet: (c, v) => {
        c.tiktok.enabled = v;
      },
      switches: [
        {
          label: "caliber filter",
          get: (c) => c.tiktok.caliberFilter,
          set: (c, v) => {
            c.tiktok.caliberFilter = v;
          }
        },
        {
          label: "clean sidebar & buttons",
          get: (c) => c.tiktok.cleanChrome,
          set: (c, v) => {
            c.tiktok.cleanChrome = v;
          }
        },
        {
          label: "force light mode",
          get: (c) => c.tiktok.lightMode,
          set: (c, v) => {
            c.tiktok.lightMode = v;
          }
        },
        {
          label: "post-only mode (hide feed)",
          get: (c) => c.tiktok.postOnlyMode,
          set: (c, v) => {
            c.tiktok.postOnlyMode = v;
          }
        }
      ]
    }
  ];
  function detectPlatformFromUrl(url) {
    if (!url) return null;
    try {
      const host = new URL(url).hostname;
      if (host.endsWith("youtube.com")) return "youtube";
      if (host === "x.com" || host.endsWith(".x.com") || host.endsWith("twitter.com")) return "x";
      if (host.endsWith("instagram.com")) return "instagram";
      if (host.endsWith("tiktok.com")) return "tiktok";
    } catch {
      return null;
    }
    return null;
  }
  function makeSwitchInput(checked, onChange) {
    const wrap = document.createElement("label");
    wrap.className = "switch";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    const track = document.createElement("span");
    track.className = "switch-track";
    const thumb = document.createElement("span");
    thumb.className = "switch-thumb";
    track.appendChild(thumb);
    wrap.appendChild(input);
    wrap.appendChild(track);
    return wrap;
  }
  function renderSwitchRow(spec, config, save) {
    const row = document.createElement("label");
    row.className = "row";
    const text = document.createElement("span");
    text.className = "row-label";
    text.textContent = spec.label;
    const toggle = makeSwitchInput(spec.get(config), (val) => {
      spec.set(config, val);
      void save();
    });
    row.appendChild(text);
    row.appendChild(toggle);
    return row;
  }
  function renderCard(titleText, isOff, switches, config, save, headerAction) {
    const card = document.createElement("section");
    card.className = `card${isOff ? " is-off" : ""}`;
    const head = document.createElement("div");
    head.className = "card-head";
    const title = document.createElement("span");
    title.className = "card-title";
    title.textContent = titleText;
    head.appendChild(title);
    if (headerAction) head.appendChild(headerAction);
    card.appendChild(head);
    const body = document.createElement("div");
    body.className = "card-body";
    for (const sw of switches) {
      body.appendChild(renderSwitchRow(sw, config, save));
    }
    card.appendChild(body);
    return card;
  }
  async function initPopup() {
    const stored = await browser.storage.local.get("sieveConfig");
    const config = mergeConfig(stored.sieveConfig);
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const detected = detectPlatformFromUrl(tabs[0]?.url);
    const siteLabel = document.getElementById("active-site");
    const rawMaster = document.getElementById("master-enabled");
    const masterInput = rawMaster instanceof HTMLInputElement ? rawMaster : null;
    const primaryMount = document.getElementById("primary-mount");
    const secondaryMount = document.getElementById("secondary-mount");
    const rawDetails = document.getElementById("other-platforms");
    const detailsEl = rawDetails instanceof HTMLDetailsElement ? rawDetails : null;
    const indicatorEl = document.getElementById("other-indicator");
    if (siteLabel) {
      const matchedCard = PLATFORM_CARDS.find((p) => p.id === detected);
      siteLabel.textContent = matchedCard ? matchedCard.title : "all sites";
    }
    const saveAndRerender = async () => {
      await browser.storage.local.set({ sieveConfig: config });
      renderAll();
      updateStatusMode();
    };
    if (masterInput) {
      masterInput.checked = config.enabled;
      masterInput.addEventListener("change", () => {
        config.enabled = masterInput.checked;
        void saveAndRerender();
      });
    }
    if (detailsEl && indicatorEl) {
      detailsEl.addEventListener("toggle", () => {
        indicatorEl.textContent = detailsEl.open ? "-" : "+";
      });
    }
    function renderUniversalAndSitesGeneralView(mount) {
      const platformSwitches = PLATFORM_CARDS.map((p) => ({
        label: p.title,
        get: p.enabledGet,
        set: p.enabledSet
      }));
      mount.appendChild(
        renderCard("active platforms", !config.enabled, platformSwitches, config, saveAndRerender)
      );
      mount.appendChild(
        renderCard("universal", !config.enabled, UNIVERSAL_SWITCHES, config, saveAndRerender)
      );
    }
    function renderActivePlatformView(primarySpec, mount, otherMount) {
      const siteSwitch = makeSwitchInput(primarySpec.enabledGet(config), (val) => {
        primarySpec.enabledSet(config, val);
        void saveAndRerender();
      });
      mount.appendChild(
        renderCard(
          primarySpec.title,
          !config.enabled || !primarySpec.enabledGet(config),
          primarySpec.switches,
          config,
          saveAndRerender,
          siteSwitch
        )
      );
      const uniGroup = document.createElement("div");
      uniGroup.className = "sub-group";
      const uniTitle = document.createElement("div");
      uniTitle.className = "sub-title";
      uniTitle.textContent = "universal";
      uniGroup.appendChild(uniTitle);
      for (const sw of UNIVERSAL_SWITCHES) {
        uniGroup.appendChild(renderSwitchRow(sw, config, saveAndRerender));
      }
      otherMount.appendChild(uniGroup);
      for (const other of PLATFORM_CARDS.filter((p) => p.id !== primarySpec.id)) {
        const group = document.createElement("div");
        group.className = "sub-group";
        group.appendChild(
          renderSwitchRow(
            {
              label: other.title,
              get: other.enabledGet,
              set: other.enabledSet
            },
            config,
            saveAndRerender
          )
        );
        otherMount.appendChild(group);
      }
    }
    function renderAll() {
      if (!primaryMount || !secondaryMount) return;
      primaryMount.replaceChildren();
      secondaryMount.replaceChildren();
      const activeSpec = detected ? PLATFORM_CARDS.find((p) => p.id === detected) : void 0;
      if (!activeSpec) {
        if (detailsEl) detailsEl.hidden = true;
        renderUniversalAndSitesGeneralView(primaryMount);
      } else {
        if (detailsEl) detailsEl.hidden = false;
        renderActivePlatformView(activeSpec, primaryMount, secondaryMount);
      }
    }
    let cachedCount = 0;
    const statusLine = document.getElementById("status-line");
    function updateStatusMode() {
      if (!statusLine) return;
      const modeLabel = config.grader.mode === "off" ? "sets only" : config.grader.mode === "local" ? "local" : "api";
      statusLine.textContent = `${cachedCount} filtered \xB7 ${modeLabel}`;
    }
    renderAll();
    try {
      const status = await browser.runtime.sendMessage({ type: "GET_STATUS" });
      if (isRecord(status) && typeof status.sessionFilteredCount === "number") {
        cachedCount = status.sessionFilteredCount;
      }
      updateStatusMode();
    } catch {
      if (statusLine) statusLine.textContent = DEFAULT_CONFIG.grader.mode;
    }
    document.getElementById("open-options")?.addEventListener("click", () => {
      void browser.runtime.openOptionsPage();
      window.close();
    });
  }
  if (typeof browser !== "undefined" && browser.storage) {
    void initOptionsThemeGuard();
    void initPopup();
  }
  function initOptionsThemeGuard() {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      document.documentElement.classList.add("theme-switching");
      void document.documentElement.offsetHeight;
      requestAnimationFrame(() => {
        document.documentElement.classList.remove("theme-switching");
      });
    });
  }
})();
