# Third-party notices

Flowcordia includes and derives from third-party open-source software. Flowcordia-authored code is
licensed under Apache License 2.0 unless a file or directory states otherwise. Vendored projects
retain their original copyright notices and licenses.

## Trigger.dev

- Source: https://github.com/triggerdotdev/trigger.dev
- License: Apache License 2.0
- Copyright: Trigger.dev contributors

Flowcordia preserves Trigger.dev as its execution foundation.

## Activepieces Community Edition

- Source: https://github.com/activepieces/activepieces
- Pinned source revision: `d1b800f3db6db52379476c069ea3cdbd2c998276`
- License for the included Community Edition source: MIT
- Copyright: Activepieces Inc. and contributors

The distributable Flowcordia Studio uses the MIT-licensed Activepieces frontend and Community
Edition piece framework/catalog. Activepieces enterprise paths are excluded from the Flowcordia
build and distribution. The complete upstream license is preserved in
`studio-v2/activepieces-web/LICENSE` and `studio-v2/activepieces-core-nodes/LICENSE`.

## Windmill reference source

- Source: https://github.com/windmill-labs/windmill
- Pinned source revision: `9cd6a70f6ace956f679c1ce1fb46543cda569183`
- License: AGPL-3.0, Apache-2.0, or proprietary by upstream file boundary
- Copyright: Windmill Labs, Inc. and contributors

The vendored Windmill frontend is retained only as a separately licensed design and engineering
reference under `studio-v2/windmill-frontend`. It is not linked into, built into, or shipped in the
Flowcordia application image. Its upstream license files remain authoritative.

## Dependency notices

Package-manager dependencies retain the licenses declared by their respective packages. The
published container's SBOM is the authoritative per-release dependency inventory.
