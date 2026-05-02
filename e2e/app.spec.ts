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
  await expect(page.getByRole("button", { name: "Open System", exact: true })).toBeVisible();
});

test("workspace navigation opens all major panels without live data dependency", async ({ page }) => {
  await page.goto("/");
  const workspaceNav = page.getByRole("navigation", { name: "Stock Analyser workspace" });

  await workspaceNav.getByRole("button", { name: "Analyse", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Global Market Workstation" })).toBeVisible();
  await expect(page.getByLabel("Ticker or company")).toBeVisible();

  await workspaceNav.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Screener Builder" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run Screen", exact: true })).toBeVisible();

  await workspaceNav.getByRole("button", { name: "Watchlist", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Watchlists" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh Watchlist" })).toBeDisabled();

  await workspaceNav.getByRole("button", { name: "Portfolio", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Portfolio" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Holding" })).toBeVisible();

  await workspaceNav.getByRole("button", { name: "Alerts", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Alerts" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Alert" })).toBeVisible();

  await workspaceNav.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Side-by-Side Matrix" })).toBeVisible();

  await workspaceNav.getByRole("button", { name: "Events", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Load Events" })).toBeVisible();

  await workspaceNav.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(page.getByRole("heading", { name: "PRD Data Validation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run Validation" })).toBeVisible();

  await workspaceNav.getByRole("button", { name: "System", exact: true }).click();
  await expect(page.getByRole("heading", { name: "System Guide" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Refresh System Status|Refreshing/ })).toBeVisible();

  await workspaceNav.getByRole("button", { name: "Privacy", exact: true }).click();
  await expect(page.getByRole("heading", { name: "GDPR Controls" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export Workspace JSON" })).toBeVisible();

  await workspaceNav.getByRole("button", { name: "Auth", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Account and Sync Foundation" })).toBeVisible();
});

test("workspace buttons and forms expose safe validation states", async ({ page }) => {
  await page.goto("/");
  const workspaceNav = page.getByRole("navigation", { name: "Stock Analyser workspace" });

  await workspaceNav.getByRole("button", { name: "Analyse", exact: true }).click();
  const searchForm = page.locator("form.search-row");
  await expect(searchForm.getByRole("button", { name: "Analyse", exact: true })).toBeDisabled();
  await expect(searchForm.getByRole("button", { name: "Refresh Data", exact: true })).toBeDisabled();
  await page.getByLabel("Ticker or company").fill("deutsche");
  await expect(page.getByRole("button", { name: /DBK\.DE/i })).toBeVisible();

  await workspaceNav.getByRole("button", { name: "Discover", exact: true }).click();
  await page.getByRole("button", { name: "Value Near Lows" }).click();
  await expect(page.getByRole("button", { name: "Value Near Lows" })).toHaveClass(/active/);
  await page.getByPlaceholder("My screen").fill("QA screen");
  await page.getByRole("button", { name: "Save Screen" }).click();
  await expect(page.getByRole("button", { name: "QA screen", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Charts" }).click();
  await expect(page.getByRole("button", { name: "Charts" })).toHaveClass(/active/);

  await workspaceNav.getByRole("button", { name: "Portfolio", exact: true }).click();
  await page.getByRole("button", { name: "Add Holding" }).click();
  await expect(page.getByText("Missing ticker query parameter.")).toBeVisible();

  await workspaceNav.getByRole("button", { name: "Alerts", exact: true }).click();
  await page.getByRole("button", { name: "Add Alert" }).click();
  await expect(page.getByText("Missing ticker query parameter.")).toBeVisible();
  await page.getByLabel("Schedule").selectOption("manual");
  await expect(page.getByLabel("Schedule")).toHaveValue("manual");

  await workspaceNav.getByRole("button", { name: "Auth", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Account" })).toBeVisible();

  await workspaceNav.getByRole("button", { name: "Privacy", exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete Workspace" })).toBeDisabled();
  await page.getByPlaceholder("DELETE").fill("DELETE");
  await expect(page.getByRole("button", { name: "Delete Workspace" })).toBeEnabled();
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

test("public system APIs return designed readiness and auth-boundary responses", async ({ request }) => {
  const readiness = await request.get("/api/system/readiness");
  expect(readiness.ok()).toBe(true);
  const readinessPayload = await readiness.json();
  expect(readinessPayload.mode).toBe("deployment-readiness");
  expect(readinessPayload.security.cspEnabled).toBe(true);
  expect(readinessPayload.gdpr.exportEnabled).toBe(true);

  const workerStatus = await request.get("/api/alerts/worker");
  expect(workerStatus.ok()).toBe(true);
  const workerStatusPayload = await workerStatus.json();
  expect(workerStatusPayload.mode).toBe("hosted-alert-worker");
  expect(workerStatusPayload.auth).toBe("bearer-secret");

  const unauthorizedWorker = await request.post("/api/alerts/worker", { data: { force: true } });
  expect([401, 403, 503]).toContain(unauthorizedWorker.status());

  const invalidHistory = await request.get("/api/history?region=USA");
  expect(invalidHistory.status()).toBe(400);
});
