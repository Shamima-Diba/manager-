import { spawnSync } from "node:child_process";

const publicSite = process.env.PUBLIC_SITE_BUILD === "1";
const command = publicSite
  ? ["run", "site:build"]
  : ["exec", "vite", "build", "apps/web"];

if (publicSite && process.env.VERCEL_ENV === "production") {
  console.error("Blocked: public-site build is Preview-only.");
  process.exit(1);
}

const result = spawnSync("yarn", command, {
  stdio: "inherit",
  env: process.env,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
