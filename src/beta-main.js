import "./beta.css";
import { mountIcons } from "./icons.js";
mountIcons();
import { BetaController } from "./beta-controller.js";
import { corpus } from "./beta-search.js";
import { mountVoice } from "./voice-controller.js";
const $ = (id) => document.getElementById(id),
  el = (tag, text) => {
    const e = document.createElement(tag);
    e.textContent = text;
    return e;
  };
let voice = { active: false, resident: false };
const controller = new BetaController({ changed: refresh });
function refresh() {
  const busy = controller.busy,
    voiceActive = voice.active;
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
    if (!(await voice.beforeSearch())) return;
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

voice = mountVoice(controller, refresh);

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
            voice: voice.diagnostics(),
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
          if (controller.busy || voice.active) {
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
mountConversation(controller, voice);
