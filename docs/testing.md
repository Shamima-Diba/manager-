# Test commands and scope

## Application tests

`npm ci` uses the exact lockfile. `npm run typecheck`, `npm run build`, `npm test`, `npm run smoke-test`, `npm run test:e2e`. FFmpeg/libass/libx264 and Bengali fonts must be installed for render tests. Browser test needs `npx playwright install --with-deps chromium`.

Vitest tests use original CC0 fixtures. Mastodon HTTP tests are LOCAL MOCKS; they verify official request and error contracts without posting. Actual FFmpeg tests validate metadata and temporary-directory cleanup, and actual static generation tests check HTML contents/escaping/metadata/RSS/sitemap. SRT/VTT tests do not invent timestamps.

Playwright unconfigured-state test passes without public env. The authenticated browser test is skipped unless E2E_EMAIL/E2E_PASSWORD and configured frontend/local Supabase are supplied. Those test-only values belong in local environment/CI secrets, not source. Current authenticated test covers sign-in, article save and job display only; media/review/schedule UI E2E coverage remains incomplete.

## Database tests on local Supabase

Apply migrations, then use psql with ON_ERROR_STOP=1 on supabase/tests/authorization.sql and workflow.sql. Assertions run inside rollback transactions using synthetic verified users. Never use production databases. This full local Supabase execution was NOT run in the build environment because Docker was missing.

## Standalone PostgreSQL test (executed here)

For test-only PostgreSQL, install pgcrypto and real pgmq 1.5.1. Upstream source was obtained at https://github.com/pgmq/pgmq tag v1.5.1, commit 7fd411d8ffd53b5313039f59167124c861d46430. Build extension SQL using `make` then `make install` with your pg_config. No third-party pgmq sources are bundled in the ZIP.

Create a fresh disposable database and apply tests/integration/postgres-bootstrap.sql FIRST, followed by all migrations in sorted order, then both SQL assertion scripts. Bootstrap supplies a minimum Auth/Storage schema contract plus auth.uid() from request.jwt.claim.sub, not real Supabase services. It must NEVER be applied to an existing Supabase project. Cluster-level test roles must not already exist; dispose roles/database carefully between repetitions.

Actual commands used in the sandbox (Linux, PostgreSQL 16.15):

```sh
sudo -u postgres createdb manager_test
sudo -u postgres psql -v ON_ERROR_STOP=1 -d manager_test -f tests/integration/postgres-bootstrap.sql
for f in supabase/migrations/*.sql; do
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d manager_test -f "$f"
done
sudo -u postgres psql -v ON_ERROR_STOP=1 -d manager_test -f supabase/tests/authorization.sql
sudo -u postgres psql -v ON_ERROR_STOP=1 -d manager_test -f supabase/tests/workflow.sql
```

## Actual worker harness (executed here)

`tests/integration/worker-harness.ts` starts a clearly labeled local HTTP Storage stub, seeds a real pgmq render job via the actual create_render RPC, spawns the actual Node worker using manager_worker_api database role, downloads fixture bytes, executes FFmpeg, uploads MP4/thumbnail to the stub, and verifies durable success plus queue acknowledgement. It also calls real review/publish RPCs, serves the public-site snapshot through an explicit local PostgREST stub, and verifies the actual worker rebuilt the approved article HTML. It does not validate real Storage authentication, hosted network policy, or Supabase signing implementation.

```sh
TEST_DATABASE_URL='YOUR_DISPOSABLE_ADMIN_CONNECTION' node --import tsx tests/integration/worker-harness.ts
```

Sandbox used local PostgreSQL peer auth as the postgres OS user and the Node binary /usr/local/bin/node; the worker connection used `options=-c role=manager_worker_api`. Optional HARNESS_EVIDENCE_DIR saves local rendered evidence; these generated binaries are deliberately excluded from source packaging. Inspect any test output before sharing; no test-only secret is a production credential.

## Missing verification

Supabase Docker stack, Edge Deno compilation, hosted OAuth, real social publication, provider-specific account eligibility/permissions, deployed Vercel/Netlify behavior, Docker image build, GPU workloads, TTS/model Bengali quality, analytics, load, restore drill and penetration tests are NOT run. Source presence and successful unit tests do not establish production readiness.
