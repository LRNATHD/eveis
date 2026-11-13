import { ext, hasExtStorage } from "../browser-api.js";
import { DEFAULT_CONFIG, mergeConfig } from "../defaults.js";
import { isRecord, type Platform, type SieveConfig } from "../types.js";

interface SwitchSpec {
  label: string;
  get: (c: SieveConfig) => boolean;
  set: (c: SieveConfig, val: boolean) => void;
}

interface PlatformCardSpec {
  id: Platform;
  title: string;
  enabledGet: (c: SieveConfig) => boolean;
  enabledSet: (c: SieveConfig, val: boolean) => void;
  switches: SwitchSpec[];
}

const UNIVERSAL_SWITCHES: SwitchSpec[] = [
  {
    label: "pass followed creators",
    get: (c) => c.passFollowed,
    set: (c, v) => {
      c.passFollowed = v;
    },
  },
  {
    label: "echo chamber memory (48h)",
    get: (c) => c.noveltyFilter,
    set: (c, v) => {
      c.noveltyFilter = v;
    },
  },
  {
    label: "tier 2 slop maximizer",
    get: (c) => c.grader.mode !== "off",
    set: (c, v) => {
      c.grader.mode = v ? (c.grader.apiKey ? "api" : "local") : "off";
    },
  },
];

const PLATFORM_CARDS: PlatformCardSpec[] = [
  {
    id: "youtube",
    title: "youtube",
    enabledGet: (c) => c.youtube.enabled,
    enabledSet: (c, v) => {
      c.youtube.enabled = v;
    },
    switches: [
      {
        label: "brainrot slop booster",
        get: (c) => c.youtube.caliberFilter,
        set: (c, v) => {
          c.youtube.caliberFilter = v;
        },
      },
      {
        label: "shorts-only home & watch",
        get: (c) => c.youtube.hideShorts,
        set: (c, v) => {
          c.youtube.hideShorts = v;
        },
      },
      {
        label: "bloat header & AI chips",
        get: (c) => c.youtube.cleanHeader,
        set: (c, v) => {
          c.youtube.cleanHeader = v;
        },
      },
      {
        label: "clickbait thumbnails",
        get: (c) => c.youtube.midFrameThumbs,
        set: (c, v) => {
          c.youtube.midFrameThumbs = v;
        },
      },
      {
        label: "ALL-CAPS hype titles",
        get: (c) => c.youtube.calmTitles,
        set: (c, v) => {
          c.youtube.calmTitles = v;
        },
      },
      {
        label: "maximize vague clickbait",
        get: (c) => c.youtube.dearrowTitles,
        set: (c, v) => {
          c.youtube.dearrowTitles = v;
        },
      },
    ],
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
        label: "ragebait only (reply/like ratio)",
        get: (c) => c.x.caliberFilter,
        set: (c, v) => {
          c.x.caliberFilter = v;
        },
      },
      {
        label: "boost llm slop cadence",
        get: (c) => c.x.slopCadenceFilter,
        set: (c, v) => {
          c.x.slopCadenceFilter = v;
        },
      },
      {
        label: "evil crimson X branding",
        get: (c) => c.x.classicBird,
        set: (c, v) => {
          c.x.classicBird = v;
        },
      },
      {
        label: "bloat right sidebar",
        get: (c) => c.x.cleanSidebar,
        set: (c, v) => {
          c.x.cleanSidebar = v;
        },
      },
      {
        label: "highlight premium & grok",
        get: (c) => c.x.cleanNav,
        set: (c, v) => {
          c.x.cleanNav = v;
        },
      },
      {
        label: "ALL-CAPS hype tweets",
        get: (c) => c.x.restoreHeadlines,
        set: (c, v) => {
          c.x.restoreHeadlines = v;
        },
      },
    ],
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
        label: "boost slop & ads",
        get: (c) => c.instagram.caliberFilter,
        set: (c, v) => {
          c.instagram.caliberFilter = v;
        },
      },
      {
        label: "reels-only locked at 4x",
        get: (c) => c.instagram.filterReels,
        set: (c, v) => {
          c.instagram.filterReels = v;
        },
      },
      {
        label: "max UI clutter & bloat",
        get: (c) => c.instagram.hideClutter,
        set: (c, v) => {
          c.instagram.hideClutter = v;
        },
      },
    ],
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
        label: "reddit ai stories only",
        get: (c) => c.tiktok.caliberFilter,
        set: (c, v) => {
          c.tiktok.caliberFilter = v;
        },
      },
      {
        label: "highlight live, shop & coins",
        get: (c) => c.tiktok.cleanChrome,
        set: (c, v) => {
          c.tiktok.cleanChrome = v;
        },
      },
      {
        label: "force evil dark mode",
        get: (c) => c.tiktok.lightMode,
        set: (c, v) => {
          c.tiktok.lightMode = v;
        },
      },
      {
        label: "infinite scroll lock-in",
        get: (c) => c.tiktok.postOnlyMode,
        set: (c, v) => {
          c.tiktok.postOnlyMode = v;
        },
      },
    ],
  },
];

