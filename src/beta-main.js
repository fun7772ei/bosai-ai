import "./beta.css";
import { BetaController } from "./beta-controller.js";
import { corpus } from "./beta-search.js";
import { VoiceDraft } from "./voice-draft.js";
import { releaseVoiceResources } from "./voice-lifecycle.js";
import { correctionReview, applyCorrection } from "./voice-review.js";
import { mountVoiceEvaluation } from "./voice-evaluation-ui.js";
const $ = (id) => document.getElementById(id),
  el = (tag, text) => {
    const e = document.createElement(tag);
    e.textContent = text;
    return e;
  };
const controller = new BetaController({ changed: refresh });
function refresh() {
  const busy = controller.busy,
    voiceActive = voiceBusy || !!voiceMic || voiceListening;
  for (const id of ["saveModel", "loadModel", "mode"])
    $(id).disabled = busy || voiceActive;
  $("stop").disabled = !busy;
  $("resetModel").disabled = voiceActive || (!controller.channel && !busy);
  $("modelState").textContent = controller.state;
  $("saved").textContent = controller.storageError
    ? "端末保存を利用できません。軽量検索をご利用ください。"
    : controller.saved?.complete
      ? "AIモデル：保存済み（4 / 4）"
      : `AIモデル：未保存（${controller.saved?.files?.filter((f) => f.present).length || 0} / 4）`;
  $("loadModel").disabled = busy || voiceActive || !controller.saved?.complete;
  document.dispatchEvent(new Event("bosai:state"));
}
async function modelAction(action) {
  try {
    await controller[action]();
  } catch (e) {
    controller.phase(
      `処理を完了できませんでした：${e.message}。軽量検索は利用できます。`,
    );
  }
  await controller.inspect();
}
$("saveModel").onclick = () => modelAction("save");
$("loadModel").onclick = () => modelAction("load");
$("stop").onclick = () => controller.stop();
$("resetModel").onclick = () => controller.reset();

// Moonshine Voice Japanese Tiny (non-streaming) is opt-in. Keep text search usable if this fails.
// The official WASM package is pinned; the microphone and model load only on button press.
// Base is available only through an explicit evaluation route, pending iPad approval.
const voiceModel =
  new URL(location.href).searchParams.get("voice_eval") === "base"
    ? "base"
    : "tiny";
const MOONSHINE_MODULE = new URL(
  "moonshine/index.js",
  location.origin + import.meta.env.BASE_URL,
).href;
$("voiceEnableIso").onclick = () => {
  try {
    sessionStorage.setItem("bosai-voice-draft", $("chatQuestion").value);
  } catch {}
  const url = new URL(location.href);
  url.searchParams.set("voice_iso", "1");
  location.assign(url.href);
};
const voiceUnload = el("button", "音声モデルを解放");
voiceUnload.type = "button";
voiceUnload.id = "voiceUnload";
voiceUnload.className = "outlined";
$("voiceStop").after(voiceUnload);
voiceUnload.disabled = true;
let voiceMic = null,
  voiceBusy = false,
  voiceListening = false,
  voiceSeq = 0,
  voiceTarget = null,
  voiceReleaseFailed = false;
const voiceDraft = new VoiceDraft(),
  voiceEvents = [];
document.querySelector(".voice-lab-tag").textContent =
  "Powered by Moonshine AI · 日本語" +
  (voiceModel === "base" ? "Base（実機評価専用・未検証）" : "Tiny");
const modelEvaluation = el("details", ""),
  modelSummary = el("summary", "Tiny / Base の実機比較について"),
  modelNote = el(
    "p",
    "通常はTinyを使用します。BaseはiPad未検証の評価専用です。下の選択でページを開き直すと、この画面の入力・会話・評価記録は消えます。必要な記録を先に書き出してください。保存済みモデルは維持します。",
  ),
  modelChoice = el(
    "a",
    voiceModel === "base"
      ? "Tinyに戻る"
      : "Baseの評価画面を開く（任意・未検証）",
  );
