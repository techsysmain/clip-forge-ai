export interface Word {
  word: string;
  start: number;
  end: number;
}

export interface Segment {
  text: string;
  start: number;
  end: number;
}

export interface Transcript {
  text: string;
  language?: string;
  words: Word[];
  segments: Segment[];
}

export interface Caption {
  start: number; // seconds relative to clip start
  end: number;
  text: string;
  /** Present only when real word-level timing is available */
  words: Word[];
}

export type CaptionPosition = "bottom" | "middle" | "top";
export type CaptionPreset = "clean" | "social" | "minimal" | "accessible";

export interface CaptionStyle {
  preset: CaptionPreset;
  fontSize: number; // px, based on a 1080px short side
  textColor: string; // #RRGGBB
  highlightColor: string;
  position: CaptionPosition;
  outline: number; // px, 0 = none
  background: boolean;
  bold: boolean;
  uppercase: boolean;
  highlightWord: boolean;
}

export const CAPTION_PRESETS: Record<CaptionPreset, CaptionStyle & { label: string; description: string }> = {
  clean: {
    label: "Clean",
    description: "White text with a dark outline",
    preset: "clean",
    fontSize: 64,
    textColor: "#FFFFFF",
    highlightColor: "#FFFFFF",
    position: "bottom",
    outline: 4,
    background: false,
    bold: true,
    uppercase: false,
    highlightWord: false,
  },
  social: {
    label: "Social",
    description: "Bold caps with highlighted spoken word",
    preset: "social",
    fontSize: 78,
    textColor: "#FFFFFF",
    highlightColor: "#FFE600",
    position: "middle",
    outline: 7,
    background: false,
    bold: true,
    uppercase: true,
    highlightWord: true,
  },
  minimal: {
    label: "Minimal",
    description: "Small, professional, subtle box",
    preset: "minimal",
    fontSize: 46,
    textColor: "#FFFFFF",
    highlightColor: "#FFFFFF",
    position: "bottom",
    outline: 0,
    background: true,
    bold: false,
    uppercase: false,
    highlightWord: false,
  },
  accessible: {
    label: "Accessible",
    description: "Large, high-contrast captions",
    preset: "accessible",
    fontSize: 88,
    textColor: "#FFFFFF",
    highlightColor: "#FFD400",
    position: "bottom",
    outline: 0,
    background: true,
    bold: true,
    uppercase: false,
    highlightWord: true,
  },
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Merges untrusted partial settings over a preset, validating every field. */
export function resolveStyle(input: unknown): CaptionStyle {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const preset = (raw.preset as CaptionPreset) in CAPTION_PRESETS ? (raw.preset as CaptionPreset) : "clean";
  const base = CAPTION_PRESETS[preset];
  const num = (v: unknown, min: number, max: number, d: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
  const color = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v.toUpperCase() : d);
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    preset,
    fontSize: num(raw.fontSize, 24, 140, base.fontSize),
    textColor: color(raw.textColor, base.textColor),
    highlightColor: color(raw.highlightColor, base.highlightColor),
    position: ["bottom", "middle", "top"].includes(raw.position as string)
      ? (raw.position as CaptionPosition)
      : base.position,
    outline: num(raw.outline, 0, 14, base.outline),
    background: bool(raw.background, base.background),
    bold: bool(raw.bold, base.bold),
    uppercase: bool(raw.uppercase, base.uppercase),
    highlightWord: bool(raw.highlightWord, base.highlightWord),
  };
}

/** Estimates how many characters fit on one caption line within the safe area. */
export function charsPerLine(width: number, style: CaptionStyle): number {
  const usable = width * 0.84;
  const charW = style.fontSize * (style.uppercase ? 0.72 : 0.58) * (style.bold ? 1.05 : 1);
  return Math.max(12, Math.min(48, Math.floor(usable / charW)));
}

interface CaptionOptions {
  maxCharsPerLine?: number;
  maxLines?: number;
  maxDuration?: number;
}

/**
 * Builds readable captions (<= 2 lines each) for the range [clipStart, clipEnd],
 * with times relative to the clip start. Uses word timing when available,
 * otherwise falls back to segment timing.
 */
