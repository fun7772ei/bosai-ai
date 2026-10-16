# Chat-first redesign — 2026-10-16

## Information architecture and prior UI audit

The prior entry point displayed the introduction, long limitations block, dictionary search, voice experiment, model management, results, and diagnostics together. Conversation was an additional mount that moved voice/settings panels between DOM parents. The initial view was dictionary. Two question forms and several back/toggle controls duplicated navigation.

| Classification | Prior items | New location |
| --- | --- | --- |
| Primary | question/search, conversation, clarification, candidates, original text | Chat is the initial view; one question composer; source warnings remain visible and original steps/sources expand inline |
| Supporting | examples, all-88 browse, categories, source links | Welcome suggestions; independent searchable dictionary; all source fields preserved |
| Settings | Ruri save/load/release, retrieval mode, offline state, privacy, notices | Settings, never moved between views |
| Optional voice | prepare/isolation/start/stop/release, committed text/corrections | Composer popover, explicit user-controlled recording and sending |
| Development | Tiny/Base evaluation, manual speech capture, diagnostic JSON | Collapsed advanced settings; absent from normal chat |

Removed the separate dictionary question-search form, duplicate chat toggle/back navigation, result-side search renderer, permanently visible voice lab and chat diagnostics. Retrieval algorithms, conversation engine, all 88 imported records, vectors, warnings, conditions, sources, model chunk formats and local-storage keys are unchanged. Dictionary keyword search now includes the complete original body, warnings, steps and source labels.

Comparison at 1180×820: [previous UI](images/ui-before.png) · [new UI](images/ui-after.png).

## Design

Common chat-app patterns (persistent composer, readable conversation stream, contextual actions, sidebar and progressive disclosure) inform this design. No external product is copied or claimed to have been tested. Muted sage navigation, warm neutral surfaces, restrained typography and clear source cards form a distinct lightweight visual system. No new runtime dependency is introduced.

At 1180×820 (iPad 10 landscape CSS viewport) a sidebar remains visible. At 820×1180 portrait the menu collapses. Phone and desktop layouts adapt independently. Text controls use 16px font to avoid iOS focus zoom; action targets are at least 44px. Dynamic height follows visualViewport and safe-area insets. Enter inserts a line; Cmd/Ctrl+Enter sends without interrupting IME composition. Light/dark/system appearance persists locally. Reduced-motion, visible focus, labelled controls, a skip link, status announcements and a labelled conversation log are provided. Navigation preserves drafts, filters, source selection and an in-flight conversation; it does not reparent runtime controls.

Conversation is still memory-only and cleared on reload. An isolation-mode reload preserves the draft once in sessionStorage and explicitly warns that conversation will end. No transcription is auto-sent or silently corrected. Existing voice close-failure gates prevent unsafe simultaneous runtime residency; dictionary remains independent.

## Updates and storage

The service worker still installs a complete shell before waiting. A visible update action explicitly explains conversation reset, refuses while processing/voice is active and reloads after activation. Controlled old tabs retain access to their shell assets, including offline, via same-origin hashed-asset fallback. Old shells are collected only when no controlled clients remain at activation. Model/SDK stores and user settings are never part of shell cleanup. This may retain extra shell versions while old tabs remain open; it prioritizes tab stability and saved data. Neither uninstall nor cache clearing is an upgrade step.

PR #22 is integrated; README and AGENTS links now describe the archived task accurately. Historical instructions do not override the current requested publication.

## Validation record

- 179 unit tests pass, including source integrity, storage, conversation safety and voice lifecycle.
- Production build and public-build isolation check pass (88 records, no public generative runtime/weight bundle).
- Chromium `redesign-ui-check.mjs`: all 88 original records and links; chat/clarification/source interaction; draft/history/filter continuity; settings; themes; voice popover; offline reload; 1180×820, 820×1180, 390×844, 1440×900 and 820×500 simulated keyboard viewport. No page errors/overflow.
- Linux WebKit: the same layout, interaction and 88-source checks pass. Playwright offline emulation produced an internal navigation error; stopping a dedicated preview server instead confirms real network-unavailable offline restart. This does not certify Safari on iPad.
- `redesign-update-check.mjs`: explicit update/reload; saved-store sentinel retention; old-tab asset access offline; new-shell offline restart.
- Real Ruri 64 questions × three retrieval modes: 192 runs pass, including unsaved/failed-save fallback, saved/reused model, stop/retry, offline restart, waiting update, legacy model-data sentinel retention and no re-download.
- Held-out conversation core: 25 turns pass, with real Ruri, stale-choice rejection, stop/recovery and offline saved-model restart.
- Voice SDK-double UI: 11 checks pass, including explicit correction, manual edits, no auto-send, close failure and recovery. This is not recognition accuracy evidence.
- Actual pinned Moonshine SDK Tiny/Base: online/offline load/start/stop/close and Ruri→voice→Ruri switching; synthetic browser microphone. This is not Japanese ASR accuracy or physical microphone evidence.

Fresh screenshots and machine-readable results are CI artifacts (`redesign-*`, existing regression artifacts). Historical frozen cases/results were not relabelled or rewritten. Full CI and final published verification are recorded in the PR/release report.

## Physical iPad verification still required

Linux Chromium viewports and Linux WebKit are not an iPad Safari/PWA certification. Verify the actual iPad 10 in both orientations, Safari and installed PWA separately: software keyboard/IME and visual viewport panning, safe areas, touch scrolling in long source text, microphone permission, long Japanese recognition, memory pressure/background suspension, saved-model persistence and offline cold restart. No physical device was available in this environment.
