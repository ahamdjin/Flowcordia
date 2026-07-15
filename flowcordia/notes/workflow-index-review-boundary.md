# Workflow index review boundary

This review contains one product slice: repository discovery through a durable exact-commit index into a read-only Studio graph.

It intentionally excludes graph editing, saves, proposal creation from canvas edits, TypeScript generation, compilation, deployment, execution, and live run state. Those exclusions keep the review large enough to be useful while preserving a single provable responsibility.
