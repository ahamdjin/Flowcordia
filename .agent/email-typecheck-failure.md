# Typecheck failure tail

```text
2026-07-28T16:16:46.3111926Z 
2026-07-28T16:16:46.3116681Z ##[endgroup]
2026-07-28T16:16:48.5024013Z ##[group]@internal/replication:build
2026-07-28T16:16:48.5103842Z cache miss, executing 48a1a6b9a6e7ad9f
2026-07-28T16:16:48.5193442Z 
2026-07-28T16:16:48.5254726Z > @internal/replication@0.0.1 build /home/runner/work/Flowcordia/Flowcordia/internal-packages/replication
2026-07-28T16:16:48.5384075Z > pnpm run clean && tsc -p tsconfig.build.json
2026-07-28T16:16:48.5402309Z 
2026-07-28T16:16:48.5563177Z 
2026-07-28T16:16:48.5644814Z > @internal/replication@0.0.1 clean /home/runner/work/Flowcordia/Flowcordia/internal-packages/replication
2026-07-28T16:16:48.5773468Z > rimraf dist
2026-07-28T16:16:48.6080433Z 
2026-07-28T16:16:48.6244455Z ##[endgroup]
2026-07-28T16:16:58.1134606Z ##[group]@trigger.dev/rbac:typecheck
2026-07-28T16:16:58.1201141Z cache miss, executing aea531469c595caa
2026-07-28T16:16:58.1285151Z 
2026-07-28T16:16:58.1344353Z > @trigger.dev/rbac@0.0.1 typecheck /home/runner/work/Flowcordia/Flowcordia/internal-packages/rbac
2026-07-28T16:16:58.1353606Z > tsc --noEmit
2026-07-28T16:16:58.1383314Z 
2026-07-28T16:16:58.1434038Z ##[endgroup]
2026-07-28T16:16:59.0394100Z ##[group]@trigger.dev/sso:typecheck
2026-07-28T16:16:59.0454002Z cache miss, executing 9a0987d9379b5071
2026-07-28T16:16:59.0506615Z 
2026-07-28T16:16:59.0587768Z > @trigger.dev/sso@0.0.1 typecheck /home/runner/work/Flowcordia/Flowcordia/internal-packages/sso
2026-07-28T16:16:59.0623565Z > tsc --noEmit
2026-07-28T16:16:59.0662327Z 
2026-07-28T16:16:59.0764190Z ##[endgroup]
2026-07-28T16:16:59.7684280Z ##[group]@trigger.dev/rbac:build
2026-07-28T16:16:59.7733846Z cache miss, executing b8b23155286526fe
2026-07-28T16:16:59.7793909Z 
2026-07-28T16:16:59.7914338Z > @trigger.dev/rbac@0.0.1 build /home/runner/work/Flowcordia/Flowcordia/internal-packages/rbac
2026-07-28T16:16:59.7974213Z > pnpm run clean && tsc --noEmit false --outDir dist --declaration
2026-07-28T16:16:59.8033495Z 
2026-07-28T16:16:59.8133470Z 
2026-07-28T16:16:59.8154284Z > @trigger.dev/rbac@0.0.1 clean /home/runner/work/Flowcordia/Flowcordia/internal-packages/rbac
2026-07-28T16:16:59.8243988Z > rimraf dist
2026-07-28T16:16:59.8314623Z 
2026-07-28T16:16:59.8374206Z ##[endgroup]
2026-07-28T16:17:14.9408234Z ##[group]@trigger.dev/sso:build
2026-07-28T16:17:14.9453706Z cache miss, executing 645f797a5f8cabf6
2026-07-28T16:17:14.9503239Z 
2026-07-28T16:17:14.9604718Z > @trigger.dev/sso@0.0.1 build /home/runner/work/Flowcordia/Flowcordia/internal-packages/sso
2026-07-28T16:17:14.9783885Z > pnpm run clean && tsc --noEmit false --outDir dist --declaration
2026-07-28T16:17:14.9833334Z 
2026-07-28T16:17:14.9937997Z 
2026-07-28T16:17:15.0034374Z > @trigger.dev/sso@0.0.1 clean /home/runner/work/Flowcordia/Flowcordia/internal-packages/sso
2026-07-28T16:17:15.0103804Z > rimraf dist
2026-07-28T16:17:15.0199339Z 
2026-07-28T16:17:15.0354554Z ##[endgroup]
2026-07-28T16:17:28.2224236Z ##[group]@internal/zod-worker:typecheck
2026-07-28T16:17:28.2394207Z cache miss, executing 176c81a44b5c698e
2026-07-28T16:17:28.2485483Z 
2026-07-28T16:17:28.2584426Z > @internal/zod-worker@0.0.1 typecheck /home/runner/work/Flowcordia/Flowcordia/internal-packages/zod-worker
2026-07-28T16:17:28.2710589Z > tsc --noEmit
2026-07-28T16:17:28.2775024Z 
2026-07-28T16:17:28.2924003Z ##[endgroup]
2026-07-28T16:17:31.2758096Z ##[group]@trigger.dev/sdk:build
2026-07-28T16:17:31.2824317Z cache miss, executing 4b406ac53538178c
2026-07-28T16:17:31.2913302Z 
2026-07-28T16:17:31.3018416Z > @trigger.dev/sdk@4.5.0-rc.7 build /home/runner/work/Flowcordia/Flowcordia/packages/trigger-sdk
2026-07-28T16:17:31.3074094Z > tshy && pnpm run update-version && pnpm run bundle-docs
2026-07-28T16:17:31.3190629Z 
2026-07-28T16:17:31.3420787Z 
2026-07-28T16:17:31.3444297Z > @trigger.dev/sdk@4.5.0-rc.7 update-version /home/runner/work/Flowcordia/Flowcordia/packages/trigger-sdk
2026-07-28T16:17:31.3543904Z > tsx ../../scripts/updateVersion.ts
2026-07-28T16:17:31.3633704Z 
2026-07-28T16:17:31.3717659Z Updated packages/trigger-sdk version.js to 4.5.0-rc.7
2026-07-28T16:17:31.3853529Z 
2026-07-28T16:17:31.3974404Z > @trigger.dev/sdk@4.5.0-rc.7 bundle-docs /home/runner/work/Flowcordia/Flowcordia/packages/trigger-sdk
2026-07-28T16:17:31.3998732Z > tsx ../../scripts/bundleSdkDocs.ts
2026-07-28T16:17:31.4096210Z 
2026-07-28T16:17:31.4174623Z [bundleSdkDocs] bundled 157 docs from the "Documentation" nav into packages/trigger-sdk/docs
2026-07-28T16:17:31.4213986Z ##[endgroup]
2026-07-28T16:17:37.4274470Z ##[group]@internal/clickhouse:build
2026-07-28T16:17:37.4275580Z cache miss, executing 1945bb4bfc12aba3
2026-07-28T16:17:37.4303372Z 
2026-07-28T16:17:37.4305217Z > @internal/clickhouse@0.0.2 build /home/runner/work/Flowcordia/Flowcordia/internal-packages/clickhouse
2026-07-28T16:17:37.4306665Z > pnpm run clean && tsc -p tsconfig.build.json
2026-07-28T16:17:37.4307356Z 
2026-07-28T16:17:37.4307572Z 
2026-07-28T16:17:37.4308467Z > @internal/clickhouse@0.0.2 clean /home/runner/work/Flowcordia/Flowcordia/internal-packages/clickhouse
2026-07-28T16:17:37.4309524Z > rimraf dist
2026-07-28T16:17:37.4309875Z 
2026-07-28T16:17:37.4310619Z ##[endgroup]
2026-07-28T16:17:40.8284179Z ##[group]@internal/clickhouse:typecheck
2026-07-28T16:17:40.8313904Z cache miss, executing e852d89094ad068c
2026-07-28T16:17:40.8333595Z 
2026-07-28T16:17:40.8344263Z > @internal/clickhouse@0.0.2 typecheck /home/runner/work/Flowcordia/Flowcordia/internal-packages/clickhouse
2026-07-28T16:17:40.8373855Z > tsc --noEmit -p tsconfig.build.json
2026-07-28T16:17:40.8403351Z 
2026-07-28T16:17:40.8434062Z ##[endgroup]
2026-07-28T16:17:43.7146676Z ##[group]@internal/sdk-compat-tests:typecheck
2026-07-28T16:17:43.7183697Z cache miss, executing 6156d1a083659531
2026-07-28T16:17:43.7270543Z 
2026-07-28T16:17:43.7371262Z > @internal/sdk-compat-tests@0.0.1 typecheck /home/runner/work/Flowcordia/Flowcordia/internal-packages/sdk-compat-tests
2026-07-28T16:17:43.7518653Z > tsc --noEmit
2026-07-28T16:17:43.7543165Z 
2026-07-28T16:17:43.7704187Z ##[endgroup]
2026-07-28T16:17:46.2465074Z ##[group]@trigger.dev/redis-worker:build
2026-07-28T16:17:46.2573954Z cache miss, executing 158623c79d256ba2
2026-07-28T16:17:46.2623287Z 
2026-07-28T16:17:46.2674848Z > @trigger.dev/redis-worker@4.5.0-rc.7 build /home/runner/work/Flowcordia/Flowcordia/packages/redis-worker
2026-07-28T16:17:46.2753774Z > tsup
2026-07-28T16:17:46.2793616Z 
2026-07-28T16:17:46.2884402Z [34mCLI[39m Building entry: src/index.ts
2026-07-28T16:17:46.2924275Z [34mCLI[39m Using tsconfig: tsconfig.json
2026-07-28T16:17:46.2973860Z [34mCLI[39m tsup v8.4.0
2026-07-28T16:17:46.3064603Z [34mCLI[39m Using tsup config: /home/runner/work/Flowcordia/Flowcordia/packages/redis-worker/tsup.config.ts
2026-07-28T16:17:46.3144056Z [34mCLI[39m Target: es2022
2026-07-28T16:17:46.3195951Z [34mCLI[39m Cleaning output folder
2026-07-28T16:17:46.3233699Z [34mCJS[39m Build start
2026-07-28T16:17:46.3274019Z [34mESM[39m Build start
2026-07-28T16:17:46.3276690Z "flattenAttributes" is imported from external module "@trigger.dev/core/v3/utils/flattenAttributes" but never used in "dist/index.cjs".
2026-07-28T16:17:46.3303572Z [34mDTS[39m Build start
2026-07-28T16:17:46.3354350Z "flattenAttributes" is imported from external module "@trigger.dev/core/v3/utils/flattenAttributes" but never used in "dist/index.js".
2026-07-28T16:17:46.3370127Z [32mCJS[39m [1mdist/index.cjs     [22m[32m556.70 KB[39m
2026-07-28T16:17:46.3393888Z [32mCJS[39m [1mdist/index.cjs.map [22m[32m1.19 MB[39m
2026-07-28T16:17:46.3534538Z [32mCJS[39m ⚡️ Build success in 13518ms
2026-07-28T16:17:46.3566160Z [32mESM[39m [1mdist/index.js     [22m[32m555.18 KB[39m
2026-07-28T16:17:46.3594004Z [32mESM[39m [1mdist/index.js.map [22m[32m1.19 MB[39m
2026-07-28T16:17:46.3594762Z [32mESM[39m ⚡️ Build success in 13519ms
2026-07-28T16:17:46.3595373Z [32mDTS[39m ⚡️ Build success in 69024ms
2026-07-28T16:17:46.3596098Z [32mDTS[39m [1mdist/index.d.cts [22m[32m87.85 KB[39m
2026-07-28T16:17:46.3596898Z [32mDTS[39m [1mdist/index.d.ts  [22m[32m87.85 KB[39m
2026-07-28T16:17:46.3597753Z ##[endgroup]
2026-07-28T16:17:56.6001732Z ##[group]@trigger.dev/rsc:typecheck
2026-07-28T16:17:56.6015399Z cache miss, executing ec9c094b0918e829
2026-07-28T16:17:56.6103473Z 
2026-07-28T16:17:56.6124355Z > @trigger.dev/rsc@4.5.0-rc.7 typecheck /home/runner/work/Flowcordia/Flowcordia/packages/rsc
2026-07-28T16:17:56.6293883Z > tsc --noEmit
2026-07-28T16:17:56.6298590Z 
2026-07-28T16:17:56.6444312Z ##[endgroup]
2026-07-28T16:18:12.8770105Z ##[group]@internal/schedule-engine:typecheck
2026-07-28T16:18:12.8854038Z cache miss, executing 41fe3c07a9fc3c0f
2026-07-28T16:18:12.9023682Z 
2026-07-28T16:18:12.9035547Z > @internal/schedule-engine@0.0.1 typecheck /home/runner/work/Flowcordia/Flowcordia/internal-packages/schedule-engine
2026-07-28T16:18:12.9073736Z > tsc --noEmit -p tsconfig.build.json
2026-07-28T16:18:12.9103188Z 
2026-07-28T16:18:12.9174307Z ##[endgroup]
2026-07-28T16:18:15.8278794Z ##[group]supervisor:typecheck
2026-07-28T16:18:15.8378548Z cache miss, executing c2266bcff73ce22f
2026-07-28T16:18:15.8433507Z 
2026-07-28T16:18:15.8464215Z > supervisor@0.0.1 typecheck /home/runner/work/Flowcordia/Flowcordia/apps/supervisor
2026-07-28T16:18:15.8523551Z > tsc --noEmit
2026-07-28T16:18:15.8535330Z 
2026-07-28T16:18:15.8574064Z ##[endgroup]
2026-07-28T16:18:18.0427978Z ##[group]@internal/schedule-engine:build
2026-07-28T16:18:18.0467646Z cache miss, executing fc4a4d0019f1eb5a
2026-07-28T16:18:18.0523461Z 
2026-07-28T16:18:18.0570068Z > @internal/schedule-engine@0.0.1 build /home/runner/work/Flowcordia/Flowcordia/internal-packages/schedule-engine
2026-07-28T16:18:18.0673987Z > pnpm run clean && tsc -p tsconfig.build.json
2026-07-28T16:18:18.0683371Z 
2026-07-28T16:18:18.0754108Z 
2026-07-28T16:18:18.0904787Z > @internal/schedule-engine@0.0.1 clean /home/runner/work/Flowcordia/Flowcordia/internal-packages/schedule-engine
2026-07-28T16:18:18.0933693Z > rimraf dist
2026-07-28T16:18:18.1047781Z 
2026-07-28T16:18:18.1094105Z ##[endgroup]
2026-07-28T16:18:20.4404401Z ##[group]@trigger.dev/redis-worker:typecheck
2026-07-28T16:18:20.4493830Z cache miss, executing 739310689e95ebc0
2026-07-28T16:18:20.4553344Z 
2026-07-28T16:18:20.4614655Z > @trigger.dev/redis-worker@4.5.0-rc.7 typecheck /home/runner/work/Flowcordia/Flowcordia/packages/redis-worker
2026-07-28T16:18:20.4663752Z > tsc --noEmit -p tsconfig.src.json
2026-07-28T16:18:20.4673324Z 
2026-07-28T16:18:20.4674045Z ##[endgroup]
2026-07-28T16:18:23.1873926Z ##[group]@internal/run-engine:typecheck
2026-07-28T16:18:23.1892363Z cache miss, executing 3f4025e2b29dcf94
2026-07-28T16:18:23.2013345Z 
2026-07-28T16:18:23.2134467Z > @internal/run-engine@0.0.1 typecheck /home/runner/work/Flowcordia/Flowcordia/internal-packages/run-engine
2026-07-28T16:18:23.2163793Z > tsc --noEmit -p tsconfig.build.json
2026-07-28T16:18:23.2223309Z 
2026-07-28T16:18:23.2284162Z ##[endgroup]
2026-07-28T16:18:24.8754530Z ##[group]@trigger.dev/python:typecheck
2026-07-28T16:18:24.8773786Z cache miss, executing f3fe055f5466c220
2026-07-28T16:18:24.8803258Z 
2026-07-28T16:18:24.8804637Z > @trigger.dev/python@4.5.0-rc.7 typecheck /home/runner/work/Flowcordia/Flowcordia/packages/python
2026-07-28T16:18:24.8833704Z > tsc --noEmit -p tsconfig.src.json
2026-07-28T16:18:24.8863129Z 
2026-07-28T16:18:24.8863980Z ##[endgroup]
2026-07-28T16:18:26.2868194Z ##[group]@internal/run-engine:build
2026-07-28T16:18:26.2875362Z cache miss, executing a7761216909e1930
2026-07-28T16:18:26.2875963Z 
2026-07-28T16:18:26.2877005Z > @internal/run-engine@0.0.1 build /home/runner/work/Flowcordia/Flowcordia/internal-packages/run-engine
2026-07-28T16:18:26.2878149Z > pnpm run clean && tsc -p tsconfig.build.json
2026-07-28T16:18:26.2878746Z 
2026-07-28T16:18:26.2878973Z 
2026-07-28T16:18:26.2879985Z > @internal/run-engine@0.0.1 clean /home/runner/work/Flowcordia/Flowcordia/internal-packages/run-engine
2026-07-28T16:18:26.2881079Z > rimraf dist
2026-07-28T16:18:26.2881523Z 
2026-07-28T16:18:26.2882207Z ##[endgroup]
2026-07-28T16:18:26.9051995Z ##[group]trigger.dev:typecheck
2026-07-28T16:18:26.9053447Z cache miss, executing 74484cec73ee033b
2026-07-28T16:18:26.9054109Z 
2026-07-28T16:18:26.9055189Z > trigger.dev@4.5.0-rc.7 typecheck /home/runner/work/Flowcordia/Flowcordia/packages/cli-v3
2026-07-28T16:18:26.9056234Z > tsc -p tsconfig.src.json --noEmit
2026-07-28T16:18:26.9056588Z 
2026-07-28T16:18:26.9057094Z ##[endgroup]
2026-07-28T16:18:27.3259201Z ##[group]trigger.dev:build
2026-07-28T16:18:27.3259832Z cache miss, executing 2afd390fb463b32c
2026-07-28T16:18:27.3260211Z 
2026-07-28T16:18:27.3260874Z > trigger.dev@4.5.0-rc.7 build /home/runner/work/Flowcordia/Flowcordia/packages/cli-v3
2026-07-28T16:18:27.3261768Z > tshy && pnpm run update-version
2026-07-28T16:18:27.3261980Z 
2026-07-28T16:18:27.3261986Z 
2026-07-28T16:18:27.3262933Z > trigger.dev@4.5.0-rc.7 update-version /home/runner/work/Flowcordia/Flowcordia/packages/cli-v3
2026-07-28T16:18:27.3263913Z > tsx ../../scripts/updateVersion.ts
2026-07-28T16:18:27.3264255Z 
2026-07-28T16:18:27.3264598Z Updated packages/cli-v3 version.js to 4.5.0-rc.7
2026-07-28T16:18:27.3265446Z ##[endgroup]
2026-07-28T16:18:35.4346538Z ##[group]@internal/dashboard-agent:typecheck
2026-07-28T16:18:35.4347834Z cache miss, executing 7c811dd6e0d4f466
2026-07-28T16:18:35.4348425Z 
2026-07-28T16:18:35.4349682Z > @internal/dashboard-agent@0.0.1 typecheck /home/runner/work/Flowcordia/Flowcordia/internal-packages/dashboard-agent
2026-07-28T16:18:35.4351133Z > tsc --noEmit
2026-07-28T16:18:35.4351814Z 
2026-07-28T16:18:35.4352918Z ##[endgroup]
2026-07-28T16:19:59.8971496Z [;31mwebapp:typecheck[;0m
2026-07-28T16:19:59.8972220Z cache miss, executing 700646e442bb2409
2026-07-28T16:19:59.8972608Z 
2026-07-28T16:19:59.8977001Z > webapp@1.0.0 typecheck /home/runner/work/Flowcordia/Flowcordia/apps/webapp
2026-07-28T16:19:59.8978124Z > cross-env NODE_OPTIONS="--max-old-space-size=8192" tsc --noEmit -p ./tsconfig.check.json
2026-07-28T16:19:59.8978720Z 
2026-07-28T16:19:59.9008552Z ##[error]command (/home/runner/work/Flowcordia/Flowcordia/apps/webapp) /home/runner/setup-pnpm/node_modules/.bin/pnpm run typecheck exited (2)
2026-07-28T16:19:59.9021530Z webapp#typecheck:  ERROR  command (/home/runner/work/Flowcordia/Flowcordia/apps/webapp) /home/runner/setup-pnpm/node_modules/.bin/pnpm run typecheck exited (2)
2026-07-28T16:19:59.9040959Z ##[error]app/features/flowcordia/setup/emailConfiguration.server.ts(284,3): error TS2322: Type '{ mode: "separate"; version: "1"; updatedAt: string; configuration: { transport: "resend"; apiKey: string; fromEmail: string; replyToEmail: string; } | { transport: "smtp"; port: number; host: string; ... 4 more ...; secure?: unknown; } | { ...; }; lastTestedAt: string; } | { ...; } | null' is not assignable to type '{ mode: "separate"; version: "1"; updatedAt: string; configuration: { transport: "resend"; apiKey: string; fromEmail: string; replyToEmail: string; } | { transport: "smtp"; port: number; host: string; ... 4 more ...; password?: string | undefined; } | { ...; }; lastTestedAt: string; } | { ...; } | null'.
2026-07-28T16:19:59.9046903Z   Type '{ mode: "separate"; version: "1"; updatedAt: string; configuration: { transport: "resend"; apiKey: string; fromEmail: string; replyToEmail: string; } | { transport: "smtp"; port: number; host: string; ... 4 more ...; secure?: unknown; } | { ...; }; lastTestedAt: string; }' is not assignable to type '{ mode: "separate"; version: "1"; updatedAt: string; configuration: { transport: "resend"; apiKey: string; fromEmail: string; replyToEmail: string; } | { transport: "smtp"; port: number; host: string; ... 4 more ...; password?: string | undefined; } | { ...; }; lastTestedAt: string; } | { ...; } | null'.
2026-07-28T16:19:59.9051190Z     Type '{ mode: "separate"; version: "1"; updatedAt: string; configuration: { transport: "resend"; apiKey: string; fromEmail: string; replyToEmail: string; } | { transport: "smtp"; port: number; host: string; ... 4 more ...; secure?: unknown; } | { ...; }; lastTestedAt: string; }' is not assignable to type '{ mode: "separate"; version: "1"; updatedAt: string; configuration: { transport: "resend"; apiKey: string; fromEmail: string; replyToEmail: string; } | { transport: "smtp"; port: number; host: string; ... 4 more ...; password?: string | undefined; } | { ...; }; lastTestedAt: string; }'.
2026-07-28T16:19:59.9053614Z       Types of property 'configuration' are incompatible.
2026-07-28T16:19:59.9055981Z         Type '{ transport: "resend"; apiKey: string; fromEmail: string; replyToEmail: string; } | { transport: "smtp"; port: number; host: string; fromEmail: string; replyToEmail: string; user?: string | undefined; password?: string | undefined; secure?: unknown; } | { ...; }' is not assignable to type '{ transport: "resend"; apiKey: string; fromEmail: string; replyToEmail: string; } | { transport: "smtp"; port: number; host: string; secure: boolean; fromEmail: string; replyToEmail: string; user?: string | undefined; password?: string | undefined; } | { ...; }'.
2026-07-28T16:19:59.9059648Z           Type '{ transport: "smtp"; port: number; host: string; fromEmail: string; replyToEmail: string; user?: string | undefined; password?: string | undefined; secure?: unknown; }' is not assignable to type '{ transport: "resend"; apiKey: string; fromEmail: string; replyToEmail: string; } | { transport: "smtp"; port: number; host: string; secure: boolean; fromEmail: string; replyToEmail: string; user?: string | undefined; password?: string | undefined; } | { ...; }'.
2026-07-28T16:19:59.9062653Z             Type '{ transport: "smtp"; port: number; host: string; fromEmail: string; replyToEmail: string; user?: string | undefined; password?: string | undefined; secure?: unknown; }' is not assignable to type '{ transport: "smtp"; port: number; host: string; secure: boolean; fromEmail: string; replyToEmail: string; user?: string | undefined; password?: string | undefined; }'.
2026-07-28T16:19:59.9064679Z               Types of property 'secure' are incompatible.
2026-07-28T16:19:59.9065103Z                 Type 'unknown' is not assignable to type 'boolean'.
2026-07-28T16:19:59.9065768Z  ELIFECYCLE  Command failed with exit code 2.
2026-07-28T16:19:59.9066016Z 
2026-07-28T16:19:59.9066147Z  Tasks:    63 successful, 64 total
2026-07-28T16:19:59.9066442Z Cached:    0 cached, 64 total
2026-07-28T16:19:59.9066686Z   Time:    6m19.31s 
2026-07-28T16:19:59.9066935Z Failed:    webapp#typecheck
2026-07-28T16:19:59.9067087Z 
2026-07-28T16:19:59.9067267Z  ERROR  run failed: command  exited (2)
2026-07-28T16:19:59.9229909Z  ELIFECYCLE  Command failed with exit code 2.
2026-07-28T16:19:59.9385068Z ##[error]Process completed with exit code 2.
2026-07-28T16:19:59.9479765Z Post job cleanup.
2026-07-28T16:20:00.1048271Z Pruning is unnecessary.
2026-07-28T16:20:00.1247707Z Post job cleanup.
2026-07-28T16:20:00.2275465Z [command]/usr/bin/git version
2026-07-28T16:20:00.2349941Z git version 2.54.0
2026-07-28T16:20:00.2440176Z Temporarily overriding HOME='/home/runner/work/_temp/e28b62e4-45b2-4a1e-860c-8da01b51861f' before making global git config changes
2026-07-28T16:20:00.2442101Z Adding repository directory to the temporary git global config as a safe directory
2026-07-28T16:20:00.2448697Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/Flowcordia/Flowcordia
2026-07-28T16:20:00.2500506Z Removing SSH command configuration
2026-07-28T16:20:00.2516613Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
2026-07-28T16:20:00.2599265Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
2026-07-28T16:20:00.3172174Z Removing HTTP extra header
2026-07-28T16:20:00.3174038Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
2026-07-28T16:20:00.3236729Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
2026-07-28T16:20:00.3570120Z Removing includeIf entries pointing to credentials config files
2026-07-28T16:20:00.3570937Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
2026-07-28T16:20:00.3630313Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
2026-07-28T16:20:00.4028826Z Cleaning up orphan processes
```
