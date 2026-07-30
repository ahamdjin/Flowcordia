# Vendored Studio Sources

These directories preserve the upstream frontend source that will serve as the
Flowcordia Studio V2 foundation.

## Activepieces

- Repository: https://github.com/activepieces/activepieces
- Commit: `d1b800f3db6db52379476c069ea3cdbd2c998276`
- Local mirror: `activepieces-web/`
- Core node subset: `activepieces-core-nodes/`
- License: MIT outside the upstream enterprise paths, as described in
  `activepieces-web/LICENSE`

The complete upstream `packages/web` package is copied without modification.
The core node subset preserves HTTP, Math Helper, Code, If/Branch, Loop,
Manual, Webhook, Schedule, Delay, Data Mapper, Text Helper, Date Helper, Store,
and Subflow foundations together with their required framework and contract
packages.
Flowcordia-specific adapters must live outside this directory.

## Windmill

- Repository: https://github.com/windmill-labs/windmill
- Commit: `9cd6a70f6ace956f679c1ce1fb46543cda569183`
- Local mirror: `windmill-frontend/`
- License: AGPLv3, Apache 2.0, or proprietary depending on the upstream file and
  feature boundary, as described in `windmill-frontend/LICENSE`

The complete upstream `frontend` package is copied without modification.
Flowcordia-specific adapters must live outside this directory.

Do not remove upstream copyright, license, or notice files when reducing these
copies later.
