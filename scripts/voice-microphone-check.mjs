import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, createReadStream } from "node:fs";
import { createServer } from "node:http";
const assets = JSON.parse(readFileSync("test-results/moonshine-assets.json"));
const files = Object.values(assets.models).flatMap((m) =>
  m.manifest.groups.flatMap((g) => g.files),
);
const server = createServer((req, res) => {
  const f = files.find((f) => f.url === decodeURIComponent(req.url.slice(1)));
  if (!f) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    "content-length": f.size,
    "access-control-allow-origin": "*",
  });
  createReadStream(f.localFile).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const wav = readFileSync("scripts/evaluation/synthetic-ja/long.wav");
const input = Buffer.concat([
  Buffer.alloc(16000 * 2 * 6),
  wav.subarray(44),
  Buffer.alloc(16000 * 2 * 2),
]);
const header = Buffer.from(wav.subarray(0, 44));
header.writeUInt32LE(input.length + 36, 4);
header.writeUInt32LE(input.length, 40);
writeFileSync("/tmp/bosai-long-mic.wav", Buffer.concat([header, input]));
const browser = await chromium.launch({
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--use-file-for-fake-audio-capture=/tmp/bosai-long-mic.wav",
  ],
});
const out = {
  platform:
    "Linux Chromium fake microphone playing actual synthetic WAV, NOT human or iPad capture",
};
try {
  const context = await browser.newContext({
    viewport: { width: 1180, height: 820 },
  });
  await context.route("https://download.moonshine.ai/**", (r) =>
    r.fulfill({
      status: 302,
      headers: {
        location:
          `http://127.0.0.1:${server.address().port}/` +
          encodeURIComponent(r.request().url()),
        "access-control-allow-origin": "*",
      },
    }),
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:4173/bosai-ai/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.locator("#voiceToggle").click();
  await page.waitForFunction(
    () => document.querySelector(".voice-lab").dataset.phase === "recording",
    null,
    { timeout: 120000 },
  );
  // Wait for the 41.7s source and silent lead-in to finish. No external speech service.
  await page.waitForTimeout(48000);
  out.recordingPhase = await page
    .locator(".voice-lab")
    .getAttribute("data-phase");
  await page.screenshot({ path: "test-results/voice-real-microphone.png" });
  await page.locator("#voiceStop").click();
  await page.waitForFunction(
    () =>
      ["review", "error"].includes(
        document.querySelector(".voice-lab").dataset.phase,
      ),
    null,
    { timeout: 120000 },
  );
  out.finalPhase = await page.locator(".voice-lab").getAttribute("data-phase");
  out.statusText = await page.locator("#voiceStatus").textContent();
  out.transcript = await page.locator("#chatQuestion").inputValue();
  out.sent = await page.locator("#conversationLog").textContent();
  out.errors = errors;
  out.status =
    out.finalPhase === "review" &&
    out.transcript.length > 150 &&
    !out.sent &&
    errors.length === 0
      ? "passed"
      : "failed";
  if (out.status !== "passed") process.exitCode = 1;
} catch (e) {
  out.status = "failed";
  out.error = e.stack;
  process.exitCode = 1;
} finally {
  writeFileSync(
    "test-results/voice-real-microphone.json",
    JSON.stringify(out, null, 2),
  );
  console.log(out);
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
