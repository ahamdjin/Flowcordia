# GitHub integration map

The repo already has GitHub App support.

Main pieces:

- configuration schema enables the app connection
- service creates the GitHub App client
- install route starts the install flow
- callback route saves or updates the installation
- project settings can connect a repository
- branch checks use the GitHub App installation client

There are two separate GitHub features:

1. GitHub login for users
2. GitHub App for repository connection

These should not be mixed.

Flowcordia next step:

Add setup guidance around the existing GitHub App system before changing the flow.

Do not replace the existing logic until callback handling, repository sync, and deployment triggers are fully mapped.
