import type { Page, Cookie } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
let cookies: Cookie[] | undefined;
// Reuse one authenticated owner session within this test worker. Production
// pairing rate limits stay intact as the number of dashboard journeys grows.
export async function openDashboard(page: Page) {
  if (cookies) await page.context().addCookies(cookies);
  else {
    const token = (
      await readFile(
        join(process.env.AGENTS_E2E_DATA_DIR!, "pairing-token"),
        "utf8",
      )
    ).trim();
    const response = await page.request.post("/api/session", {
      data: { token },
    });
    if (!response.ok())
      throw new Error(
        "Dashboard fixture pairing failed: HTTP " + response.status(),
      );
    cookies = await page.context().cookies();
  }
  await page.goto("/");
}
