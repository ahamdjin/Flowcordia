# GitHub event flow map

Fourth pass note.

Confirmed existing parts:

- GitHub App client
- install redirect route
- install callback route
- installation save service
- repository save service
- connected project repository
- branch tracking
- branch existence check

Not confirmed yet:

- GitHub event receiver route
- push event handler
- pull request event handler
- repository access change handler
- event to deployment trigger path

Practical meaning:

Repository connection exists, but automatic deploy from GitHub push or pull request events is not fully mapped yet.

Flowcordia rule:

Do not promise automatic GitHub deployment until this event path is found or built.

Safe next step:

Add read only GitHub setup status first. Event based deployment should come later.