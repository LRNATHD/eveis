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
  async function initPopup() {
    const stored = await browser.storage.local.get("sieveConfig");
    const config = mergeConfig(stored.sieveConfig);
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const detected = detectPlatformFromUrl(tabs[0]?.url);
    const siteLabel = document.getElementById("active-site");
    const masterInput = document.getElementById("master-enabled");
    const primaryMount = document.getElementById("primary-mount");
    const secondaryMount = document.getElementById("secondary-mount");
    const detailsEl = document.getElementById("other-platforms");
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
      const sitesCard = document.createElement("section");
      sitesCard.className = `card${!config.enabled ? " is-off" : ""}`;
      const sitesHead = document.createElement("div");
      sitesHead.className = "card-head";
      const sitesTitle = document.createElement("span");
      sitesTitle.className = "card-title";
      sitesTitle.textContent = "active platforms";
      sitesHead.appendChild(sitesTitle);
      sitesCard.appendChild(sitesHead);
      const sitesBody = document.createElement("div");
      sitesBody.className = "card-body";
      for (const p of PLATFORM_CARDS) {
        sitesBody.appendChild(
          renderSwitchRow(
            {
              label: p.title,
              get: p.enabledGet,
              set: p.enabledSet
            },
            config,
            saveAndRerender
          )
        );
      }
      sitesCard.appendChild(sitesBody);
      mount.appendChild(sitesCard);
      const uniCard = document.createElement("section");
      uniCard.className = `card${!config.enabled ? " is-off" : ""}`;
      const uniHead = document.createElement("div");
      uniHead.className = "card-head";
      const uniTitle = document.createElement("span");
      uniTitle.className = "card-title";
      uniTitle.textContent = "universal";
      uniHead.appendChild(uniTitle);
      uniCard.appendChild(uniHead);
      const uniBody = document.createElement("div");
      uniBody.className = "card-body";
      for (const sw of UNIVERSAL_SWITCHES) {
        uniBody.appendChild(renderSwitchRow(sw, config, saveAndRerender));
      }
      uniCard.appendChild(uniBody);
      mount.appendChild(uniCard);
    }
    function renderActivePlatformView(primarySpec, mount, otherMount) {
      const card = document.createElement("section");
      card.className = `card${!config.enabled || !primarySpec.enabledGet(config) ? " is-off" : ""}`;
      const head = document.createElement("div");
      head.className = "card-head";
      const title = document.createElement("span");
      title.className = "card-title";
      title.textContent = primarySpec.title;
      const siteSwitch = makeSwitchInput(primarySpec.enabledGet(config), (val) => {
        primarySpec.enabledSet(config, val);
        void saveAndRerender();
      });
      head.appendChild(title);
      head.appendChild(siteSwitch);
      const body = document.createElement("div");
      body.className = "card-body";
      for (const sw of primarySpec.switches) {
        body.appendChild(renderSwitchRow(sw, config, saveAndRerender));
      }
      card.appendChild(head);
      card.appendChild(body);
      mount.appendChild(card);
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
      cachedCount = status.sessionFilteredCount ?? 0;
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
    void initPopup();
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      document.documentElement.classList.add("theme-switching");
      void document.documentElement.offsetHeight;
      requestAnimationFrame(() => {
        document.documentElement.classList.remove("theme-switching");
      });
    });
  }
})();
