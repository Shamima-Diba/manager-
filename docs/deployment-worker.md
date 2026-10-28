# Worker deployment

The worker is a separate compute plane. Supabase and a static frontend alone do not provision continuous queue consumers, FFmpeg capacity, GPUs, or model weights.

## Least-privilege database identity

Migrations create NOLOGIN role manager_worker_api. Using an administrator connection in a trusted terminal, create a separate login, set its password with psql's `\password` prompt or your deployment secret manager, and grant membership:

```sql
create role manager_worker login;
-- Set its password out of band, never in source or chat.
grant manager_worker_api to manager_worker;
```

Use this login for DATABASE_URL (prefer session pooler or direct connection with TLS validation). It can execute worker RPCs but has no direct public table privileges. Do not grant schema creation, superuser, BYPASSRLS or membership in authenticated/service_role to this login. Restrict DB network ingress to the worker host.

**Remaining privileged credential:** Supabase Storage upload/signing uses SUPABASE_SERVICE_ROLE_KEY. This bypasses RLS and affects the entire Supabase project. It is unavoidable in this slice's Storage implementation, and the dedicated database role does NOT reduce that key's power. Isolate the worker, protect/rotate the key, restrict egress, and use a dedicated Supabase project. A narrow Storage signing broker would be a future hardening improvement.

## Local process

```sh
npm ci
node --env-file=.env --import tsx apps/worker/src/main.ts
./scripts/doctor
```

FFmpeg/ffprobe, fontconfig and Noto Sans Bengali must be installed. The worker logs JSON, never tokens. It claims one job at a time per process. SIGTERM finishes the current job, then stops claiming. Docker timeout 150 seconds may interrupt unusually long work; leases recover rendering and quarantine publishing.

## Containers

```sh
docker compose -f infra/docker-compose.yml build --pull
docker compose -f infra/docker-compose.yml up -d
```

The root `.env` is required. Use private secret mounts/environment injection in production rather than loose env files. Bind the public site only behind a TLS reverse proxy; port 8080 is plaintext. The source sets CPU/memory/PID bounds, read-only root, isolated /tmp, no added capabilities, node user, and log rotation. Root-owned pre-existing volumes may need one-time ownership repair; do not run the worker as root as a workaround.

Pinned container tags: node 22.23.0-bookworm-slim, nginx 1.28.0-alpine, optional ollama 0.12.6. Container builds and tag pull availability were NOT tested here (Docker unavailable). Tags are versioned, not digest-locked; apt packages are distro-managed, so container bit-for-bit reproducibility is not claimed. Review upstream patches and resolve immutable digests before production.

CPU template accepts one image/video plus optional licensed narration and explicit subtitles. It produces 720p/1080p selected aspect ratios if host resources permit. Short clips must cover the requested duration; validation fails rather than silently producing a shorter artifact. No logo/lower-third/music composition, multi-scene transitions, or render farm is implemented.

## Public site storage

Worker uses SITE_OUTPUT_DIR=/site/current under a writable named volume. Nginx reads the same volume under `/usr/share/nginx/html/current`. Rebuild creates `.next`, moves current to `.previous`, then installs next. This avoids stale files from withdrawn posts, but the two renames have a small gap; uninterrupted atomic symlink/deploy promotion is not implemented. A global site workflow lock prevents concurrent rebuilds. Multiple hosts require a shared deploy mechanism; local named volumes are not shared across hosts.

## Optional GPU

```sh
docker compose -f infra/docker-compose.yml -f infra/docker-compose.gpu.yml --profile gpu up -d ollama
```

This starts an optional Ollama container only. It does not pull models or connect the UI to AI. Install NVIDIA driver/container toolkit and provision hardware yourself. Review every model's weight license and Bengali quality before use. The current text adapter accepts public HTTPS endpoints; put a trusted HTTPS model gateway in front of a private Ollama/vLLM instance. Direct private HTTP endpoint support is not implemented. Core rendering requires no GPU.
