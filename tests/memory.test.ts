import { describe, expect, it } from "vitest";
import { createMemoryStore } from "../src/background/memory.js";
import type { FeedItem } from "../src/types.js";

function makeItem(id: string, handle: string): FeedItem {
  return {
    platform: "youtube",
    id,
    creatorHandle: handle,
    surface: "home",
    titleOrText: `Video ${id}`,
  };
}

describe("createMemoryStore", () => {
  it("caches item verdicts and promotes creators after 3 consistent verdicts", async () => {
    const store = createMemoryStore({ maxItems: 5 });

    await store.recordVerdict(makeItem("v1", "@GoodMaker"), "keep");
    await store.recordVerdict(makeItem("v2", "@GoodMaker"), "keep");
    expect(store.getItemVerdict("youtube", "v1")).toBe("keep");
    expect(store.getCreatorVerdict("youtube", "goodmaker")).toBeUndefined();

    await store.recordVerdict(makeItem("v3", "@GoodMaker"), "keep");
    expect(store.getCreatorVerdict("youtube", "goodmaker")).toBe("keep");
    expect(store.getCreatorVerdict("instagram", "goodmaker")).toBe("keep");
    expect(store.getCreatorVerdict("tiktok", "goodmaker")).toBe("keep");
  });

  it("promotes consistently low-caliber creators to drop after 5 drops and leaves mixed creators unpromoted", async () => {
    const store = createMemoryStore();

    await store.recordVerdict(makeItem("s1", "@SlopMill"), "drop");
    await store.recordVerdict(makeItem("s2", "@SlopMill"), "drop");
    await store.recordVerdict(makeItem("s3", "@SlopMill"), "drop");
    expect(store.getCreatorVerdict("youtube", "slopmill")).toBeUndefined();

    await store.recordVerdict(makeItem("s4", "@SlopMill"), "drop");
    await store.recordVerdict(makeItem("s5", "@SlopMill"), "drop");
    expect(store.getCreatorVerdict("youtube", "slopmill")).toBe("drop");

    await store.recordVerdict(makeItem("m1", "@MixedBag"), "keep");
    await store.recordVerdict(makeItem("m2", "@MixedBag"), "drop");
    await store.recordVerdict(makeItem("m3", "@MixedBag"), "keep");
    expect(store.getCreatorVerdict("youtube", "mixedbag")).toBeUndefined();
    expect(store.counts().droppedTotal).toBe(6);
  });

  it("evicts oldest item verdicts past maxItems and clears cleanly", async () => {
    const store = createMemoryStore({ maxItems: 2 });
    await store.recordVerdict(makeItem("a", "@c1"), "keep");
    await store.recordVerdict(makeItem("b", "@c1"), "keep");
    await store.recordVerdict(makeItem("c", "@c1"), "drop");

    expect(store.getItemVerdict("youtube", "a")).toBeUndefined();
    expect(store.getItemVerdict("youtube", "b")).toBe("keep");
    expect(store.getItemVerdict("youtube", "c")).toBe("drop");

    await store.clear();
    expect(store.getItemVerdict("youtube", "c")).toBeUndefined();
    expect(store.counts().cachedItems).toBe(0);
  });
});
