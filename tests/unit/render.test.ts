import { it, expect } from "vitest";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { render, run, probe } from "../../packages/render-engine/src/index";
const base = {
  origin: "bundled fixture",
  creator: "manager authors",
  license: "CC0-1.0",
  evidence_url: "fixtures/LICENSE",
  retrieved_at: "2026-10-27T00:00:00.000Z",
  attribution: "No attribution required",
  commercial: "yes" as const,
  modifications: "allowed" as const,
  editorial_only: false,
  consent_notes: "No persons or trademarks",
  decision: "approved" as const,
};
it("renders actual MP4 with Bengali subtitles and valid metadata", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "manager-test-"));
  try {
    const ppm = path.resolve("tests/fixtures/scene.ppm");
    const file = path.join(dir, "scene.png");
    await run("ffmpeg", [
      "-y",
      "-i",
      ppm,
      "-frames:v",
      "1",
      "-threads",
      "1",
      file,
    ]);
    const bytes = await readFile(file);
    const output = path.join(dir, "result.mp4");
    const r = await render({
      media: file,
      license: {
        ...base,
        checksum: createHash("sha256").update(bytes).digest("hex"),
      },
      subtitles: await readFile("tests/fixtures/bengali.srt", "utf8"),
      ratio: "1:1",
      resolution: 720,
      seconds: 2,
      output,
    });
    expect(r.codec).toBe("h264");
    expect(r.width).toBe(720);
    expect(r.duration).toBeCloseTo(2, 0);
    expect(r.size).toBeGreaterThan(1000);
    expect(r.manifest[0].license).toBe("CC0-1.0");
    expect(
      (await probe(output)).streams.some((s: any) => s.codec_type === "audio"),
    ).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("invalid media fails and leaves no render temporary directory", async () => {
  const before = (await readdir(tmpdir())).filter((x) =>
    x.startsWith("manager-render-"),
  );
  const dir = await mkdtemp(path.join(tmpdir(), "invalid-manager-"));
  try {
    const media = path.join(dir, "invalid.bin");
    await writeFile(media, "not a media file");
    const checksum = createHash("sha256")
      .update("not a media file")
      .digest("hex");
    await expect(
      render({
        media,
        license: { ...base, checksum },
        ratio: "1:1",
        resolution: 720,
        seconds: 2,
        output: path.join(dir, "out.mp4"),
      }),
    ).rejects.toThrow();
    expect(
      (await readdir(tmpdir())).filter((x) => x.startsWith("manager-render-")),
    ).toEqual(before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("failure after temporary allocation cleans up", async () => {
  const before = (await readdir(tmpdir())).filter((x) =>
    x.startsWith("manager-render-"),
  );
  const dir = await mkdtemp(path.join(tmpdir(), "cleanup-manager-"));
  try {
    const media = path.join(dir, "scene.png");
    await run("ffmpeg", [
      "-y",
      "-i",
      path.resolve("tests/fixtures/scene.ppm"),
      "-frames:v",
      "1",
      "-threads",
      "1",
      media,
    ]);
    const checksum = createHash("sha256")
      .update(await readFile(media))
      .digest("hex");
    await expect(
      render({
        media,
        license: { ...base, checksum },
        subtitles: "invalid timing",
        ratio: "1:1",
        resolution: 720,
        seconds: 2,
        output: path.join(dir, "out.mp4"),
      }),
    ).rejects.toThrow();
    expect(
      (await readdir(tmpdir())).filter((x) => x.startsWith("manager-render-")),
    ).toEqual(before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
