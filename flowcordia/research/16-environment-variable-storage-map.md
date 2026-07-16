# Environment variable storage map

Third pass note.

Project environment variables are not just plain text rows.

Main repository:

- EnvironmentVariablesRepository

Main model concepts:

- EnvironmentVariable
- EnvironmentVariableValue
- SecretReference
- SecretStore

Storage flow:

1. variable key is stored on the project variable record
2. each environment gets a value record
3. value record points to a secret reference
4. actual secret value is stored through the secret store
5. secret keys are namespaced by project id, environment id, and variable key

The repository removes blacklisted variables before saving.

Important rule:

Never expose secret values in setup UI.

For setup pages, show only:

- present
- missing
- provider type
- last updated metadata if safe

Flowcordia rule:

Use this existing system for project runtime env vars.

Do not store self host server secrets in project env vars unless there is a clear reason.