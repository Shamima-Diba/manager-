import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { render } from "../../../packages/render-engine/src/index.js";
import {
  Mastodon,
  ProviderError,
} from "../../../packages/providers/src/index.js";
import {
  decrypt,
  redact,
  limitedBytes,
  safeFetch,
} from "../../../packages/security/src/index.js";
import { assetGuard } from "../../../packages/shared/src/index.js";
import { exportSite } from "../../public-site/src/build.js";
for (const k of ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])
  if (!process.env[k]) throw Error(`Missing ${k}`);
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 4,
  connectionTimeoutMillis: 10000,
});
const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const worker = process.env.WORKER_ID || randomUUID();
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
function log(event: string, details: Record<string, unknown> = {}) {
  console.log(
    redact(
      JSON.stringify({
        time: new Date().toISOString(),
        event,
        worker,
        ...details,
      }),
    ),
  );
}
async function call(name: string, args: unknown[] = []) {
  const safe = [
    "worker_dispatch",
    "worker_claim",
    "worker_renew",
    "worker_asset",
    "worker_finish",
    "worker_fail",
  ];
  if (!safe.includes(name)) throw Error("Invalid worker operation");
  const sql = `select manager_private.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as result`;
  return (await pool.query(sql, args)).rows[0].result;
}
async function asset(workspace: string, id: string, dir: string) {
  const a = await call("worker_asset", [workspace, id]);
  if (!a) throw Error("ASSET_GUARD: reviewed asset unavailable");
  assetGuard(a.license);
  const { data, error } = await db.storage
    .from(a.bucket)
    .createSignedUrl(a.object_path, 120);
  if (error) throw error;
  // Only the exact configured Supabase Storage origin is trusted, including local dev.
  const u = new URL(data.signedUrl),
    trusted = new URL(process.env.SUPABASE_URL!);
  if (u.origin !== trusted.origin) throw Error("Unexpected storage origin");
  const response = await fetch(u, {
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  const bytes = await limitedBytes(
    response,
    Number(process.env.MAX_DOWNLOAD_BYTES) || 52428800,
  );
  const file = path.join(dir, id);
  await writeFile(file, bytes);
  return { file, license: a.license };
}
async function perform(message: any) {
  const { run, job, token, msg_id } = message;
  let leaseLost = false;
  let renewInFlight = false;
  const renew = async (stage = "heartbeat") => {
    if (renewInFlight) return;
    renewInFlight = true;
    try {
      if (!(await call("worker_renew", [run.id, token, msg_id, stage])))
        leaseLost = true;
    } catch {
      leaseLost = true;
    } finally {
      renewInFlight = false;
    }
  };
  const timer = setInterval(() => void renew(), 15000);
  const checkpoint = async (stage: string) => {
    await renew(stage);
    if (leaseLost) throw Error("Lease lost or cancellation requested");
  };
  const dir = await mkdtemp(path.join(tmpdir(), "manager-job-"));
  try {
    await checkpoint("validate_input");
    let result: Record<string, unknown>;
    if (run.kind === "render") {
      const spec = job.spec;
      const media = await asset(run.workspace_id, spec.asset_id, dir);
      const audio = spec.audio_id
        ? await asset(run.workspace_id, spec.audio_id, dir)
        : null;
      await checkpoint("assets_authorized");
      const file = path.join(dir, "render.mp4");
      const output = await render({
        media: media.file,
        license: media.license,
        audio: audio?.file,
        audioLicense: audio?.license,
        subtitles: spec.subtitles || undefined,
        ratio: spec.ratio,
        resolution: spec.resolution,
        seconds: spec.seconds,
        output: file,
      });
      await checkpoint("output_inspected");
      const prefix = `${run.workspace_id}/${job.id}/${token}`;
      const renderPath = prefix + ".mp4";
      let up = await db.storage
        .from("video-renders")
        .upload(renderPath, await readFile(file), {
          contentType: "video/mp4",
          upsert: false,
        });
      if (up.error) throw up.error;
      up = await db.storage
        .from("thumbnails")
        .upload(prefix + ".jpg", output.thumbnail, {
          contentType: "image/jpeg",
          upsert: false,
        });
      if (up.error) throw up.error;
      await checkpoint("artifact_uploaded");
      const { thumbnail, ...metadata } = output;
      result = {
        ...metadata,
        path: renderPath,
        thumbnail_path: prefix + ".jpg",
        provider_provenance: { renderer: "FFmpeg", generative_media: false },
        attribution_manifest: output.manifest,
      };
    } else if (run.kind === "publish") {
      if (!job?.connection || !job?.secret)
        throw new ProviderError(
          "auth",
          "Not configured: social credentials missing",
        );
      if (job.connection.status !== "connected")
        throw new ProviderError("auth", "Disconnected account");
      const key = Buffer.from(process.env.TOKEN_KEY_BASE64 || "", "base64");
      if (job.secret.kid !== process.env.TOKEN_KEY_ID)
        throw new ProviderError("auth", "Encryption key id unavailable");
      const access = decrypt(job.secret, key);
      const provider = new Mastodon(job.connection.origin);
      await checkpoint("before_external_publish");
      const submitted = await provider.publish({
        text: job.caption,
        key: job.idempotency_key,
        token: access,
        language: "bn",
      });
      log("provider_submitted", { run: run.id, provider_id: submitted.id });
      // Transport success is not sufficient: require read-back confirmation. Unknown is never retried.
      result = await provider.verify(submitted.id, access);
    } else if (run.kind === "site") {
      await checkpoint("static_site_build");
      result = await exportSite();
      if (process.env.SITE_BUILD_HOOK) {
        const r = await safeFetch(process.env.SITE_BUILD_HOOK, {
          method: "POST",
        });
        if (!r.ok) throw Error(`Deploy hook HTTP ${r.status}`);
        result = {
          ...result,
          deploy_hook: "accepted; deployment confirmation is external",
        };
      } else
        result = {
          ...result,
          deployment:
            "files rebuilt on mounted output; serve with static host or deploy separately",
        };
    } else throw Error("Unsupported workflow kind");
    if (leaseLost) {
      if (run.kind === "publish")
        throw new ProviderError(
          "unknown",
          "Lease lost after provider side effect",
        );
      throw Error("Lease lost");
    }
    await call("worker_finish", [
      run.id,
      token,
      msg_id,
      JSON.stringify(result),
    ]);
    log("job_completed", { run: run.id, kind: run.kind });
  } catch (e) {
    const err = e as Error;
    const category =
      e instanceof ProviderError
        ? e.category
        : run.kind === "publish"
          ? "unknown"
          : "render_error";
    log("job_error", { run: run.id, category, error: redact(err.message) });
    try {
      await call("worker_fail", [
        run.id,
        token,
        msg_id,
        category,
        redact(err.message),
        e instanceof ProviderError ? e.retryAfter : 60,
      ]);
    } catch (f) {
      log("outcome_record_failed", {
        run: run.id,
        error: (f as Error).message,
      });
    }
  } finally {
    clearInterval(timer);
    await rm(dir, { recursive: true, force: true });
  }
}
log("worker_started");
while (!stopping) {
  try {
    await call("worker_dispatch");
    const message = await call("worker_claim", [worker]);
    if (message) await perform(message);
    else await new Promise((r) => setTimeout(r, 2000));
  } catch (e) {
    log("worker_loop_error", { error: (e as Error).message });
    await new Promise((r) => setTimeout(r, 5000));
  }
}
await pool.end();
log("worker_stopped");
