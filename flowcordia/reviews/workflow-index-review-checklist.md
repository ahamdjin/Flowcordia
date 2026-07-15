# Workflow index review checklist

- [ ] Every route reuses dashboard authorization and the Studio feature gate.
- [ ] No browser field controls repository or tenant scope.
- [ ] Push payload is verified before normalization.
- [ ] Tree discovery is exact-commit and rejects truncation.
- [ ] Workflow content is exact-commit/blob/path verified.
- [ ] Durable replacement is generation/lease guarded and transactional.
- [ ] Failure keeps the last complete catalog.
- [ ] Invalid documents cannot render.
- [ ] Studio verifies the canonical digest before graph projection.
- [ ] Browser DTO contains no protected values or internal identities.
- [ ] Worker is default-off, no-overlap, gracefully stopped, and runtime-isolated.
- [ ] Rollout, recovery, rollback, and operating signals are documented.
- [ ] Full CI passes on the exact head.
