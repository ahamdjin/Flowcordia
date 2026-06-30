# Feature flags and permissions map

Second pass note.

The app separates product mode and permission checks.

Product mode:

- managed cloud mode is detected from host and cloud env
- private connections only show when enabled and managed cloud is true

This means self hosted UI can hide things that cloud UI shows.

Permission layer:

- dashboardLoader wraps route loaders
- dashboardAction wraps route actions
- route context resolves organization or project scope
- auth reads the user session
- RBAC checks ability against action and resource

Important behavior:

If a route has a scoped permission check but no organization or project scope, it should fail closed.

Flowcordia rule:

Before adding a settings page, decide:

- is it organization scoped
- who can read it
- who can change it
- should it be cloud only or self hosted only
- what happens when the user lacks permission

Safe first version:

Use read only pages with existing authenticated org access.

Add write actions later, one at a time.