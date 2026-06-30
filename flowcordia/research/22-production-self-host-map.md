# Production self host map

Fourth pass note.

There are two self host levels:

1. local development Docker stack
2. production hosting Docker or Kubernetes stack

Production docs describe separate webapp and worker components.

Webapp machine hosts:

- webapp
- Postgres
- Redis
- related services

Worker machine hosts:

- supervisor
- run workloads

Important production concerns:

- worker token sharing
- registry credentials
- object storage credentials
- public app URL
- email auth setup
- GitHub OAuth callback URL
- scaling worker machines
- network access between webapp and workers

Registry matters because deploy images are stored and pulled from it.

Object storage matters for large payloads and outputs.

Flowcordia rule:

Do not rebrand or simplify production hosting until we know which services Flowcordia needs unchanged.

Safe future work:

Create Flowcordia setup docs that point to the existing self host docs, then gradually replace Trigger wording later.