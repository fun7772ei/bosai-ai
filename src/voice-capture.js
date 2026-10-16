// Batch ~85ms rather than posting 375 messages/second. Never output microphone sound.
class Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(4096);
    this.used = 0;
    this.power = 0;
    this.port.onmessage = () => {
      this.flush();
      this.port.postMessage({ flushed: true });
    };
  }
  flush() {
    if (!this.used) return;
    this.port.postMessage({
      audio: this.buffer.slice(0, this.used),
      level: Math.sqrt(this.power / this.used),
    });
    this.used = 0;
    this.power = 0;
  }
  process(inputs) {
    const channels = inputs[0];
    if (channels?.[0])
      for (let i = 0; i < channels[0].length; i++) {
        let sample = 0;
        for (const channel of channels) sample += channel[i] / channels.length;
        this.buffer[this.used++] = sample;
        this.power += sample * sample;
        if (this.used === this.buffer.length) this.flush();
      }
    return true;
  }
}
registerProcessor("bosai-capture", Capture);
