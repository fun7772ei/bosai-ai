# Moonshine Japanese Tiny/Base decision dossier (2026-10-15)

Status: research and code inspection only. NOT an iPad Safari transcription benchmark. The current main at 4995f552 (merged PR #20) uses the pinned 0.1.5 Moonshine WASM browser package.

## What is actually deployed in source
- src/beta-main.js resolves same-origin moonshine/index.js and loads it ONLY on the user-selected voice path. Its MicTranscriber uses language ja and ModelArch.Tiny (legacy non-streaming), after manifest probes found ja Tiny/Base but not ja TinyStreaming in pinned 0.1.5.
- scripts/prepare-moonshine.mjs obtains the pinned npm dist at build time; vite.config.js serves it under /bosai-ai/moonshine/. Model weights are NOT included in this repository/build. The runtime retrieves them separately.
- OnText is provisional; onLine commits via src/voice-draft.js; user checks/edits before manually submitting. Loading/start/stop/close, pagehide and Ruri mutual exclusion are in beta-main.js. Ruri's IndexedDB and cache must not be cleared.
- COOP/COEP / crossOriginIsolated and WebKit microphone gesture gating remain browser-sensitive. The research-only voice_iso route exists, but Pages response headers, CDN/model cross-origin policy, worker startup and offline reloading still need on-device verification. Current text/Ruri PWA functionality must remain independent.

## Models: do not mix these benchmarks
| Candidate | Availability, scope | Published data | Download / memory |
| --- | --- | --- | --- |
| ja Tiny non-streaming | Current pinned SDK supports ja, ModelArch.Tiny as locally probed in docs/moonshine-voice-beta.md | Do NOT reuse 19.7%: it belongs to Tiny Streaming. The onnx-community Tiny Japanese card reports FLEURS 17.87% CER and Common Voice 17 18.3% CER for its ONNX conversion; NOT a bosai-ai measurement. | UsefulSensors moonshine-tiny-ja safetensors is ~108 MB (unquantized); browser quantized assets/runtime peak not measured. |
| ja Base non-streaming | Pinned WASM manifest probe reports ModelArch.Base supported for ja; integration and iPad load remain UNTESTED. | Older official model table reports Japanese Base 13.62% CER with another evaluation procedure/dataset; not directly comparable to Tiny ONNX card scores or new streaming panels. | UsefulSensors moonshine-base-ja model.safetensors is 246 MB before tokenizer/runtime, not actual WASM/cache total or Safari peak. |
| ja Tiny Streaming | Different architecture; previously selected on an incompatible 0.1.5 manifest. | Official new 400-clip FLEURS+ReazonSpeech Japanese panel: CER 19.7%. | Do not activate with 0.1.5: manifest says unsupported. |
| ja Small Streaming | Newer line, different SDK/migration | Same panel 17.2% CER; not Tiny/Base apples-to-apples. | Native/current WASM integration must be established independently. |

Do not quote speed, iPad memory or CER gains for a switch to Base before recording the same utterances with the same device and normalization. Published percentages above have different evaluation conditions and checkpoints.

## License and distribution gate
- Moonshine Voice core source is MIT by default, BUT the official LICENSE explicitly excludes legacy non-streaming non-English models, including Japanese Tiny and Japanese Base, from MIT: these use Moonshine Community License. Streaming models are a different category.
- For redistributing legacy Japanese model materials, inspect the full Community License, retain a copy and the required NOTICE attribution and display the required Powered by Moonshine AI credit; also confirm restrictions and model packaging terms. This is a licensing checklist, not legal approval.
- GitHub Pages can serve static JS/WASM files, but technical hostability is not license clearance, nor does hosting resolve COOP/COEP isolation or Cache Storage reliability. No licensed weight copy is introduced here. Do not replace SDK version or move model files without verification.

## Source links (checked 2026-10-15)
- https://github.com/moonshine-ai/moonshine/blob/main/LICENSE
- https://github.com/moonshine-ai/moonshine/blob/main/docs/models/accuracy.md
- https://github.com/moonshine-ai/moonshine/blob/main/docs/quickstart.md
- https://huggingface.co/UsefulSensors/moonshine-tiny-ja/tree/main
- https://huggingface.co/UsefulSensors/moonshine-base-ja/tree/main
- https://huggingface.co/onnx-community/moonshine-tiny-ja-ONNX
- https://github.com/moonshine-ai/moonshine-js (archived old SDK; not an upgrade target)
- Repository evidence: docs/moonshine-voice-beta.md, scripts/prepare-moonshine.mjs, src/beta-main.js.

## Decision / staging
1. Keep Tiny non-streaming selected; do not make Base default or preload both.
2. Run scripts/voice-cer.mjs for both models against the same 28 fixed scripts; compare per-case text/CER, failures, model download bytes, cold/warm init, peak browser memory, release and reload. All measurements are currently unmeasured.
3. Only after successful isolated Ruri switching and iPad Safari Base startup should Base become an opt-in experimental choice. Never claim new accuracy from published scores alone.
4. For true offline-first voice, pin and same-origin host all required JS/WASM and verify actual model/cache persistence across PWA reload and loss of network; do not purge previously saved data.
