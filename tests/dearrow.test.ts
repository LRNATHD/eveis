import { describe, expect, it } from "vitest";
import {
  cleanDeArrowTitle,
  isVagueClickbaitTitle,
  lookupDeArrowTitles,
  sha256Prefix4,
} from "../src/core/dearrow.js";

describe("DeArrow k-anonymous title curating", () => {
  it("computes exact 4-char lowercase hex SHA-256 prefix", async () => {
    const prefix = await sha256Prefix4("dQw4w9WgXcQ");
    expect(prefix).toMatch(/^[0-9a-f]{4}$/);
    expect(prefix).toBe("5f6b");
    expect(await sha256Prefix4("")).toBe("e3b0");
  });

  it("flags vague curiosity-gap clickbait titles while sparing descriptive titles", () => {
    expect(isVagueClickbaitTitle("This Changed Everything...")).toBe(true);
    expect(isVagueClickbaitTitle("I Tried Living Underground For 30 Days")).toBe(true);
    expect(isVagueClickbaitTitle("Why Nobody Talks About This")).toBe(true);
    expect(
      isVagueClickbaitTitle("Machining a Cycloidal Gearbox on a Manual Lathe"),
    ).toBe(false);
  });

  it("cleans DeArrow > escape prefixes and selects locked or non-negative-vote non-original titles", async () => {
    expect(cleanDeArrowTitle("How >NASA Built the >Apollo Guidance Computer")).toBe(
      "How NASA Built the Apollo Guidance Computer",
    );

    const mockFetch: typeof fetch = async (url) => {
      expect(String(url)).toContain("/api/branding/5f6b");
      return new Response(
        JSON.stringify({
          dQw4w9WgXcQ: {
            titles: [
              {
                title: ">Rick >Astley - Never Gonna Give You Up",
                original: false,
                votes: 3,
                locked: true,
              },
            ],
          },
          untrustedVid1: {
            titles: [
              {
                title: "Spam title",
                original: false,
                votes: -2,
                locked: false,
              },
            ],
          },
        }),
        { status: 200 },
      );
    };

    const resolved = await lookupDeArrowTitles(["dQw4w9WgXcQ"], mockFetch);
    expect(resolved.get("dQw4w9WgXcQ")).toBe("Rick Astley - Never Gonna Give You Up");
    expect(resolved.has("untrustedVid1")).toBe(false);
  });
});
