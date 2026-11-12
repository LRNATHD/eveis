import { describe, expect, it } from "vitest";
import { isStructuralSlop, scoreSlopCadence } from "../src/core/slop-cadence.js";

describe("scoreSlopCadence", () => {
  it("keeps normal human technical, weird, or punchy posts well below threshold", () => {
    const humanPost =
      "Just etched a two-layer flex circuit in ferric chloride on the kitchen stove. Traces held down to 6 mil.";
    const shortJoke = "honestly wild how good a sharp chisel feels";
    const normalList = "Three bugs left:\n1. SPI clock polarity\n2. DMA ring wrap\n3. brownout reset";

    expect(scoreSlopCadence(humanPost)).toBeLessThan(30);
    expect(scoreSlopCadence(shortJoke)).toBeLessThan(20);
    expect(scoreSlopCadence(normalList)).toBeLessThan(35);
    expect(isStructuralSlop(humanPost)).toBe(false);
  });

  it("catches stacked emoji-deck + engagement-bait + listicle LLM slop on X", () => {
    const slopThread = [
      "I studied 500 startups in today's fast-paced world so you don't have to.",
      "It's not about working harder, it's about leveraging systems.",
      "🚀 Unlock the power of distribution",
      "💡 Foster a game-changer mindset",
      "🔥 Supercharge your daily output",
      "💰 Skyrocket revenue with seamless workflows",
      "Save this for later. Let that sink in.",
    ].join("\n");

    expect(scoreSlopCadence(slopThread)).toBeGreaterThanOrEqual(65);
    expect(isStructuralSlop(slopThread)).toBe(true);
  });

  it("catches leaked assistant refusals/preambles and generic bot replies", () => {
    expect(
      isStructuralSlop("Certainly! Here is the revised tweet with higher engagement:"),
    ).toBe(true);

    expect(
      isStructuralSlop("Great point! This really resonates, thanks for sharing!", {
        isReply: true,
      }),
    ).toBe(true);

    expect(
      isStructuralSlop("Great point! Have you tested whether the MOSFET gate driver rings above 400kHz?", {
        isReply: false,
      }),
    ).toBe(false);
  });
});
