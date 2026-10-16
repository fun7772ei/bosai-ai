// The pinned SDK's worker host keeps inference and WASM off the UI thread.
// A stopped stream is closed; the model worker survives until search or explicit release.
export class VoiceSession {
  constructor({
    moduleUrl,
    model = "tiny",
    onLine = () => {},
    onProgress = () => {},
    onLevel = () => {},
    onError = () => {},
  }) {
    Object.assign(this, {
      moduleUrl,
      model,
      onLine,
      onProgress,
      onLevel,
      onError,
    });
    this.sequence = 0;
    this.closed = false;
  }
  async load() {
    if (this.host) return;
    const lib = await import(/* @vite-ignore */ this.moduleUrl);
    if (this.closed) throw Error("音声入力をキャンセルしました");
    this.host = new lib.SttWorkerHost(new URL("./", this.moduleUrl).href);
    this.host.onProgress = (_id, loaded, total) =>
      this.onProgress(total ? loaded / total : 0);
    await this.host.loadTranscriber({
      transcriberId: "voice",
      modelArch:
        this.model === "base" ? lib.ModelArch.Base : lib.ModelArch.Tiny,
      source: { kind: "catalog", language: "ja" },
    });
  }
  // Call synchronously from the tap, before model/download awaits (Safari activation).
  prepareCapture() {
    this.audio = new AudioContext();
    this.resume = this.audio.resume();
    this.media = navigator.mediaDevices.getUserMedia({ audio: true });
    this.media.then(
      (stream) => {
        if (this.closed) stream.getTracks().forEach((t) => t.stop());
      },
      () => {},
    );
    // Observe immediately: permission can be refused while the model is loading.
    this.media.catch(() => {});
    this.resume.catch(() => {});
  }
  async start() {
    const [media] = await Promise.all([this.media, this.resume]);
    if (this.closed) {
      media.getTracks().forEach((t) => t.stop());
      throw Error("キャンセルしました");
    }
    await this.load();
    if (this.closed) throw Error("キャンセルしました");
    this.stream = "capture-" + ++this.sequence;
    await this.host.createStream("voice", this.stream, { updateInterval: 0.8 });
    const update = ({ line }) => this.onLine(line);
    this.host.setListener(this.stream, {
      onLineStarted: update,
      onLineTextChanged: update,
      onLineUpdated: update,
      onLineCompleted: update,
      onError: (e) => this.onError(e.error),
    });
    await this.host.start(this.stream);
    if (this.closed) throw Error("キャンセルしました");
    await this.audio.audioWorklet.addModule(
      new URL("./voice-capture.js", import.meta.url),
    );
    if (this.closed) throw Error("キャンセルしました");
    this.source = this.audio.createMediaStreamSource(media);
    this.node = new AudioWorkletNode(this.audio, "bosai-capture");
    this.node.port.onmessage = ({ data }) => {
      if (!this.node || data.flushed) return;
      try {
        this.host.addAudio(this.stream, data.audio, this.audio.sampleRate);
        this.onLevel(data.level);
        if (this.host.queuedSeconds(this.stream) > 20)
          this.onError(
            Error(
              "認識が録音に追いついていません。録音を停止して結果を確認してください。",
            ),
          );
      } catch (e) {
        this.onError(e);
      }
    };
    this.source.connect(this.node);
    this.node.connect(this.audio.destination);
  }
  async stop() {
    // Drain the worklet's partial buffer before the worker's ForceUpdate barrier.
    if (this.node) {
      const node = this.node;
      await new Promise((resolve) => {
        const done = () => {
          node.port.removeEventListener("message", ack);
          resolve();
        };
        const timer = setTimeout(done, 500);
        const ack = (e) => {
          if (e.data.flushed) {
            clearTimeout(timer);
            done();
          }
        };
        node.port.addEventListener("message", ack);
        node.port.postMessage("flush");
      });
    }
    this.node?.disconnect();
    this.node = null;
    this.source?.disconnect();
    await this.releaseCapture();
    if (this.stream) {
      this.host.addAudio(this.stream, new Float32Array(16000), 16000, {
        transcribe: false,
      });
      await this.host.stop(this.stream);
      await this.host.closeStream(this.stream);
      this.stream = null;
    }
    this.onLevel(0);
  }
  async releaseCapture() {
    this.media?.then(
      (s) => s.getTracks().forEach((t) => t.stop()),
      () => {},
    );
    if (this.audio && this.audio.state !== "closed") await this.audio.close();
    this.audio = null;
  }
  async close() {
    this.closed = true;
    this.node?.disconnect();
    this.node = null;
    this.source?.disconnect();
    // Termination also aborts a blocked load, inference, and pending RPCs.
    try {
      this.host?.close();
      this.host = null;
      this.stream = null;
    } finally {
      await this.releaseCapture();
      this.onLevel(0);
    }
  }
}
