# Workflow index enterprise readiness criteria

- Tenant and repository identity is database constrained and rechecked server-side.
- GitHub writes are not introduced by the read slice.
- Read operations are installation scoped and exact commit bound.
- Catalog updates are atomic, leased, generation guarded, and auditable.
- Webhooks are signature verified, bounded, deduplicated, and replay checked.
- Invalid data is visible without becoming executable or renderable.
- Worker rollout is default off and reversible.
- The existing customer runtime remains untouched.
- Browser data is explicitly projected and redacted.
- Full integration and operational recovery are required before broader rollout.
