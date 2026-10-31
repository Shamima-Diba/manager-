import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import {
  parseIncomingNewsroomEvent,
  sha256Hex,
  verifyIntegrationSignature,
} from "../../../packages/integrations/src/index.ts";

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
    const token = request.headers.get("x-manager-integration-key") ?? "";
    const timestamp = request.headers.get("x-manager-timestamp") ?? "";
    const signature = request.headers.get("x-manager-signature") ?? "";
    if (token.length < 32 || token.length > 256) return json({ error: "Integration authentication required" }, 401);
    if (!/^[0-9]{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
      return json({ error: "Expired or invalid event timestamp" }, 401);
    }
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > 65536) return json({ error: "Event payload exceeds 64 KiB" }, 413);
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 65536) return json({ error: "Event payload exceeds 64 KiB" }, 413);

    const credentialHash = await sha256Hex(token);
    const { data: integration, error: lookupError } = await admin
      .from("workspace_integrations").select("id,workspace_id,source_system")
      .eq("credential_hash", credentialHash).eq("enabled", true).maybeSingle();
    if (lookupError || !integration) return json({ error: "Integration authentication failed" }, 401);
    if (!await verifyIntegrationSignature(token, timestamp, rawBody, signature)) {
      return json({ error: "Invalid event signature" }, 401);
    }

    let parsed: unknown;
    try { parsed = JSON.parse(rawBody); } catch { return json({ error: "Invalid JSON" }, 400); }
    const event = parseIncomingNewsroomEvent(parsed);
    const { data: inserted, error: insertError } = await admin
      .from("integration_events")
      .upsert({
        workspace_id: integration.workspace_id,
        integration_id: integration.id,
        external_event_id: event.event_id,
        event_type: event.event_type,
        occurred_at: event.occurred_at,
        payload: event.payload,
      }, { onConflict: "workspace_id,integration_id,external_event_id", ignoreDuplicates: true })
      .select("id");
    if (insertError) throw insertError;

    await admin.from("workspace_integrations").update({ last_seen_at: new Date().toISOString() })
      .eq("id", integration.id);
    return json({
      status: "accepted",
      mode: "shadow",
      duplicate: !inserted || inserted.length === 0,
      event_type: event.event_type,
      publication_performed: false,
    }, 202);
  } catch (error) {
    console.error(JSON.stringify({ event: "integration_ingest_error", message: (error as Error).message }));
    return json({ error: (error as Error).message || "Unable to accept event" }, 400);
  }
});
