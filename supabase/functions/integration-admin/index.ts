import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { sha256Hex } from "../../../packages/integrations/src/index.ts";

const env = (key: string) => Deno.env.get(key) ?? "";
const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const jwt = authorization.replace(/^Bearer\s+/i, "");
    if (!jwt || jwt === authorization) return json({ error: "Sign in required" }, 401);
    const { data: { user }, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !user) return json({ error: "Sign in required" }, 401);

    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > 4096) return json({ error: "Request too large" }, 413);
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid body" }, 400);
    const workspaceId = body.workspace_id;
    if (typeof workspaceId !== "string") return json({ error: "workspace_id is required" }, 400);

    const { data: membership, error: memberError } = await admin
      .from("workspace_members").select("role")
      .eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
    if (memberError || !membership || !["owner", "admin"].includes(membership.role)) {
      return json({ error: "Workspace owner/admin permission required" }, 403);
    }

    if (body.action === "disable") {
      if (typeof body.integration_id !== "string") return json({ error: "integration_id is required" }, 400);
      const { error } = await admin.from("workspace_integrations").update({ enabled: false })
        .eq("id", body.integration_id).eq("workspace_id", workspaceId);
      if (error) throw error;
      return json({ status: "disabled" });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const sourceSystem = typeof body.source_system === "string" ? body.source_system.trim() : "";
    if (!name || name.length > 120 || !/^[a-z][a-z0-9_-]{1,39}$/.test(sourceSystem)) {
      return json({ error: "Provide a name and valid source_system identifier" }, 400);
    }

    const random = crypto.getRandomValues(new Uint8Array(32));
    const secret = btoa(String.fromCharCode(...random)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const { data, error } = await admin.from("workspace_integrations").insert({
      workspace_id: workspaceId,
      name,
      source_system: sourceSystem,
      credential_hash: await sha256Hex(secret),
      created_by: user.id,
    }).select("id,name,source_system,created_at").single();
    if (error) throw error;

    // Plaintext key is shown exactly once. Only its SHA-256 hash is stored.
    return json({ integration: data, integration_key: secret, signature_header: "X-Manager-Signature: sha256=<hex>", timestamp_header: "X-Manager-Timestamp: <unix-seconds>" }, 201);
  } catch (error) {
    console.error(JSON.stringify({ event: "integration_admin_error", message: (error as Error).message }));
    return json({ error: "Unable to manage integration" }, 400);
  }
});
