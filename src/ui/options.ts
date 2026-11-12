import {
  API_DEFAULT_ENDPOINT,
  API_DEFAULT_MODEL,
  DEFAULT_CONFIG,
  DEFAULT_RUBRIC,
  LOCAL_DEFAULT_ENDPOINT,
  LOCAL_DEFAULT_MODEL,
  mergeConfig,
} from "../defaults.js";
import { isRecord, type GraderMode, type SieveConfig } from "../types.js";

function parseLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseGraderMode(val: string): GraderMode {
  return val === "off" || val === "local" || val === "api" ? val : DEFAULT_CONFIG.grader.mode;
}

function requireElement<T extends HTMLElement>(
  id: string,
  ctor: abstract new (...args: never[]) => T,
): T {
  const el = document.getElementById(id);
  if (!(el instanceof ctor)) {
    throw new Error(`Missing element #${id}`);
  }
  return el;
}

async function initOptions(): Promise<void> {
  const stored = await browser.storage.local.get("sieveConfig");
  const config: SieveConfig = mergeConfig(stored.sieveConfig);

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

  function populateFields(): void {
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

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleSave(): void {
    if (saveIndicator) saveIndicator.textContent = "saving...";
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      config.passFollowed = passFollowedEl.checked;
      config.noveltyFilter = noveltyFilterEl.checked;
      config.grader.mode = parseGraderMode(modeEl.value);
      config.grader.streamHoldMs = Math.max(
        100,
        Number.parseInt(holdEl.value, 10) || DEFAULT_CONFIG.grader.streamHoldMs,
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
    blockEl,
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
      const res: unknown = await browser.runtime.sendMessage({
        type: "TEST_GRADER",
        graderOverride: {
          mode: parseGraderMode(modeEl.value),
          endpoint: endpointEl.value.trim(),
          model: modelEl.value.trim(),
          apiKey: keyEl.value.trim(),
          rubric: rubricEl.value,
          streamHoldMs: Number.parseInt(holdEl.value, 10) || DEFAULT_CONFIG.grader.streamHoldMs,
        },
      });

      if (testResult && isRecord(res)) {
        if (res.ok !== true) {
          const msg = typeof res.error === "string" ? res.error : "unreachable";
          testResult.textContent = `failed: ${msg}`;
        } else {
          const ms = typeof res.ms === "number" ? res.ms : 0;
          testResult.textContent = `ok · ${ms}ms · slop probe ${res.droppedProbeSlop ? "dropped" : "kept"}`;
        }
      }
    } catch {
      if (testResult) testResult.textContent = "connection failed";
    } finally {
      testBtn.disabled = false;
    }
  });

  async function refreshStats(): Promise<void> {
    if (!statsEl) return;
    try {
      const s: unknown = await browser.runtime.sendMessage({ type: "GET_STATUS" });
      if (!isRecord(s)) return;
      const hnVideos = typeof s.hnVideos === "number" ? s.hnVideos : 0;
      const slopChannels = typeof s.slopChannels === "number" ? s.slopChannels : 0;
      const cachedItems = typeof s.cachedItems === "number" ? s.cachedItems : 0;
      const learnedCreators = typeof s.learnedCreators === "number" ? s.learnedCreators : 0;
      const dwelledCount = typeof s.dwelledCount === "number" ? s.dwelledCount : 0;
      statsEl.textContent = `${hnVideos.toLocaleString()} hn videos · ${slopChannels.toLocaleString()} slop channels · ${cachedItems} cached · ${learnedCreators} creators · ${dwelledCount} dwelled`;
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
