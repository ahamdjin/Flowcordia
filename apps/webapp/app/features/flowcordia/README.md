# Flowcordia webapp boundary

This folder contains Flowcordia-specific control-plane features that live inside the inherited web application.

## Rules

- Keep Flowcordia modules isolated from run-engine, queue, supervisor, and deployment internals.
- Prefer adapters around existing services over parallel implementations.
- Never return secret values to browser loaders.
- Add a folder README that records upstream and downstream connections for every feature.
- Keep new routes hidden until permissions, direct navigation, and failure behavior are verified.

## Current features

- `setup/` — safe configuration-presence checks and the general-email connection test.

The workflow Studio will receive its own folder after the workflow model and GitHub lifecycle contracts are accepted.
