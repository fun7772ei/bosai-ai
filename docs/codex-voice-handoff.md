# Codex one-pass follow-up: voice runtime, dialogue semantics, final UI

**Base branch**: prep/voice-conversation-eval-20261015 (this draft PR), not old PR #18 or #19. Keep this PR open/draft; do not merge main or deploy Pages. Read AGENTS.md; docs/moonshine-tiny-base-research.md; docs/source-audit-and-regressions.md; docs/voice-evaluation.md; docs/conversation-core-design.md. Treat archived logs as historical.

Already completed in this PR: 28-versioned Japanese ASR text cases, Unicode CER evaluator with untouched raw transcripts/unmeasured semantics, candidate-only correction helper and tests, source/defect investigation, documentation. No real Tiny/Base recording or iPad inference conducted. Source corpus/sidecars were not changed.

Implement as one coordinated task:
1. Check actual pinned moonshine-wasm@0.1.5 ja Tiny/Base manifest and license/artifact URLs. Add an explicit opt-in Base to src/beta-main.js only if proven loadable on iPad; keep Tiny default and Ruri mutual exclusion. Preserve user gesture for microphone start, SDK stop/close, VoiceDraft manual edits, provisional text, and download/diagnostic display. Do not use TinyStreaming with old manifest.
2. Integrate src/voice-correction.js as a **non-destructive, user-confirmed suggestion** after committed transcription; never auto-change negation/number/subject or send. Extend voice-cer capture/export so the same 28 scripts can be compared Tiny/Base on actual iPad with tagged data. Store measured JSON as new artifacts; do not fabricate missing results.
3. Improve src/request-facts.js, request-understanding.js, request-scope.js and conversation-applicability.js based on docs/source-audit-and-regressions.md. Resolve f11 vehicle/road unknown and f01 unwanted bosai-84; preserve general actionable questions where supported without static live/safety guarantees. Add behavioral regression tests; avoid growing unrelated regexp branches.
4. Redesign UI in src/conversation-ui.js, src/beta-main.js, src/conversation.css, src/beta.css as needed. Keep original text/warning/source cards, local-only text fallback, saved Ruri models and offline PWA. Do not rearrange SDK/cache keys without migration.
5. Test targeted node tests, npm test, npm run build, public-build check; full GitHub CI real Ruri/offline/restart/stop/switching; actual iPad Safari Tiny and Base mic, memory, model reload, no-network and UI. Report results per layer, not merely CI green; leave untested as untested.

**Forbidden modifications**: original 88 records and references, 88 sidecar review statuses without evidence/human audit, historical frozen questions/labels/logs, site data/cache reset, model download/weight redistribution without license check; no main merge, no GitHub Pages publication.

**Success**: app remains usable with voice unavailable/offline; outputs are provisional/manual, obvious homophones not silently committed; measured (not borrowed) per-model Japanese CER; unrelated source candidates clearly rejected or flagged; subject/negation/vehicle-vs-road distinctions pass fresh heldout tests; browser Ruri full check and iPad confirmation explicitly separated.
