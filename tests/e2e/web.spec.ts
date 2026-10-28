import { test, expect } from "@playwright/test";
test("truthful unconfigured state without frontend credentials", async ({
  page,
}) => {
  test.skip(
    !!process.env.VITE_SUPABASE_URL,
    "Run this test without frontend env",
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Not configured" }),
  ).toBeVisible();
  await expect(
    page.getByText("Set VITE_SUPABASE_URL", { exact: false }),
  ).toBeVisible();
});
test("local authenticated vertical slice", async ({ page }) => {
  test.skip(
    !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
    "Requires local Supabase seeded verified test account and configured frontend",
  );
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_EMAIL!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: /Continue|চালিয়ে যান/ }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page
    .getByRole("button", { name: "Content Studio", exact: true })
    .click();
  await page.getByLabel("Title", { exact: true }).fill("E2E " + Date.now());
  await page
    .getByLabel("Body (plain text)", { exact: true })
    .fill("Verified local test article.");
  await page.getByRole("button", { name: "Save immutable revision" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Job Monitor", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Job Monitor" }),
  ).toBeVisible();
});
