import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectPlatformFromUrl } from "../src/ui/popup.js";

const root = process.cwd();

function walkTextFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === ".web-ext-artifacts" ||
      entry.name === "vendor" ||
      entry.name === "seeds" ||
      entry.name === "fonts"
    ) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTextFiles(full, out);
    } else if (/\.(ts|js|mjs|html|css|md|json)$/i.test(entry.name) && entry.name !== "package-lock.json") {
      out.push(full);
    }
  }
  return out;
}

describe("Chrome MV3 manifest, seeds, evil UI polish, and copy hygiene", () => {
  it("contains valid Chrome MV3 manifest with document_start scripts", () => {
    const manifestPath = path.join(root, "extension", "manifest.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      manifest_version: number;
      name: string;
      background?: { service_worker?: string };
      action?: { default_popup?: string };
      options_ui?: { page?: string };
      content_scripts?: Array<{ run_at?: string; js?: string[]; css?: string[] }>;
    };

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe("Eveis");
    expect(manifest.background?.service_worker).toBe("dist/background.js");
    expect(manifest.action?.default_popup).toBe("ui/popup.html");
    expect(manifest.options_ui?.page).toBe("ui/options.html");
    expect(manifest.content_scripts?.length).toBe(4);

    const referencedPaths = [
      manifest.background?.service_worker ?? "",
      manifest.action?.default_popup ?? "",
      manifest.options_ui?.page ?? "",
      ...(manifest.content_scripts ?? []).flatMap((cs) => [...(cs.js ?? []), ...(cs.css ?? [])]),
    ].filter(Boolean);

    for (const rel of referencedPaths) {
      expect(existsSync(path.join(root, "extension", rel)), `Missing ${rel}`).toBe(true);
    }

    for (const cs of manifest.content_scripts ?? []) {
      expect(cs.run_at).toBe("document_start");
    }
  });

  it("ships non-empty HackerTube, AiSList, and JetBrains Mono assets", () => {
    const videos = readFileSync(path.join(root, "extension/assets/seeds/hn-videos.txt"), "utf8")
      .trim()
      .split("\n");
    const slop = readFileSync(path.join(root, "extension/assets/seeds/slop-channels.txt"), "utf8")
      .trim()
      .split("\n");
    const fontStat = statSync(
      path.join(root, "extension/assets/fonts/jetbrains-mono-regular.woff2"),
    );

    expect(videos.length).toBeGreaterThan(6000);
    expect(slop.length).toBeGreaterThan(50000);
    expect(fontStat.size).toBeGreaterThan(20000);
  });

  it("enforces JetBrains Mono only and evil UI rules in theme.css", () => {
    const css = readFileSync(path.join(root, "extension/ui/theme.css"), "utf8");
    expect(css).toContain("JetBrains Mono");
    expect(css).toContain("#ff1e42");
    expect(css).not.toMatch(/transition\s*:\s*all\b/);
    expect(css).toContain("@media (hover: hover)");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("overscroll-behavior: contain");
    expect(css).toContain("align-items: center");
  });

  it("covers YouTube, Twitter, Instagram, and TikTok post-render UI bloat rules", () => {
    const ytCss = readFileSync(path.join(root, "extension/styles/youtube.css"), "utf8");
    const ytContent = readFileSync(path.join(root, "src/content/youtube.ts"), "utf8");
    expect(ytCss).toContain("eveis-yt-shorts");
    expect(ytCss).toContain("ytd-masthead");
    expect(ytCss).not.toContain("#eveis-evil-hud");
    expect(ytContent).toContain("hypeTitle");
    expect(ytContent).toContain("/shorts/");

    const xCss = readFileSync(path.join(root, "extension/styles/twitter.css"), "utf8");
    expect(xCss).toContain("eveis-x-dropped");

    const igCss = readFileSync(path.join(root, "extension/styles/instagram.css"), "utf8");
    expect(igCss).toContain("eveis-ig-on");

    const ttCss = readFileSync(path.join(root, "extension/styles/tiktok.css"), "utf8");
    expect(ttCss).toContain("eveis-tt-dropped");
    expect(ttCss).toContain("eveis-tt-dark");

    expect(detectPlatformFromUrl("https://example.org")).toBeNull();
    expect(detectPlatformFromUrl("chrome://extensions")).toBeNull();
    expect(detectPlatformFromUrl("https://www.youtube.com/watch?v=IS5ycm7VfXg")).toBe("youtube");
    expect(detectPlatformFromUrl("https://x.com/explore")).toBe("x");
    expect(detectPlatformFromUrl("https://www.instagram.com/reels/")).toBe("instagram");
    expect(detectPlatformFromUrl("https://www.tiktok.com/")).toBe("tiktok");
  });

  it("contains zero em dashes across project source, UI, and documentation files", () => {
    const files = walkTextFiles(root);
    const offenders: string[] = [];
    for (const file of files) {
      if (file.endsWith("manifest-and-hygiene.test.ts")) continue;
      const content = readFileSync(file, "utf8");
      if (content.includes("\u2014")) {
        offenders.push(path.relative(root, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
