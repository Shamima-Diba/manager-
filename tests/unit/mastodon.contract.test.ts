// LOCAL CONTRACT MOCKS ONLY. No social publication is made.
import { it, expect, vi } from "vitest";
import { Mastodon } from "../../packages/providers/src/index";
const input = {
  text: "বাংলার সংবাদ",
  key: "stable-idempotency",
  token: "TEST_ONLY",
  language: "bn",
};
it("uses verified official statuses request and readback contract", async () => {
  const request = vi
    .fn()
    .mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            id: "123",
            url: "https://social.example/@test/123",
          }),
        ),
    );
  const p = new Mastodon("https://social.example", request);
  expect(await p.publish(input)).toHaveProperty("id", "123");
  const [url, init] = request.mock.calls[0];
  expect(url).toBe("https://social.example/api/v1/statuses");
  expect(init.headers["Idempotency-Key"]).toBe(input.key);
  expect(init.body.get("status")).toBe(input.text);
  expect(init.body.has("scheduled_at")).toBe(false);
  expect(await p.verify("123", "TEST_ONLY")).toHaveProperty("id", "123");
});
it.each([
  [401, "auth"],
  [429, "rate_limit"],
  [500, "unknown"],
  [422, "rejected"],
])("HTTP %s classified %s", async (status, category) => {
  const p = new Mastodon(
    "https://social.example",
    vi.fn().mockResolvedValue(new Response("{}", { status: Number(status) })),
  );
  await expect(p.publish(input)).rejects.toHaveProperty("category", category);
});
it("lost transport becomes unknown, never fake success", async () => {
  const p = new Mastodon(
    "https://social.example",
    vi.fn().mockRejectedValue(Error("network")),
  );
  await expect(p.publish(input)).rejects.toHaveProperty("category", "unknown");
});
it("malformed accepted response becomes unknown", async () => {
  const p = new Mastodon(
    "https://social.example",
    vi.fn().mockResolvedValue(new Response("{}")),
  );
  await expect(p.publish(input)).rejects.toHaveProperty("category", "unknown");
});
it("unconfirmed lookup never becomes published", async () => {
  const p = new Mastodon(
    "https://social.example",
    vi.fn().mockResolvedValue(new Response("{}", { status: 404 })),
  );
  await expect(p.verify("123", "TEST_ONLY")).rejects.toHaveProperty(
    "category",
    "unknown",
  );
});
