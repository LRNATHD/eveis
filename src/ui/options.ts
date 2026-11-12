import {
  API_DEFAULT_ENDPOINT,
  API_DEFAULT_MODEL,
  DEFAULT_RUBRIC,
  LOCAL_DEFAULT_ENDPOINT,
  LOCAL_DEFAULT_MODEL,
  mergeConfig,
} from "../defaults.js";
import type { GraderMode, SieveConfig } from "../types.js";

function parseLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

async function initOptions(): Promise<void> {
  const stored = await browser.storage.local.get("sieveConfig");
  const config: SieveConfig = mergeConfig(stored.sieveConfig as Partial<SieveConfig> | undefined);

  const passFollowedEl = document.getElementById("pass-followed") as HTMLInputElement;
  const noveltyFilterEl = document.getElementById("novelty-filter") as HTMLInputElement;
  const modeEl = document.getElementById("grader-mode") as HTMLSelectElement;
  const holdEl = document.getElementById("grader-hold") as HTMLInputElement;
  const endpointEl = document.getElementById("grader-endpoint") as HTMLInputElement;
  const modelEl = document.getElementById("grader-model") as HTMLInputElement;
  const keyEl = document.getElementById("grader-key") as HTMLInputElement;
  const rubricEl = document.getElementById("grader-rubric") as HTMLTextAreaElement;
  const allowEl = document.getElementById("allow-handles") as HTMLTextAreaElement;
  const blockEl = document.getElementById("block-handles") as HTMLTextAreaElement;
  const saveIndicator = document.getElementById("save-indicator");
  const testBtn = document.getElementById("test-grader") as HTMLButtonElement;
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
      config.grader.mode = modeEl.value as GraderMode;
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
    const nextMode = modeEl.value as GraderMode;
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
      const res = (await browser.runtime.sendMessage({
        type: "TEST_GRADER",
        graderOverride: {
          mode: modeEl.value as GraderMode,
          endpoint: endpointEl.value.trim(),
          model: modelEl.value.trim(),
          apiKey: keyEl.value.trim(),
          rubric: rubricEl.value,
          streamHoldMs: Number.parseInt(holdEl.value, 10) || 650,
        },
      })) as { ok?: boolean; ms?: number; droppedProbeSlop?: boolean; error?: string };

      if (testResult) {
        if (!res.ok) {
          testResult.textContent = `failed: ${res.error ?? "unreachable"}`;
        } else {
          testResult.textContent = `ok · ${res.ms ?? 0}ms · slop probe ${res.droppedProbeSlop ? "dropped" : "kept"}`;
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
      const s = (await browser.runtime.sendMessage({ type: "GET_STATUS" })) as {
        cachedItems?: number;
        learnedCreators?: number;
        dwelledCount?: number;
        hnVideos?: number;
        slopChannels?: number;
      };
      statsEl.textContent = `${(s.hnVideos ?? 0).toLocaleString()} hn videos · ${(s.slopChannels ?? 0).toLocaleString()} slop channels · ${s.cachedItems ?? 0} cached · ${s.learnedCreators ?? 0} creators · ${s.dwelledCount ?? 0} dwelled`;
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
