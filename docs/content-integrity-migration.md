# Content-Integrity Migration

The first relationship scan (2026-08-28) reported 155 findings. Four were valid one-way recipe-to-KB links, which are explicitly permitted by the recipes spec. The corrected baseline contains 151 legacy defects: 149 asymmetric `relatedIds` relationships and two obsolete targets.

The remaining exemptions are stored as readable diagnostics in `scripts/content-integrity-baseline.json`. New defects fail `pnpm lint:content`. When fixing a legacy defect, remove its exact diagnostic from the baseline in the same change: stale exemptions also fail the check, preventing a resolved defect from silently returning. Do not add new defects to the baseline.

Recipe-to-KB links must still point to existing articles. Other `relatedIds` relationships must be reciprocal.