export function detectPlatformFromUrl(url?: string): Platform | null {
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

function makeSwitchInput(checked: boolean, onChange: (val: boolean) => void): HTMLLabelElement {
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

function renderSwitchRow(
  spec: SwitchSpec,
  config: SieveConfig,
  save: () => Promise<void>,
): HTMLElement {
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

function renderCard(
  titleText: string,
  isOff: boolean,
  switches: SwitchSpec[],
  config: SieveConfig,
  save: () => Promise<void>,
  headerAction?: HTMLElement,
): HTMLElement {
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

async function initPopup(): Promise<void> {
  const stored = await ext.storageGet("sieveConfig");
  const config = mergeConfig(stored.sieveConfig);

  const tabUrl = await ext.queryActiveTabUrl();
  const detected = detectPlatformFromUrl(tabUrl);

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
    await ext.storageSet({ sieveConfig: config });
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

  function renderUniversalAndSitesGeneralView(mount: HTMLElement): void {
    const platformSwitches: SwitchSpec[] = PLATFORM_CARDS.map((p) => ({
      label: p.title,
      get: p.enabledGet,
      set: p.enabledSet,
    }));
    mount.appendChild(
      renderCard("active platforms", !config.enabled, platformSwitches, config, saveAndRerender),
    );
    mount.appendChild(
      renderCard("universal", !config.enabled, UNIVERSAL_SWITCHES, config, saveAndRerender),
    );
  }

  function renderActivePlatformView(
    primarySpec: PlatformCardSpec,
    mount: HTMLElement,
    otherMount: HTMLElement,
  ): void {
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
        siteSwitch,
      ),
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
            set: other.enabledSet,
          },
          config,
          saveAndRerender,
        ),
      );
      otherMount.appendChild(group);
    }
  }

  function renderAll(): void {
    if (!primaryMount || !secondaryMount) return;
    primaryMount.replaceChildren();
    secondaryMount.replaceChildren();

    const activeSpec = detected ? PLATFORM_CARDS.find((p) => p.id === detected) : undefined;
    if (!activeSpec) {
      if (detailsEl) detailsEl.hidden = true;
      renderUniversalAndSitesGeneralView(primaryMount);
    } else {
      if (detailsEl) detailsEl.hidden = false;
      renderActivePlatformView(activeSpec, primaryMount, secondaryMount);
    }
  }

  let cachedCount = 0;
  let boostedCount = 0;
  const statusLine = document.getElementById("status-line");

  function updateStatusMode(): void {
    if (!statusLine) return;
    const modeLabel =
      config.grader.mode === "off"
        ? "sets only"
        : config.grader.mode === "local"
          ? "local"
          : "api";
    statusLine.textContent = `${boostedCount} boosted · ${cachedCount} craft killed · ${modeLabel}`;
  }

  renderAll();

  try {
    const status: unknown = await ext.sendMessage({ type: "GET_STATUS" });
    if (isRecord(status)) {
      if (typeof status.sessionFilteredCount === "number") {
        cachedCount = status.sessionFilteredCount;
      }
      if (typeof status.sessionBoostedCount === "number") {
        boostedCount = status.sessionBoostedCount;
      }
    }
    updateStatusMode();
  } catch {
    if (statusLine) statusLine.textContent = DEFAULT_CONFIG.grader.mode;
  }

  document.getElementById("open-options")?.addEventListener("click", () => {
    void ext.openOptionsPage();
    window.close();
  });
}

if (hasExtStorage()) {
  void initOptionsThemeGuard();
  void initPopup();
}

function initOptionsThemeGuard(): void {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    document.documentElement.classList.add("theme-switching");
    void document.documentElement.offsetHeight;
    requestAnimationFrame(() => {
      document.documentElement.classList.remove("theme-switching");
    });
  });
}
