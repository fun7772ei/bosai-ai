// Actual pinned Tiny/Base weights; synthetic Japanese audio, not human/iPad evidence.
import { chromium, webkit } from "@playwright/test";
import { readFileSync, writeFileSync, createReadStream } from "node:fs";
import { createServer } from "node:http";
import {
  characterEdits,
  evaluateAsrCases,
  compareAsrReports,
} from "../src/voice-cer.js";
const assets = JSON.parse(readFileSync("test-results/moonshine-assets.json"));
const cases = JSON.parse(
  readFileSync("scripts/evaluation/synthetic-ja/cases.json"),
);
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
const browserType = process.env.BOSAI_BROWSER === "webkit" ? webkit : chromium;
const browser = await browserType.launch(),
  out = {
    createdAt: new Date().toISOString(),
    platform: `Linux ${browserType.name()}, NOT physical iPad`,
    audio:
      "Open JTalk synthetic voice. Not human speech, ambient noise or microphone accuracy.",
    models: [],
    peakMemory:
      "Browser process RSS sum (includes shared pages), sampled every 100ms. NOT Safari/iPad or JS heap.",
    reports: {},
  };
let peak = 0,
  sampling = false;
const cdp =
  browserType === chromium ? await browser.newBrowserCDPSession() : null;
const timer = cdp
  ? setInterval(async () => {
      if (sampling) return;
      sampling = true;
      try {
        const { processInfo } = await cdp.send("SystemInfo.getProcessInfo");
        let rss = 0;
        for (const p of processInfo) {
          try {
            rss +=
              Number(
                readFileSync(`/proc/${p.id}/status`, "utf8").match(
                  /VmRSS:\s+(\d+)/,
                )?.[1] || 0,
              ) * 1024;
          } catch {}
        }
        peak = Math.max(peak, rss);
      } catch {}
      sampling = false;
    }, 100)
  : null;
try {
  const context = await browser.newContext();
  await context.route("https://download.moonshine.ai/**", (route) =>
    route.fulfill({
      status: 302,
      headers: {
        location:
          `http://127.0.0.1:${server.address().port}/` +
          encodeURIComponent(route.request().url()),
        "access-control-allow-origin": "*",
      },
    }),
  );
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.log("CONSOLE", m.text());
  });
  await page.goto("http://localhost:4173/bosai-ai/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  out.isolated = await page.evaluate(() => crossOriginIsolated);
  if (!out.isolated) throw Error("No isolation");
  for (const model of ["tiny", "base"]) {
    peak = 0;
    const load = await page.evaluate(async (model) => {
      const { SttWorkerHost, ModelArch } =
        await import("/bosai-ai/moonshine/index.js");
      window.realHost = new SttWorkerHost();
      const t = performance.now();
      await window.realHost.loadTranscriber({
        transcriberId: "test",
        modelArch: model === "tiny" ? ModelArch.Tiny : ModelArch.Base,
        source: { kind: "catalog", language: "ja" },
      });
      return performance.now() - t;
    }, model);
    const row = {
      model,
      loadMs: load,
      modelBytes: assets.models[model].manifest.groups
        .flatMap((g) => g.files)
        .reduce((n, f) => n + f.size, 0),
      trials: [],
    };
    for (const c of cases) {
      const wav = readFileSync(c.file),
        audio = Array.from(
          { length: (wav.length - 44) / 2 },
          (_, i) => wav.readInt16LE(44 + i * 2) / 32768,
        );
      const result = await page.evaluate(
        async ({ audio, id }) => {
          const host = window.realHost,
            lines = new Map(),
            stream = id;
          let heartbeat = 0;
          const timer = setInterval(() => heartbeat++, 20);
          const t = performance.now();
          await host.createStream("test", stream, { updateInterval: 0.8 });
          const update = ({ line }) => lines.set(line.id, line);
          host.setListener(stream, {
            onLineStarted: update,
            onLineTextChanged: update,
            onLineUpdated: update,
            onLineCompleted: update,
          });
          await host.start(stream);
          // Send in 1-second chunks; worker updates may coalesce but no samples are dropped.
          for (let i = 0; i < audio.length; i += 16000)
            host.addAudio(
              stream,
              new Float32Array(audio.slice(i, i + 16000)),
              16000,
            );
          host.addAudio(stream, new Float32Array(16000), 16000, {
            transcribe: false,
          });
          await host.stop(stream);
          const elapsedMs = performance.now() - t;
          await host.closeStream(stream);
          clearInterval(timer);
          return {
            transcript: [...lines.values()].map((l) => l.text).join(" "),
            elapsedMs,
            heartbeat,
            lines: [...lines.values()].map((l) => ({
              id: l.id,
              text: l.text,
              isComplete: l.isComplete,
            })),
          };
        },
        { audio, id: c.id },
      );
      row.trials.push({
        id: c.id,
        reference: c.reference,
        seconds: c.seconds,
        ...result,
        ...characterEdits(c.reference, result.transcript),
        realTimeFactor: result.elapsedMs / (c.seconds * 1000),
      });
      console.log(model, c.id, result.elapsedMs.toFixed(0), result.transcript);
    }
    row.peakBrowserProcessRssBytes = cdp ? peak : null;
    await page.evaluate(() => window.realHost.close());
    out.models.push(row);
    out.reports[model] = evaluateAsrCases(cases, row.trials, model);
    writeFileSync(
      `test-results/voice-real-${browserType.name()}.json`,
      JSON.stringify(out, null, 2),
    );
  }
  out.comparison = compareAsrReports(out.reports.tiny, out.reports.base);
  out.status = "passed";
} catch (e) {
  out.status = "failed";
  out.error = e.stack;
  process.exitCode = 1;
} finally {
  if (timer) clearInterval(timer);
  writeFileSync(
    `test-results/voice-real-${browserType.name()}.json`,
    JSON.stringify(out, null, 2),
  );
  console.log(
    JSON.stringify({
      status: out.status,
      error: out.error,
      comparison: out.comparison,
      models: out.models.map(({ trials, ...m }) => m),
    }),
  );
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
