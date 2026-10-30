import { describe, expect, it, vi } from "vitest";
import { fetchFeed, parseFeed } from "../../packages/feed-ingestion/src/index.js";

const rss = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Example</title>
<item><title>বাংলাদেশ সংবাদ</title><link>https://example.com/story/1#top</link><guid>story-1</guid><description><![CDATA[<p>প্রথম খবর &amp; তথ্য</p>]]></description><pubDate>Sat, 31 Oct 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;
const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom story</title><id>tag:example.com,2026:1</id><link href="https://example.com/a"/><summary>Summary</summary><updated>2026-10-31T10:00:00Z</updated></entry></feed>`;

describe("feed ingestion parser", () => {
  it("parses RSS, normalizes URLs and creates stable fingerprints", () => {
    const a = parseFeed(rss, "https://example.com/feed");
    const b = parseFeed(rss, "https://example.com/feed");
    expect(a).toHaveLength(1);
    expect(a[0].title).toBe("বাংলাদেশ সংবাদ");
    expect(a[0].url).toBe("https://example.com/story/1");
    expect(a[0].summary).toContain("প্রথম খবর");
    expect(a[0].fingerprint).toBe(b[0].fingerprint);
    expect(a[0].publishedAt).toBe("2026-10-31T10:00:00.000Z");
  });
  it("parses Atom entries and relative links", () => {
    const items = parseFeed(atom, "https://example.com/feed");
    expect(items[0].url).toBe("https://example.com/a");
    expect(items[0].id).toContain("tag:example.com");
  });
  it("rejects DTD/entity expansion and malformed XML", () => {
    expect(() => parseFeed("<!DOCTYPE x [<!ENTITY e 'boom'>]><rss/>", "https://example.com/feed")).toThrow();
    expect(() => parseFeed("<rss><item></rss>", "https://example.com/feed")).toThrow();
  });
  it("drops insecure item links and rejects non-HTTPS feeds", () => {
    expect(parseFeed("<rss><channel><item><title>x</title><link>http://127.0.0.1/a</link></item></channel></rss>", "https://example.com/feed")).toHaveLength(0);
    expect(() => parseFeed(rss, "http://example.com/feed")).toThrow();
  });
  it("uses conditional requests and handles 304 without parsing a body", async () => {
    const request = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("If-None-Match")).toBe('"v1"');
      return new Response(null, { status: 304, headers: { etag: '"v2"' } });
    });
    const result = await fetchFeed("https://example.com/feed", { etag: '"v1"' }, request as any);
    expect(result.status).toBe("not_modified");
    expect(result.etag).toBe('"v2"');
    expect(result.items).toHaveLength(0);
  });
  it("rejects HTML content disguised as a feed", async () => {
    const request = vi.fn(async () => new Response("<html/>", { status: 200, headers: { "content-type": "text/html" } }));
    await expect(fetchFeed("https://example.com/feed", {}, request as any)).rejects.toThrow("content type");
  });
});
