import { expect, test } from "@playwright/test";

test("landing page exposes core workspaces", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Stock Analyser" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Analyse", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Discover", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Portfolio", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Alerts", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Account", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Privacy", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Events", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Validate", exact: true })).toBeVisible();
});

test("workspace navigation opens portfolio, alerts, and privacy without live data dependency", async ({ page }) => {
  await page.goto("/");
  const workspaceNav = page.getByRole("navigation", { name: "Stock Analyser workspace" });
  await workspaceNav.getByRole("button", { name: "Portfolio", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Portfolio" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Holding" })).toBeVisible();

  await workspaceNav.getByRole("button", { name: "Alerts", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Alerts" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Alert" })).toBeVisible();

  await workspaceNav.getByRole("button", { name: "Privacy", exact: true }).click();
  await expect(page.getByRole("heading", { name: "GDPR Controls" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export Workspace JSON" })).toBeVisible();

  await workspaceNav.getByRole("button", { name: "Auth", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Account and Sync Foundation" })).toBeVisible();
});

test("workspace navigation opens validation without live data dependency", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(page.getByRole("heading", { name: "PRD Data Validation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run Validation" })).toBeVisible();
});

test("analysis input starts empty and match selection sets region", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open analyser", exact: true }).click();
  await expect(page.getByLabel("Ticker or company")).toHaveValue("");
  await expect(page.getByLabel("Region")).toHaveValue("");
  await page.getByLabel("Ticker or company").fill("deutsche");
  await page.getByRole("button", { name: /DBK\.DE/i }).click();
  await expect(page.getByLabel("Ticker or company")).toHaveValue("DBK.DE");
  await expect(page.getByLabel("Region")).toHaveValue("Europe");
});

test("terminal deep link mounts analysis workspace for ticker", async ({ page }) => {
  await page.goto("/terminal/AAPL");
  await expect(page.getByRole("heading", { name: "Global Market Workstation" })).toBeVisible();
  await expect(page.getByLabel("Ticker or company")).toHaveValue("AAPL");
});

test("mobile viewport keeps primary page usable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Open analyser" })).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
});
