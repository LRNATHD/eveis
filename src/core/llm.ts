import type { FeedItem, SieveConfig } from "../types.js";

const MAX_BATCH_SIZE = 20;
const BACKGROUND_TIMEOUT_MS = 6000;

export function parseDropResponse(raw: string, validIds: Set<string>): Set<string> {
  const dropped = new Set<string>();
  if (!raw || typeof raw !== "string") return dropped;

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const candidate = (fenced?.[1] ?? raw).trim();
  const braceStart = candidate.indexOf("{");
  const braceEnd = candidate.lastIndexOf("}");
  if (braceStart === -1 || braceEnd <= braceStart) return dropped;

  try {
    const parsed = JSON.parse(candidate.slice(braceStart, braceEnd + 1)) as { drop?: unknown };
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

export function parseIndexedVerdicts(raw: string, orderedIds: string[]): Set<string> {
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
    const parsed = JSON.parse(candidate.slice(braceStart, braceEnd + 1)) as Record<string, unknown>;
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

export async function gradeItemsBatch(
  items: FeedItem[],
  config: SieveConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<Set<string>> {
  const dropped = new Set<string>();
  if (config.grader.mode === "off" || items.length === 0) return dropped;
  if (!config.grader.endpoint || !config.grader.model) return dropped;
  if (config.grader.mode === "api" && !config.grader.apiKey.trim()) return dropped;

  const batch = items.slice(0, MAX_BATCH_SIZE);
  const orderedIds = batch.map((item) => item.id);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BACKGROUND_TIMEOUT_MS);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.grader.mode === "api" && config.grader.apiKey.trim()) {
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

    if (!res.ok) return dropped;
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content ?? "";
    return parseIndexedVerdicts(content, orderedIds);
  } catch {
    return dropped;
  } finally {
    clearTimeout(timer);
  }
}
