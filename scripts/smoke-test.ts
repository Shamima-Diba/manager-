import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { run, render } from "../packages/render-engine/src/index.js";
const dir = await mkdtemp(path.join(tmpdir(), "manager-smoke-"));
try {
  const file = path.join(dir, "scene.png");
  await run("ffmpeg", [
    "-y",
    "-i",
    path.resolve("tests/fixtures/scene.ppm"),
    "-frames:v",
    "1",
    "-threads",
    "1",
    file,
  ]);
  const checksum = createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
  const result = await render({
    media: file,
    license: {
      origin: "fixture",
      creator: "manager authors",
      license: "CC0-1.0",
      evidence_url: "tests/fixtures/LICENSE",
      retrieved_at: "2026-10-27T00:00:00Z",
      attribution: "none",
      commercial: "yes",
      modifications: "allowed",
      editorial_only: false,
      consent_notes: "no identifiable people",
      decision: "approved",
      checksum,
    },
    ratio: "9:16",
    resolution: 720,
    seconds: 2,
    subtitles: await readFile("tests/fixtures/bengali.srt", "utf8"),
    output: path.join(dir, "smoke.mp4"),
  });
  console.log(
    JSON.stringify({
      status: "PASS",
      ...result,
      thumbnail: `${result.thumbnail.length} bytes (not included in log)`,
    }),
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
