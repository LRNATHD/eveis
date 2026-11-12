import { describe, expect, it } from "vitest";
import { createNoveltyMemory, extractSignatureTokens } from "../src/background/novelty.js";

describe("dwell-based novelty memory", () => {
  it("extracts distinctive content tokens and ignores stopwords/URLs", () => {
    const tokens = extractSignatureTokens(
      "OpenAI just released a new quantized model on https://t.co/xyz123 for local laptops!",
    );
    expect(tokens.has("openai")).toBe(true);
    expect(tokens.has("quantized")).toBe(true);
    expect(tokens.has("https")).toBe(false);
  });

  it("drops near-duplicate unfollowed rehashes of an already-dwelled story while keeping distinct posts on the same topic", () => {
    const novelty = createNoveltyMemory();

    novelty.recordDwelled(
      "TSMC confirms 2nm wafer production yield passed 80 percent at Hsinchu fab ahead of schedule",
    );

    expect(
      novelty.isRedundantRehash(
        "Breaking: TSMC confirms 2nm wafer production yield has passed 80 percent at its Hsinchu fab ahead of schedule!",
      ),
    ).toBe(true);

    expect(
      novelty.isRedundantRehash(
        "How TSMC extreme ultraviolet pellicle membranes survive 500 watts of tin plasma",
      ),
    ).toBe(false);
  });
});
