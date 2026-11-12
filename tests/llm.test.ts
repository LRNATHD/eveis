import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/defaults.js";
import type { FeedItem, MemoryStore, ResolvedVerdict, SeedSets, SieveConfig } from "../src/types.js";
import { gradeItemsBatch, parseIndexedVerdicts } from "../src/core/llm.js";
import { runSieveOnBatch } from "../src/core/sieve.js";

describe("parseIndexedVerdicts", () => {
  it("parses plain JSON and markdown-fenced drop arrays", () => {
    const valid = ["a", "b", "c"];
    expect([...parseIndexedVerdicts('{"drop":["b"]}', valid)]).toEqual(["b"]);
    expect([
      ...parseIndexedVerdicts('Here is the result:\n```json\n{"drop": ["a", "ghost"]}\n```', valid),
    ]).toEqual(["a"]);
  });

  it("returns empty set on malformed output", () => {
    expect(parseIndexedVerdicts("not json at all", ["a"]).size).toBe(0);
  });

  it("maps 3-way indexed verdicts (k / u / d) so only confident d entries drop", () => {
    const ids = ["id_good", "id_unsure", "id_slop"];
    const dropped = parseIndexedVerdicts('{"0":"k","1":"u","2":"d"}', ids);
    expect([...dropped]).toEqual(["id_slop"]);
  });
});

describe("gradeItemsBatch and runSieveOnBatch", () => {
  const sampleItems: FeedItem[] = [
    {
      platform: "youtube",
      id: "craft1",
      creatorHandle: "diy_optics",
      surface: "home",
      titleOrText: "Grinding a 6-inch telescope mirror by hand",
    },
    {
      platform: "youtube",
      id: "slop2",
      creatorHandle: "drama_alert_clone",
      surface: "home",
      titleOrText: "YOU WONT BELIEVE WHO GOT EXPOSED TODAY",
    },
  ];

  it("grades unseen items via OpenAI-compatible chat endpoint and records memory", async () => {
    const recorded: Array<[string, ResolvedVerdict]> = [];
    const memory: MemoryStore = {
      getItemVerdict: () => undefined,
      getCreatorVerdict: () => undefined,
      recordVerdict: async (item, v) => {
        recorded.push([item.id, v]);
      },
      clear: async () => {},
      counts: () => ({ cachedItems: 0, learnedCreators: 0, droppedTotal: 0 }),
    };
    const seeds: SeedSets = {
      hnVideos: new Set(),
      hnChannels: new Set(),
      slopChannels: new Set(),
    };
    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '```json\n{"drop":["slop2"]}\n```' } }],
        }),
        { status: 200 },
      );

    const dropped = await runSieveOnBatch(sampleItems, DEFAULT_CONFIG, seeds, memory, mockFetch);
    expect([...dropped]).toEqual(["slop2"]);
    expect(recorded).toEqual([
      ["craft1", "keep"],
      ["slop2", "drop"],
    ]);
  });

  it("fails open within streamHoldMs when LLM is slow, while populating cache when it finishes", async () => {
    const recorded: Array<[string, ResolvedVerdict]> = [];
    const memory: MemoryStore = {
      getItemVerdict: () => undefined,
      getCreatorVerdict: () => undefined,
      recordVerdict: async (item, v) => {
        recorded.push([item.id, v]);
      },
      clear: async () => {},
      counts: () => ({ cachedItems: 0, learnedCreators: 0, droppedTotal: 0 }),
    };
    const seeds: SeedSets = {
      hnVideos: new Set(),
      hnChannels: new Set(),
      slopChannels: new Set(),
    };
    const fastTimeoutConfig: SieveConfig = {
      ...DEFAULT_CONFIG,
      grader: { ...DEFAULT_CONFIG.grader, streamHoldMs: 40 },
    };

    const slowFetch: typeof fetch = async () => {
      await new Promise((r) => setTimeout(r, 120));
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"drop":["slop2"]}' } }] }),
        { status: 200 },
      );
    };

    const start = Date.now();
    const droppedNow = await runSieveOnBatch(
      sampleItems,
      fastTimeoutConfig,
      seeds,
      memory,
      slowFetch,
    );
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(droppedNow.size).toBe(0);

    await new Promise((r) => setTimeout(r, 110));
    expect(recorded).toEqual([
      ["craft1", "keep"],
      ["slop2", "drop"],
    ]);
  });

  it("throws from gradeItemsBatch on HTTP errors and fails open in runSieveOnBatch without poisoning memory", async () => {
    const recorded: Array<[string, ResolvedVerdict]> = [];
    const memory: MemoryStore = {
      getItemVerdict: () => undefined,
      getCreatorVerdict: () => undefined,
      recordVerdict: async (item, v) => {
        recorded.push([item.id, v]);
      },
      clear: async () => {},
      counts: () => ({ cachedItems: 0, learnedCreators: 0, droppedTotal: 0 }),
    };
    const seeds: SeedSets = {
      hnVideos: new Set(),
      hnChannels: new Set(),
      slopChannels: new Set(),
    };
    const failingFetch: typeof fetch = async () => new Response("Unavailable", { status: 503 });

    await expect(gradeItemsBatch(sampleItems, DEFAULT_CONFIG, failingFetch)).rejects.toThrow(
      "HTTP 503",
    );

    const dropped = await runSieveOnBatch(sampleItems, DEFAULT_CONFIG, seeds, memory, failingFetch);
    expect(dropped.size).toBe(0);
    expect(recorded).toEqual([]);
  });

  it("returns empty drop set when grader mode is off", async () => {
    const offConfig: SieveConfig = {
      ...DEFAULT_CONFIG,
      grader: { ...DEFAULT_CONFIG.grader, mode: "off" },
    };
    const res = await gradeItemsBatch(sampleItems, offConfig, async () => {
      throw new Error("should not be called");
    });
    expect(res.size).toBe(0);
  });
});
