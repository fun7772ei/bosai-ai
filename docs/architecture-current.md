# Architecture map and redesign boundaries

Snapshot: 2026-10-15, `main` after PR #18 (`782ccdce`). This is a **map**, not a mandate to preserve the existing structure.

## Currently shipped paths

| Area | Current entry points | Current responsibility |
| --- | --- | --- |
| Public app shell | `index.html`, `src/beta-main.js`, `src/conversation-ui.js` | Navigation, dictionary, chat UI, voice controls |
| Dialogue | `src/conversation.js`, `src/conversation-context.js` | Turn state, regex-based situation extraction, follow-up context, clarification |
| Request boundaries | `src/question-intent.js`, `src/query-scope.js`, `conversation.js:coverage()` | Overlapping detection of unsupported/current-status questions |
| Retrieval | `src/beta-controller.js`, `src/beta-search.js`, `src/bosai-search.js`, `src/semantic-search.js` | Ruri + lexical search, fallback and ranking |
| Evidence matching | `src/conversation-evidence.js`, `src/conversation-applicability.js`, `src/conversation-applicability.json` | Capability promotion, contradiction filtering, 88 sidecars; only 4 entries have verified prerequisite annotations |
| Embeddings | `src/ruri-client.js`, `src/ruri.worker.js`, `src/embedding-runtime.js` | Isolated local CPU/WASM model and query vectors |
| Local data | `src/bosai-data.json`, `src/bosai-vectors.json`, `src/model-storage.js`, `public/sw.js` | 88 unchanged originals, vectors, offline downloads/cache |
| Speech | `src/beta-main.js` Moonshine integration, `src/voice-draft.js` | Optional microphone; excludes simultaneous Ruri model residency |
| Historical research | `research.html`, `src/main.js`, `src/six-*.js`, `src/cpu-*.js` | Legacy generation / experiment path; not public advice |
| Tests | `tests/*.test.js`, `scripts/*browser-check.mjs`, `.github/workflows/beta-check.yml` | Fast unit checks + real-Ruri browser regression |

## Why today's structure slows development

1. Scope checks are split among three entry points. Negative/question interpretation and capability checks occur in several passes, so a new case can require changes in multiple files.
2. Multiple historic test suites (`conversation-v2` through `v16`) are rerun even for a small iteration; they are necessary as evidence, not necessarily as the inner-loop development tool.
3. Historical `CLOUD_*.md` instructions describe now-merged branches as not merged. Treat those as immutable history, not live constraints.
4. The 88-entry sidecar is not a complete semantic audit. The existing confirmation UI is cautious but is **not** an authoritative answerability checker.
5. The public app, research experiments, UI, and model plumbing have distinct lifecycles. Coupling them makes harmless changes expensive to verify.

## Suggested replacement architecture (permission, not implementation claim)

```text
User text / optional Moonshine transcript
  -> one request-understanding stage (intent, negation, uncertainty, facts + provenance)
  -> immutable conversation state transition
  -> lexical + Ruri retrieval (fallback if unavailable)
  -> evidence evaluator (source-specific preconditions and contradictions)
  -> typed answer decision (source / clarification / not covered)
  -> UI presentation of original text, warnings, attribution
```

Keep the model worker, storage/cache, and microphone adapters isolated from the conversation policy. One typed result should travel through the pipeline rather than re-running similar regex rules at each boundary.

## A practical rewrite sequence

- **First:** freeze a compact behavior-based acceptance suite: ordinary queries, multi-turn corrections, negation, missing facts, unsupported live questions, 88-source integrity, offline restart, stop/retry, voice isolation. Preserve originals of existing tests.
- **Second:** implement a replacement policy/retrieval orchestration in a new module or branch. Prefer pure functions and a typed state/decision contract over scattered predicates. Deleting old internals is allowed once parity is demonstrated.
- **Third:** run targeted tests while iterating; measure new performance with the same workloads and same hardware. Do not extrapolate Chromium PSS/latency to Safari.
- **Fourth:** perform independent held-out semantic assessment, full real-Ruri/offline CI, and iPad Safari verification before considering production replacement.

### Guardrail

A full rewrite is encouraged when it removes accidental complexity, **but a shorter implementation is not automatically a safer one**. Never discard negation, disaster distinctions, uncertain prerequisites, source warnings, or offline recovery just to reduce line count.
