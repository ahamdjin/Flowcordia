# Env and self-host map

The repo already has a large environment schema.

Important categories:

- core app URLs
- database connection
- session and encryption values
- Redis
- email
- GitHub login
- GitHub App
- object storage
- deployment registry
- alerts
- telemetry

Self-hosting currently depends on environment variables first.

Flowcordia should not immediately move everything into the database.

Better order:

1. document required variables
2. group variables by feature
3. show status in UI without revealing values
4. add test buttons for services
5. later allow saving selected settings in the product

First feature groups:

- core stack
- GitHub App
- general email
- alert email
- object storage

Important rule:

Never show secret values in UI. Show only present or missing.
