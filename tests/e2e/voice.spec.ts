import { test, expect, type Page } from "@playwright/test";
import { openDashboard } from "./dashboard-session.js";
interface Fixture {
  micCalls: number;
  starts: number;
  stops: number;
  lang: string;
  local: boolean | undefined;
  resolve: () => void;
  send: (text: string) => void;
}
async function pair(page: Page, localSupported: boolean) {
  await page.addInitScript((localSupported) => {
    const state: Fixture = {
      micCalls: 0,
      starts: 0,
      stops: 0,
      lang: "",
      local: undefined,
      resolve: () => {},
      send: () => {},
    };
    Object.defineProperty(window, "voiceFixture", { value: state });
    class Recognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onresult:
        | ((event: {
            results: { isFinal: boolean; 0: { transcript: string } }[];
          }) => void)
        | null = null;
      constructor() {
        if (localSupported)
          Object.defineProperty(this, "processLocally", {
            value: true,
            writable: true,
          });
        state.send = (text) =>
          this.onresult?.({
            results: [{ isFinal: true, 0: { transcript: text } }],
          });
      }
      static async available() {
        return "available";
      }
      start() {
        state.starts++;
        state.lang = this.lang;
        state.local = (
          this as unknown as { processLocally?: boolean }
        ).processLocally;
        this.onstart?.();
      }
      abort() {
        this.onend?.();
      }
    }
    Object.defineProperty(window, "SpeechRecognition", { value: Recognition });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () => {
        state.micCalls++;
        return new Promise((resolve) => {
          state.resolve = () =>
            resolve({
              getTracks: () => [
                {
                  stop: () => {
                    state.stops++;
                  },
                },
              ],
            });
        });
      },
    });
    Object.defineProperty(window, "AudioContext", {
      value: class {
        state = "running";
        async close() {
          this.state = "closed";
        }
        createAnalyser() {
          return {
            fftSize: 256,
            frequencyBinCount: 128,
            getByteTimeDomainData: (buffer: Uint8Array) => buffer.fill(128),
          };
        }
        createMediaStreamSource() {
          return { connect: () => {} };
        }
      },
    });
  }, localSupported);
  await openDashboard(page);
  await expect(page.getByLabel("Command your agents")).toBeVisible();
}
test("voice fixtures: remote recognition needs explicit consent and Nepali transcripts never auto-submit", async ({
  page,
}) => {
  await pair(page, false);
  const before = (await (await page.request.get("/api/state")).json()).tasks
    .length;
  await page.getByRole("button", { name: "Start voice input" }).click();
  await expect(page.getByRole("alert")).toContainText("cannot guarantee local");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { voiceFixture: Fixture }).voiceFixture.micCalls,
    ),
  ).toBe(0);
  await page.getByText("Voice language and privacy", { exact: true }).click();
  await page
    .getByLabel("Voice language", { exact: true })
    .selectOption("ne-NP");
  await page
    .getByLabel("Allow browser speech service for recognition", {
      exact: false,
    })
    .check();
  await page.getByRole("button", { name: "Start voice input" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { voiceFixture: Fixture }).voiceFixture
            .micCalls,
      ),
    )
    .toBe(1);
  await page.evaluate(() =>
    (window as unknown as { voiceFixture: Fixture }).voiceFixture.resolve(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { voiceFixture: Fixture }).voiceFixture.lang,
      ),
    )
    .toBe("ne-NP");
  await page.evaluate(() =>
    (window as unknown as { voiceFixture: Fixture }).voiceFixture.send(
      "मेरो योजना तयार गर्नुहोस्",
    ),
  );
  await expect(page.getByLabel("Command your agents")).toHaveValue(
    "मेरो योजना तयार गर्नुहोस्",
  );
  expect(
    (await (await page.request.get("/api/state")).json()).tasks.length,
  ).toBe(before);
  await page.getByRole("button", { name: "Stop listening" }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { voiceFixture: Fixture }).voiceFixture.stops,
    ),
  ).toBe(1);
  await page.reload();
  await page.getByText("Voice language and privacy", { exact: true }).click();
  await expect(page.getByLabel("Voice language", { exact: true })).toHaveValue(
    "ne-NP",
  );
  await expect(
    page.getByLabel("Allow browser speech service for recognition", {
      exact: false,
    }),
  ).not.toBeChecked();
});
test("voice fixtures: cancelling a pending microphone grant releases a late stream without recognition", async ({
  page,
}) => {
  await pair(page, true);
  await page.getByRole("button", { name: "Start voice input" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { voiceFixture: Fixture }).voiceFixture
            .micCalls,
      ),
    )
    .toBe(1);
  await page.getByRole("button", { name: "Stop listening" }).click();
  await page.evaluate(() =>
    (window as unknown as { voiceFixture: Fixture }).voiceFixture.resolve(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { voiceFixture: Fixture }).voiceFixture.stops,
      ),
    )
    .toBe(1);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { voiceFixture: Fixture }).voiceFixture.starts,
    ),
  ).toBe(0);
  await expect(
    page.getByRole("button", { name: "Start voice input" }),
  ).toBeVisible();
});
