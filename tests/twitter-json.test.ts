import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/defaults.js";
import { filterTwitterJson } from "../src/adapters/twitter-json.js";

describe("filterTwitterJson", () => {
  it("drops promoted tweets, who-to-follow modules, and decider-rejected unfollowed tweets while keeping followed tweets", async () => {
    const timelinePayload = {
      data: {
        home: {
          home_timeline_urt: {
            instructions: [
              {
                type: "TimelineAddEntries",
                entries: [
                  {
                    entryId: "promoted-tweet-1",
                    content: {
                      itemContent: {
                        promotedMetadata: { impressionId: "ad1" },
                        tweet_results: { result: { rest_id: "ad_tweet" } },
                      },
                    },
                  },
                  {
                    entryId: "who-to-follow-1",
                    content: {
                      items: [],
                    },
                  },
                  {
                    entryId: "tweet-followed-1",
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            __typename: "Tweet",
                            rest_id: "1001",
                            core: {
                              user_results: {
                                result: {
                                  rest_id: "u1",
                                  legacy: { screen_name: "friend_hw", following: true },
                                },
                              },
                            },
                            legacy: {
                              full_text: "soldered the flight computer",
                              favorite_count: 25,
                              reply_count: 2,
                              quote_count: 0,
                            },
                          },
                        },
                      },
                    },
                  },
                  {
                    entryId: "tweet-algo-slop",
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            __typename: "TweetWithVisibilityResults",
                            tweet: {
                              rest_id: "1002",
                              core: {
                                user_results: {
                                  result: {
                                    rest_id: "u2",
                                    is_blue_verified: true,
                                    legacy: { screen_name: "outrage_acct", following: false },
                                  },
                                },
                              },
                              legacy: {
                                full_text: "Why everyone in SF is wrong:",
                                favorite_count: 100,
                                reply_count: 10,
                                quote_count: 1,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    };

    const out = (await filterTwitterJson(
      timelinePayload,
      "/i/api/graphql/abc/HomeTimeline",
      DEFAULT_CONFIG,
      async (items) => {
        const algo = items.find((i) => i.id === "1002");
        expect(algo?.isFollowed).toBe(false);
        const friend = items.find((i) => i.id === "1001");
        expect(friend?.isFollowed).toBe(true);
        return new Set(["1002"]);
      },
    )) as typeof timelinePayload;

    const entries = out.data.home.home_timeline_urt.instructions[0]!.entries;
    expect(entries.map((e) => e.entryId)).toEqual(["tweet-followed-1"]);
  });

  it("extracts linked YouTube IDs, swaps YouTube card thumbnails to hq2.jpg, and calms ALL-CAPS tweets", async () => {
    const payload = {
      data: {
        home: {
          instructions: [
            {
              entries: [
                {
                  entryId: "tweet-yt-card",
                  content: {
                    itemContent: {
                      tweet_results: {
                        result: {
                          rest_id: "2001",
                          core: {
                            user_results: {
                              result: { legacy: { screen_name: "eng_poster", following: false } },
                            },
                          },
                          legacy: {
                            full_text: "THIS FPGA TALK IS AMAZING!! https://t.co/xyz",
                            entities: {
                              urls: [{ expanded_url: "https://www.youtube.com/watch?v=JXDEuBa_yeg" }],
                            },
                          },
                          card: {
                            legacy: {
                              binding_values: [
                                {
                                  key: "title",
                                  value: { string_value: "THIS FPGA TALK IS AMAZING!!" },
                                },
                                {
                                  key: "vanity_url",
                                  value: { string_value: "youtube.com" },
                                },
                                {
                                  key: "photo_image_full_size_large",
                                  value: {
                                    image_value: {
                                      url: "https://i.ytimg.com/vi/JXDEuBa_yeg/maxresdefault.jpg",
                                    },
                                  },
                                },
                              ],
                            },
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    };

    let seenYtIds: string[] | undefined;
    await filterTwitterJson(payload, "/i/api/graphql/1/HomeTimeline", DEFAULT_CONFIG, async (items) => {
      seenYtIds = items[0]?.linkedYoutubeIds;
      return new Set();
    });

    expect(seenYtIds).toEqual(["JXDEuBa_yeg"]);
    const tweet = payload.data.home.instructions[0]!.entries[0]!.content.itemContent.tweet_results.result;
    expect(tweet.legacy.full_text).toBe("This FPGA talk is amazing! https://t.co/xyz");
    expect(tweet.card.legacy.binding_values[2]!.value.image_value!.url).toBe(
      "https://i.ytimg.com/vi/JXDEuBa_yeg/hq2.jpg",
    );
  });

  it("filters Twitter ExplorePage trends and tweets, dropping promoted and low-caliber trends", async () => {
    const explorePayload = {
      data: {
        explore_page: {
          body: {
            initialTimeline: {
              timeline: {
                timeline: {
                  instructions: [
                    {
                      type: "TimelineAddEntries",
                      entries: [
                        {
                          entryId: "trend-promoted-1",
                          content: {
                            itemContent: {
                              __typename: "TimelineTrend",
                              name: "#Sponsored Cola",
                              promotedMetadata: { impressionId: "p1" },
                            },
                          },
                        },
                        {
                          entryId: "trend-gossip-2",
                          content: {
                            itemContent: {
                              __typename: "TimelineTrend",
                              name: "Love Island Breakup",
                              trendMetadata: { domainContext: "Celebrity · Trending" },
                            },
                          },
                        },
                        {
                          entryId: "trend-science-3",
                          content: {
                            itemContent: {
                              __typename: "TimelineTrend",
                              name: "Starship Flight 12",
                              trendMetadata: { domainContext: "Science · Trending" },
                            },
                          },
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      },
    };

    await filterTwitterJson(
      explorePayload,
      "/i/api/graphql/xyz/ExplorePage",
      DEFAULT_CONFIG,
      async (items) => {
        expect(items.map((i) => i.titleOrText)).toEqual([
          "Love Island Breakup",
          "Starship Flight 12",
        ]);
        const gossip = items.find((i) => i.titleOrText === "Love Island Breakup");
        return new Set(gossip ? [gossip.id] : []);
      },
    );

    const remaining =
      explorePayload.data.explore_page.body.initialTimeline.timeline.timeline.instructions[0]!
        .entries;
    expect(remaining.map((e) => e.entryId)).toEqual(["trend-science-3"]);
  });

  it("never removes clicked focal tweets, quote tweets, or threads on /TweetDetail (only promoted ads)", async () => {
    const detailPayload = {
      data: {
        threaded_conversation_with_injections_v2: {
          instructions: [
            {
              type: "TimelineAddEntries",
              entries: [
                {
                  entryId: "tweet-focal-999",
                  content: {
                    itemContent: {
                      tweet_results: {
                        result: {
                          rest_id: "999",
                          core: {
                            user_results: {
                              result: { legacy: { screen_name: "unfollowed_author", following: false } },
                            },
                          },
                          legacy: { full_text: "Thread on building a home electron microscope (1/6)" },
                        },
                      },
                    },
                  },
                },
                {
                  entryId: "promoted-reply-ad",
                  content: {
                    itemContent: {
                      promotedMetadata: { impressionId: "ad99" },
                      tweet_results: { result: { rest_id: "ad_99" } },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    };

    let deciderCalled = false;
    await filterTwitterJson(
      detailPayload,
      "/i/api/graphql/xyz/TweetDetail",
      DEFAULT_CONFIG,
      async () => {
        deciderCalled = true;
        return new Set(["999"]);
      },
    );

    expect(deciderCalled).toBe(false);
    const entries =
      detailPayload.data.threaded_conversation_with_injections_v2.instructions[0]!.entries;
    expect(entries.map((e) => e.entryId)).toEqual(["tweet-focal-999"]);
  });

  it("includes quoted tweet text, media tags, and followed-retweeter status on HomeTimeline", async () => {
    const payload = {
      data: {
        home: {
          instructions: [
            {
              entries: [
                {
                  entryId: "tweet-qt-1",
                  content: {
                    itemContent: {
                      tweet_results: {
                        result: {
                          rest_id: "3001",
                          core: {
                            user_results: {
                              result: { legacy: { screen_name: "curious_dev", following: false } },
                            },
                          },
                          legacy: {
                            full_text: "Whoa look at this",
                            extended_entities: { media: [{ type: "video" }] },
                          },
                          quoted_status_result: {
                            result: {
                              core: {
                                user_results: {
                                  result: { legacy: { screen_name: "optics_lab" } },
                                },
                              },
                              legacy: {
                                full_text: "Femtosecond laser ablation of sapphire substrates",
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                {
                  entryId: "tweet-rt-by-friend",
                  content: {
                    itemContent: {
                      tweet_results: {
                        result: {
                          rest_id: "3002",
                          core: {
                            user_results: {
                              result: { legacy: { screen_name: "friend_follows", following: true } },
                            },
                          },
                          legacy: {
                            full_text: "RT @stranger: cool CNC jig",
                            retweeted_status_result: {
                              result: {
                                rest_id: "3002_inner",
                                core: {
                                  user_results: {
                                    result: { legacy: { screen_name: "stranger", following: false } },
                                  },
                                },
                                legacy: { full_text: "cool CNC jig" },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    };

    let captured: unknown[] = [];
    await filterTwitterJson(payload, "/i/api/graphql/1/HomeTimeline", DEFAULT_CONFIG, async (items) => {
      captured = items;
      return new Set();
    });

    expect(captured[0]).toMatchObject({
      id: "3001",
      secondaryText: expect.stringContaining("Femtosecond laser ablation"),
    });
    expect((captured[0] as { secondaryText?: string }).secondaryText).toContain("[video]");
    expect(captured[1]).toMatchObject({
      id: "3002",
      isFollowed: true,
    });
  });
});
