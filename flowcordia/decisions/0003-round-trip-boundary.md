# ADR 0003: Round-trip guarantees have an explicit boundary

## Status

Accepted.

## Context

Arbitrary TypeScript can express behavior that cannot be represented as a stable visual graph. Claiming universal conversion would risk destructive edits and false confidence.

## Decision

Lossless visual/code round-trip is guaranteed for the Flowcordia workflow model and supported SDK constructs. Unsupported code remains intact behind a code-task node with declared schemas and references.

## Consequences

- The product can preserve full developer power without corrupting source.
- Visual coverage is measurable through the capability matrix.
- The compiler must emit clear unsupported-construct diagnostics.
- A code escape hatch preserves runtime parity but does not count as visual parity.

## Reversal condition

The supported subset may expand, but unsupported code must never be rewritten without explicit user action.

