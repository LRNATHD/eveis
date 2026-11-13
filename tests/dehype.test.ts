import { describe, expect, it } from "vitest";
import { calmTitle, hypeTitle, midFrameThumbUrl, normalizeHandle } from "../src/core/dehype.js";

describe("normalizeHandle", () => {
  it("strips leading @ and lowercases", () => {
    expect(normalizeHandle("  @@MakerLab ")).toBe("makerlab");
    expect(normalizeHandle("UC3-uyUX8s536lUkrWwYvfDg")).toBe("uc3-uyux8s536lukrwwyvfdg");
    expect(normalizeHandle(undefined)).toBe("");
  });
});

describe("calmTitle", () => {
  it("leaves normal mixed-case titles untouched", () => {
    const original = "Building a High-Altitude Stratospheric Balloon PCB from Scratch";
    expect(calmTitle(original)).toBe(original);
  });

  it("calms screaming all-caps titles while preserving technical acronyms", () => {
    const loud = "THIS TINY PCB CHANGED GPU DESIGN FOREVER!!!";
    expect(calmTitle(loud)).toBe("This tiny PCB changed GPU design forever!");
  });

  it("calms multi-word shouting segments inside mixed titles", () => {
    const semiLoud = "I Built a 3D Printer That ACTUALLY WORKS INSANELY WELL!!";
    expect(calmTitle(semiLoud)).toBe("I Built a 3D Printer That actually works insanely well!");
  });

  it("preserves short acronyms like NASA, MIT, FPGA, USB-C, LLM, AI, DIY", () => {
    const techLoud = "HOW NASA AND MIT BUILT AN FPGA AI CHIP WITH USB-C";
    expect(calmTitle(techLoud)).toBe("How NASA and MIT built an FPGA AI chip with USB-C");
  });

  it("never alters case-sensitive URLs, @handles, or SNAKE_CASE identifiers inside shouting text", () => {
    expect(calmTitle("WATCH THIS NOW!! @MakerLab https://t.co/AbCdEf99")).toBe(
      "Watch this now! @MakerLab https://t.co/AbCdEf99",
    );
    expect(calmTitle("Why O_RDONLY and O_NONBLOCK matter in POSIX")).toBe(
      "Why O_RDONLY and O_NONBLOCK matter in POSIX",
    );
  });
});

describe("midFrameThumbUrl", () => {
  it("rewrites standard and custom YouTube thumbnail URLs to hq2.jpg", () => {
    expect(
      midFrameThumbUrl("https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg?sqp=abc"),
    ).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hq2.jpg");

    expect(
      midFrameThumbUrl("https://i9.ytimg.com/vi_webp/JXDEuBa_yeg/hqdefault_custom_2.webp?v=123"),
    ).toBe("https://i.ytimg.com/vi/JXDEuBa_yeg/hq2.jpg");
  });

  it("uses explicit videoId fallback when URL is non-standard", () => {
    expect(midFrameThumbUrl("https://yt3.ggpht.com/something", "JXDEuBa_yeg")).toBe(
      "https://i.ytimg.com/vi/JXDEuBa_yeg/hq2.jpg",
    );
  });

  it("leaves unrelated image URLs unchanged when no videoId exists", () => {
    expect(midFrameThumbUrl("https://pbs.twimg.com/media/abc.jpg")).toBe(
      "https://pbs.twimg.com/media/abc.jpg",
    );
  });
});

describe("hypeTitle", () => {
  it("converts calm titles to all-caps shouting with clickbait suffixes", () => {
    const out = hypeTitle("Building a PCB from scratch?");
    expect(out).toContain("BUILDING A PCB FROM SCRATCH?!");
    expect(out.length).toBeGreaterThan("Building a PCB from scratch?".length);
  });
});
