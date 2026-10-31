const encoder = new TextEncoder();

export type IncomingNewsroomEvent = {
  event_id: string;
  event_type: string;
  occurred_at: string;
  payload: Record<string, unknown>;
};

const secretKeys = new Set([
  "token", "access_token", "refresh_token", "client_secret", "secret",
  "password", "api_key", "authorization", "cookie", "service_role_key",
]);

export function containsCredentialLikeKeys(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsCredentialLikeKeys);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) => secretKeys.has(key.toLowerCase()) || containsCredentialLikeKeys(child),
  );
}

export function parseIncomingNewsroomEvent(value: unknown): IncomingNewsroomEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Event body must be a JSON object");
  }
  const event = value as Record<string, unknown>;
  if (typeof event.event_id !== "string" || !/^[A-Za-z0-9._:-]{1,160}$/.test(event.event_id)) {
    throw new Error("event_id must be 1–160 safe characters");
  }
  if (typeof event.event_type !== "string" || !/^[a-z][a-z0-9_.-]{2,79}$/.test(event.event_type)) {
    throw new Error("event_type is invalid");
  }
  if (typeof event.occurred_at !== "string" || !Number.isFinite(Date.parse(event.occurred_at))) {
    throw new Error("occurred_at must be a valid date-time");
  }
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
    throw new Error("payload must be a JSON object");
  }
  if (containsCredentialLikeKeys(event.payload)) {
    throw new Error("Payload must not contain credentials or authorization headers");
  }
  return {
    event_id: event.event_id,
    event_type: event.event_type,
    occurred_at: new Date(event.occurred_at).toISOString(),
    payload: event.payload as Record<string, unknown>,
  };
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyIntegrationSignature(
  token: string,
  timestamp: string,
  rawBody: string,
  signature: string,
): Promise<boolean> {
  if (!/^[0-9]{10}$/.test(timestamp) || !/^sha256=[0-9a-f]{64}$/.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(token), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  const bytes = new Uint8Array(signature.slice(7).match(/.{2}/g)!.map((part) => Number.parseInt(part, 16)));
  return crypto.subtle.verify("HMAC", key, bytes, encoder.encode(`${timestamp}.${rawBody}`));
}

export async function signIntegrationEvent(token: string, timestamp: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(token), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));
  return "sha256=" + Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}
