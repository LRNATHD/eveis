import { isRecord, type FeedItem, type JsonRecord, type SieveConfig } from "../types.js";

const MAX_BATCH_SIZE = 20;
const BACKGROUND_TIMEOUT_MS = 6000;

function extractJsonObject(raw: string): JsonRecord | null {
  if (!raw) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const candidate = (fenced?.[1] ?? raw).trim();
  const braceStart = candidate.indexOf("{");
  const braceEnd = candidate.lastIndexOf("}");
  if (braceStart === -1 || braceEnd <= braceStart) return null;

  try {
    const parsed: unknown = JSON.parse(candidate.slice(braceStart, braceEnd + 1));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseIndexedVerdicts(raw: string, orderedIds: string[]): Set<string> {
  const dropped = new Set<string>();
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

function summarizeIndexedItem(item: FeedItem, index: number) {
  return {
    i: String(index),
    p: item.platform,
    by: item.creatorHandle || item.creatorId || "",
    text: item.titleOrText.slice(0, 240),
    ...(item.secondaryText ? { ctx: item.secondaryText.slice(0, 180) } : {}),
    ...(item.durationSec ? { dur: item.durationSec } : {}),
  };
}

const VERDICT_OUTPUT_INSTRUCTIONS = `Label each item index "0", "1", ... with one letter:
- "k" = keep (engineering, hardware, software, science, space, design, art, photography, music, demos, links, dry humor/jokes, opinions, weird rabbit holes, or normal human updates even if only a few words long)
- "u" = unsure or neutral (kept by default when in doubt)
- "d" = confident drop (ONLY clear ragebait, public humiliation/dunk clips, political/culture-war outrage, celebrity/influencer gossip, crypto/memecoin shills, hustle-bro/DM-funnel bait, short-drama cliffhangers, or AI voiceover sleep-slop)

Return ONLY a JSON object mapping every index to "k", "u", or "d", like {"0":"k","1":"u","2":"d"}.`;

function readFirstChoiceContent(body: unknown): string {
  if (!isRecord(body) || !Array.isArray(body.choices)) return "";
  const first = body.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) return "";
  return typeof first.message.content === "string" ? first.message.content : "";
}

export async function gradeItemsBatch(
  items: FeedItem[],
  config: SieveConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<Set<string>> {
  if (config.grader.mode === "off" || items.length === 0) return new Set();
  if (!config.grader.endpoint || !config.grader.model) {
    throw new Error("Missing grader endpoint or model");
  }
  if (config.grader.mode === "api" && !config.grader.apiKey.trim()) {
    throw new Error("Missing API key");
  }

  const batch = items.slice(0, MAX_BATCH_SIZE);
  const orderedIds = batch.map((item) => item.id);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BACKGROUND_TIMEOUT_MS);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.grader.apiKey.trim()) {
    headers.Authorization = `Bearer ${config.grader.apiKey.trim()}`;
  }

  const isLocal = config.grader.mode === "local";

  try {
    const res = await fetchImpl(config.grader.endpoint, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: config.grader.model,
        temperature: 0,
        ...(isLocal
          ? {
              seed: 42,
              keep_alive: "30m",
              response_format: { type: "json_object" },
            }
          : {}),
        messages: [
          {
            role: "system",
            content: `${config.grader.rubric.trim()}\n\n${VERDICT_OUTPUT_INSTRUCTIONS}`,
          },
          {
            role: "user",
            content: JSON.stringify(batch.map(summarizeIndexedItem)),
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const body: unknown = await res.json();
    return parseIndexedVerdicts(readFirstChoiceContent(body), orderedIds);
  } finally {
    clearTimeout(timer);
  }
}
