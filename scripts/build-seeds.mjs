import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedsDir = path.join(rootDir, "extension", "assets", "seeds");
const submoduleAisList = path.join(rootDir, "vendor", "AiSList", "AiSList", "aislist_blocklist.txt");

const HACKERTUBE_VIDEOS_URL = "https://hackertube.org/download/videos.jsonl";
const AISLIST_FALLBACK_URL =
  "https://raw.githubusercontent.com/Override92/AiSList/main/AiSList/aislist_blocklist.txt";

function normKey(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

async function main() {
  await mkdir(seedsDir, { recursive: true });

  const [videosJsonl, aislistRaw] = await Promise.all([
    fetchText(HACKERTUBE_VIDEOS_URL),
    existsSync(submoduleAisList)
      ? readFile(submoduleAisList, "utf8")
      : fetchText(AISLIST_FALLBACK_URL),
  ]);

  const hnVideos = new Set();
  const hnChannels = new Set();

  for (const line of videosJsonl.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const row = JSON.parse(trimmed);
    const vid = row.vid || row.video_id || row.id;
    if (typeof vid === "string" && vid.length >= 8) {
      hnVideos.add(vid.trim());
    }
    for (const candidate of [row.channel, row.channel_id, row.channel_handle]) {
      const key = normKey(candidate);
      if (key.length >= 2) hnChannels.add(key);
    }
  }

  const slopChannels = new Set();
  for (const line of aislistRaw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("!") || trimmed.startsWith("#")) continue;
    const key = normKey(trimmed);
    if (key.length >= 2 && !hnChannels.has(key)) {
      slopChannels.add(key);
    }
  }

  const sortedVideos = [...hnVideos].sort();
  const sortedHnChannels = [...hnChannels].sort();
  const sortedSlop = [...slopChannels].sort();

  await Promise.all([
    writeFile(path.join(seedsDir, "hn-videos.txt"), sortedVideos.join("\n") + "\n", "utf8"),
    writeFile(path.join(seedsDir, "hn-channels.txt"), sortedHnChannels.join("\n") + "\n", "utf8"),
    writeFile(path.join(seedsDir, "slop-channels.txt"), sortedSlop.join("\n") + "\n", "utf8"),
  ]);

  console.log(
    `Built seeds: ${sortedVideos.length} HN videos, ${sortedHnChannels.length} HN channels, ${sortedSlop.length} slop channels`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
