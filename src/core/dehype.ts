const PRESERVED_ACRONYMS = new Set([
  "2D",
  "3D",
  "AI",
  "API",
  "ARM",
  "ASIC",
  "CAD",
  "CAM",
  "CEO",
  "CERN",
  "CGI",
  "CLI",
  "CNC",
  "CPU",
  "CRT",
  "CSS",
  "CTO",
  "DAC",
  "DIY",
  "DMA",
  "DNS",
  "DSP",
  "EDA",
  "EEG",
  "EMC",
  "EMI",
  "ESP",
  "EU",
  "FM",
  "FPGA",
  "GCC",
  "GLSL",
  "GPIO",
  "GPS",
  "GPU",
  "GUI",
  "HDL",
  "HDMI",
  "HF",
  "HTML",
  "HTTP",
  "HTTPS",
  "I2C",
  "IC",
  "IDE",
  "IOT",
  "IP",
  "IR",
  "ISA",
  "JIT",
  "JPL",
  "JS",
  "JSON",
  "LAN",
  "LASER",
  "LCD",
  "LED",
  "LIDAR",
  "LLM",
  "LNA",
  "LORA",
  "MAC",
  "MCU",
  "MEMS",
  "MIDI",
  "MIT",
  "ML",
  "MLX",
  "MOSFET",
  "MRI",
  "NASA",
  "NFC",
  "NLP",
  "NVME",
  "NYC",
  "OLED",
  "OS",
  "PCB",
  "PCI",
  "PCIE",
  "PDF",
  "PID",
  "PLL",
  "PWM",
  "QFP",
  "QR",
  "RADAR",
  "RAM",
  "RF",
  "RGB",
  "RISC",
  "RL",
  "ROM",
  "ROS",
  "RTOS",
  "RUST",
  "SBC",
  "SDK",
  "SDR",
  "SF",
  "SIMD",
  "SLA",
  "SLS",
  "SMD",
  "SMT",
  "SOC",
  "SPI",
  "SQL",
  "SRAM",
  "SSD",
  "SSH",
  "SVG",
  "SWD",
  "TCP",
  "TLA",
  "TLS",
  "TPU",
  "TS",
  "TTL",
  "TV",
  "UART",
  "UDP",
  "UHF",
  "UI",
  "UK",
  "URL",
  "US",
  "USA",
  "USB",
  "USB-C",
  "UV",
  "UX",
  "VCO",
  "VFD",
  "VFX",
  "VGA",
  "VHF",
  "VHS",
  "VLSI",
  "VM",
  "VPN",
  "VR",
  "WASM",
  "WIFI",
  "X86",
  "XML",
]);

const YT_THUMB_RE = /^https?:\/\/i\d*\.ytimg\.com\/vi(?:_webp)?\/([A-Za-z0-9_-]{11})\//i;

