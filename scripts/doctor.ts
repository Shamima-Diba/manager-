import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { run } from "../packages/render-engine/src/index.js";
import { safeFetch } from "../packages/security/src/index.js";
let failures = 0;
async function check(name: string, fn: () => Promise<unknown>) {
  try {
    const detail = await fn();
    console.log(JSON.stringify({ check: name, status: "PASS", detail }));
  } catch (e) {
    failures++;
    console.log(
      JSON.stringify({
        check: name,
        status: "FAIL",
        error: (e as Error).message,
      }),
    );
  }
}
for (const name of [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
])
  await check("env:" + name, async () => {
    if (!process.env[name])
      throw Error("Missing; configure in environment/secret store");
    return "present (value not logged)";
  });
await check("database/migrations/queue/storage", async () => {
  const p = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  try {
    return (await p.query("select manager_private.worker_health() as health"))
      .rows[0].health;
  } finally {
    await p.end();
  }
});
await check("storage access", async () => {
  const s = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const r = await s.storage.getBucket("source-assets");
  if (r.error) throw r.error;
  return { id: r.data.id, public: r.data.public };
});
await check(
  "ffmpeg",
  async () => (await run("ffmpeg", ["-version"], 5000)).split("\n")[0],
);
await check(
  "ffprobe",
  async () => (await run("ffprobe", ["-version"], 5000)).split("\n")[0],
);
await check("Bengali font", async () => {
  const s = await run("fc-match", ["Noto Sans Bengali"], 5000);
  if (!s.includes("Bengali")) throw Error("Install fonts-noto-core");
  return s.trim();
});
if (process.env.TEXT_ENDPOINT)
  await check(
    "text provider connectivity (not model-quality validation)",
    async () => {
      const endpoint =
        process.env.TEXT_ENDPOINT! +
        (process.env.TEXT_PROVIDER === "ollama" ? "/api/tags" : "/models");
      const r = await safeFetch(endpoint, {
        headers: process.env.TEXT_API_KEY
          ? { Authorization: `Bearer ${process.env.TEXT_API_KEY}` }
          : {},
      });
      if (!r.ok) throw Error(`HTTP ${r.status}`);
      return "reachable; no generation attempted";
    },
  );
else
  console.log(
    JSON.stringify({ check: "text provider", status: "Not configured" }),
  );
if (process.env.MASTODON_ORIGIN)
  await check("Mastodon public endpoint", async () => {
    const r = await safeFetch(
      process.env.MASTODON_ORIGIN! + "/api/v2/instance",
    );
    if (!r.ok) throw Error(`HTTP ${r.status}`);
    return "reachable; OAuth/publishing not verified";
  });
else
  console.log(
    JSON.stringify({ check: "social provider", status: "Not configured" }),
  );
process.exitCode = failures ? 1 : 0;
