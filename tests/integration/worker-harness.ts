// REAL PostgreSQL+pgmq and actual worker/FFmpeg. Storage HTTP is an explicit LOCAL TEST STUB.
// Run ONLY on disposable database after bootstrap + all migrations.
// TEST_DATABASE_URL must allow fixture inserts; no production credentials or data.
import pg from "pg";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { run, probe } from "../../packages/render-engine/src/index.js";
if (!process.env.TEST_DATABASE_URL)
  throw Error("TEST_DATABASE_URL required, disposable database only");
const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
const dir = await mkdtemp(path.join(tmpdir(), "manager-harness-"));
const outputDir = process.env.HARNESS_EVIDENCE_DIR;
const objects = new Map<string, Buffer>();
const user = randomUUID(),
  workspace = randomUUID(),
  content = randomUUID(),
  version = randomUUID(),
  asset = randomUUID();
let child: ReturnType<typeof spawn> | undefined;
let logs = "";
const server = createServer(async (req, res) => {
  try {
    const route = new URL(req.url!, "http://localhost").pathname;
    const prefix = "/storage/v1";
    if (req.method === "POST" && route === "/rest/v1/rpc/public_site_data") {
      for await (const _ of req) {
      }
      const snapshot = (
        await pool.query("select public.public_site_data()as snapshot")
      ).rows[0].snapshot;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(snapshot));
      return;
    }
    if (req.method === "POST" && route.startsWith(prefix + "/object/sign/")) {
      for await (const _ of req) {
      }
      const object = decodeURIComponent(
        route.slice((prefix + "/object/sign/").length),
      );
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          signedURL: "/object/sign/" + object + "?token=LOCAL_TEST_ONLY",
        }),
      );
      return;
    }
    if (req.method === "GET" && route.startsWith(prefix + "/object/sign/")) {
      const object = decodeURIComponent(
        route.slice((prefix + "/object/sign/").length),
      );
      const b = objects.get(object);
      if (!b) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.setHeader("content-type", "image/png");
      res.end(b);
      return;
    }
    if (req.method === "POST" && route.startsWith(prefix + "/object/")) {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c);
      const object = decodeURIComponent(
        route.slice((prefix + "/object/").length),
      );
      objects.set(object, Buffer.concat(chunks));
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ Key: object, Id: randomUUID() }));
      return;
    }
    res.writeHead(404);
    res.end("LOCAL TEST STUB: route unavailable");
  } catch {
    res.writeHead(500);
    res.end();
  }
});
try {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("listen failed");
  const file = path.join(dir, "fixture.png");
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
  const media = await readFile(file),
    checksum = createHash("sha256").update(media).digest("hex");
  objects.set("source-assets/" + workspace + "/" + asset, media);
  const license = {
    origin: "local fixture",
    creator: "manager authors",
    license: "CC0-1.0",
    evidence_url: "tests/fixtures/LICENSE",
    retrieved_at: "2026-10-27T00:00:00Z",
    attribution: "none",
    commercial: "yes",
    modifications: "allowed",
    editorial_only: false,
    consent_notes: "No people",
    decision: "approved",
    checksum,
  };
  await pool.query(
    "insert into auth.users(id,email,email_confirmed_at)values($1,$2,now())",
    [user, "harness-" + user + "@example.test"],
  );
  await pool.query(
    "insert into public.workspaces(id,name,slug)values($1,$2,$3)",
    [workspace, "Worker test", "worker-" + workspace],
  );
  await pool.query(
    "insert into public.workspace_members values($1,$2,'owner')",
    [workspace, user],
  );
  await pool.query(
    "insert into public.content_items(id,workspace_id,title,body,created_by)values($1,$2,$3,$4,$5)",
    [content, workspace, "বাংলার সংবাদ", "Local worker test", user],
  );
  await pool.query(
    "insert into public.content_versions(id,workspace_id,content_id,version,payload,sha256)values($1,$2,$3,1,$4,$5)",
    [version, workspace, content, "{}", "test"],
  );
  await pool.query(
    "update public.content_items set current_version_id=$1 where id=$2",
    [version, content],
  );
  await pool.query(
    "insert into public.assets(id,workspace_id,object_path,mime,size_bytes,checksum)values($1,$2,$3,'image/png',$4,$5)",
    [asset, workspace, workspace + "/" + asset, media.length, checksum],
  );
  await pool.query(
    "insert into public.asset_licenses(workspace_id,asset_id,details,decision)values($1,$2,$3,'approved')",
    [workspace, asset, license],
  );
  const client = await pool.connect();
  let renderId: string;
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [
      user,
    ]);
    await client.query("set local role authenticated");
    renderId = (
      await client.query(
        "select public.create_render($1,$2,null,$3,'1:1',720,2) as id",
        [content, asset, await readFile("tests/fixtures/bengali.srt", "utf8")],
      )
    ).rows[0].id;
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
  const workerURL = new URL(process.env.TEST_DATABASE_URL!);
  workerURL.searchParams.set("options", "-c role=manager_worker_api");
  child = spawn(
    process.execPath,
    ["--import", "tsx", "apps/worker/src/main.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: workerURL.href,
        SUPABASE_URL: `http://127.0.0.1:${address.port}`,
        SUPABASE_SERVICE_ROLE_KEY: "LOCAL_TEST_STUB_NOT_A_REAL_CREDENTIAL",
        WORKER_ID: "harness-worker",
        SITE_OUTPUT_DIR: path.join(dir, "site"),
        PUBLIC_SITE_ORIGIN: "https://fixture.example",
        SITE_BUILD_HOOK: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout!.on("data", (b) => {
    logs += b.toString();
  });
  child.stderr!.on("data", (b) => {
    logs += b.toString();
  });
  let row: any;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    row = (
      await pool.query("select *from public.render_jobs where id=$1", [
        renderId,
      ])
    ).rows[0];
    if (row.status === "succeeded" || row.status === "failed") break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (row?.status !== "succeeded")
    throw Error(
      "Worker did not succeed: " + JSON.stringify(row) + " logs: " + logs,
    );
  const mp4 = objects.get("video-renders/" + row.artifact_path);
  if (!mp4) throw Error("Upload not present in storage stub");
  await writeFile(path.join(dir, "actual.mp4"), mp4);
  const metadata = await probe(path.join(dir, "actual.mp4"));
  if (
    metadata.streams.find((s: any) => s.codec_type === "video").codec_name !==
    "h264"
  )
    throw Error("Invalid MP4");
  const queue = (
    await pool.query(
      "select count(*)as n from pgmq.q_manager_jobs where message->>'run_id' in(select id::text from public.workflow_runs where entity_id=$1)",
      [renderId],
    )
  ).rows[0];
  if (Number(queue.n) !== 0) throw Error("Message not acknowledged");
  // Approve and publish through the actual permission-enforced RPCs, then let worker rebuild.
  const editor = await pool.connect();
  try {
    await editor.query("begin");
    await editor.query("select set_config('request.jwt.claim.sub',$1,true)", [
      user,
    ]);
    await editor.query("set local role authenticated");
    await editor.query(
      "select public.review_content($1,$2,'approved','Evidence reviewed for disposable worker test')",
      [content, version],
    );
    await editor.query(
      "select public.publish_website($1,'worker-article','Approved worker fixture','news')",
      [content],
    );
    await editor.query("commit");
  } catch (e) {
    await editor.query("rollback");
    throw e;
  } finally {
    editor.release();
  }
  await pool.query(
    "update public.site_rebuild_requests set requested_at=now()-interval '30 seconds'where workspace_id=$1",
    [workspace],
  );
  let siteReady = false;
  const siteDeadline = Date.now() + 15000;
  while (Date.now() < siteDeadline) {
    const jobs = (
      await pool.query(
        "select status from public.workflow_runs where workspace_id=$1 and kind='site'",
        [workspace],
      )
    ).rows;
    if (jobs.some((j) => j.status === "succeeded")) {
      siteReady = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!siteReady) throw Error("Worker site rebuild failed: " + logs);
  const article = await readFile(
    path.join(
      dir,
      "site",
      "worker-" + workspace,
      "articles/worker-article/index.html",
    ),
    "utf8",
  );
  if (
    !article.includes("<h1>বাংলার সংবাদ</h1>") ||
    !article.includes("Local worker test")
  )
    throw Error("Approved article missing from actual site export");
  if (outputDir) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, "worker-render.mp4"), mp4);
    await run("ffmpeg", [
      "-y",
      "-i",
      path.join(dir, "actual.mp4"),
      "-frames:v",
      "1",
      "-threads",
      "1",
      path.join(outputDir, "worker-frame.png"),
    ]);
    await writeFile(
      path.join(outputDir, "worker-harness-result.json"),
      JSON.stringify(
        {
          test: "LOCAL storage stub + actual pgmq/worker/FFmpeg",
          status: "PASS",
          metadata: row.metadata,
          worker_logs: logs,
        },
        null,
        2,
      ),
    );
  }
  console.log(
    JSON.stringify({
      status: "PASS",
      test: "real worker durable render using explicit local storage HTTP stub",
      codec: "h264",
      bytes: mp4.length,
      queue_acknowledged: true,
      approved_article_static_build: true,
    }),
  );
} finally {
  if (child) {
    child.kill("SIGTERM");
    await new Promise((r) => child!.once("exit", r));
  }
  await new Promise<void>((r) => server.close(() => r()));
  // Delete in FK-safe order; shared queue is disposable; no production use.
  await pool.query("delete from public.workflow_steps where workspace_id=$1", [
    workspace,
  ]);
  await pool.query("delete from public.workflow_runs where workspace_id=$1", [
    workspace,
  ]);
  await pool.query("delete from public.asset_usage where workspace_id=$1", [
    workspace,
  ]);
  await pool.query("delete from public.render_jobs where workspace_id=$1", [
    workspace,
  ]);
  await pool.query(
    "update public.content_items set current_version_id=null where workspace_id=$1",
    [workspace],
  );
  await pool.query("delete from public.website_posts where workspace_id=$1", [
    workspace,
  ]);
  await pool.query("delete from public.approvals where workspace_id=$1", [
    workspace,
  ]);
  await pool.query(
    "delete from public.content_versions where workspace_id=$1",
    [workspace],
  );
  await pool.query("delete from public.content_items where workspace_id=$1", [
    workspace,
  ]);
  await pool.query("delete from public.workspaces where id=$1", [workspace]);
  await pool.query("delete from auth.users where id=$1", [user]);
  await pool.end();
  await rm(dir, { recursive: true, force: true });
}
