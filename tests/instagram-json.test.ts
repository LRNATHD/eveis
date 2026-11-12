import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/defaults.js";
import { filterInstagramJson } from "../src/adapters/instagram-json.js";

describe("filterInstagramJson", () => {
  it("filters Instagram Reels GraphQL edges while preserving page_info even when all edges drop", async () => {
    const reelsGraphql = {
      data: {
        xdt_api__v1__clips__home__connection_v2: {
          edges: [
            {
              node: {
                media: {
                  pk: "reel_ad_1",
                  ad_id: "999111",
                  caption: { text: "Buy this gadget" },
                  user: { pk: "u_ad", username: "gadget_drop" },
                },
              },
            },
            {
              node: {
                media: {
                  pk: "reel_craft_2",
                  caption: { text: "CNC brass clock escapement prototype" },
                  video_duration: 28,
                  like_count: 1400,
                  comment_count: 35,
                  user: {
                    pk: "u_machinist",
                    username: "clockmaker_jp",
                    friendship_status: { following: false },
                  },
                },
              },
            },
            {
              node: {
                media: {
                  pk: "reel_slop_3",
                  caption: { text: "Wait till the end!! 😱😱" },
                  video_duration: 9,
                  user: {
                    pk: "u_repost",
                    username: "viral_clips_daily",
                    friendship_status: { following: false },
                  },
                },
              },
            },
          ],
          page_info: {
            has_next_page: true,
            end_cursor: "CURSOR_NEXT_99",
          },
        },
      },
    };

    const out = (await filterInstagramJson(
      structuredClone(reelsGraphql),
      "/graphql/query",
      DEFAULT_CONFIG,
      async (items) => {
        expect(items.every((i) => i.surface === "reels")).toBe(true);
        return new Set(["reel_slop_3"]);
      },
    )) as typeof reelsGraphql;

    const conn = out.data.xdt_api__v1__clips__home__connection_v2;
    expect(conn.edges).toHaveLength(1);
    expect(conn.edges[0]!.node.media.pk).toBe("reel_craft_2");
    expect(conn.page_info.end_cursor).toBe("CURSOR_NEXT_99");

    const allDropped = (await filterInstagramJson(
      structuredClone(reelsGraphql),
      "/graphql/query",
      DEFAULT_CONFIG,
      async () => new Set(["reel_craft_2", "reel_slop_3"]),
    )) as typeof reelsGraphql;

    expect(allDropped.data.xdt_api__v1__clips__home__connection_v2.edges).toHaveLength(0);
    expect(allDropped.data.xdt_api__v1__clips__home__connection_v2.page_info.has_next_page).toBe(
      true,
    );
  });

  it("filters Instagram Home timeline feed_items, dropping ads and unfollowed low-caliber suggestions", async () => {
    const timelineRest = {
      feed_items: [
        {
          media_or_ad: {
            pk: "ig_post_friend",
            caption: { text: "weekend hike" },
            user: { pk: "u1", username: "bestfriend", friendship_status: { following: true } },
          },
        },
        {
          media_or_ad: {
            pk: "ig_post_ad",
            injected: { label: "Sponsored" },
            caption: { text: "Shop now" },
            user: { pk: "u2", username: "brand" },
          },
        },
        {
          media_or_ad: {
            pk: "ig_post_suggested_slop",
            caption: { text: "Celebrity gossip thread" },
            user: { pk: "u3", username: "gossip_page", friendship_status: { following: false } },
          },
        },
      ],
    };

    const out = (await filterInstagramJson(
      timelineRest,
      "/api/v1/feed/timeline/",
      DEFAULT_CONFIG,
      async () => new Set(["ig_post_suggested_slop"]),
    )) as typeof timelineRest;

    expect(out.feed_items).toHaveLength(1);
    expect(out.feed_items[0]!.media_or_ad.pk).toBe("ig_post_friend");
  });

  it("never suppresses posts on Instagram user profiles (user_timeline / clips__user) while still calming ALL-CAPS captions", async () => {
    const profileGraphql = {
      data: {
        xdt_api__v1__feed__user_timeline_graphql_connection: {
          edges: [
            {
              node: {
                pk: "prof_ig_1",
                caption: { text: "NEW STUDIO BUILD IN PROGRESS!!" },
                user: { pk: "u9", username: "some_creator", friendship_status: { following: false } },
              },
            },
          ],
        },
      },
    };

    let deciderCalled = false;
    const out = (await filterInstagramJson(
      profileGraphql,
      "/graphql/query",
      DEFAULT_CONFIG,
      async () => {
        deciderCalled = true;
        return new Set(["prof_ig_1"]);
      },
      "https://www.instagram.com/some_creator/",
    )) as typeof profileGraphql;

    expect(deciderCalled).toBe(false);
    const edges = out.data.xdt_api__v1__feed__user_timeline_graphql_connection.edges;
    expect(edges).toHaveLength(1);
    expect(edges[0]!.node.caption.text).toBe("New studio build in progress!");
  });
});
