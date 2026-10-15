import type { Page } from "playwright";
import {
  BrowserInteraction,
  type BrowserAction,
} from "../../shared/computer.js";

export async function interactWithPage(
  page: Page,
  raw: BrowserAction,
  signal: AbortSignal,
) {
  const input = BrowserInteraction.parse(raw);
  const locate = (target: BrowserAction["action"]["target"]) =>
    page.getByRole(target.role, { name: target.name, exact: true });
  const target = locate(input.action.target);
  if ((await target.count()) !== 1)
    throw new Error("Browser target is missing or ambiguous.");
  if ((await target.getAttribute("type"))?.toLowerCase() === "password")
    throw new Error("Password controls are not supported.");
  const expected = locate(input.expect.target);
  const matches = async () => {
    if ((await expected.count()) !== 1) return false;
    if ((await expected.getAttribute("type"))?.toLowerCase() === "password")
      throw new Error("Password evidence is prohibited.");
    if (input.expect.property === "visible")
      return String(await expected.isVisible()) === input.expect.equals;
    if (input.expect.property === "value")
      return (
        (await expected.inputValue({ timeout: 500 })) === input.expect.equals
      );
    return (
      (await expected.innerText({ timeout: 500 })).trim() ===
      input.expect.equals
    );
  };
  if (await matches())
    throw new Error(
      "Postcondition already holds. Provide a postcondition that demonstrates an actual change.",
    );
  signal.throwIfAborted();
  if (input.action.kind === "click") await target.click({ timeout: 5000 });
  else if (input.action.kind === "fill")
    await target.fill(input.action.text, { timeout: 5000 });
  else await target.press(input.action.key, { timeout: 5000 });
  const end = Date.now() + 3000;
  do {
    signal.throwIfAborted();
    if (await matches())
      return `Playwright ${input.action.kind} executed once; ${input.expect.property} postcondition observed.`;
    await new Promise((r) => setTimeout(r, 100));
  } while (Date.now() < end);
  throw new Error(
    "Browser input was dispatched but its postcondition was not verified. No automatic retry.",
  );
}