const modelUrl = new URL(location.href);
modelUrl.searchParams.set("voice_iso", "1");
if (voiceModel === "base") modelUrl.searchParams.delete("voice_eval");
else modelUrl.searchParams.set("voice_eval", "base");
modelChoice.href = modelUrl.href;
modelEvaluation.append(modelSummary, modelNote, modelChoice);
document.querySelector(".voice-lab").append(modelEvaluation);
let voiceStage = "未準備",
  voiceLastError = null,
  voiceAttempt = null,
  voiceAttemptId = 0;
const committedView = el("p", "");
committedView.id = "voiceCommitted";
committedView.className = "voice-live";
committedView.setAttribute("aria-live", "polite");
$("voiceLive").after(committedView);
const correctionPanel = el("div", "");
correctionPanel.id = "voiceCorrections";
correctionPanel.setAttribute("aria-label", "確定文の補正候補");
committedView.after(correctionPanel);
mountVoiceEvaluation(document.querySelector(".voice-lab"), {
  model: () => voiceModel,
  getCommitted: () => voiceAttempt,
  isStopped: () => !voiceBusy && !voiceListening && !voiceMic,
});
function reviewVoice() {
  correctionPanel.replaceChildren();
  for (const candidate of correctionReview(
    voiceDraft.committed,
    voiceTarget?.value || "",
    { edited: voiceDraft.edited, provisional: voiceDraft.provisionalAtStop },
  )) {
    const row = el("div", ""),
      why = el("p", candidate.reason),
      preview = el("p", candidate.text),
      accept = el(
        "button",
        "「" + candidate.from + "」→「" + candidate.to + "」を採用",
      );
    accept.type = "button";
    const target = voiceTarget;
    accept.onclick = () => {
      if (!applyCorrection(target, candidate))
        voiceState(
          "入力が変わったため補正を適用しませんでした。現在の入力を確認してください。",
        );
      correctionPanel.replaceChildren();
    };
    row.append(el("strong", "補正候補（未適用）"), why, preview, accept);
    correctionPanel.append(row);
  }
}
function voiceLog(type, text = "") {
  voiceEvents.push({
    type,
    at: Date.now(),
    characters: String(text).length,
    stage: voiceStage,
  });
  if (voiceEvents.length > 120) voiceEvents.shift();
}
function voiceInput() {
  const chat = $("conversation");
  return $("chatQuestion");
}
document.addEventListener("input", (event) => {
  if (voiceTarget === event.target && voiceListening)
    voiceDraft.noteManualChange(voiceTarget.value);
});
function voiceState(message) {
  $("voiceStatus").textContent = message;
  const lab = document.querySelector(".voice-lab");
  if (lab) {
    lab.dataset.active = String(voiceBusy || voiceListening || !!voiceMic);
    lab.dataset.listening = String(voiceListening);
    lab.dataset.processing = String(voiceBusy);
  }
  $("voiceLoad").disabled = voiceBusy || !!voiceMic || voiceListening;
  $("voiceListen").disabled =
    voiceBusy || !voiceMic || voiceListening || voiceReleaseFailed;
  $("voiceStop").disabled = voiceBusy || !voiceListening;
  voiceUnload.disabled = voiceBusy || !voiceMic || voiceListening;
  refresh();
}
function voiceFailure(e) {
  let message;
  if (typeof e === "number") {
    // Embind can throw a C++ exception pointer instead of a JS Error.
    // The decimal number is a WASM memory address, NOT a public error code.
    // The SDK's C++ exception pointer may belong to a different WASM heap.
    // Never dereference it through an arbitrary module instance.
    message = "WASM内部例外（数字 " + e + " はエラーコードではありません）";
  } else message = e?.message || String(e);
  voiceLastError = {
    stage: voiceStage,
    name: e?.name || typeof e,
    message,
    numericException: typeof e === "number" ? e : null,
    at: new Date().toISOString(),
  };
  voiceState(
    "音声入力エラー【" +
      voiceStage +
      "】：" +
      message +
      "。文字入力は引き続き利用できます。",
  );
}
function voiceApply() {
  if (!voiceTarget || voiceDraft.edited) return;
  // Live text is a REPLACEMENT view, never appended onto a previous preview.
  voiceTarget.value = voiceDraft.value;
  voiceTarget.dispatchEvent(new Event("input"));
}
async function voiceRelease(alreadyStopped = false) {
  const mic = voiceMic;
  voiceMic = null;
  voiceListening = false;
  const released = await releaseVoiceResources(mic, { alreadyStopped });
  // Accept any onLine delivered during stop/close before invalidating callbacks.
  voiceSeq++;
  voiceReleaseFailed = !released.closed;
  if (!released.closed) voiceMic = mic; // Keep the handle for a retry; Ruri remains gated.
  $("voiceLoad").disabled = voiceBusy || !!voiceMic;
  $("voiceListen").disabled = true;
  $("voiceStop").disabled = true;
  if (!released.ok)
    voiceFailure(
      Error("音声の停止・解放を確認できません：" + released.errors.join("; ")),
    );
  return released.ok;
}
if (!crossOriginIsolated) {
  $("voiceEnableIso").hidden = false;
  $("voiceStatus").textContent = location.search.includes("voice_iso=1")
    ? "Moonshineの準備に必要なブラウザ分離がまだ有効ではありません。古いタブを閉じて、音声実験モードを開き直してください。"
    : "音声AIには分離モードが必要です。「音声実験モードを有効化」を押してください。";
} else {
  $("voiceStatus").textContent =
    "音声実験モードが有効です。音声AIを準備できます。";
}
$("voiceLoad").onclick = async () => {
  if (voiceBusy || voiceMic) return;
  if (!crossOriginIsolated) {
    $("voiceEnableIso").hidden = false;
    voiceState(
      location.search.includes("voice_iso=1")
        ? "音声実験モードでもブラウザ分離が有効ではありません。タブを閉じて開き直してください。Safari側が非対応の可能性もあります。"
        : "Moonshineの標準WASMにはブラウザ分離が必要です。「音声実験モードを有効化」を押して同じページを開き直してください。",
    );
    return;
  }
  $("voiceEnableIso").hidden = true;
  const generation = ++voiceSeq;
  voiceBusy = true;
  voiceState("準備中。必要なモデルを取得・初期化しています…");
  try {
    // Avoid keeping the Ruri inference runtime and speech model loaded together on iPad.
    if (controller.busy)
      throw Error("Ruriの処理終了後にもう一度お試しください");
    if (controller.channel) await controller.reset();
    voiceStage = "音声ライブラリの読み込み";
    voiceState("準備中：音声ライブラリを読み込んでいます…");
    const { MicTranscriber, ModelArch } = await import(
      /* @vite-ignore */ MOONSHINE_MODULE
    );
    if (generation !== voiceSeq) return;
    // One SDK runtime only: mic.load() owns the Moonshine model and WASM.
    // The first progress notification separates download from WASM setup.
    voiceStage = "WASM・モデル配布情報の初期化";
    voiceState("準備中：WASMと日本語モデル情報を確認しています…");
    const mic = new MicTranscriber()
      .language("ja")
      .modelArch(voiceModel === "base" ? ModelArch.Base : ModelArch.Tiny)
      .onProgress((fraction, file) => {
        if (generation === voiceSeq) {
          voiceStage = "モデル取得・読み込み";
          voiceState(
            "モデル準備中 " + Math.round(fraction * 100) + "% " + (file || ""),
          );
        }
      })
      .onText((text) => {
        if (generation !== voiceSeq) return;
        voiceDraft.interim(text);
        voiceLog("onText", text);
        voiceApply();
        $("voiceLive").textContent = text ? "認識中（暫定）：" + text : "";
      })
      .onLine((line) => {
        if (generation !== voiceSeq) return;
        const t = String(line?.text || "").trim();
        if (!t) return;
        voiceDraft.commit(line);
        voiceLog("onLine", t);
        voiceApply();
        committedView.textContent = "確定：" + voiceDraft.committed;
        $("voiceLive").textContent = "";
      })
      .onError((error) => {
        if (generation === voiceSeq) voiceFailure(error?.error || error);
      });
    voiceMic = mic;
    await mic.load();
    if (generation !== voiceSeq) {
      await voiceRelease();
      return;
    }
    voiceStage = "準備完了";
    voiceLastError = null;
    voiceState("準備完了。マイク開始を押して日本語で話してください。");
  } catch (e) {
    await voiceRelease();
    voiceFailure(e);
  } finally {
    voiceBusy = false;
    voiceState($("voiceStatus").textContent);
  }
};
voiceUnload.onclick = async () => {
  if (voiceBusy || voiceListening || !voiceMic) return;
  voiceBusy = true;
  voiceStage = "モデル解放";
  voiceState("音声モデルを解放しています…");
  try {
    if (await voiceRelease()) {
      voiceLog("release");
      voiceState("音声モデルを解放しました。Ruriへ戻れます。");
    }
  } catch (e) {
    voiceFailure(e);
  } finally {
    voiceBusy = false;
    voiceState($("voiceStatus").textContent);
  }
};
$("voiceListen").onclick = async () => {
  if (voiceBusy || !voiceMic || voiceListening || voiceReleaseFailed) return;
  voiceBusy = true;
  voiceStage = "マイク開始";
  voiceTarget = voiceInput();
  voiceDraft.begin(voiceTarget.value.trim());
  $("voiceLive").textContent = "";
  committedView.textContent = "";
  correctionPanel.replaceChildren();
  voiceAttempt = null;
  voiceLog("start");
  voiceState("マイクの許可を確認しています…");
  try {
    // start() is only called from a direct tap, required by Safari microphone gating.
    await voiceMic.start();
    voiceListening = true;
    voiceState("録音中。話し終わったら「録音停止」を押してください。");
  } catch (e) {
    await voiceRelease();
    voiceFailure(e);
  } finally {
    voiceBusy = false;
    voiceState($("voiceStatus").textContent);
  }
};
$("voiceStop").onclick = async () => {
  if (!voiceMic) return;
  voiceBusy = true;
  voiceStage = "録音終了";
  voiceState("録音を終了しています…");
  try {
    await voiceMic.stop();
    const ended = voiceDraft.stop();
    voiceLog("stop", ended.text);
    voiceApply();
    voiceAttempt = {
      id: ++voiceAttemptId,
      text: voiceDraft.committed,
      provisional: ended.provisional,
    };
    reviewVoice();
    if (!(await voiceRelease(true))) return;
    voiceState(
      ended.manuallyEdited
        ? "録音終了。手入力での修正を保持しました。認識結果との違いを確認してください。"
        : ended.provisional
          ? "録音終了。末尾は暫定認識のため、入力欄を必ず確認・修正してから送信してください。"
          : ended.text
            ? "文字起こし完了。入力欄を確認・修正してから送信してください。"
            : "録音を終了しました。文字が認識されていません。",
    );
  } catch (e) {
    await voiceRelease();
    voiceFailure(e);
  } finally {
    voiceBusy = false;
    voiceState($("voiceStatus").textContent);
  }
};
addEventListener("pagehide", () => {
  voiceSeq++;
  const m = voiceMic;
  voiceMic = null;
  try {
    Promise.resolve(m?.stop()).catch(() => {});
  } catch {}
  try {
    Promise.resolve(m?.close()).catch(() => {});
  } catch {}
});

