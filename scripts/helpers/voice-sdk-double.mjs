// Synthetic capture only, never an ASR or microphone measurement.
export function installCaptureDouble() {
  const device = navigator.mediaDevices;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: device,
  });
  Object.defineProperty(device, "getUserMedia", {
    configurable: true,
    value: async () => {
      if (window.testPermissionDenied)
        throw new DOMException("Permission denied", "NotAllowedError");
      window.testCaptureContext ??= new AudioContext();
      return window.testCaptureContext.createMediaStreamDestination().stream;
    },
  });
}

// UI/state evidence only. Never report this double as measured ASR.
export async function installVoiceDouble(context) {
  await context.addInitScript(installCaptureDouble);
  await context.route("**/moonshine/index.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
    export const ModelArch={Tiny:0,Base:1};
    export class SttWorkerHost {
      constructor(){window.testHost=this;this.listeners=new Map();}
      async loadTranscriber(config){window.testLoadCount=(window.testLoadCount||0)+1;window.testVoiceArch=config.modelArch;if(window.testLoadError)throw Error('model load failed');if(window.testHoldLoad)await new Promise(r=>window.testResumeLoad=r);}
      async createStream(_,id){this.stream=id;} setListener(id,listener){this.listeners.set(id,listener);}
      async start(){} addAudio(){} queuedSeconds(){return 0;}
      emit(line){const cb=this.listeners.get(this.stream);(line.isComplete?cb?.onLineCompleted:cb?.onLineTextChanged)?.({line});}
      async stop(){if(window.testFinal)this.emit(window.testFinal);}
      async closeStream(id){this.listeners.delete(id);window.testStreamClosed=true;}
      close(){if(window.testCloseFailure)throw Error("test close failure");this.listeners.clear();window.testClosed=true;window.testResumeLoad?.();}
    }
  `,
    }),
  );
}
