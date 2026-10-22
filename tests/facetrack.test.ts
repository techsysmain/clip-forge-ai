import { describe, expect, it } from "vitest";
import { buildTrack, lerpExpression, primaryFace, trackCropFilter } from "@/lib/facetrack";

const face = (cx: number, cy = 0.4, w = 0.2, h = 0.3) => ({ cx, cy, w, h });

describe("primaryFace", () => {
  it("picks the largest face", () => {
    expect(primaryFace([face(0.2, 0.4, 0.1, 0.1), face(0.7, 0.4, 0.3, 0.4)])?.cx).toBe(0.7);
    expect(primaryFace([])).toBeNull();
  });
});

describe("buildTrack", () => {
  it("returns null when no face was ever found", () => {
    expect(buildTrack([{ t: 0, face: null }], 10)).toBeNull();
  });

  it("spans the whole clip and ignores single-frame outliers and tiny movements", () => {
    const track = buildTrack(
      [
        { t: 1, face: face(0.5) },
        { t: 2, face: face(0.51) },
        { t: 3, face: face(0.95) }, // outlier
        { t: 4, face: face(0.5) },
        { t: 5, face: null },
      ],
      6,
    )!;
    expect(track[0].t).toBe(0);
    expect(track[track.length - 1].t).toBe(6);
    expect(track.every((p) => p.cx === 0.5)).toBe(true);
  });

  it("follows a sustained move", () => {
    const track = buildTrack(
      [0, 1, 2, 3, 4, 5].map((t) => ({ t, face: face(t < 3 ? 0.3 : 0.8) })),
      5,
    )!;
    expect(track[0].cx).toBe(0.3);
    expect(track[track.length - 1].cx).toBe(0.8);
  });
});

describe("expressions", () => {
  it("is constant when the subject does not move", () => {
    expect(lerpExpression([{ t: 0, v: 10 }, { t: 5, v: 10 }])).toBe("10");
  });

  it("interpolates between keyframes", () => {
    const e = lerpExpression([{ t: 0, v: 0 }, { t: 2, v: 100 }]);
    expect(e).toBe("if(lt(t,2),0+(100)*(t-0)/2,100)");
  });

  it("builds a crop filter clamped inside the scaled frame", () => {
    const f = trackCropFilter({
      srcWidth: 1280,
      srcHeight: 720,
      width: 1080,
      height: 1920,
      assFile: "subs.ass",
      points: [{ t: 0, cx: 0, cy: 0.5 }, { t: 4, cx: 1, cy: 0.5 }],
    });
    expect(f).toContain("scale=3414:1920");
    expect(f).toContain("crop=1080:1920:'if(lt(t,4),0+(2334)*(t-0)/4,2334)':'0'");
    expect(f).toContain("ass=subs.ass[v]");
  });
});
