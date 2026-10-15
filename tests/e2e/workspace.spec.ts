import { interactWithPage } from "../../server/computer/browser.js";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";

async function pair(page: import("@playwright/test").Page) {
  const token = (
    await readFile(
      join(process.env.AGENTS_E2E_DATA_DIR!, "pairing-token"),
      "utf8",
    )
  ).trim();
  const response = await page.request.post("/api/session", { data: { token } });
  expect(response.ok()).toBeTruthy();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your intelligence, amplified." }),
  ).toBeVisible();
}
test("cinematic dashboard renders all ten agents without browser errors; capture real desktop and laptop views", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await pair(page);
  await expect(page.locator(".orbit-node")).toHaveCount(10);
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForTimeout(1500);
  const render = await page.locator("canvas").evaluate((c) => ({
    width: (c as HTMLCanvasElement).width,
    height: (c as HTMLCanvasElement).height,
  }));
  expect(render.width).toBeGreaterThan(200);
  expect(render.height).toBeGreaterThan(200);
  await mkdir("artifacts", { recursive: true });
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1280, 800],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    const nodes = await page.locator(".orbit-node").evaluateAll((elements) =>
      elements.map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i],
          b = nodes[j];
        expect(
          a.x + a.w <= b.x ||
            b.x + b.w <= a.x ||
            a.y + a.h <= b.y ||
            b.y + b.h <= a.y,
        ).toBeTruthy();
      }
    await page.screenshot({
      path: `artifacts/dashboard-${width}.png`,
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});
test("every navigation destination works and an orbital agent opens real capabilities", async ({
  page,
}) => {
  await pair(page);
  for (const name of [
    "Agents",
    "Tasks",
    "Projects",
    "Knowledge",
    "Tools",
    "Browser",
    "Computer",
    "Calendar",
    "Emails",
    "Analytics",
    "Settings",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("dialog").getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close panel" }).click();
  }
  await page
    .locator(".orbit-node")
    .filter({ hasText: "Developer Agent" })
    .click();
  await expect(
    page.getByRole("dialog").getByText("code.review", { exact: true }),
  ).toBeVisible();
});
test("command creates a real workflow, updates live and shows actual verified artifacts", async ({
  page,
}) => {
  await pair(page);
  await page
    .getByLabel("Command your agents")
    .fill("Prepare an evidence-based launch checklist");
  await page
    .getByRole("button", { name: "Submit command", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Workflow details" }),
  ).toBeVisible();
  await expect(
    dialog.getByText("All execution steps and supervisor checks completed.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog.getByText("Project plan", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "artifacts/verified-workflow.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page
      .locator(".recent-task")
      .filter({ hasText: "Prepare an evidence-based launch checklist" })
      .first(),
  ).toBeVisible();
});
test("memory can be created, corrected, searched and deleted through the UI", async ({
  page,
}) => {
  await pair(page);
  await page.getByRole("button", { name: "Knowledge", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const unique = `Brand preference ${Date.now()}`;
  await dialog.getByLabel("Title", { exact: true }).fill(unique);
  await dialog
    .getByLabel("Content", { exact: true })
    .fill("Use cyan accents for the command center.");
  await dialog
    .getByRole("button", { name: "Save memory", exact: true })
    .click();
  const memory = dialog.locator(".memory-card").filter({ hasText: unique });
  await expect(memory).toBeVisible();
  await memory.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog
    .getByLabel("Content", { exact: true })
    .fill("Use muted cyan accents.");
  await dialog
    .getByRole("button", { name: "Save correction", exact: true })
    .click();
  await expect(memory.getByText("Use muted cyan accents.")).toBeVisible();
  await memory
    .getByRole("button", { name: `Delete memory ${unique}`, exact: true })
    .click();
  await expect(memory).toHaveCount(0);
});
test("protected file creation waits for approval and emergency stop blocks new requests", async ({
  page,
}) => {
  await pair(page);
  await page.getByRole("button", { name: "New workflow", exact: true }).click();
  const form = page.getByRole("dialog");
  await form
    .getByLabel("Objective", { exact: true })
    .fill("Create an approved verification note");
  await form
    .getByLabel("Assigned agent", { exact: true })
    .selectOption("computer");
  await form
    .getByLabel("Execution tool", { exact: true })
    .selectOption("workspace.write");
  await form.getByLabel("Workspace file path").fill(`e2e-${Date.now()}.txt`);
  await form
    .getByLabel("Source text / content")
    .fill("Approved local evidence.");
  await form
    .getByRole("button", { name: "Create workflow", exact: true })
    .click();
  const details = page.getByRole("dialog");
  await expect(
    details.getByRole("heading", { name: "Authorization required" }),
  ).toBeVisible();
  await details
    .getByRole("button", { name: "Approve once", exact: true })
    .click();
  await expect(
    details.getByText("All execution steps and supervisor checks completed.", {
      exact: true,
    }),
  ).toBeVisible();
  await details.getByRole("button", { name: "Close panel" }).click();
  await page
    .getByRole("button", { name: "EMERGENCY STOP", exact: true })
    .click();
  await expect(
    page.getByText("Emergency stop is active. Tools and schedules are paused."),
  ).toBeVisible();
  expect(
    (
      await page.request.post("/api/tasks", {
        data: { objective: "Should be blocked" },
      })
    ).status(),
  ).toBe(400);
  await page
    .getByRole("button", { name: "Resume system", exact: true })
    .click();
  await expect(
    page.getByText("Emergency stop is active. Tools and schedules are paused."),
  ).toHaveCount(0);
});
test("settings persist real autonomy policy and visual quality", async ({
  page,
}) => {
  await pair(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /autonomous Also run/ }).click();
  expect(
    (await (await page.request.get("/api/state")).json()).policy.mode,
  ).toBe("autonomous");
  await dialog.getByLabel("Render quality").selectOption("performance");
  await dialog.getByLabel("Reduced motion").check();
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByLabel("Render quality"),
  ).toHaveValue("performance");
  await expect(
    page.getByRole("dialog").getByLabel("Reduced motion"),
  ).toBeChecked();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /manual Run only/ })
    .click();
});
test("real Chromium navigation extracts a deterministic isolated website fixture and captures evidence", async ({
  page,
}) => {
  await page.route("https://example.com/agents-fixture", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: '<!doctype html><title>Verified fixture</title><meta name="description" content="Browser verification fixture"><h1>Research source</h1><p>Observed information, not a simulated screenshot.</p><a href="/next">Next page</a>',
    }),
  );
  await page.goto("https://example.com/agents-fixture");
  await expect(
    page.getByRole("heading", { name: "Research source" }),
  ).toBeVisible();
  expect(await page.title()).toBe("Verified fixture");
  await page.screenshot({ path: "artifacts/browser-fixture.png" });
});

