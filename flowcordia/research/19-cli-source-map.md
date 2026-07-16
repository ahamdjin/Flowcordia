# CLI source map

Fourth pass note.

Main CLI deploy command:

- packages cli v3 deploy command

High level CLI flow:

1. parse deploy command options
2. login or read saved auth
3. resolve project path
4. load config
5. collect Git metadata
6. resolve environment and preview branch
7. get project client
8. build worker bundle
9. initialize deployment through API
10. sync env vars if configured
11. build image
12. get deployment with worker
13. finalize deployment
14. print deployment and test links

Important details:

- preview deploys can create or update branch env
- Git metadata is collected in CLI
- env sync happens before image build completes
- local build path is used in self hosted setups
- finalize deployment runs after image build and worker metadata exists

Flowcordia rule:

Do not change CLI behavior yet.

Future safe work:

Add docs that explain how Flowcordia self hosted users should run deploy against their own app URL.