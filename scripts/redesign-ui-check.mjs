import { spawn } from "node:child_process";
import { chromium, webkit } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import corpus from "../src/bosai-data.json" with { type: "json" };
mkdirSync("test-results", { recursive: true });
const browserType = process.env.BOSAI_BROWSER === "webkit" ? webkit : chromium;
// WebKit's Playwright offline emulation can reject navigation before dispatching to SW.
// For local WebKit, stop a dedicated origin server instead: the network really is unavailable.
const isolatedServer =
  browserType === webkit && !process.env.BOSAI_PUBLIC_URL
    ? spawn(
        process.execPath,
        [
          "node_modules/vite/bin/vite.js",
          "preview",
          "--port",
          "4174",
          "--strictPort",
        ],
        { stdio: "ignore" },
      )
    : null;
const base =
  process.env.BOSAI_PUBLIC_URL ||
  `http://localhost:${isolatedServer ? 4174 : 4173}/bosai-ai/`;
if (isolatedServer)
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
const browser = await browserType.launch(),
  out = {
    browser: browserType.name(),
    url: base,
    device: "Emulated viewports, not physical iPad Safari",
    checks: [],
    errors: [],
  };
const context = await browser.newContext({ hasTouch: true });
const page = await context.newPage();
page.on("pageerror", (e) => out.errors.push(e.message));
async function nav(view) {
  if (
    (await page.locator("#menuToggle").isVisible()) &&
    (await page.locator("#appNavigation").isHidden())
  )
    await page.locator("#menuToggle").click();
  await page.locator(`[data-view="${view}"]`).click();
}
async function send(text) {
  await page.locator("#chatQuestion").fill(text);
  await page.locator("#chatSend").click();
  await page.waitForFunction(
    () =>
      !document.querySelector("#chatStop").hidden === false &&
      document.querySelector("#conversationLog").children.length >= 2,
  );
}
try {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto(base);
  await page.waitForFunction(
    () => document.querySelector("#conversation").dataset.state,
  );
  assert(await page.locator("#conversation").isVisible());
  assert(await page.locator("#appNavigation").isVisible());
  assert.equal(await page.locator("#chatExamples button").count(), 3);
  out.checks.push("chat-first and landscape sidebar");
  await page.screenshot({ path: "test-results/redesign-landscape.png" });
  await page.locator("#chatQuestion").fill("保持する下書き");
  await nav("dictionary");
  assert.equal(await page.locator("[data-browse-entry]").count(), 88);
  for (const entry of corpus) {
    await page.locator(`[data-browse-entry="${entry.id}"]`).click();
    const card = page.locator("#browseArticle article");
    const text = await card.textContent();
    for (const value of [
      entry.title,
      entry.summary,
      entry.warning,
      entry.items,
      ...entry.steps,
    ])
      assert(text.includes(value), entry.id);
    assert.deepEqual(
      await card.locator("a").evaluateAll((ns) =>
        ns.map((n) => ({
          label: n.textContent,
          url: n.getAttribute("href"),
        })),
      ),
      entry.sources,
    );
  }
  out.checks.push(
    "all 88 original records, warnings, steps, items and source links",
  );
  await page.locator("#browseQuery").fill("津波");
  assert((await page.locator("[data-browse-entry]").count()) > 0);
  assert((await page.locator("[data-browse-entry]").count()) < 88);
  await page.locator("#browseCategory").selectOption({ index: 1 });
  out.checks.push("keyword and category filters");
  await nav("settings");
  assert(await page.locator("#saveModel").isVisible());
  assert(await page.locator("#diagnostics").isVisible());
  assert(await page.locator("#voiceExperiments").isHidden());
  await page.locator("#theme").selectOption("dark");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  out.checks.push("focused settings, dark theme and collapsed experiments");
  await nav("chat");
  assert.equal(
    await page.locator("#chatQuestion").inputValue(),
    "保持する下書き",
  );
  await send("寝ているときに地震が来たら？");
  assert(
    await page
      .locator("#conversationLog")
      .textContent()
      .then((t) => t.includes("寝ている")),
  );
  await page.locator("[data-source-choice]:enabled").first().click();
  assert(await page.locator("#conversationLog .warning").isVisible());
  assert(await page.locator("#conversationLog .entry details").isVisible());
  assert.equal(
    await page.locator("#conversationLog .entry details").getAttribute("open"),
    null,
  );
  await page.locator("#conversationLog .entry summary").click();
  assert(await page.locator("#conversationLog .entry a").first().isVisible());
  out.checks.push("send, candidate choice, warnings and expandable original");
  const history = await page
    .locator("#conversation")
    .getAttribute("data-state");
  await nav("dictionary");
  assert.equal(await page.locator("#browseQuery").inputValue(), "津波");
  await nav("chat");
  assert.equal(
    await page.locator("#conversation").getAttribute("data-state"),
    history,
  );
  out.checks.push("view changes preserve chat, draft and dictionary filters");
  await page.locator("#voiceToggle").tap();
  assert(await page.locator("#voiceLoad").isVisible());
  await page.locator("#voiceClose").click();
  assert(await page.locator("#voicePopover").isHidden());
  out.checks.push("voice controls open and close from composer");
  for (const [name, width, height] of [
    ["portrait", 820, 1180],
    ["phone", 390, 844],
    ["desktop", 1440, 900],
    ["keyboard", 820, 500],
  ]) {
    await page.setViewportSize({ width, height });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const input = await page.locator("#chatQuestion").boundingBox();
    const send = await page.locator("#chatSend").boundingBox();
    assert(
      input.y >= 0 && send.y + send.height <= height,
      `${name} composer outside viewport`,
    );
    assert(send.width >= 44 && send.height >= 44);
    if (name === "portrait") {
      assert(await page.locator("#appNavigation").isHidden());
      await nav("settings");
      await page.locator("#theme").selectOption("light");
      await nav("chat");
    }
    await page.screenshot({ path: `test-results/redesign-${name}.png` });
    out.checks.push(
      `${name}: no horizontal overflow, composer visible, 44px target`,
    );
  }
  await page.setViewportSize({ width: 1180, height: 820 });
  await nav("settings");
  await page.locator("#theme").selectOption("system");
  await page.waitForFunction(() =>
    document
      .querySelector("#shellState")
      .textContent.startsWith("アプリ・辞書のオフライン準備が完了"),
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  if (isolatedServer) {
    const exited = new Promise((r) => isolatedServer.once("exit", r));
    isolatedServer.kill();
    await exited;
  } else await context.setOffline(true);
  await page.reload();
  await nav("dictionary");
  assert.equal(await page.locator("[data-browse-entry]").count(), 88);
  await page.locator("[data-browse-entry]").first().click();
  assert(await page.locator("#browseArticle article").isVisible());
  await nav("chat");
  await send("寝ているときに地震が来たら？");
  assert((await page.locator("[data-source-choice]").count()) > 0);
  out.checks.push("offline reload, dictionary and model-free chat");
  assert.equal(out.errors.length, 0);
  out.status = "passed";
} catch (e) {
  out.status = "failed";
  out.failure = e.stack;
  process.exitCode = 1;
} finally {
  writeFileSync(
    `test-results/redesign-ui-${browserType.name()}${process.env.BOSAI_PUBLIC_URL ? "-public" : ""}.json`,
    JSON.stringify(out, null, 2),
  );
  console.log(out);
  isolatedServer?.kill();
  await browser.close();
}
