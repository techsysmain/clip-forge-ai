import type { Caption, CaptionStyle } from "@/lib/subtitles";

/** Approximates the burned-in subtitle look using container-relative units (1080px short side). */
export function CaptionOverlay({
  caption,
  time,
  style,
  vertical,
}: {
  caption: Caption | undefined;
  time: number;
  style: CaptionStyle;
  vertical: boolean;
}) {
  if (!caption) return null;
  const pos =
    style.position === "top"
      ? { top: vertical ? "12%" : "7%" }
      : style.position === "middle"
        ? { top: "50%", transform: "translateY(-50%)" }
        : { bottom: vertical ? "20%" : "7%" };
  const fmt = (s: string) => (style.uppercase ? s.toUpperCase() : s);
  const outline = style.outline;
  const shadow =
    !style.background && outline > 0
      ? [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 2], [0, -2], [2, 0], [-2, 0]]
          .map(([x, y]) => `${(x * outline) / 2.2}cqmin ${(y * outline) / 2.2}cqmin 0 #000`)
          .join(",")
      : undefined;
  return (
    <div className="pointer-events-none absolute inset-x-0 flex justify-center px-[8%]" style={pos}>
      <p
        className="text-center leading-tight"
        style={{
          fontSize: `${style.fontSize / 10.8}cqmin`,
          fontWeight: style.bold ? 800 : 500,
          color: style.textColor,
          textShadow: shadow,
          background: style.background ? "rgba(0,0,0,0.6)" : undefined,
          padding: style.background ? "0.2em 0.5em" : undefined,
          borderRadius: "0.15em",
        }}
      >
        {caption.words.length > 0
          ? caption.words.map((w, i) => {
              const on = style.highlightWord && time >= w.start && time < (caption.words[i + 1]?.start ?? caption.end);
              return (
                <span key={i} style={{ color: on ? style.highlightColor : undefined }}>
                  {fmt(w.word)}{" "}
                </span>
              );
            })
          : fmt(caption.text)}
      </p>
    </div>
  );
}
