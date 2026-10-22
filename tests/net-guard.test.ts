import { describe, expect, it } from "vitest";
import { assertSafeUrl, isPrivateIp, UnsafeUrlError } from "@/lib/net-guard";

describe("isPrivateIp", () => {
  it.each(["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.16.0.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])(
    "blocks %s",
    (ip) => expect(isPrivateIp(ip)).toBe(true),
  );
  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"])("allows %s", (ip) => expect(isPrivateIp(ip)).toBe(false));
});

describe("assertSafeUrl", () => {
  it.each([
    "http://localhost/video.mp4",
    "http://127.0.0.1:8080/x.mp4",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/x",
    "ftp://example.com/x.mp4",
    "file:///etc/passwd",
    "https://user:pass@example.com/x.mp4",
    "not a url",
  ])("rejects %s", async (u) => {
    await expect(assertSafeUrl(u)).rejects.toBeInstanceOf(UnsafeUrlError);
  });
  it("accepts a public IP literal", async () => {
    await expect(assertSafeUrl("https://93.184.216.34/video.mp4")).resolves.toBeInstanceOf(URL);
  });
});