export function buildCaptions(
  transcript: Transcript,
  clipStart: number,
  clipEnd: number,
  opts: CaptionOptions = {},
): Caption[] {
  const maxLine = opts.maxCharsPerLine ?? 28;
  const maxChars = maxLine * (opts.maxLines ?? 2);
  const maxDur = opts.maxDuration ?? 4.5;
  const duration = clipEnd - clipStart;
  const clamp = (n: number) => Math.min(duration, Math.max(0, n));

  const words = transcript.words
    .filter((w) => w.end > clipStart && w.start < clipEnd && w.word.trim())
    .map((w) => ({ word: w.word.trim(), start: clamp(w.start - clipStart), end: clamp(w.end - clipStart) }));

  const captions: Caption[] = [];

  if (words.length > 0) {
    let group: Word[] = [];
    const len = () => group.reduce((n, w) => n + w.word.length + 1, -1);
    const flush = () => {
      if (!group.length) return;
      captions.push({
        start: group[0].start,
        end: Math.max(group[group.length - 1].end, group[0].start + 0.2),
        text: group.map((w) => w.word).join(" "),
        words: group,
      });
      group = [];
    };
    for (const w of words) {
      if (group.length) {
        const gap = w.start - group[group.length - 1].end;
        if (len() + 1 + w.word.length > maxChars || gap > 0.8 || w.end - group[0].start > maxDur) flush();
      }
      group.push(w);
      const last = w.word.slice(-1);
      if ((/[.?!]/.test(last) && group.length >= 3) || (/[,;:]/.test(last) && len() > maxLine)) flush();
    }
    flush();
  } else {
    for (const seg of transcript.segments) {
      if (seg.end <= clipStart || seg.start >= clipEnd || !seg.text.trim()) continue;
      const s = clamp(seg.start - clipStart);
      const e = clamp(seg.end - clipStart);
      const tokens = seg.text.trim().split(/\s+/);
      const chunks: string[] = [];
      let cur = "";
      for (const t of tokens) {
        if (cur && cur.length + 1 + t.length > maxChars) {
          chunks.push(cur);
          cur = t;
        } else cur = cur ? `${cur} ${t}` : t;
      }
      if (cur) chunks.push(cur);
      const total = chunks.reduce((n, c) => n + c.length, 0) || 1;
      let t = s;
      for (const c of chunks) {
        const d = ((e - s) * c.length) / total;
        captions.push({ start: t, end: t + d, text: c, words: [] });
        t += d;
      }
    }
  }

  // Ensure captions never overlap
  for (let i = 0; i < captions.length - 1; i++) {
    if (captions[i].end > captions[i + 1].start) captions[i].end = captions[i + 1].start;
  }
  return captions.filter((c) => c.end - c.start > 0.05);
}

function pad(n: number, w = 2) {
  return String(n).padStart(w, "0");
}

export function srtTime(sec: number): string {
  const ms = Math.round(Math.max(0, sec) * 1000);
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor((ms % 3600000) / 60000))}:${pad(
    Math.floor((ms % 60000) / 1000),
  )},${pad(ms % 1000, 3)}`;
}

/** Wraps text into at most two balanced lines. */
export function wrapTwoLines(text: string, maxLine: number): string {
  if (text.length <= maxLine) return text;
  const words = text.split(" ");
  let best = text;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const diff = Math.abs(a.length - b.length);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = `${a}\n${b}`;
    }
  }
  return best;
}

export function toSrt(captions: Caption[]): string {
  return (
    captions
      .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${wrapTwoLines(c.text, 32)}\n`)
      .join("\n")
  );
}

function assTime(sec: number): string {
  const cs = Math.round(Math.max(0, sec) * 100);
  return `${Math.floor(cs / 360000)}:${pad(Math.floor((cs % 360000) / 6000))}:${pad(Math.floor((cs % 6000) / 100))}.${pad(cs % 100)}`;
}

function assColor(hex: string, alpha = "00"): string {
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return `&H${alpha}${b}${g}${r}`.toUpperCase();
}

function assText(s: string): string {
  return s.replace(/\\/g, "").replace(/[{}]/g, "").replace(/\r?\n/g, " ");
}

export function toAss(captions: Caption[], style: CaptionStyle, width: number, height: number): string {
  const vertical = height > width;
  const align = style.position === "top" ? 8 : style.position === "middle" ? 5 : 2;
  const marginV =
    style.position === "middle" ? 0 : Math.round(height * (vertical ? (style.position === "top" ? 0.12 : 0.2) : 0.07));
  const marginLR = Math.round(width * 0.08);
  const boxed = style.background;
  const outline = boxed ? 14 : style.outline;
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,DejaVu Sans,${Math.round(style.fontSize)},${assColor(style.textColor)},${assColor(style.textColor)},${
      boxed ? assColor("#000000", "60") : assColor("#000000")
    },${assColor("#000000", "80")},${style.bold ? -1 : 0},0,0,0,100,100,0,0,${boxed ? 3 : 1},${outline},0,${align},${marginLR},${marginLR},${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const fmt = (s: string) => assText(style.uppercase ? s.toUpperCase() : s);
  const lines: string[] = [];
  const inline = (hex: string) => `&H${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}&`.toUpperCase();
  const base = inline(style.textColor);
  const hl = inline(style.highlightColor);
  for (const c of captions) {
    if (style.highlightWord && c.words.length > 0) {
      c.words.forEach((w, i) => {
        const start = i === 0 ? c.start : w.start;
        const end = i < c.words.length - 1 ? c.words[i + 1].start : c.end;
        if (end <= start) return;
        const text = c.words
          .map((x, j) => (j === i ? `{\\c${hl}}${fmt(x.word)}{\\c${base}}` : fmt(x.word)))
          .join(" ");
        lines.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Default,,0,0,0,,${text}`);
      });
    } else {
      lines.push(`Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${fmt(c.text)}`);
    }
  }
  return [...header, ...lines, ""].join("\n");
}
