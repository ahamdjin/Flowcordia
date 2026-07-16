# GitHub webhook gap map

Third pass note.

The repo has GitHub App install and callback flow.

Confirmed pieces:

- app client creation
- install redirect
- callback handling
- installation save
- repository save
- repository connection to project
- branch tracking
- branch existence check

Open gap:

The active webhook receiver for GitHub push and pull request events was not confirmed in this pass.

Why this matters:

A complete GitHub deployment flow needs:

1. webhook receiver
2. signature verification
3. event parsing
4. repository lookup
5. branch tracking match
6. deployment trigger
7. repository access sync for install changes

Flowcordia rule:

Before building automatic GitHub deploys, find or add the webhook receiver as a tiny isolated step.

Do not assume installation callback equals webhook handling. They are different flows.