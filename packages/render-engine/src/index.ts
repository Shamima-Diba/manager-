import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { assetGuard, License, parseSubtitles } from "../../shared/src/index.js";
export async function run(command: string, args: string[], timeout = 120000) {
  return new Promise<string>((resolve, reject) => {
    const p = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "2" },
    });
    let out = "",
      err = "";
    p.stdout.on("data", (b) => {
      out = (out + b).slice(-200000);
    });
    p.stderr.on("data", (b) => {
      err = (err + b).slice(-10000);
    });
    const timer = setTimeout(() => p.kill("SIGKILL"), timeout);
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(out)
        : reject(Error(`${command} failed (${code}): ${err}`));
    });
  });
}
export async function probe(file: string) {
  return JSON.parse(
    await run(
      "ffprobe",
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-show_format",
        "-show_streams",
        "-of",
        "json",
        file,
      ],
      15000,
    ),
  );
}
export type RenderInput = {
  media: string;
  license: License;
  audio?: string;
  audioLicense?: License;
  subtitles?: string;
  ratio: "9:16" | "16:9" | "1:1";
  resolution: 720 | 1080;
  seconds: number;
  output: string;
};
export async function render(i: RenderInput) {
  assetGuard(i.license);
  if (i.audio) {
    if (!i.audioLicense) throw Error("ASSET_GUARD: audio rights missing");
    assetGuard(i.audioLicense);
  }
  if (
    !["9:16", "16:9", "1:1"].includes(i.ratio) ||
    ![720, 1080].includes(i.resolution) ||
    i.seconds <= 0 ||
    i.seconds > Number(process.env.MAX_RENDER_SECONDS || 120)
  )
    throw Error("Render bounds");
  const checksum = createHash("sha256")
    .update(await readFile(i.media))
    .digest("hex");
  if (checksum !== i.license.checksum)
    throw Error("ASSET_GUARD: checksum mismatch");
  if (
    i.audio &&
    createHash("sha256")
      .update(await readFile(i.audio))
      .digest("hex") !== i.audioLicense!.checksum
  )
    throw Error("Audio checksum mismatch");
  const info = await probe(i.media);
  const visual = info.streams.find((s: any) => s.codec_type === "video");
  if (
    !visual ||
    visual.width > 4096 ||
    visual.height > 4096 ||
    (Number(info.format.duration) || 0) > 600
  )
    throw Error("Invalid media bounds");
  if (i.audio) {
    const a = await probe(i.audio);
    if (
      !a.streams.some((s: any) => s.codec_type === "audio") ||
      Number(a.format.duration) > 600
    )
      throw Error("Invalid audio");
  }
  const dir = await mkdtemp(path.join(tmpdir(), "manager-render-"));
  try {
    const media = path.join(dir, "input");
    await copyFile(i.media, media);
    if (i.subtitles) {
      const cues = parseSubtitles(i.subtitles);
      if (cues.some((c) => c.end > i.seconds + 0.05))
        throw Error("Subtitle exceeds explicit duration");
      await writeFile(path.join(dir, "captions.srt"), i.subtitles);
    }
    const n = i.resolution;
    const [width, height] =
      i.ratio === "9:16"
        ? [n, Math.round((n * 16) / 9)]
        : i.ratio === "16:9"
          ? [Math.round((n * 16) / 9), n]
          : [n, n];
    const w = width - (width % 2),
      h = height - (height % 2);
    const args = [
      "-y",
      "-nostdin",
      "-threads",
      "2",
      "-protocol_whitelist",
      "file,pipe",
    ];
    const still = ["png", "jpeg", "webp", "bmp"].includes(visual.codec_name);
    if (still) args.push("-loop", "1");
    args.push("-i", media);
    if (i.audio) args.push("-protocol_whitelist", "file,pipe", "-i", i.audio);
    else args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
    let filter = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0x101827,setsar=1`;
    if (i.subtitles)
      filter += `,subtitles=${dir}/captions.srt:force_style='FontName=Noto Sans Bengali,FontSize=24,MarginV=40,Outline=2'`;
    args.push(
      "-vf",
      filter,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-t",
      String(i.seconds),
      "-r",
      "25",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      "-filter_threads",
      "1",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      path.join(dir, "output.mp4"),
    );
    await run("ffmpeg", args, Number(process.env.RENDER_TIMEOUT_MS) || 120000);
    const result = await probe(path.join(dir, "output.mp4"));
    const stream = result.streams.find((s: any) => s.codec_type === "video");
    if (
      stream.codec_name !== "h264" ||
      stream.width !== w ||
      Math.abs(Number(result.format.duration) - i.seconds) > 0.3
    )
      throw Error("Output validation failed");
    await copyFile(path.join(dir, "output.mp4"), i.output);
    await run("ffmpeg", [
      "-y",
      "-i",
      i.output,
      "-frames:v",
      "1",
      "-threads",
      "1",
      path.join(dir, "thumbnail.jpg"),
    ]);
    const bytes = await readFile(i.output);
    return {
      duration: Number(result.format.duration),
      width: w,
      height: h,
      codec: stream.codec_name,
      size: bytes.length,
      checksum: createHash("sha256").update(bytes).digest("hex"),
      template_version: "manager-still-v1",
      manifest: [i.license, ...(i.audioLicense ? [i.audioLicense] : [])],
      thumbnail: await readFile(path.join(dir, "thumbnail.jpg")),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
