# Final Delivery Report — Banglar Voice 24 / Private Manager
**Date:** 2026-10-31  
**Status:** PARTIAL DELIVERY — NOT COMPLETE / NOT PRODUCTION READY

## Executive result

The Manager and public-site build targets are now separated in Vercel and both have successful, protected Preview deployments from the same feature branch. The public-site build is confirmed to run the static generator rather than the Manager SPA.

This is not yet the requested fully managed newsroom. The live Manager database currently contains no editorial content, the new safe snapshot RPC migration is committed but not applied, and the public Preview generator reports one root page and zero workspaces. Therefore no real article page has been rendered from approved content yet.

Manager remains the private control plane. The public website is a separate Vercel project. No production cutover, live publication, production environment change, or Automation King project change was performed.

## Source

- Repository: `Shamima-Diba/manager-`
- Branch: `feat/banglarvoice-public-news-experience-2026-10-31`
- Latest implementation commit at deployment verification: `5f9b50a98b66d75c6a58db3b57f481605ce9edbd`
- Report commit: see this document's Git history.
- Prior styling foundation commit: `799b81c08fa9706dc1164e2f269f2d178e00cfdb`

## What was implemented in the branch

1. Responsive editorial CSS foundation for the static public-site generator.
2. New additive SQL migration `20261031010000_public_site_approved_snapshot.sql` that replaces `public_site_data()` with a strict read-only projection:
   - current content version must match the website snapshot version;
   - content must be `approved`;
   - content must be non-sensitive;
   - a matching `approvals.decision='approved'` row must exist;
   - only allowlisted public text/settings fields are returned.
3. Public-site exporter now uses `SUPABASE_ANON_KEY`, not the service-role key, for the public export RPC. It validates the returned contract and restores the previous output directory if promotion fails.
4. Build dispatcher selects the public generator only for the dedicated public-preview deployment URL; the private Manager deployment continues to build the Vite admin SPA.
5. Public-site production build guard blocks a production-target build for the dedicated Preview project.
6. Node.js runtime pinned to 24.x; Vercel public project uses Yarn v1 lockfile installation.

## Supabase inspection — read-only

Project: `dbxbbfqsgjzeqswpwjbk`

- Workspace `banglar-voice-24` exists; `publishing_paused=false`.
- `content_items`: 0 rows.
- `website_posts`: 0 rows.
- `approvals`: 0 rows.
- Existing live `public_site_data()` still reads legacy `website_posts` and does not yet enforce the new content-version/approval join.
- The new migration exists only in the feature branch. It was not applied to the active Supabase project.
- No SQL mutation or migration deployment was performed.

This explains the current public build result: `{"pages":1,"workspaces":0}`. The deployment contains the empty root Newsrooms page, not a real article/newsroom. It is not acceptable as a finished public website.

## Vercel Preview evidence

### Private Manager project

- Project: `manager--apps`
- Project ID: `prj_E4Ixlpuam0JUDtIq7QxaUfrpvpEM`
- Deployment: `dpl_A3jLrzZcsNX4sLyVmbq18DYmHD1F`
- URL: `https://manager-apps-48y0kergp-shamima-diba.vercel.app`
- State: `READY`
- Commit: `5f9b50a98b66d75c6a58db3b57f481605ce9edbd`
- Build type: Manager Vite SPA. This is not a public-site build.

### Separate public-site Preview project

- Project: `banglarvoice-public-preview`
- Project ID: `prj_TCJnpRfU7W6fdgX9S84BqOWzuye4`
- Deployment: `dpl_E6NYhenD6fgC386H3qvMSDfD789Q`
- URL: `https://banglarvoice-public-preview-fqum7p9a6-shamima-diba.vercel.app`
- State: `READY`
- Target: Preview (Vercel API reports `target=null` for this Preview deployment)
- Commit: `5f9b50a98b66d75c6a58db3b57f481605ce9edbd`
- Build log confirms `node scripts/build.mjs` → `site:build` → `apps/public-site/src/build.ts` and output `{"pages":1,"workspaces":0}`.
- SSO protection is enabled for all deployment targets; no custom domains are attached.
- Supabase URL, publishable key, output path and public-build selector are scoped to Preview and the feature branch. No production variables were created for this project.

Earlier failed attempts exposed a monorepo Vercel config mismatch and the repository's Yarn lockfile. Those build settings were corrected before the final READY deployment. The failed attempts did not become live production deployments.

## Acceptance matrix

| Area | Result | Notes |
|---|---|---|
| Separate private Manager Preview | PASS — BUILD READY | Admin SPA only |
| Separate protected public-site Preview | PASS — BUILD READY | Static generator executed |
| Public content rendering | BLOCKED | 0 workspaces / 0 approved articles in database |
| Safe content_items → snapshot contract | CODE COMMITTED | Migration not applied or DB-tested |
| Public exporter without service-role key | CODE COMMITTED | Anonymous publishable key used |
| Output promotion rollback | CODE COMMITTED | Automated test not rerun in this execution |
| Manager website settings editor | INCOMPLETE | Existing Website CMS only publishes approved article snapshots |
| Header/navigation editor | INCOMPLETE | Static nav remains hard-coded |
| Breaking-news Realtime | NOT IMPLEMENTED / UNVERIFIED | No acceptance evidence |
| Newsletter subscribe + durable queue + sender | NOT IMPLEMENTED / UNVERIFIED | No acceptance evidence |
| AI greeting + RAG/BM25/pgvector | NOT IMPLEMENTED / UNVERIFIED | No acceptance evidence |
| TTS browser/cloud fallback | NOT IMPLEMENTED / UNVERIFIED | No acceptance evidence |
| Desktop and 375px visual screenshots | NOT VERIFIED | No browser screenshot tool was available |
| `npm test`, `npm run typecheck` | NOT RUN | No runner was available in this execution |
| Production cutover/live publication | NOT DONE | Explicitly kept out of scope |

## Safety

- No production Supabase migration or SQL write.
- No production environment variables changed.
- No live publication or custom domain assignment.
- No Automation King project access or modification.
- Manager remains separate from the public website.
- Public-site project is SSO protected; no successful production deployment exists.

## Required completion gates

1. Provision a separate Supabase Preview/staging project/database. Do not use the active Manager database as a staging target.
2. Apply the branch migrations to that isolated Preview database and run SQL tests for draft, rejected, sensitive, stale-version and unapproved exclusions.
3. Create a reviewed, non-sensitive test article in Preview; verify content item → approval → website snapshot → read-only RPC → generated article/category/RSS/sitemap.
4. Add Manager UI for site identity/settings, header and navigation, categories, breaking-news, newsletter, AI/RAG and TTS configuration with server-side role checks, audit history, and durable job receipts.
5. Implement newsletter queue/worker/provider, AI retrieval/greeting, breaking-news Realtime subscription, and TTS fallback end-to-end.
6. Run unit, typecheck, build, database integration and authenticated browser tests. Capture genuine desktop and 375px screenshots from the protected Preview session.
7. Verify both deployments against the same commit and Preview database. Keep production disabled until all gates pass and obtain separate explicit cutover approval.

**Final conclusion:** The safe public export foundation and two separate Preview build surfaces exist. The requested full Manager-controlled public newsroom and its backend workflows are not yet complete or accepted.
