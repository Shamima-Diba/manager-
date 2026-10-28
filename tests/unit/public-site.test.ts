import { it, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildSite } from "../../apps/public-site/src/build";
it("generates crawlable safe article, category, RSS, sitemap and search", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "site-test-"));
  try {
    const result = await buildSite(
      {
        workspaces: [
          { id: "w", slug: "banglar-voice-24", name: "Banglar Voice 24" },
        ],
        posts: [
          {
            workspace_id: "w",
            slug: "first-news",
            title: "বাংলার সংবাদ",
            body: "<script>alert(1)</script> public article",
            description: "Verified summary",
            category: "news",
            correction_note: "Correction made",
            published_at: "2026-10-27T00:00:00Z",
          },
        ],
      },
      dir,
      "https://news.example",
    );
    const html = await readFile(
      path.join(dir, "banglar-voice-24/articles/first-news/index.html"),
      "utf8",
    );
    expect(html).toContain("<h1>বাংলার সংবাদ</h1>");
    expect(html).toContain('rel="canonical"');
    expect(html).toContain("og:description");
    expect(html).not.toContain("<script>alert(1)");
    expect(html).not.toContain("signedUrl");
    expect(html).toContain("Correction made");
    expect(await readFile(path.join(dir, "sitemap.xml"), "utf8")).toContain(
      "first-news",
    );
    expect(
      await readFile(path.join(dir, "banglar-voice-24/rss.xml"), "utf8"),
    ).toContain("<rss");
    expect(result.pages).toBeGreaterThan(5);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
