# Fresh integration evidence, 2026-10-15

These are NEW measurements, not replacements for any frozen evaluation. Local conversation reports retain their original `implementation`, `workingTreeDirty` and `coreSha256` fields: they were recorded before implementation commits, so inspect the hashes rather than treating the old base HEAD as tested source. Before-fix failures are intentionally retained. Later lifecycle error handling and numeric-duration safety checks have separate unit/UI tests and CI evidence.

- local-final32-before-fixes: f01 retained bosai-84, f05 lacked floodedRoad=true.
- local-final32-after-fixes: 46/46 control, zero badTop3 queries.
- local-heldout-before-fixes: vi01 vehicle question leaked a road unknown; vi02 mentioned a nonflooded vehicle plus walking and was incorrectly treated as mixed movement.
- local-heldout-after-fixes: 10/10 control, zero badTop3 queries.
- local-core12: 17/17 control, including the historical f11 flooded-vehicle question.
- local-ruri-offline: genuine CPU/WASM Ruri, persistence/sentinel, update, offline restart, stop and release checks; not iPad Safari.
- local-moonshine-manifests / distribution: genuine native WASM manifests; actual CDN file sizes and verified CRC32C, plus SHA256 and HTTP response headers. Weights are NOT committed. The native SDK's own cache key remains unchanged.

No speech recordings, real Japanese recognized text, or CER measurement results are included. A deterministic UI test's synthetic text must never be counted as a measured ASR attempt.

`local-moonshine-cors-distribution.json` adds an Origin-bearing HEAD check of all six actual CDN files (each `corsVerified: true`). `local-voice-ui-final.json` includes nonoverlapping layout and a failed-close conversation gate. Its synthetic SDK is explicitly labelled.

To reproduce a CI semantic summary without changing historical labels:

```sh
gh run download RUN_ID --name ruri-beta-check --dir test-results/ci-RUN_ID
node scripts/summarize-voice-integration.mjs test-results/ci-RUN_ID RUN_ID
```

The reporter saves input artifact hashes. Conversation control/forbidden-candidate failures and gold ranking misses are separate. Dictionary outputs use the frozen `relevant`, `dangerous`, `absent`, and `ambiguous` labels: a top-3 miss or scope-label difference is not automatically a safety violation. Check each failure's query and source rather than counting CI green as meaning correctness.
