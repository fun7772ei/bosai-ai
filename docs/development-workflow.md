# Development loop: fast iterations, thorough release verification

Updated 2026-10-15. This guidance is scoped to **development effort**, not to weakening disaster-information requirements.

## Local quick checks (every small edit)

```bash
node --test tests/conversation.test.js tests/conversation-applicability.test.js
# or choose tests for the module actually changed
npm test
npm run build
node scripts/check-public-build.mjs
```

A fresh clone also needs `npm ci` before these commands. Unit tests and the public-build check are cheap relative to downloading/initializing Ruri in a browser.

## Automatic PR checks

- **Draft PR / each push**: quick job runs `npm ci`, all unit tests, production build and the public-build contents check.
- **Ready-for-review PR / each subsequent push**: the quick job runs, then the full job runs the real Ruri Chromium CPU/WASM, old regression matrices, offline/saved-model checks, and Moonshine isolation checks.
- **Manual request**: `workflow_dispatch` runs quick and full, even without a PR.

Start exploratory or architecture changes as **draft**. Mark ready only when a coherent revision is ready for expensive checks. After a ready PR changes, full CI automatically reruns. Do not merge risky runtime changes without a successful full run and a review of semantic regressions. Real iPad testing is still separate.

## When to look at history

- `docs/diagnostics/`: original measured outputs and frozen baselines. Read a **specific** JSON only when investigating a matching regression or compiling final comparative results.
- `docs/history/`: old root handoffs copied verbatim to retain provenance; do not load them as instructions.
- `scripts/evaluation/`: historical and frozen question sets; never edit labels/results to force a pass.
- `docs/phase*-*.md`: experiment reports and chronological decisions. A historical implementation choice is not a forever constraint.

## Efficiency measurement

Track separate categories instead of guessing a percent saved: Codex prompt/context growth, total model usage per task, time in local/test processes, full CI duration, and number of repeated debug cycles. Lower GitHub Actions run time and lower LLM token use are related only indirectly. Use comparable task classes before/after any change.
