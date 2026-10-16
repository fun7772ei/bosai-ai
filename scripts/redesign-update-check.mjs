// Production SW lifecycle integration. Test files and origin storage are isolated to this browser context.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const original = readFileSync("dist/sw.js", "utf8"),
  browser = await chromium.launch(),
  context = await browser.newContext(),
  page = await context.newPage(),
  out = { checks: [], errors: [] };
page.on("pageerror", (e) => out.errors.push(e.message));
try {
  await page.goto("http://localhost:4173/bosai-ai/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(async () => {
    const keys = await caches.keys(),
      shell = keys.find((k) => k.startsWith("bosai-ai-shell-"));
    await (
      await caches.open(shell)
    ).put(
      "/bosai-ai/assets/old-tab-module.js",
      new Response("old tab retained"),
    );
    await (
      await caches.open("bosai-model-sentinel")
    ).put("/saved-model", new Response("model bytes"));
    localStorage.setItem("bosai-user-sentinel", "keep");
  });
  const other = await context.newPage();
  await other.goto("http://localhost:4173/bosai-ai/");
  writeFileSync(
    "dist/sw.js",
    original.replace(
      /const SHELL = '[^']+';/,
      "const SHELL = 'bosai-ai-shell-redesign-update-check';",
    ),
  );
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    await r.update();
  });
  await page.waitForFunction(
    async () => !!(await navigator.serviceWorker.getRegistration())?.waiting,
  );
  await page.locator(".update-notice button").waitFor();
  await Promise.all([
    page.waitForEvent("load"),
    page.locator(".update-notice button").click(),
  ]);
  await page.waitForFunction(
    () => document.querySelector("#conversation").dataset.state,
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem("bosai-user-sentinel")),
    "keep",
  );
  assert.equal(
    await page.evaluate(
      async () =>
        await (
          await (
            await caches.open("bosai-model-sentinel")
          ).match("/saved-model")
        ).text(),
    ),
    "model bytes",
  );
  out.checks.push("explicit update reloads without removing saved stores");
  await context.setOffline(true);
  assert.equal(
    await other.evaluate(() =>
      fetch("./assets/old-tab-module.js").then((r) => r.text()),
    ),
    "old tab retained",
  );
  out.checks.push("old tab can still load old hashed assets offline");
  await page.reload();
  assert(await page.locator("#conversation").isVisible());
  out.checks.push("updated shell restarts offline");
  assert.equal(out.errors.length, 0);
  out.status = "passed";
} catch (e) {
  out.status = "failed";
  out.failure = e.stack;
  process.exitCode = 1;
} finally {
  writeFileSync("dist/sw.js", original);
  writeFileSync(
    "test-results/redesign-update.json",
    JSON.stringify(out, null, 2),
  );
  console.log(out);
  await browser.close();
}
