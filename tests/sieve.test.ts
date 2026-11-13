import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/defaults.js";
import type { FeedItem, MemoryLookup, SeedSets, SieveConfig } from "../src/types.js";
import { evaluateLocalTiers, extractYouTubeIdsFromText, isBrainrotItem } from "../src/core/sieve.js";

function makeSeeds(overrides: Partial<SeedSets> = {}): SeedSets {
  return {
    hnVideos: overrides.hnVideos ?? new Set(["hnVid000001"]),
    hnChannels: overrides.hnChannels ?? new Set(["3blue1brown", "uc_hn_trusted"]),
    slopChannels: overrides.slopChannels ?? new Set(["aislopfarm99", "uc_slop_1"]),
  };
}

const emptyMemory: MemoryLookup = {
  getItemVerdict: () => undefined,
  getCreatorVerdict: () => undefined,
};

describe("evaluateLocalTiers (evil brainrot mode)", () => {
  it("keeps and boosts sponsored items immediately", () => {
    const item: FeedItem = {
      platform: "x",
      id: "t1",
      creatorHandle: "@friend",
      isFollowed: true,
      isSponsored: true,
      surface: "timeline",
      titleOrText: "Buy our enterprise SaaS",
    };
    expect(evaluateLocalTiers(item, DEFAULT_CONFIG, makeSeeds(), emptyMemory)).toBe("keep");
    expect(isBrainrotItem(item, DEFAULT_CONFIG, makeSeeds())).toBe(true);
  });

  it("suppresses boring HackerTube canonical video IDs and HN-trusted channels", () => {
    const byVid: FeedItem = {
      platform: "youtube",
      id: "hnVid000001",
      creatorHandle: "unknown_uploader",
      surface: "home",
      titleOrText: "The Mother of All Demos",
    };
    const byChannel: FeedItem = {
      platform: "youtube",
      id: "brandNew2026",
      creatorHandle: "3Blue1Brown",
      surface: "home",
      titleOrText: "New visual proof",
    };
    expect(evaluateLocalTiers(byVid, DEFAULT_CONFIG, makeSeeds(), emptyMemory)).toBe("drop");
    expect(evaluateLocalTiers(byChannel, DEFAULT_CONFIG, makeSeeds(), emptyMemory)).toBe("drop");
  });

  it("keeps and boosts known AiSList slop channels while dropping user blockHandles", () => {
    const slop: FeedItem = {
      platform: "youtube",
      id: "slopVid",
      creatorHandle: "@AiSlopFarm99",
      surface: "home",
      titleOrText: "Boring History For Sleep",
    };
    const config: SieveConfig = {
      ...DEFAULT_CONFIG,
      blockHandles: ["@boring_professor"],
    };
    const blocked: FeedItem = {
      platform: "x",
      id: "x99",
      creatorHandle: "boring_professor",
      surface: "timeline",
      titleOrText: "Linear algebra lecture notes",
    };
    expect(evaluateLocalTiers(slop, config, makeSeeds(), emptyMemory)).toBe("keep");
    expect(isBrainrotItem(slop, config, makeSeeds())).toBe(true);
    expect(evaluateLocalTiers(blocked, config, makeSeeds(), emptyMemory)).toBe("drop");
  });

  it("boosts ragebait, comment-bait DM templates, siren-emoji hype, and short-drama cliffhangers", () => {
    const ragebait: FeedItem = {
      platform: "x",
      id: "rage1",
      creatorHandle: "hot_take_guy",
      isFollowed: false,
      surface: "timeline",
      titleOrText: "Anyone who cooks at home is wasting their life",
      metrics: { likes: 60, replies: 210, quotes: 95 },
    };
    const bait: FeedItem = {
      platform: "instagram",
      id: "reel_bait",
      creatorHandle: "growth_guru",
      isFollowed: false,
      surface: "reels",
      titleOrText: 'Comment "SYSTEM" and I\'ll DM you the Notion template!',
    };
    const sirenBait: FeedItem = {
      platform: "x",
      id: "siren_1",
      creatorHandle: "alpha_alerts",
      isFollowed: false,
      surface: "timeline",
      titleOrText: "🚨 BREAKING: INSANE NEW AI JUST KILLED SOFTWARE ENGINEERING FOREVER 🧵",
    };
    const shortDrama: FeedItem = {
      platform: "tiktok",
      id: "drama_3",
      creatorHandle: "muffindrama_us",
      isFollowed: false,
      surface: "reels",
      titleOrText: "Part 12 | Billionaire CEO secretly marries cleaner #reelshort #shortdrama",
    };

    expect(evaluateLocalTiers(ragebait, DEFAULT_CONFIG, makeSeeds(), emptyMemory)).toBe("keep");
    expect(evaluateLocalTiers(bait, DEFAULT_CONFIG, makeSeeds(), emptyMemory)).toBe("keep");
    expect(evaluateLocalTiers(sirenBait, DEFAULT_CONFIG, makeSeeds(), emptyMemory)).toBe("keep");
    expect(evaluateLocalTiers(shortDrama, DEFAULT_CONFIG, makeSeeds(), emptyMemory)).toBe("keep");
  });

  it("suppresses non-YouTube posts that link to HackerTube videos", () => {
    expect(
      extractYouTubeIdsFromText("Must watch talk https://youtu.be/hnVid000001?t=42 and https://www.youtube.com/watch?v=abcDEF12345"),
    ).toEqual(["hnVid000001", "abcDEF12345"]);

    const tweetWithHnLink: FeedItem = {
      platform: "x",
      id: "tw_hn_1",
      creatorHandle: "random_reader",
      surface: "timeline",
      titleOrText: "Still the best talk ever https://youtu.be/hnVid000001",
      linkedYoutubeIds: ["hnVid000001"],
    };

    expect(evaluateLocalTiers(tweetWithHnLink, DEFAULT_CONFIG, makeSeeds(), emptyMemory)).toBe("drop");
  });
});