try {
  $("mode").value = localStorage.getItem("bosai-beta-mode") || "hybrid";
} catch {}
if (!$("mode").value) $("mode").value = "hybrid";
$("mode").onchange = () => {
  try {
    localStorage.setItem("bosai-beta-mode", $("mode").value);
  } catch {}
};
$("build").textContent =
  `ベータ版 ${__APP_BUILD__} / 辞書 ${corpus.length}件 / CPU・WASM / 自由生成なし`;
try {
  const previous = localStorage.getItem("bosai-beta-stage");
  if (previous && !/完了|利用可能|解放|停止/.test(previous))
    $("recovery").textContent =
      `前回の記録：${previous}。終了理由は未確定です。保存は削除していません。`;
} catch {}
$("export").onclick = () => {
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          {
            build: __APP_BUILD__,
            userAgent: navigator.userAgent,
            standalone:
              matchMedia("(display-mode: standalone)").matches ||
              navigator.standalone === true,
            origin: location.origin,
            saved: controller.saved,
            storageError: controller.storageError,
            state: controller.state,
            runs: controller.runs,
            deviceVerification: "Not automatically iPad verified",
            voice: {
              model: voiceModel,
              stage: voiceStage,
              error: voiceLastError,
              crossOriginIsolated,
              mode:
                new URL(location.href).searchParams.get("voice_iso") === "1",
              events: voiceEvents,
              provisionalAtStop: voiceDraft.provisionalAtStop,
              manuallyEdited: voiceDraft.edited,
            },
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
  );
  const a = el("a", "");
  a.href = url;
  a.download = "bosai-ruri-beta.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const online = () =>
  ($("connection").textContent = navigator.onLine
    ? "オンライン"
    : "オフライン");
addEventListener("online", online);
addEventListener("offline", online);
online();
if (["localhost", "127.0.0.1"].includes(location.hostname))
  Object.defineProperty(window, "bosaiBeta", { value: controller });
controller.inspect();
refresh();
(async () => {
  if ("serviceWorker" in navigator && import.meta.env.PROD)
    try {
      const registration = await navigator.serviceWorker.register(
        `${import.meta.env.BASE_URL}sw.js`,
        { updateViaCache: "none" },
      );
      await navigator.serviceWorker.ready;
      $("shellState").textContent =
        "アプリ・辞書のオフライン準備が完了しました。AI検索にはモデルの保存も必要です。";
      const announceAssets = () =>
        navigator.serviceWorker.controller?.postMessage({
          type: "CLIENT_READY",
          assets: [
            ...document.querySelectorAll('script[src],link[rel="stylesheet"]'),
          ].map((n) => n.src || n.href),
        });
      announceAssets();
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        announceAssets,
      );
      addEventListener("pageshow", announceAssets);
      addEventListener("focus", announceAssets);
      setInterval(announceAssets, 30000);
      const updateNotice = () => {
        if (!registration.waiting) return;
        const notice = el("div", "");
        notice.className = "update-notice";
        const text = el(
            "span",
            "新しいバージョンを利用できます。更新すると会話は終了します。保存モデルは維持します。",
          ),
          button = el("button", "更新して開き直す");
        button.type = "button";
        button.onclick = () => {
          if (controller.busy || voiceBusy || voiceMic || voiceListening) {
            text.textContent =
              "処理・録音を終了し、音声モデルを解放してから更新してください。";
            return;
          }
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            () => location.reload(),
            { once: true },
          );
          registration.waiting?.postMessage({ type: "APPLY_UPDATE" });
        };
        notice.append(text, button);
        document.querySelector("main").prepend(notice);
      };
      updateNotice();
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (
            worker.state === "installed" &&
            navigator.serviceWorker.controller
          )
            updateNotice();
        });
      });
      registration.update().catch(() => {});
    } catch (e) {
      $("shellState").textContent =
        `アプリのオフライン準備は未完了です：${e.message}`;
    }
  else
    $("shellState").textContent =
      "開発画面です。オフライン利用は公開ビルドで確認してください。";
})();

// Unified Phase 2 chat, dictionary browsing, and settings; existing Moonshine runtime is reused.
import { mountConversation } from "./conversation-ui.js";
mountConversation(controller);
