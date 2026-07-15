# Workflow index migration notes

The migration is additive and creates only the dedicated `flowcordia` PostgreSQL schema and workflow-index tables. It adds foreign keys to existing public organization, project, GitHub App installation, and repository records but alters none of those tables. Application rollback can leave the schema in place; destructive rollback is separate and reviewed.
