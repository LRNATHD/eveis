// Structural LLM-slop cadence scorer adapted from midego1/slop-filter-for-x (MIT).
// Tuned conservatively so normal short or technical human writing never trips the gate.

const SLOP_LEXICON = [
  "delve",
  "tapestry",
  "testament to",
  "ever-evolving",
  "ever-changing",
  "fast-paced world",
  "in today's",
  "landscape of",
  "realm of",
  "unlock the",
  "harness the",
  "leverage the power",
  "leveraging systems",
  "seamless",
  "robust solution",
  "game-changer",
  "game changer",
  "paradigm shift",
  "navigate the complexities",
  "it's worth noting",
  "at its core",
  "crucial role",
  "a myriad of",
  "plethora",
  "foster a",
  "embark on",
  "shed light on",
  "supercharge",
  "skyrocket",
  "ushering in",
  "the future of work",
];

const ENGAGEMENT_HOOKS = [
  "let that sink in",
  "read that again",
  "bookmark this",
  "save this post",
  "save this for later",
  "follow for more",
  "you're welcome",
  "most people don't know",
  "nobody talks about this",
  "no one is talking about",
  "here's the kicker",
  "and the best part?",
  "steal my",
  "i studied",
  "i analyzed",
  "so you don't have to",
  "this changes everything",
  "buckle up",
  "a thread:",
  "mega thread",
];

const LEAKED_ASSISTANT_RE =
  /\b(?:as an ai (?:language )?model|i'?m sorry,? but i (?:can'?t|cannot)|i cannot fulfill|as a large language model|here is (?:the|a) (?:rewritten|revised) (?:post|tweet)|certainly!\s+here)\b/gi;

const PROMPT_RESIDUE_RE =
  /(?:\bsure[,!]\s+here'?s\b|\[insert [a-z ]+\]|\bas requested,|\btone:\s|\bword count:|\bhashtags:\s)/gi;

const ANTITHESIS_RE =
  /(?:\b(?:it'?s|this|that)\s+(?:is\s+)?not\s+(?:just\s+|about\s+)?[^.!?\n]{2,42}[\u2014.,-]\s*(?:it'?s|it is|this is|that'?s)\s|\bnot\s+because[^.!?\n]{2,42},?\s*but\s+because\b)/gi;

const GENERIC_BOT_REPLY_RE =
  /\b(?:great point|well said|couldn'?t agree more|this really resonates|thanks for sharing|spot on[.!]|insightful (?:post|thread)|100% agree)\b/gi;

const EMOJI_BULLET_LINE_RE =
  /^\s*(?:[✅✔️🚀💡🔥📌🎯⚡️🧠📈💰👇🔑⭐️✨🙌💬🛠️📊🤝🎁]|[-•*]\s*[\p{Extended_Pictographic}])/u;

export interface CadenceContext {
  isReply?: boolean;
}

function countWords(text: string): number {
  return (text.trim().match(/\S+/g) ?? []).length;
}

function countRegex(text: string, re: RegExp): number {
  re.lastIndex = 0;
  return (text.match(re) ?? []).length;
}

function addDiminishing(weight: number, hits: number): number {
  if (hits <= 0) return 0;
  let pts = 0;
  const capped = Math.min(hits, 4);
  for (let i = 0; i < capped; i++) {
    pts += weight / (i + 1);
  }
  return Math.round(pts);
}

export function scoreSlopCadence(text: string, ctx: CadenceContext = {}): number {
  if (!text) return 0;
  const raw = text.trim();
  const lower = raw.toLowerCase();
  const words = countWords(raw);

  const leakedHits = countRegex(raw, LEAKED_ASSISTANT_RE);
  const residueHits = countRegex(raw, PROMPT_RESIDUE_RE);
  if (leakedHits > 0) return 95;
  if (residueHits > 0) return 90;

  if (ctx.isReply && words <= 24) {
    const botPraise = countRegex(raw, GENERIC_BOT_REPLY_RE);
    if (botPraise > 0 && !raw.includes("?")) {
      return 75;
    }
  }

  let total = 0;

  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const emojiLines = lines.filter((l) => EMOJI_BULLET_LINE_RE.test(l)).length;
  if (emojiLines >= 3) {
    total += addDiminishing(30, emojiLines);
  }

  total += addDiminishing(22, countRegex(raw, ANTITHESIS_RE));

  const lexiconHits = SLOP_LEXICON.filter((phrase) => lower.includes(phrase)).length;
  total += addDiminishing(13, lexiconHits);

  const baitHits = ENGAGEMENT_HOOKS.filter((phrase) => lower.includes(phrase)).length;
  total += addDiminishing(19, baitHits);

  const numberedLines = countRegex(raw, /^\s*\d{1,2}[.)]\s+\S/gm);
  const threadSlash = countRegex(raw, /^\s*\d{1,2}\/(?:\d{1,2})?\s*$/gm);
  if (numberedLines >= 4 || threadSlash >= 1) {
    total += addDiminishing(16, Math.max(numberedLines - 2, threadSlash * 2));
  }

  const arrows = countRegex(raw, /[→↳➜►▪️▶️]/g);
  if (arrows >= 3) {
    total += addDiminishing(11, arrows - 1);
  }

  const emDashes = countRegex(raw, /\u2014/g);
  if (emDashes >= 3) {
    total += addDiminishing(10, emDashes - 2);
  }

  if (lines.length >= 6) {
    const shortLines = lines.filter((l) => {
      const w = countWords(l);
      return w > 0 && w <= 6;
    }).length;
    if (shortLines / lines.length >= 0.65) {
      total += addDiminishing(14, 2);
    }
  }

  if (words < 14) {
    total = Math.round(total * 0.35);
  }

  return Math.min(100, total);
}

export function isStructuralSlop(
  text: string,
  ctx: CadenceContext = {},
  threshold = 65,
): boolean {
  return scoreSlopCadence(text, ctx) >= threshold;
}
