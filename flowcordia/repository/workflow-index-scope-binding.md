# Repository scope binding

Every index operation binds organization, project, GitHub App installation database ID, App installation numeric ID, repository database ID, repository numeric ID, owner, name, and production branch. Reads and writes include the complete binding; a changed connection fails before GitHub access or durable replacement.
