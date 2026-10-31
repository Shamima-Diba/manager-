import { describe, expect, it } from "vitest";
import {
  containsCredentialLikeKeys,
  parseIncomingNewsroomEvent,
  sha256Hex,
  signIntegrationEvent,
  verifyIntegrationSignature,
} from "../../packages/integrations/src/index";

describe("Manager shadow newsroom integration", () => {
  const body = JSON.stringify({
    event_id: "report-2026-001",
    event_type: "report.submitted",
    occurred_at: "2026-10-31T00:00:00.000Z",
    payload: { report_id: "r-1", title: "Test report", status: "submitted" },
  });

  it("validates a minimal newsroom event without requiring editorial fields", () => {
    expect(parseIncomingNewsroomEvent(JSON.parse(body))).toMatchObject({
      event_id: "report-2026-001",
      event_type: "report.submitted",
      payload: { report_id: "r-1" },
    });
  });

  it("rejects credential-like fields at any payload depth", () => {
    expect(containsCredentialLikeKeys({ nested: [{ Authorization: "Bearer x" }] })).toBe(true);
    expect(() => parseIncomingNewsroomEvent({
      event_id: "e1", event_type: "report.updated", occurred_at: "2026-10-31T00:00:00Z",
      payload: { metadata: { api_key: "never-store" } },
    })).toThrow(/credentials/);
  });

  it("rejects malformed identifiers, dates and payloads", () => {
    expect(() => parseIncomingNewsroomEvent({ ...JSON.parse(body), event_id: " " })).toThrow();
    expect(() => parseIncomingNewsroomEvent({ ...JSON.parse(body), occurred_at: "yesterday" })).toThrow();
    expect(() => parseIncomingNewsroomEvent({ ...JSON.parse(body), payload: [] })).toThrow();
  });

  it("hashes integration credentials and verifies timestamp-bound HMAC signatures", async () => {
    const token = "test-only-integration-token";
    const timestamp = "1793400000";
    const signature = await signIntegrationEvent(token, timestamp, body);
    expect(await sha256Hex(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyIntegrationSignature(token, timestamp, body, signature)).toBe(true);
    expect(await verifyIntegrationSignature(token, timestamp, body + " ", signature)).toBe(false);
    expect(await verifyIntegrationSignature(token, timestamp, body, "sha256=" + "0".repeat(64))).toBe(false);
  });
});
