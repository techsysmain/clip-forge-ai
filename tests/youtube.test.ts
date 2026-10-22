import { describe, expect, it } from "vitest";
import { parseIsoDuration, parseYouTubeUrl } from "@/lib/youtube";

describe("parseYouTubeUrl", () => {
  const id = "dQw4w9WgXcQ";
  it.each([
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=10s`,
    `youtu.be/${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://m.youtube.com/watch?v=${id}`,
  ])("accepts %s", (u) => expect(parseYouTubeUrl(u)).toBe(id));

  it.each([
    "",
    "not a url",
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ%00",
    "https://evil.com/youtube.com/watch?v=dQw4w9WgXcQ",
    "javascript:alert(1)",
    "https://www.youtube.com/playlist?list=PL123",
  ])("rejects %j", (u) => expect(parseYouTubeUrl(u)).toBeNull());

  it("parses ISO durations", () => {
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("garbage")).toBe(0);
  });
});
