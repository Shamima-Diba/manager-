import { describe, it, expect } from "vitest";
import {
  assetGuard,
  normalizeBengali,
  parseSubtitles,
  subtitles,
  canTransition,
  retryDelay,
  ScriptSchema,
} from "../../packages/shared/src/index";
import {
  publicIP,
  encrypt,
  decrypt,
  redact,
  validateURL,
  limitedBytes,
} from "../../packages/security/src/index";
export const license = {
  origin: "manager fixture",
  creator: "manager authors",
  license: "CC0-1.0",
  evidence_url: "fixtures/LICENSE",
  retrieved_at: "2026-10-27T00:00:00.000Z",
  attribution: "No attribution required",
  commercial: "yes" as const,
  modifications: "allowed" as const,
  editorial_only: false,
  consent_notes: "No people, marks, or music",
  decision: "approved" as const,
  checksum: "a".repeat(64),
};
describe("editorial and security boundaries", () => {
  it("blocks unknown licenses", () =>
    expect(() => assetGuard({ ...license, commercial: "unknown" })).toThrow(
      "ASSET_GUARD",
    ));
  it("allows reviewed compatible rights", () =>
    expect(assetGuard(license)).toEqual(license));
  it("requires structured evidence fields", () =>
    expect(() => ScriptSchema.parse({ narration: "fabricated" })).toThrow());
  it("normalizes Bengali with explicit dictionary", () =>
    expect(normalizeBengali("ঢাকা", { ঢাকা: "ঢাকা শহর" })).toBe("ঢাকা শহর"));
  it("roundtrips user-provided timings", () => {
    const cues = [{ start: 0, end: 1.2, text: "বাংলার কণ্ঠ" }];
    expect(parseSubtitles(subtitles(cues, "srt"))).toEqual(cues);
    expect(parseSubtitles(subtitles(cues, "vtt"))).toEqual(cues);
  });
  it("rejects invented or invalid timing", () => {
    expect(() => parseSubtitles("untimed words")).toThrow();
    expect(() =>
      parseSubtitles("1\n00:00:02,000 --> 00:00:01,000\ntext"),
    ).toThrow();
  });
  it("unknown publication has no retry transition", () => {
    expect(canTransition("publication", "unknown", "dispatching")).toBe(false);
    expect(canTransition("render", "queued", "running")).toBe(true);
  });
  it("bounds retries with jitter", () =>
    expect(retryDelay(50, () => 0)).toBe(3600));
  it.each([
    "127.0.0.1",
    "10.2.3.4",
    "169.254.169.254",
    "100.64.0.1",
    "192.168.2.1",
    "::1",
    "::ffff:127.0.0.1",
    "fe80::1",
    "2001:db8::1",
  ])("blocks nonpublic IP %s", (ip) => expect(publicIP(ip)).toBe(false));
  it("rejects HTTP and private URL", async () => {
    await expect(validateURL("http://example.org")).rejects.toThrow();
    await expect(validateURL("https://127.0.0.1")).rejects.toThrow();
  });
  it("authenticated encryption rejects tampering", () => {
    const key = Buffer.alloc(32, 42),
      v = encrypt("test-only-token", key, "k1");
    expect(decrypt(v, key)).toBe("test-only-token");
    expect(() =>
      decrypt({ ...v, tag: Buffer.alloc(16).toString("base64") }, key),
    ).toThrow();
  });
  it("redacts credentials", () =>
    expect(redact("Bearer secret123 token=abc")).not.toContain("secret123"));
  it("limits streamed downloads", async () =>
    await expect(limitedBytes(new Response("12345"), 3)).rejects.toThrow(
      "large",
    ));
});
