# GitHub deploy map

Second pass note.

GitHub integration already has these pieces:

- GitHub App client creation
- install redirect route
- callback route
- installation save or update service
- repository fetch from installation
- project repository connection
- branch tracking config
- branch existence check

GitHub data storage is split like this:

- installation belongs to organization
- repository belongs to installation
- connected repository belongs to project

Branch tracking is stored as structured data on the connected project repository.

The deployment presenter reads the connected repository and resolves the environment GitHub branch.

Important unknown still to map:

- active webhook receiver for push and pull request events
- repository sync when access changes
- exact path from GitHub event to deployment creation

Flowcordia rule:

Do not build a new GitHub system.

Wrap the existing install and repo connection flow first.

Future setup wizard should feed into the current GitHub App system, not replace it.