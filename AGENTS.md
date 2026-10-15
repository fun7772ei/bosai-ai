# bosai-ai — Current development contract (2026-10-15)

This is the short, **current** entry point for coding agents and contributors. `CLOUD_HANDOFF.md`, `CLOUD_PROMPT.md`, older PR descriptions, frozen evaluations, and archived documents are historical evidence, **not ongoing instructions**. Follow the latest explicit user request first.

## Product invariants (what must work)

- Target: iPad 10 / Safari, installable offline PWA. Keep the saved model/cache usable across upgrades; never silently delete user data or trigger a compulsory re-download.
- The 88 imported disaster-source records (body, conditions, warnings, references, provenance) must remain traceable and unmodified. User-facing advice must preserve material negation, prerequisites and warnings.
- No claim to know live alerts, nearby shelter availability, a person's current safety, or individual treatment from a static offline dictionary. Never equate retrieval similarity or a selected source with a verified safe answer.
- The app must remain usable offline with a lightweight retrieval fallback if Ruri is not loaded. On-device voice is optional and must not block text/dictionary usage.
- Preserve local-only processing by default and clearly explain any network request for optional initial model download or external source link. The project is a beta; do not claim independent safety certification or completed iPad verification.

## Implementation is replaceable

- **You may redesign or replace the app architecture, algorithms, UI, file layout, state model, and internal APIs.** Do not layer additional conditionals onto an unsuitable design solely to preserve previous internals.
- Legacy research paths, benchmark harnesses, old UI layouts, and the exact old search-ranking heuristics are **not contracts**. Remove or isolate superseded pieces when the replacement is better. Preserve historical evidence and meaningful behavioral tests.
- Do not rewrite past evaluation results, change frozen labels to make a new implementation pass, or claim that old performance measurements are measurements of new code.
- When a historical instruction conflicts with this document or today's task, classify it as history; do not silently inherit it. If product guarantees themselves conflict, document the trade-off and keep the safer beta behavior.
- Keep implementation changes in a branch and PR for review. Merge/deploy only when explicitly requested for that task.

## Work efficiently

1. Read this file, `README.md`, and only the relevant modules. See `docs/architecture-current.md` for entry points; for the planned conversation-engine replacement use `docs/conversation-rewrite-brief.md` and the compact `docs/codex-task.md`.
2. Treat `docs/diagnostics/**`, `docs/history/**`, `docs/phase1-*.md`, and frozen v2–v18 logs as **opt-in evidence**, not mandatory reading on every task.
3. For small changes, run targeted `node --test tests/<related>.test.js`. Then run the **quick** suite described in `docs/development-workflow.md`.
4. Work on a **draft PR** while iterating. Quick CI still runs; the full real-model/browser matrix runs when the PR is marked ready for review, and on subsequent commits to a ready PR.
5. A rewrite is evaluated against behavior, source integrity, offline stability, and fresh held-out scenarios—not source code similarity to the old implementation.

This policy clarifies the maintainer's rewrite permission; it does **not** authorize removing safety checks without an equivalent, tested design.
