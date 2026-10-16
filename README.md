# ぼうさい辞書 AI (bosai-ai)

Offline-oriented disaster-information dictionary and conversation beta for iPad 10 / Safari. [Public GitHub Pages beta](https://fun7772ei.github.io/bosai-ai/).

**Status (2026-10-16):** Chat-first redesign: one composer, a full offline dictionary and focused settings, with adaptive iPad navigation and light/dark themes. [Design and validation details](docs/ui-redesign-20261016.md). This remains a beta; physical iPad Safari/PWA and long Japanese speech recognition require device verification.

## What it actually does

- Finds relevant entries from 88 source-preserving disaster-information records using lexical search and Ruri-v3-30m q8 embedding retrieval (on-device CPU/WASM).
- Shows complete original instructions, warnings, and references. Relevance is **not** a guarantee that the result answers a particular user's situation.
- Clarifies insufficient context and blocks some unsupported requests; explicit scenarios and contradictions are only partially audited (4 of 88 sidecars have verified prerequisites).
- Works without a saved Ruri model via lightweight search; users can opt in to initial Ruri model download (about 44 MB), saved locally. App shell and dictionary use a service worker; model files are stored in IndexedDB.
- Provides experimental Japanese voice transcription using Moonshine Tiny on supported isolated browser contexts. This is optional and not fully validated on iPad.

The fixed offline dictionary cannot check current alarms, road safety, shelter availability, or prescribe individual care.

## Developer entry points

**Start at [AGENTS.md](AGENTS.md)** for the active product constraints **and explicit permission to replace legacy architecture**. Past PR task instructions are not current requirements.

- [Architecture map and potential replacement](docs/architecture-current.md)
- [Conversation rewrite: concrete design and acceptance](docs/conversation-rewrite-brief.md)
- [Historical conversation task (archive pointer)](docs/codex-task.md)
- [Development workflow: draft/quick vs ready/full CI](docs/development-workflow.md)
- [Historical handoffs](docs/history/) and [diagnostic results](docs/diagnostics/) — read only for relevant investigations
- [iPad verification notes](docs/ipad-verification.md)

```bash
npm ci
npm test
npm run build
node scripts/check-public-build.mjs
npm run dev
```

Node.js 24+ is used in CI. Production preview: `npm run preview -- --port 4173 --strictPort`; development / research source is in `research.html`, and can be started using `npm run dev:research`.

## Sources and retention

The 88 records come from a fixed import from `fun7772ei/bosai-app`, with provenance under `docs/source/`. The source text and source references are retained; optional model weights are downloaded and cached, not committed to Git. Ruri and the archived research-model licenses are documented in `docs/model-licenses/`. Research generation code must not be confused with the public beta.

The beta remains offline-first, and user questions are not submitted to an external generative AI service.
