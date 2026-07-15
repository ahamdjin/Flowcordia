# Workflow index health model

Healthy means the sync is idle, observed commit exists, every durable entry belongs to that commit, no received webhook is aging beyond the worker budget, and Studio can re-prove selected workflow identity. Pending or running is updating; failed is degraded but preserves the last snapshot; exact-source mismatch is blocked.
