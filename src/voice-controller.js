import { VoiceSession } from "./voice-session.js";
import { VoiceDraft } from "./voice-draft.js";
import { mountVoiceEvaluation } from "./voice-evaluation-ui.js";
const $ = (id) => document.getElementById(id);
const read = (storage, key) => {
  try {
    return window[storage].getItem(key);
  } catch {
    return null;
  }
};
const write = (storage, key, value) => {
  try {
    window[storage].setItem(key, value);
    return true;
  } catch {
    return false;
  }
};
export function mountVoice(controller, changed) {
  let session = null,
    phase = "idle",
    epoch = 0,
    attempt = null,
    attemptId = 0,
    before = "",
    error = null,
    accept = false;
  const draft = new VoiceDraft(),
    events = [];
  let model =
    new URL(location.href).searchParams.get("voice_eval") === "base"
      ? "base"
      : read("localStorage", "bosai-voice-model") || "tiny";
  if (!["tiny", "base"].includes(model)) model = "tiny";
  $("voiceModel").value = model;
  const active = () => ["loading", "recording", "stopping"].includes(phase);
  function state(next, message) {
    phase = next;
    $("voiceStatus").textContent = message;
    const lab = document.querySelector(".voice-lab");
    lab.dataset.active = String(active());
    lab.dataset.listening = String(phase === "recording");
    lab.dataset.processing = String(
      phase === "loading" || phase === "stopping",
    );
    lab.dataset.phase = phase;
    $("voiceStop").disabled = phase !== "recording";
    $("voiceCancel").disabled = !active();
    $("voiceUnload").disabled = !session;
    $("voiceToggle").disabled = controller.busy || phase === "stopping";
    $("voiceModel").disabled = active();
    $("voiceModelState").textContent =
      `Powered by Moonshine AI · 日本語 ${model === "base" ? "Base（iPad未検証）" : "Tiny"} · ${session ? "メモリに保持" : "必要時に読み込み"}`;
    $("voiceRetry").hidden = phase !== "error";
    $("voiceFallback").hidden = phase !== "error" || model !== "base";
    $("voiceCurrentModel").textContent =
      "日本語 · " + (model === "base" ? "Base（iPad未検証）" : "Tiny");
    changed();
  }
  function apply() {
    if (!accept || draft.edited) return;
    $("chatQuestion").value = draft.value;
    $("chatQuestion").dispatchEvent(new Event("input", { bubbles: true }));
  }
  $("chatQuestion").addEventListener("input", (e) => {
    if (e.isTrusted && active()) draft.noteManualChange(e.target.value);
  });
  async function release() {
    const previous = session;
    if (previous) await previous.close();
    if (session === previous) session = null;
  }
  async function fail(e) {
    accept = false;
    error = e?.message || String(e);
    try {
      await release();
    } catch (releaseError) {
      error +=
        " / 解放を確認できません：" + (releaseError?.message || releaseError);
    }
    state(
      "error",
      e?.name === "NotAllowedError"
        ? "マイクを許可できませんでした。Safariの設定を確認して再試行できます。"
        : `音声入力を続けられません：${error}。文字入力は使えます。`,
    );
  }
  async function start() {
    $("voicePopover").hidden = false;
    $("voiceToggle").setAttribute("aria-expanded", "true");
    if (active()) return;
    const seq = ++epoch;
    before = $("chatQuestion").value;
    draft.begin(before);
    if (!crossOriginIsolated) {
      if (read("sessionStorage", "bosai-voice-reloading")) {
        state(
          "error",
          "このブラウザでは音声用の分離を有効にできません。文字入力をご利用ください。",
        );
        return;
      }
      state(
        "loading",
        "初回の音声準備のため開き直しています。入力・会話は保持します…",
      );
      try {
        if (!("serviceWorker" in navigator))
          throw Error("音声の準備にはService Worker対応のブラウザが必要です");
        await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  Error(
                    "音声の準備を完了できません。公開ページを開き直してください",
                  ),
                ),
              10000,
            ),
          ),
        ]);
        if (seq !== epoch) return;
        if (
          !write("sessionStorage", "bosai-voice-draft", before) ||
          !write("sessionStorage", "bosai-voice-reloading", "1")
        )
          throw Error("入力の一時保存が使えないため開き直せません");
        document.dispatchEvent(new Event("bosai:voice-handoff"));
        location.reload();
      } catch (e) {
        if (seq === epoch) await fail(e);
      }
      return;
    }
    accept = true;
    error = null;
    state(
      "loading",
      navigator.onLine
        ? "音声を準備中… 初回はモデルをダウンロードします。"
        : "保存済みの音声モデルを準備中…",
    );
    if (!session)
      session = new VoiceSession({
        moduleUrl: new URL(
          "moonshine/index.js",
          location.origin + import.meta.env.BASE_URL,
        ).href,
        model,
        onProgress: (f) => {
          if (seq === epoch)
            state("loading", `音声モデルを準備中 ${Math.round(f * 100)}%`);
        },
        onLine: (line) => {
          if (!accept || seq !== epoch) return;
          draft.update(line);
          apply();
        },
        onLevel: (level) =>
          document
            .querySelector(".voice-meter")
            .style.setProperty("--level", String(Math.min(1, level * 8))),
        onError: (e) => {
          if (seq === epoch && active()) {
            void cancel(false).then(() => fail(e));
          }
        },
      });
    // Refresh callbacks on reuse; a stream's line ids are scoped to its recording.
    session.onLine = (line) => {
      if (!accept || seq !== epoch) return;
      draft.update(line);
      apply();
    };
    session.onProgress = (f) => {
      if (seq === epoch)
        state("loading", `音声モデルを準備中 ${Math.round(f * 100)}%`);
    };
    session.onError = (e) => {
      if (seq === epoch && active()) void cancel(false).then(() => fail(e));
    };
    const current = session;
    try {
      current.prepareCapture();
      if (controller.busy) throw Error("検索処理の終了後にお試しください");
      if (controller.channel) await controller.reset();
      let timer;
      try {
        await Promise.race([
          current.start(),
          new Promise((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  Error(
                    "音声の準備が時間内に完了しませんでした。再試行してください",
                  ),
                ),
              120000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
      if (seq !== epoch) {
        await current.close();
        return;
      }
      events.push({ type: "start", model, at: Date.now() });
      state("recording", "録音中 — 話し終わったら停止してください");
    } catch (e) {
      if (seq === epoch) await fail(e);
    }
  }
  async function stop() {
    if (phase !== "recording") return;
    state("stopping", "文字起こしを確定しています…");
    const seq = epoch;
    try {
      await session.stop();
      if (seq !== epoch) return;
      const ended = draft.stop();
      apply();
      accept = false;
      attempt = {
        id: ++attemptId,
        text: draft.committed,
        provisional: ended.provisional,
      };
      events.push({ type: "stop", model, at: Date.now() });
      state(
        "review",
        ended.provisional
          ? "入力欄を確認してください。末尾に暫定認識を含みます。"
          : "入力欄を確認・修正してから送信してください。",
      );
    } catch (e) {
      if (seq === epoch) await fail(e);
    }
  }
  async function cancel(restore = true) {
    ++epoch;
    accept = false;
    try {
      await release();
    } catch (e) {
      await fail(e);
      return false;
    }
    if (restore && !draft.edited) {
      $("chatQuestion").value = before;
      $("chatQuestion").dispatchEvent(new Event("input", { bubbles: true }));
    }
    state("idle", "音声入力をキャンセルしました。");
    return true;
  }
  $("voiceToggle").onclick = () => {
    if (active()) {
      $("voicePopover").hidden = false;
      return;
    }
    void start();
  };
  $("voiceStop").onclick = () => void stop();
  $("voiceCancel").onclick = () => void cancel();
  $("voiceRetry").onclick = () => void start();
  $("voiceFallback").onclick = () => {
    model = "tiny";
    $("voiceModel").value = model;
    write("localStorage", "bosai-voice-model", model);
    void start();
  };
  $("voiceClose").onclick = () => {
    $("voicePopover").hidden = true;
    $("voiceToggle").setAttribute("aria-expanded", "false");
  };
  $("voiceUnload").onclick = async () => {
    if (await cancel(false))
      state("idle", "音声モデルを解放しました。保存データは維持しています。");
  };
  $("voiceModel").onchange = async () => {
    try {
      await release();
    } catch (e) {
      await fail(e);
      $("voiceModel").value = model;
      return;
    }
    model = $("voiceModel").value;
    write("localStorage", "bosai-voice-model", model);
    state("idle", "次の音声入力から選択したモデルを使います。");
  };
  mountVoiceEvaluation($("voiceExperiments"), {
    model: () => model,
    getCommitted: () => attempt,
    isStopped: () => !active(),
  });
  addEventListener("pagehide", () => {
    ++epoch;
    accept = false;
    void release().catch(() => {});
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && phase === "recording") void stop();
  });
  state("idle", "マイクを押すと音声を文字に変換します。自動送信はしません。");
  if (read("sessionStorage", "bosai-voice-reloading") && crossOriginIsolated) {
    try {
      sessionStorage.removeItem("bosai-voice-reloading");
    } catch {}
    setTimeout(() => {
      state("review", "音声の準備ができました。マイクを押して話してください。");
    }, 0);
  }
  return {
    get active() {
      return active();
    },
    get resident() {
      return !!session;
    },
    async beforeSearch() {
      if (active()) throw Error("録音を停止してください");
      try {
        await release();
        state("idle", "");
        $("voicePopover").hidden = true;
        $("voiceToggle").setAttribute("aria-expanded", "false");
        return true;
      } catch (e) {
        await fail(e);
        return false;
      }
    },
    diagnostics: () => ({
      model,
      phase,
      error,
      events,
      provisionalAtStop: draft.provisionalAtStop,
      manuallyEdited: draft.edited,
    }),
  };
}
