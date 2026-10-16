import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch(),
  out = { platform: "Linux Chromium, not iPad", checks: [] };
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:4173/bosai-ai/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  assert.equal(await page.evaluate(() => crossOriginIsolated), false);
  await page.evaluate(() => {
    document.querySelector("#mode").value = "light";
  });
  await page.locator("#chatQuestion").fill("寝ているときに地震が来たら？");
  await page.locator("#chatSend").click();
  await page.waitForFunction(
    () =>
      !window.bosaiConversation.busy &&
      window.bosaiConversation.history.length >= 2,
  );
  const previous = await page
    .locator("#conversation")
    .getAttribute("data-state");
  await page.locator("#chatQuestion").fill("保持する音声前の下書き");
  await Promise.all([
    page.waitForEvent("load"),
    page.locator("#voiceToggle").click(),
  ]);
  await page.waitForFunction(
    () => document.querySelector("#conversation").dataset.state,
  );
  assert(await page.evaluate(() => crossOriginIsolated));
  assert.equal(
    await page.locator("#chatQuestion").inputValue(),
    "保持する音声前の下書き",
  );
  assert.equal(
    await page.locator("#conversation").getAttribute("data-state"),
    previous,
  );
  out.checks.push(
    "first-use isolation navigation preserves draft, history, context and candidate selection",
  );
  await page.reload();
  assert(await page.evaluate(() => crossOriginIsolated));
  out.checks.push(
    "normal controlled navigation stays isolated without voice URL parameters",
  );
  assert.deepEqual(errors, []);
  await context.close();
  const blocked = await browser.newContext();
  await blocked.addInitScript(() => {
    for (const name of ["localStorage", "sessionStorage"])
      Object.defineProperty(window, name, {
        configurable: true,
        get() {
          throw new DOMException("blocked", "SecurityError");
        },
      });
  });
  const p = await blocked.newPage();
  await p.goto("http://localhost:4173/bosai-ai/");
  await p.locator("#chatQuestion").fill("寝ているときに地震が来たら？");
  await p.locator("#chatSend").click();
  await p.waitForFunction(
    () =>
      window.bosaiConversation.history.length >= 2 &&
      !window.bosaiConversation.busy,
  );
  out.checks.push("storage access failure does not block text conversation");
  out.status = "passed";
} catch (e) {
  out.status = "failed";
  out.error = e.stack;
  process.exitCode = 1;
} finally {
  writeFileSync(
    "test-results/voice-handoff.json",
    JSON.stringify(out, null, 2),
  );
  console.log(out);
  await browser.close();
}