test("coordinated workflow completes multiple specialists and carries their evidence forward", async ({
  page,
}) => {
  await pair(page);
  await page.getByRole("button", { name: "New workflow", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Objective", { exact: true })
    .fill("Prepare a coordinated product launch");
  await dialog
    .getByLabel("Execution strategy", { exact: true })
    .selectOption("team");
  await dialog
    .getByRole("button", { name: "Create workflow", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("All execution steps and supervisor checks completed.", {
        exact: true,
      }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("Revenue scenarios", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("Correspondence draft", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText(/Upstream task outputs for your review/),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/coordinated-workflow.png",
    fullPage: true,
  });
});
test("projects and schedules are persisted, editable, and removable through working controls", async ({
  page,
}) => {
  await pair(page);
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Verification project");
  await dialog
    .getByLabel("Objective", { exact: true })
    .fill("Verify project and schedule controls");
  await dialog
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  const project = dialog
    .locator(".project-card")
    .filter({ hasText: "Verification project" });
  await expect(project).toBeVisible();
  await project
    .getByPlaceholder("Add a milestone")
    .fill("Review real artifacts");
  await project
    .getByRole("button", { name: "Add milestone to Verification project" })
    .click();
  await expect(project.locator(".milestones")).toContainText(
    "Review real artifacts",
  );
  await dialog.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Tomorrow inventory");
  await dialog
    .getByLabel("Objective", { exact: true })
    .fill("Review the safe workspace");
  await dialog.getByLabel("Start time").fill("2030-01-01T09:00");
  await dialog
    .getByRole("button", { name: "Save schedule", exact: true })
    .click();
  const schedule = dialog
    .locator(".schedule-card")
    .filter({ hasText: "Tomorrow inventory" });
  await expect(schedule).toBeVisible();
  await schedule
    .getByRole("button", { name: "Pause schedule", exact: true })
    .click();
  await expect(schedule.locator(".badge")).toHaveText("paused");
  await schedule
    .getByRole("button", { name: "Delete schedule", exact: true })
    .click();
  await expect(schedule).toHaveCount(0);
});

test("Computer module reports actual host limits and exposes typed delegation without claiming Windows connectivity", async ({
  page,
}) => {
  await pair(page);
  await page.getByRole("button", { name: "Computer", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("status")).toContainText("Windows");
  await dialog.getByRole("button", { name: "Create workspace task" }).click();
  await page.getByLabel("Execution tool").selectOption("computer.delegate");
  await expect(page.getByLabel("Computer operation")).toBeVisible();
  await expect(
    page.getByText("No screenshot is sent to OpenAI.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Computer operation").selectOption("act");
  await expect(page.getByLabel("Observed window")).toBeVisible();
  await expect(page.getByLabel("Windows action")).toBeVisible();
  await page.getByLabel("Windows action").selectOption("click");
  await expect(
    page.getByLabel("Required value after the action"),
  ).toBeVisible();
});

test("Playwright interactions fill, click, and press with real postcondition checks in an isolated fixture", async ({
  page,
}) => {
  await page.route("https://example.com/interaction-fixture", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><title>Explicit interaction test fixture</title><label>Sample<input aria-label="Sample" onkeydown="if(event.key==='Enter')document.getElementById('result').textContent='Entered'"></label><button onclick="document.getElementById('result').textContent='Confirmed'">Confirm</button><h2 id="result" aria-label="Result">Waiting</h2>`,
    }),
  );
  await page.goto("https://example.com/interaction-fixture");
  const signal = new AbortController().signal;
  const text = { role: "textbox" as const, name: "Sample" };
  const heading = { role: "heading" as const, name: "Result" };
  expect(
    await interactWithPage(
      page,
      {
        action: { kind: "fill", target: text, text: "Reviewed sample" },
        expect: { target: text, property: "value", equals: "Reviewed sample" },
      },
      signal,
    ),
  ).toContain("postcondition observed");
  expect(
    await interactWithPage(
      page,
      {
        action: { kind: "press", target: text, key: "Enter" },
        expect: { target: heading, property: "text", equals: "Entered" },
      },
      signal,
    ),
  ).toContain("postcondition observed");
  expect(
    await interactWithPage(
      page,
      {
        action: { kind: "click", target: { role: "button", name: "Confirm" } },
        expect: { target: heading, property: "text", equals: "Confirmed" },
      },
      signal,
    ),
  ).toContain("postcondition observed");
  await page.screenshot({ path: "artifacts/browser-interaction-fixture.png" });
});

test("Playwright refuses ambiguous/password targets, already-true assertions, cancellation, and failed postconditions", async ({
  page,
}) => {
  await page.setContent(
    '<label>Secret<input type="password" aria-label="Secret"></label><button>Duplicate</button><button>Duplicate</button><button>Unique</button><h2 aria-label="Result">Waiting</h2>',
  );
  const expectResult = {
    target: { role: "heading" as const, name: "Result" },
    property: "text" as const,
    equals: "Changed",
  };
  const signal = new AbortController().signal;
  await expect(
    interactWithPage(
      page,
      {
        action: {
          kind: "click",
          target: { role: "button", name: "Duplicate" },
        },
        expect: expectResult,
      },
      signal,
    ),
  ).rejects.toThrow("ambiguous");
  // Password controls lack the textbox role; a labelled input fixture adds it explicitly to exercise the guard.
  await page
    .getByLabel("Secret")
    .evaluate((e) => e.setAttribute("role", "textbox"));
  await expect(
    interactWithPage(
      page,
      {
        action: {
          kind: "fill",
          target: { role: "textbox", name: "Secret" },
          text: "never sent",
        },
        expect: expectResult,
      },
      signal,
    ),
  ).rejects.toThrow("Password");
  const action = {
    kind: "click" as const,
    target: { role: "button" as const, name: "Unique" },
  };
  await expect(
    interactWithPage(
      page,
      { action, expect: { ...expectResult, equals: "Waiting" } },
      signal,
    ),
  ).rejects.toThrow("already holds");
  const cancelled = new AbortController();
  cancelled.abort();
  await expect(
    interactWithPage(page, { action, expect: expectResult }, cancelled.signal),
  ).rejects.toThrow();
  await expect(
    interactWithPage(page, { action, expect: expectResult }, signal),
  ).rejects.toThrow("not verified");
});
