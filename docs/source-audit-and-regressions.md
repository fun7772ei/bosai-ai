# Source prerequisite audit and active regression targets (2026-10-15)

Based on main after merged PR #20. This is a prioritized audit checklist, NOT a new certification of 88 source entries.

- Immutable inputs: src/bosai-data.json (all 88 original items, full text, warnings, source URLs), src/conversation-applicability.json (all 88 sidecars), historical evaluations/labels/outputs in docs/reviews, docs/diagnostics, scripts/evaluation.
- Existing validateApplicability() checks exactly 88 records, sourceFingerprint, sourceTitle/category, evidence string and prerequisite types.
- There are exactly **4 previously verified prerequisites** and **84 provisional** sidecars. No reviewStatus is modified by this PR.
- Existing verified: bosai-2 (tsunami, high ground unreachable), bosai-69 (flooded road on foot), bosai-70 (flooded road by car), bosai-71 (vehicle starts to flood); verify the source detail and warning in context before expanding any conditions.
- Provisional/high priority: bosai-0..16 tsunami evacuation/alerts; bosai-55 (leaving vehicle); bosai-61..63 (alert levels); bosai-68 (river rise); bosai-72 (storm surge); bosai-84 (flood evacuation shoes). Do not mark their prerequisites verified from titles or semantic similarity.
- Case separation: road flooded (floodedRoad) is NOT vehicle interior flooded (vehicleFlooded). Unknown is not false and may require clarification. A denial must not be reversed. Scenario/action alignment matters beyond topic matching.
- Be explicit in review logs about which warning/step line actually proves each prerequisite; a source title alone is insufficient. For each new verified prerequisite, add a source quote, actual source field, negative counterexample, expected status for missing facts and a test. Have a human check applicability implications before promotion.

## Known failure mapping from PR #20 evidence
| Case | Modules | Repro / current gap | Intended future behavior |
| --- | --- | --- | --- |
| Unwanted bosai-84 in top3 | request-facts.js, request-understanding.js, conversation-applicability.js, beta-search.js | Final-32/f01 (flood scene) leaves an unverified footwear item; real Ruri top3 failure observed | Distinguish selected task from similar topic; suppress if contradictory, otherwise label unverified, never claim applicability. |
| Unwanted general-question rejection | request-scope.js | A general boiling-time question can be blocked by the broad numeric boundary in PR #20 | Separate general procedure from site-specific absolute safety/limit, preserving not-covered for unsupported live numeric claims. |
| Vehicle vs road flood | request-facts.js, request-understanding.js | Final-12/f11: vehicle interior flood wording not reliably grounded while road becomes unknown; control 16/17 | Parse vehicle and road as independent facts, unknown stays unknown; ask precise clarification. |
| Negation/correction | request-facts.js / request-understanding.js | Multi-turn 'road flooded' -> 'road not flooded' and vehicle-change variants | Never reanimate an old affirmative or silently transfer vehicle-specific conditions. |
| Person/coreference change | request-understanding.js | 'I' -> 'friend' and omitted-pronoun follow-ups | Require clarification on change; persist source turn and subject only when justified. |
| Lost scene qualifiers | request-facts.js contextText(), request-understanding.js | Bedroom/location modifiers not in the current structured frame disappear after a short follow-up; search rank can change | Keep bounded typed qualifiers and provenance; avoid raw-positive concatenation and stale claims. |

Existing historical/frozen evaluation sets stay untouched. Repro facts here come from docs/conversation-core-validation.md and PR #20; they are not new measurements or claimed fixes. Full held-out real-Ruri regression and expert assessment are for Codex/review stage.