export function normalizeHandle(raw?: string | null): string {
  if (!raw || typeof raw !== "string") return "";
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

export function isYouTubeSafeRoute(pageUrl: string): boolean {
  try {
    const pathname = new URL(pageUrl).pathname.replace(/\/+$/, "") || "/";
    return pathname !== "/" && pathname !== "/watch" && pathname !== "/results";
  } catch {
    return false;
  }
}

function stripPunct(token: string): { lead: string; core: string; trail: string } {
  const match = /^([^A-Za-z0-9]*)([A-Za-z0-9][A-Za-z0-9'-]*[A-Za-z0-9]|[A-Za-z0-9])([^A-Za-z0-9]*)$/.exec(
    token,
  );
  if (!match) return { lead: "", core: token, trail: "" };
  return { lead: match[1] ?? "", core: match[2] ?? token, trail: match[3] ?? "" };
}

function isAcronym(core: string): boolean {
  return PRESERVED_ACRONYMS.has(core.toUpperCase());
}

function isShoutWord(core: string): boolean {
  if (isAcronym(core)) return false;
  const letters = core.replace(/[^A-Za-z]/g, "");
  return letters.length >= 2 && letters === letters.toUpperCase();
}

function capitalizeWord(word: string): string {
  return word.replace(/[A-Za-z]/, (ch) => ch.toUpperCase());
}

function isUrlOrHandle(part: string): boolean {
  return /^(?:https?:\/\/|www\.|@)/i.test(part.trim()) || part.includes("_");
}

export function calmTitle(title: string): string {
  if (!title) return title;
  const collapsed = title.replace(/!{2,}/g, "!").replace(/\?{2,}/g, "?");
  const parts = collapsed.split(/(\s+)/);
  const wordIndices: number[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part || /^\s+$/.test(part) || isUrlOrHandle(part)) continue;
    const { core } = stripPunct(part);
    const letters = core.replace(/[^A-Za-z]/g, "");
    if (letters.length >= 2 && !isAcronym(core)) {
      wordIndices.push(i);
    }
  }

  if (wordIndices.length === 0) return collapsed;

  const shoutCount = wordIndices.filter((idx) => isShoutWord(stripPunct(parts[idx]!).core)).length;
  const fullShout = shoutCount / wordIndices.length >= 0.75;

  if (fullShout) {
    let sentenceStart = true;
    return parts
      .map((part) => {
        if (!part || /^\s+$/.test(part) || isUrlOrHandle(part)) return part;
        const { lead, core, trail } = stripPunct(part);
        const letters = core.replace(/[^A-Za-z]/g, "");
        if (!letters) return part;

        let nextCore: string;
        if (isAcronym(core)) {
          nextCore = core.toUpperCase();
        } else {
          const lower = core.toLowerCase();
          nextCore = sentenceStart ? capitalizeWord(lower) : lower;
        }
        sentenceStart = /[:.!?]$/.test(trail);
        return `${lead}${nextCore}${trail}`;
      })
      .join("");
  }

  const nonSpaceIndices: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] && !/^\s+$/.test(parts[i]!)) nonSpaceIndices.push(i);
  }

  let runStart = -1;
  const lowerPositions = new Set<number>();

  for (let k = 0; k <= nonSpaceIndices.length; k++) {
    const partIdx = nonSpaceIndices[k];
    const partVal = partIdx !== undefined ? parts[partIdx]! : "";
    const shouting =
      partIdx !== undefined && !isUrlOrHandle(partVal) && isShoutWord(stripPunct(partVal).core);
    if (shouting) {
      if (runStart === -1) runStart = k;
    } else if (runStart !== -1) {
      if (k - runStart >= 2) {
        for (let j = runStart; j < k; j++) lowerPositions.add(nonSpaceIndices[j]!);
      }
      runStart = -1;
    }
  }

  if (lowerPositions.size === 0) return collapsed;

  return parts
    .map((part, idx) => {
      if (!lowerPositions.has(idx)) return part;
      const { lead, core, trail } = stripPunct(part);
      const lowered = core.toLowerCase();
      return `${lead}${idx === nonSpaceIndices[0] ? capitalizeWord(lowered) : lowered}${trail}`;
    })
    .join("");
}

export function midFrameThumbUrl(url: string, videoId?: string): string {
  if (!url) return url;
  const match = YT_THUMB_RE.exec(url);
  const resolvedId = match?.[1] ?? (videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : "");
  if (!resolvedId) return url;
  return `https://i.ytimg.com/vi/${resolvedId}/hq2.jpg`;
}

const HYPE_SUFFIXES = [
  " 🚨 (GONE WRONG!!)",
  " 😱 WAIT TILL THE END!!",
  " 🔥 NOBODY TALKS ABOUT THIS!!",
  " 💀 IT'S OVER...",
  " 🤯 EXPOSED!!",
];

export function hypeTitle(title: string): string {
  if (!title) return title;
  const trimmed = title.trim();
  if (!trimmed) return title;
  const shouted = trimmed
    .split(/(\s+)/)
    .map((part) => (isUrlOrHandle(part) ? part : part.toUpperCase()))
    .join("")
    .replace(/!+/g, "!!!")
    .replace(/\?+/g, "?!");

  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash = (hash * 31 + trimmed.charCodeAt(i)) >>> 0;
  }
  const suffix = HYPE_SUFFIXES[hash % HYPE_SUFFIXES.length] ?? " 🚨!!";
  if (/[🚨😱🔥💀🤯]/.test(shouted)) return shouted;
  return `${shouted}${suffix}`;
}

export function clickbaitThumbUrl(url: string, videoId?: string): string {
  if (!url) return url;
  const match = YT_THUMB_RE.exec(url);
  const resolvedId = match?.[1] ?? (videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : "");
  if (!resolvedId) return url;
  return `https://i.ytimg.com/vi/${resolvedId}/hqdefault.jpg`;
}
