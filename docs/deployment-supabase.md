# Supabase deployment

## Local development

Install Docker and Supabase CLI **2.122.0** using its official release instructions. This build environment did not have Docker; the complete Supabase stack was NOT started here. Do not treat standalone PostgreSQL validation as proof of hosted Supabase compatibility.

```sh
supabase start
supabase db reset
supabase status
```

config.toml uses Postgres 17. Migrations install pgcrypto, pgmq, the queue, schema/RLS/RPCs, buckets/policies, and Realtime tables. Confirm pgmq is offered by your Supabase release/plan before applying. Local auth uses email confirmations; the create_workspace RPC also checks verification unless the private server setting is changed by a database administrator. Inspect the mail viewer URL from `supabase status`. No user/password seed is supplied.

## Hosted project

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Set site URL and exact admin application redirect URLs in Auth URL configuration. Avoid broad wildcard redirect rules in production. Configure SMTP and mail templates, rate limits, and administrator MFA. Email/password, magic link and reset share the admin origin; the Settings password form completes password changes after a reset session. MFA enrollment/recovery UI is not implemented.

Never enable browser access to `manager_private`, pgmq, or the secret table. Keep only public schema exposed as configured. Verify the effective table grants and RLS after any future migration. Queue APIs are not browser endpoints.

## Buckets and Realtime

The migration creates source-assets, generated-audio, subtitle-files, video-renders, thumbnails, public-site-assets as private buckets. Browser writes only source-assets and only insert; no overwrite/delete. Source object paths are `<workspace UUID>/<asset UUID>`. Registration also requires a matching metadata row and actual Storage object. Renderer checks magic media content with ffprobe and SHA-256, rather than trusting file extensions or browser MIME alone. Upload orphan cleanup is manual if Storage succeeds but registration fails.

Add render_jobs, workflow_runs, scheduled_publications and content_items to supabase_realtime if your environment does not permit the migration's publication changes. Without Realtime, the UI still polls every 30 seconds. Do not expose OAuth states or encrypted secret rows in Realtime.

## Edge OAuth

Set Edge secrets through the dashboard/CLI secret store, **not browser variables**: APP_ORIGIN, MASTODON_ORIGIN, MASTODON_CLIENT_ID, MASTODON_CLIENT_SECRET, OAUTH_CALLBACK_URL, TOKEN_KEY_BASE64, TOKEN_KEY_ID. Supabase injects SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY. Use a fixed, approved public Mastodon origin and outbound egress restrictions. Callback requires no browser JWT but validates a cryptographic single-use state with ten-minute expiry and PKCE. POST routes authenticate the bearer session and recheck administrator membership.

```sh
supabase functions deploy social-oauth --no-verify-jwt
```

`--no-verify-jwt` is necessary for provider callback requests. The function implements JWT validation on start/disconnect, strict CORS and exact Origin checks; do not remove these checks. Edge function compilation/live deployment was not tested here. No webhook endpoint is shipped; unsupported webhooks should not be exposed.

## Scheduler

No cron service is mandatory. If pg_cron is available and your database administrator chooses to enable it, install the extension in its supported schema and schedule only:

```sql
select cron.schedule('manager-dispatch','* * * * *','select manager_private.worker_dispatch()');
```

This performs short due-job dispatch, not rendering. Review Cron permissions/availability on your plan. No migrations here assume pg_cron is available.

## First owner and role tests

Create a real user through Auth and confirm email, then use the UI create-workspace flow. The authenticated creator becomes owner atomically. No hardcoded owner password or anonymous bootstrap admin endpoint exists.

Run `psql "$LOCAL_TEST_ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/authorization.sql` and `... -f supabase/tests/workflow.sql` only on a disposable local project. The SQL inserts synthetic Auth users and rolls back; if your Auth schema requires additional mandatory fields, adapt the fixtures, not production policies. Full local Supabase execution remains unverified.
