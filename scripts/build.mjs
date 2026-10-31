import { spawnSync } from "node:child_process";

const deploymentUrl = process.env.VERCEL_URL || "";
const publicSite =
  process.env.PUBLIC_SITE_BUILD === "1" ||
  deploymentUrl.startsWith("banglarvoice-public-preview-");
const command = publicSite
  ? ["run", "site:build"]
  : ["exec", "vite", "build", "apps/web"];

if (publicSite && process.env.VERCEL_ENV === "production") {
  console.error("Blocked: public-site build is Preview-only.");
  process.exit(1);
}

const env = { ...process.env };
if (publicSite && !env.SITE_OUTPUT_DIR) {
  env.SITE_OUTPUT_DIR = "dist";
}
const result = spawnSync("yarn", command, {
  stdio: "inherit",
  env,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
