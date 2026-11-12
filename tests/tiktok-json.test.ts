import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/defaults.js";
import {
  filterTikTokJson,
  rewriteTikTokThemeCookieHeader,
} from "../src/adapters/tiktok-json.js";

describe("rewriteTikTokThemeCookieHeader", () => {
  it("forces tiktok_webapp_theme=light and tiktok_webapp_theme_source=custom cleanly", () => {
    expect(DEFAULT_CONFIG.tiktok.lightMode).toBe(true);
    expect(
      rewriteTikTokThemeCookieHeader(
        "ttwid=123; tiktok_webapp_theme=dark; tiktok_webapp_theme_source=auto; sid=abc",
      ),
    ).toBe("ttwid=123; tiktok_webapp_theme=light; tiktok_webapp_theme_source=custom; sid=abc");

    expect(rewriteTikTokThemeCookieHeader("ttwid=123")).toBe(
      "ttwid=123; tiktok_webapp_theme=light; tiktok_webapp_theme_source=custom",
    );
  });
});

describe("filterTikTokJson", () => {
  it("allows TikTok feed scrolling with caliber filtering by default and calms shouting captions", async () => {
    expect(DEFAULT_CONFIG.tiktok.postOnlyMode).toBe(false);
    const payload = {
      itemList: [
        {
          id: "tt_ad_1",
          isAd: true,
          desc: "Download game now",
          author: { id: "a1", uniqueId: "ad_acct" },
        },
        {
          id: "tt_good_2",
          isAd: false,
          desc: "LATHE TURNING A TITANIUM PCB HOUSING!!",
          author: { id: "a2", uniqueId: "machinist_sf", followStatus: 0 },
          stats: { diggCount: 5200, commentCount: 40, playCount: 48000 },
        },
        {
          id: "tt_slop_3",
          isAd: false,
          desc: "part 47 fake storytime",
          author: { id: "a3", uniqueId: "story_slop", followStatus: 0 },
          stats: { diggCount: 300, commentCount: 90, playCount: 10000 },
        },
      ],
    };

    const out = (await filterTikTokJson(
      payload,
      DEFAULT_CONFIG,
      async () => new Set(["tt_slop_3"]),
    )) as typeof payload;

    expect(out.itemList.map((i) => i.id)).toEqual(["tt_good_2"]);
    expect(out.itemList[0]!.desc).toBe("Lathe turning a titanium PCB housing!");
  });

  it("never suppresses videos on TikTok user profiles (/api/post/item_list/) while still calming captions", async () => {
    const profilePayload = {
      itemList: [
        {
          id: "tt_prof_1",
          isAd: false,
          desc: "TESTING MY NEW CNC SPINDLE!!",
          author: { id: "a9", uniqueId: "cnc_person", followStatus: 0 },
        },
      ],
    };

    let deciderCalled = false;
    const out = (await filterTikTokJson(
      profilePayload,
      DEFAULT_CONFIG,
      async () => {
        deciderCalled = true;
        return new Set(["tt_prof_1"]);
      },
      "/api/post/item_list/",
      "https://www.tiktok.com/@cnc_person",
    )) as typeof profilePayload;

    expect(deciderCalled).toBe(false);
    expect(out.itemList).toHaveLength(1);
    expect(out.itemList[0]!.desc).toBe("Testing my new CNC spindle!");
  });
});
