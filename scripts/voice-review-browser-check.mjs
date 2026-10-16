// Deterministic SDK double checks UI/state only; not recognition or performance.
import { chromium, webkit } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  installVoiceDouble,
  installCaptureDouble,
} from "./helpers/voice-sdk-double.mjs";
const browserType = process.env.BOSAI_BROWSER === "webkit" ? webkit : chromium;
const browser = await browserType.launch(),
  out = {
    platform: `Linux ${browserType.name()}`,
    sdk: "test double; UI only",
    checks: [],
  };
mkdirSync("test-results", { recursive: true });
try {
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 1180, height: 820 },
  });
  await installVoiceDouble(context);
  await context.route("**/bosai-ai/", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        "cross-origin-opener-policy": "same-origin",
        "cross-origin-embedder-policy": "require-corp",
      },
    });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:4173/bosai-ai/");
  await page.reload();
  await page.evaluate(installCaptureDouble);
  async function nav(view) {
    await page.locator(`[data-view="${view}"]`).evaluate((b) => b.click());
  }
  async function start() {
    await page.locator("#voiceToggle").click();
    await page.waitForFunction(() =>
      ["recording", "error"].includes(
        document.querySelector(".voice-lab").dataset.phase,
      ),
    );
    assert.equal(
      await page.locator(".voice-lab").getAttribute("data-phase"),
      "recording",
      await page.locator("#voiceStatus").textContent(),
    );
  }
  async function stop() {
    await page.locator("#voiceStop").click();
    await page.waitForFunction(
      () => document.querySelector(".voice-lab").dataset.phase === "review",
    );
  }
  await start();
  const recordingDraft = await page.locator("#chatQuestion").inputValue();
  await page.locator("#chatExamples button").first().click();
  assert.equal(
    await page.locator("#chatQuestion").inputValue(),
    recordingDraft,
  );
  assert.equal(await page.evaluate(() => window.testLoadCount), 1);
  assert(await page.locator("#voiceStop").isVisible());
  assert.equal(await page.locator("#voiceLoad").count(), 0);
  assert.equal(await page.locator("#voiceCommitted").count(), 0);
  out.checks.push(
    "one tap automatically prepares and starts; no model panel or duplicate transcript",
  );
  await page.evaluate(() => {
    window.testHost.emit({ id: "a", text: "津波は", isComplete: false });
    window.testHost.emit({
      id: "a",
      text: "津波は来ていません。",
      isComplete: true,
    });
    window.testHost.emit({
      id: "a",
      text: "津波は来ていません。",
      isComplete: true,
    });
    window.testFinal = { id: "b", text: "家の中です。", isComplete: true };
  });
  await stop();
  assert.equal(
    await page.locator("#chatQuestion").inputValue(),
    "津波は来ていません。 家の中です。",
  );
  assert.equal(await page.locator("#conversationLog").textContent(), "");
  assert(await page.evaluate(() => window.testStreamClosed));
  assert(!(await page.evaluate(() => window.testClosed)));
  out.checks.push(
    "line ids deduplicate; final stop callback retained; no auto send; only stream released",
  );
  await start();
  assert.equal(await page.evaluate(() => window.testLoadCount), 1);
  await page.locator("#chatQuestion").fill("手動修正を維持する");
  await page.evaluate(() =>
    window.testHost.emit({ id: "c", text: "勝手に変えない", isComplete: true }),
  );
  await stop();
  assert.equal(
    await page.locator("#chatQuestion").inputValue(),
    "手動修正を維持する",
  );
  out.checks.push("restart reuses model; manual edits survive final callbacks");
  await page.evaluate(() => (window.testFinal = null));
  await page.locator("#chatQuestion").fill("キャンセル前");
  await start();
  await page.evaluate(() =>
    window.testHost.emit({ id: "d", text: "破棄する", isComplete: false }),
  );
  await nav("dictionary");
  assert(await page.locator("#voiceActivity").isVisible());
  await page.locator("#voiceActivity button").last().click();
  await page.waitForFunction(
    () => document.querySelector(".voice-lab").dataset.phase === "review",
  );
  await nav("chat");
  await start();
  await page.locator("#voiceCancel").click();
  await page.waitForFunction(
    () => document.querySelector(".voice-lab").dataset.phase === "idle",
  );
  assert(await page.evaluate(() => window.testClosed));
  out.checks.push(
    "recording remains controllable in dictionary; cancellation terminates worker",
  );
  await page.locator("#chatQuestion").fill("消去する入力");
  await page.locator("#chatInputClear").click();
  assert.equal(await page.locator("#chatQuestion").inputValue(), "");
  await page.evaluate(() => (window.testPermissionDenied = true));
  await page.locator("#voiceToggle").click();
  await page.waitForFunction(
    () => document.querySelector(".voice-lab").dataset.phase === "error",
  );
  assert((await page.locator("#voiceStatus").textContent()).includes("マイク"));
  await page.evaluate(() => (window.testPermissionDenied = false));
  await page.locator("#voiceRetry").click();
  await page.waitForFunction(
    () => document.querySelector(".voice-lab").dataset.phase === "recording",
  );
  await stop();
  out.checks.push("clear input; microphone refusal and retry recover");
  await page.locator("#chatQuestion").fill("寝ているときに地震が来たら？");
  await page.locator("#chatSend").click();
  await page.waitForFunction(
    () =>
      !window.bosaiConversation.busy &&
      window.bosaiConversation.history.length >= 2,
  );
  assert(await page.evaluate(() => window.testClosed));
  out.checks.push(
    "send releases voice worker and resumes selected search mode",
  );
  await nav("settings");
  await page.locator("#voiceModel").selectOption("base");
  await nav("chat");
  await start();
  assert.equal(await page.evaluate(() => window.testVoiceArch), 1);
  await page.locator("#voiceCancel").click();
  await page.waitForFunction(
    () => document.querySelector(".voice-lab").dataset.phase === "idle",
  );
  await page.evaluate(() => (window.testLoadError = true));
  await page.locator("#voiceToggle").click();
  await page.waitForFunction(
    () => document.querySelector(".voice-lab").dataset.phase === "error",
  );
  await nav("settings");
  await page.locator("#voiceModel").selectOption("tiny");
  await page.evaluate(() => (window.testLoadError = false));
  await nav("chat");
  await start();
  assert.equal(await page.evaluate(() => window.testVoiceArch), 0);
  await stop();
  out.checks.push(
    "Base is explicit; load failure recovers through visible Tiny selection",
  );
  await page.locator("#chatQuestion").fill("編集中");
  await start();
  await page.evaluate(() =>
    window.testHost.emit({ id: "tail", text: "暫定の末尾", isComplete: false }),
  );
  await stop();
  assert(
    (await page.locator("#chatQuestion").inputValue()).endsWith("暫定の末尾"),
  );
  assert((await page.locator("#voiceStatus").textContent()).includes("暫定"));
  out.checks.push("uncommitted tail preserved and labelled for review");
  await page.evaluate(() => (window.testCloseFailure = true));
  await page.locator("#chatQuestion").fill("寝ているときに地震が来たら？");
  await page.locator("#chatSend").click();
  await page.waitForFunction(
    () =>
      !window.bosaiConversation.busy &&
      window.bosaiConversation.history.at(-1)?.diagnostics,
  );
  assert.equal(
    await page.evaluate(
      () => window.bosaiConversation.history.at(-1).diagnostics.actual,
    ),
    "light",
  );
  assert(
    (await page.locator("#chatStatus").textContent()).includes("軽量検索"),
  );
  await page.evaluate(() => (window.testCloseFailure = false));
  await nav("settings");
  await page.locator("#voiceUnload").click();
  await nav("chat");
  await page.evaluate(() => (window.testHoldLoad = true));
  await page.locator("#voiceToggle").click();
  await page.waitForFunction(() => !!window.testResumeLoad);
  await page.locator("#voiceCancel").click();
  await page.waitForFunction(
    () => document.querySelector(".voice-lab").dataset.phase === "idle",
  );
  await page.evaluate(() => (window.testHoldLoad = false));
  await start();
  await stop();
  out.checks.push(
    "uncertain release retains lightweight text search; cancel during model load and restart recover",
  );
  await start();
  await page.evaluate(()=>window.testHost.emit({id:'tiny-eval',text:'Tinyの原認識',isComplete:true}));await stop();
  await nav('settings');await page.locator('#diagnostics summary').first().click();
  const evaluation=page.locator('#voiceExperiments details').filter({hasText:'音声評価（28文・手動記録）'});
  await evaluation.locator('summary').click();
  await evaluation.getByRole('button',{name:'直前の試行を記録',exact:true}).click();
  await page.locator('#voiceModel').selectOption('base');
  await evaluation.getByRole('button',{name:'直前の試行を記録',exact:true}).click();
  assert((await evaluation.textContent()).includes('新しく録音を開始'));
  await nav('chat');await start();await page.evaluate(()=>window.testHost.emit({id:'base-eval',text:'Baseの原認識',isComplete:true}));await stop();
  await nav('settings');await evaluation.getByRole('button',{name:'直前の試行を記録',exact:true}).click();
  async function capture(){const pending=page.waitForEvent('download');await evaluation.getByRole('button',{name:'評価JSONを書き出す',exact:true}).click();const download=await pending;const stream=await download.createReadStream();let body='';for await(const chunk of stream)body+=chunk.toString();return JSON.parse(body);}
  const baseCapture=await capture();assert.equal(baseCapture.model,'base');assert.equal(baseCapture.results.length,1);assert.equal(baseCapture.results[0].transcript,'Baseの原認識');
  await page.locator('#voiceModel').selectOption('tiny');const tinyCapture=await capture();assert.equal(tinyCapture.model,'tiny');assert.equal(tinyCapture.results.length,1);assert.equal(tinyCapture.results[0].transcript,'Tinyの原認識');
  out.checks.push('manual evaluation keeps raw captures by model and rejects stale attempts after switching');
  assert.deepEqual(errors, []);
  out.status = "passed";
} catch (e) {
  out.status = "failed";
  out.error = e.stack;
  process.exitCode = 1;
} finally {
  writeFileSync(
    `test-results/voice-review-ui${browserType === webkit ? "-webkit" : ""}.json`,
    JSON.stringify(out, null, 2),
  );
  console.log(out);
  await browser.close();
}
