# E2E failure tail

```text
2026-07-28T16:01:29.7825827Z      [2m[90m↓[39m[22m invalid API key: 401
2026-07-28T16:01:29.7826629Z      [2m[90m↓[39m[22m JWT with matching scope: auth passes
2026-07-28T16:01:29.7827599Z      [2m[90m↓[39m[22m JWT with wrong scope (read-only) on write route: 403
2026-07-28T16:01:29.7828397Z      [2m[90m↓[39m[22m missing Authorization header: 401
2026-07-28T16:01:29.7829300Z      [2m[90m↓[39m[22m API key (tr_dev_*) on PAT-only route: 401
2026-07-28T16:01:29.7829790Z      [2m[90m↓[39m[22m malformed PAT (wrong prefix): 401
2026-07-28T16:01:29.7830553Z      [2m[90m↓[39m[22m well-formed but unknown PAT: 401
2026-07-28T16:01:29.7831333Z      [2m[90m↓[39m[22m revoked PAT: 401
2026-07-28T16:01:29.7832456Z      [2m[90m↓[39m[22m valid PAT on nonexistent project: 404 (auth passes)
2026-07-28T16:01:29.7833451Z      [2m[90m↓[39m[22m scope matches exact resource id: 200
2026-07-28T16:01:29.7834406Z      [2m[90m↓[39m[22m scope targets a different resource id: 403
2026-07-28T16:01:29.7835547Z      [2m[90m↓[39m[22m type-level scope (no id) grants all resources of that type: 200
2026-07-28T16:01:29.7836922Z      [2m[90m↓[39m[22m scope action mismatch (read-only on write route) with matching resource id: 403
2026-07-28T16:01:29.7838154Z      [2m[90m↓[39m[22m scope targets a different resource type: 403
2026-07-28T16:01:29.7839273Z      [2m[90m↓[39m[22m admin super-scope grants access (legacy behaviour): 200
2026-07-28T16:01:29.7840419Z      [2m[90m↓[39m[22m unrelated type scope with no super-scope match: 403
2026-07-28T16:01:29.7842515Z      [2m[90m↓[39m[22m custom action: type-level write:tasks scope satisfies action="trigger" (auth passes)
2026-07-28T16:01:29.7843795Z      [2m[90m↓[39m[22m multi-key resource: read:tags:<tag> scope grants access to a run carrying that tag (auth passes)
2026-07-28T16:01:29.7844736Z      [2m[90m↓[39m[22m multi-key resource: read:batch:<friendlyId> scope grants access to a run in that batch (auth passes)
2026-07-28T16:01:29.7845758Z      [2m[90m↓[39m[22m valid API key whose project is soft-deleted: 401
2026-07-28T16:01:30.2063282Z 🔦 Tracer: Logger exporter enabled (sampling = 0.05)
2026-07-28T16:01:30.2206428Z 🔌 setting up prisma client to postgres://test@localhost:32778/test?connection_limit=10&pool_timeout=60&connection_timeout=20&application_name=trigger.dev+webapp
2026-07-28T16:01:30.2239754Z 🔌 prisma client connected
2026-07-28T16:01:30.2247888Z 🔌 No database replica, using the regular client
2026-07-28T16:01:30.2254291Z ❗ database schema unspecified, will default to `public` schema
2026-07-28T16:01:30.7567729Z 🗃️  Clickhouse service enabled to host localhost:19123
2026-07-28T16:01:30.7573981Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:01:30.756Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:01:30.7584290Z [2026-07-28T16:01:30.758Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:01:30.7596019Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:01:30.759Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:01:30.7598263Z [2026-07-28T16:01:30.759Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:01:30.7601325Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:01:30.759Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:01:30.7603963Z [2026-07-28T16:01:30.759Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:01:30.7606218Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:01:30.760Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:01:30.7607968Z [2026-07-28T16:01:30.760Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:01:30.7610360Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:01:30.760Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:01:30.7612584Z [2026-07-28T16:01:30.760Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:01:30.7615366Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:01:30.761Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:01:30.7617310Z [2026-07-28T16:01:30.761Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:01:30.7620106Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:01:30.761Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:01:30.7622150Z [2026-07-28T16:01:30.761Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:01:30.7713007Z {"timestamp":"2026-07-28T16:01:30.770Z","name":"RunEngine","message":"RunEngine FairQueueSelectionStrategy queueSelectionStrategyOptions","level":"log"}
2026-07-28T16:01:30.7797154Z {"consumerCount":3,"drrQuantum":25,"defaultConcurrency":5,"consumersEnabled":false,"timestamp":"2026-07-28T16:01:30.779Z","name":"RunEngine","message":"BatchQueue initialized","level":"info"}
2026-07-28T16:01:31.1975953Z {"timestamp":"2026-07-28T16:01:31.196Z","name":"UpdateMetadataService","message":"[UpdateMetadataService] 🚽 Flushing started","level":"info"}
2026-07-28T16:01:31.2608500Z /home/runner/work/Flowcordia/Flowcordia/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/types.cjs:2498
2026-07-28T16:01:31.2609682Z             const discriminatorValues = getDiscriminator(type.shape[discriminator]);
2026-07-28T16:01:31.2610373Z                                                                    ^
2026-07-28T16:01:31.2610721Z 
2026-07-28T16:01:31.2612219Z TypeError: Cannot read properties of undefined (reading 'transport')
2026-07-28T16:01:31.2614860Z     at Object.create (/home/runner/work/Flowcordia/Flowcordia/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/types.cjs:2498:68)
2026-07-28T16:01:31.2616353Z     at app/features/flowcordia/setup/emailConfiguration.server.ts (/home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:50696:66)
2026-07-28T16:01:31.2617203Z     at /home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:8:56
2026-07-28T16:01:31.2617922Z     at app/services/email.server.ts (/home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:50771:5)
2026-07-28T16:01:31.2618601Z     at /home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:8:56
2026-07-28T16:01:31.2619441Z     at app/features/flowcordia/workflows/approval/notification.server.ts (/home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:85945:5)
2026-07-28T16:01:31.2620251Z     at /home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:8:56
2026-07-28T16:01:31.2621155Z     at app/features/flowcordia/workflows/approval/notification-processing.server.ts (/home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:86207:5)
2026-07-28T16:01:31.2622437Z     at /home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:8:56
2026-07-28T16:01:31.2623130Z     at app/v3/alertsWorker.server.ts (/home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:87176:5)
2026-07-28T16:01:31.2623550Z 
2026-07-28T16:01:31.2623644Z Node.js v20.20.2
2026-07-28T16:02:42.7548838Z  [31m❯[39m test/healthcheck-require-plugins.e2e.test.ts [2m([22m[2m3 tests[22m[2m | [22m[33m3 skipped[39m[2m)[22m[33m 144374[2mms[22m[39m
2026-07-28T16:02:42.7594117Z 
2026-07-28T16:02:42.7595535Z        [2m[90m↓[39m[22m returns 500 so the readiness probe fails and the rollout is rolled back
2026-07-28T16:02:42.7598467Z        [2m[90m↓[39m[22m skipped because /home/runner/work/Flowcordia/Flowcordia/apps/webapp/node_modules/@triggerdotdev/plugins exists — plugin would load successfully. Run `pnpm dev:unlink-webapp` to exercise this case locally; CI runs it without the link.
2026-07-28T16:02:42.7600866Z        [2m[90m↓[39m[22m returns 200 (baseline — unchanged self-hoster behaviour)
2026-07-28T16:02:42.7602778Z [31m⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Suites 3 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m
2026-07-28T16:02:42.7603588Z 
2026-07-28T16:02:42.7604731Z [41m[1m FAIL [22m[49m test/api-auth.e2e.test.ts[2m [ test/api-auth.e2e.test.ts ][22m
2026-07-28T16:02:42.7608199Z [31m[1mError[22m: Webapp failed to start.
2026-07-28T16:02:42.7608764Z Output:
2026-07-28T16:02:42.7609399Z 🔦 Tracer: Logger exporter enabled (sampling = 0.05)
2026-07-28T16:02:42.7609782Z 
2026-07-28T16:02:42.7611255Z 🔌 setting up prisma client to postgres://test@localhost:32770/test?connection_limit=10&pool_timeout=60&connection_timeout=20&application_name=trigger.dev+webapp
2026-07-28T16:02:42.7612449Z 
2026-07-28T16:02:42.7612899Z 🔌 prisma client connected
2026-07-28T16:02:42.7613152Z 
2026-07-28T16:02:42.7613586Z 🔌 No database replica, using the regular client
2026-07-28T16:02:42.7613987Z 
2026-07-28T16:02:42.7614631Z ❗ database schema unspecified, will default to `public` schema
2026-07-28T16:02:42.7615061Z 
2026-07-28T16:02:42.7615544Z 🗃️  Clickhouse service enabled to host localhost:19123
2026-07-28T16:02:42.7617296Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:00:25.240Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:02:42.7618329Z 
2026-07-28T16:02:42.7619064Z [2026-07-28T16:00:25.243Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:02:42.7619608Z 
2026-07-28T16:02:42.7620936Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:00:25.245Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:02:42.7622577Z [2026-07-28T16:00:25.245Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:02:42.7624482Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:00:25.245Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:02:42.7626315Z [2026-07-28T16:00:25.245Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:02:42.7628196Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:00:25.246Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:02:42.7629612Z [2026-07-28T16:00:25.246Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:02:42.7631460Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:00:25.246Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:02:42.7633253Z [2026-07-28T16:00:25.246Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:02:42.7635159Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:00:25.246Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:02:42.7636676Z [2026-07-28T16:00:25.246Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:02:42.7638555Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:00:25.247Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:02:42.7639510Z 
2026-07-28T16:02:42.7640048Z [2026-07-28T16:00:25.247Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:02:42.7640653Z 
2026-07-28T16:02:42.7642597Z {"timestamp":"2026-07-28T16:00:25.259Z","name":"RunEngine","message":"RunEngine FairQueueSelectionStrategy queueSelectionStrategyOptions","level":"log"}
2026-07-28T16:02:42.7643572Z 
2026-07-28T16:02:42.7644939Z {"consumerCount":3,"drrQuantum":25,"defaultConcurrency":5,"consumersEnabled":false,"timestamp":"2026-07-28T16:00:25.268Z","name":"RunEngine","message":"BatchQueue initialized","level":"info"}
2026-07-28T16:02:42.7646043Z 
2026-07-28T16:02:42.7647220Z {"timestamp":"2026-07-28T16:00:25.763Z","name":"UpdateMetadataService","message":"[UpdateMetadataService] 🚽 Flushing started","level":"info"}
2026-07-28T16:02:42.7648092Z 
2026-07-28T16:02:42.7648831Z /home/runner/work/Flowcordia/Flowcordia/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/types.cjs:2498
2026-07-28T16:02:42.7649977Z             const discriminatorValues = getDiscriminator(type.shape[discriminator]);
2026-07-28T16:02:42.7650753Z                                                                    ^
2026-07-28T16:02:42.7651096Z 
2026-07-28T16:02:42.7651718Z TypeError: Cannot read properties of undefined (reading 'transport')
2026-07-28T16:02:42.7652955Z     at Object.create (/home/runner/work/Flowcordia/Flowcordia/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/types.cjs:2498:68)
2026-07-28T16:02:42.7654604Z     at app/features/flowcordia/setup/emailConfiguration.server.ts (/home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:50696:66)
2026-07-28T16:02:42.7655962Z     at /home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:8:56
2026-07-28T16:02:42.7656784Z     at app/services/email.server.ts (/home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:50771:5)
2026-07-28T16:02:42.7657468Z     at /home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:8:56
2026-07-28T16:02:42.7658346Z     at app/features/flowcordia/workflows/approval/notification.server.ts (/home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:85945:5)
2026-07-28T16:02:42.7659176Z     at /home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:8:56
2026-07-28T16:02:42.7660072Z     at app/features/flowcordia/workflows/approval/notification-processing.server.ts (/home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:86207:5)
2026-07-28T16:02:42.7660914Z     at /home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:8:56
2026-07-28T16:02:42.7662071Z     at app/v3/alertsWorker.server.ts (/home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:87176:5)
2026-07-28T16:02:42.7662851Z 
2026-07-28T16:02:42.7663259Z Node.js v20.20.2
2026-07-28T16:02:42.7663470Z 
2026-07-28T16:02:42.7663478Z 
2026-07-28T16:02:42.7664479Z Original error: Error: Webapp did not become healthy at http://localhost:46243/healthcheck within 60000ms[39m
2026-07-28T16:02:42.7666200Z [90m [2m❯[22m Object.create ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/types.cjs:[2m2498:68[22m[39m
2026-07-28T16:02:42.7668338Z [90m [2m❯[22m app/features/flowcordia/setup/emailConfiguration.server.ts app/features/flowcordia/setup/emailConfiguration.server.ts:[2m73:57[22m[39m
2026-07-28T16:02:42.7669785Z [90m [2m❯[22m build/index.js:[2m8:56[22m[39m
2026-07-28T16:02:42.7670833Z [90m [2m❯[22m app/services/email.server.ts app/services/email.server.ts:[2m6:0[22m[39m
2026-07-28T16:02:42.7672017Z [90m [2m❯[22m build/index.js:[2m8:56[22m[39m
2026-07-28T16:02:42.7673740Z [90m [2m❯[22m app/features/flowcordia/workflows/approval/notification.server.ts app/features/flowcordia/workflows/approval/notification.server.ts:[2m11:0[22m[39m
2026-07-28T16:02:42.7675251Z [90m [2m❯[22m build/index.js:[2m8:56[22m[39m
2026-07-28T16:02:42.7677365Z [90m [2m❯[22m app/features/flowcordia/workflows/approval/notification-processing.server.ts app/features/flowcordia/workflows/approval/notification-processing.server.ts:[2m10:0[22m[39m
2026-07-28T16:02:42.7679085Z [90m [2m❯[22m build/index.js:[2m8:56[22m[39m
2026-07-28T16:02:42.7680220Z [90m [2m❯[22m app/v3/alertsWorker.server.ts app/v3/alertsWorker.server.ts:[2m5:0[22m[39m
2026-07-28T16:02:42.7682290Z [36m [2m❯[22m startWebapp ../../internal-packages/testcontainers/src/webapp.ts:[2m189:11[22m[39m
2026-07-28T16:02:42.7683745Z     [90m187|[39m     proc[33m.[39m[34mkill[39m([32m"SIGTERM"[39m)[33m;[39m
2026-07-28T16:02:42.7685302Z     [90m188|[39m     [35mconst[39m output [33m=[39m [[33m...[39mstdout[33m,[39m [33m...[39mstderr][33m.[39m[34mjoin[39m([32m"\n"[39m)[33m;[39m
2026-07-28T16:02:42.7686796Z     [90m189|[39m     throw new Error(`Webapp failed to start.\nOutput:\n${output}\n\nOr…
2026-07-28T16:02:42.7687714Z     [90m   |[39m           [31m^[39m
2026-07-28T16:02:42.7688278Z     [90m190|[39m   }
2026-07-28T16:02:42.7688764Z     [90m191|[39m
2026-07-28T16:02:42.7689934Z [90m [2m❯[22m startTestServer ../../internal-packages/testcontainers/src/webapp.ts:[2m243:21[22m[39m
2026-07-28T16:02:42.7691196Z [90m [2m❯[22m test/api-auth.e2e.test.ts:[2m24:12[22m[39m
2026-07-28T16:02:42.7692066Z 
2026-07-28T16:02:42.7692750Z [31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯[22m[39m
2026-07-28T16:02:42.7693132Z 
2026-07-28T16:02:42.7694488Z [41m[1m FAIL [22m[49m test/healthcheck-require-plugins.e2e.test.ts[2m > [22m/healthcheck with REQUIRE_PLUGINS[2m > [22mREQUIRE_PLUGINS=1 + plugin missing
2026-07-28T16:02:42.7695896Z [31m[1mError[22m: Webapp failed to start.
2026-07-28T16:02:42.7696379Z Output:
2026-07-28T16:02:42.7696997Z 🔦 Tracer: Logger exporter enabled (sampling = 0.05)
2026-07-28T16:02:42.7697398Z 
2026-07-28T16:02:42.7698798Z 🔌 setting up prisma client to postgres://test@localhost:32769/test?connection_limit=10&pool_timeout=60&connection_timeout=20&application_name=trigger.dev+webapp
2026-07-28T16:02:42.7700312Z 
2026-07-28T16:02:42.7700597Z 🔌 prisma client connected
2026-07-28T16:02:42.7700853Z 
2026-07-28T16:02:42.7701226Z 🔌 No database replica, using the regular client
2026-07-28T16:02:42.7701774Z 
2026-07-28T16:02:42.7702384Z ❗ database schema unspecified, will default to `public` schema
2026-07-28T16:02:42.7702818Z 
2026-07-28T16:02:42.7703279Z 🗃️  Clickhouse service enabled to host localhost:19123
2026-07-28T16:02:42.7703676Z 
2026-07-28T16:02:42.7705090Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:00:25.212Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:02:42.7706092Z 
2026-07-28T16:02:42.7706665Z [2026-07-28T16:00:25.213Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:02:42.7707427Z 
2026-07-28T16:02:42.7709125Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:00:25.215Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:02:42.7710811Z 
2026-07-28T16:02:42.7711420Z [2026-07-28T16:00:25.215Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:02:42.7712181Z 
2026-07-28T16:02:42.7713679Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:00:25.215Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:02:42.7714734Z 
2026-07-28T16:02:42.7715345Z [2026-07-28T16:00:25.215Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:02:42.7717387Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:00:25.216Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:02:42.7719006Z [2026-07-28T16:00:25.216Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:02:42.7721040Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:00:25.216Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:02:42.7722893Z [2026-07-28T16:00:25.216Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:02:42.7723486Z 
2026-07-28T16:02:42.7725170Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:00:25.217Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:02:42.7726216Z 
2026-07-28T16:02:42.7726820Z [2026-07-28T16:00:25.217Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:02:42.7727401Z 
2026-07-28T16:02:42.7728840Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:00:25.217Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:02:42.7730911Z 
2026-07-28T16:02:42.7731721Z [2026-07-28T16:00:25.218Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:02:42.7732320Z 
2026-07-28T16:02:42.7733439Z {"timestamp":"2026-07-28T16:00:25.231Z","name":"RunEngine","message":"RunEngine FairQueueSelectionStrategy queueSelectionStrategyOptions","level":"log"}
2026-07-28T16:02:42.7734417Z 
2026-07-28T16:02:42.7735785Z {"consumerCount":3,"drrQuantum":25,"defaultConcurrency":5,"consumersEnabled":false,"timestamp":"2026-07-28T16:00:25.248Z","name":"RunEngine","message":"BatchQueue initialized","level":"info"}
2026-07-28T16:02:42.7736941Z 
2026-07-28T16:02:42.7738149Z {"timestamp":"2026-07-28T16:00:25.726Z","name":"UpdateMetadataService","message":"[UpdateMetadataService] 🚽 Flushing started","level":"info"}
2026-07-28T16:02:42.7739014Z 
2026-07-28T16:02:42.7739777Z /home/runner/work/Flowcordia/Flowcordia/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/types.cjs:2498
2026-07-28T16:02:42.7741041Z             const discriminatorValues = getDiscriminator(type.shape[discriminator]);
2026-07-28T16:02:42.7742086Z                                                                    ^
2026-07-28T16:02:42.7742445Z 
2026-07-28T16:02:42.7742908Z TypeError: Cannot read properties of undefined (reading 'transport')
2026-07-28T16:02:42.7744190Z     at Object.create (/home/runner/work/Flowcordia/Flowcordia/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/types.cjs:2498:68)
2026-07-28T16:02:42.7745940Z     at app/features/flowcordia/setup/emailConfiguration.server.ts (/home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:50696:66)
2026-07-28T16:02:42.7747353Z     at /home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:8:56
2026-07-28T16:02:42.7748548Z     at app/services/email.server.ts (/home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:50771:5)
2026-07-28T16:02:42.7749715Z     at /home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:8:56
2026-07-28T16:02:42.7751177Z     at app/features/flowcordia/workflows/approval/notification.server.ts (/home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:85945:5)
2026-07-28T16:02:42.7753292Z     at /home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:8:56
2026-07-28T16:02:42.7754863Z     at app/features/flowcordia/workflows/approval/notification-processing.server.ts (/home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:86207:5)
2026-07-28T16:02:42.7756346Z     at /home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:8:56
2026-07-28T16:02:42.7757558Z     at app/v3/alertsWorker.server.ts (/home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:87176:5)
2026-07-28T16:02:42.7758299Z 
2026-07-28T16:02:42.7758454Z Node.js v20.20.2
2026-07-28T16:02:42.7758664Z 
2026-07-28T16:02:42.7758673Z 
2026-07-28T16:02:42.7759653Z Original error: Error: Webapp did not become healthy at http://localhost:36547/healthcheck within 60000ms[39m
2026-07-28T16:02:42.7761333Z [90m [2m❯[22m Object.create ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/types.cjs:[2m2498:68[22m[39m
2026-07-28T16:02:42.7763713Z [90m [2m❯[22m app/features/flowcordia/setup/emailConfiguration.server.ts app/features/flowcordia/setup/emailConfiguration.server.ts:[2m73:57[22m[39m
2026-07-28T16:02:42.7765094Z [90m [2m❯[22m build/index.js:[2m8:56[22m[39m
2026-07-28T16:02:42.7766146Z [90m [2m❯[22m app/services/email.server.ts app/services/email.server.ts:[2m6:0[22m[39m
2026-07-28T16:02:42.7767128Z [90m [2m❯[22m build/index.js:[2m8:56[22m[39m
2026-07-28T16:02:42.7769167Z [90m [2m❯[22m app/features/flowcordia/workflows/approval/notification.server.ts app/features/flowcordia/workflows/approval/notification.server.ts:[2m11:0[22m[39m
2026-07-28T16:02:42.7770688Z [90m [2m❯[22m build/index.js:[2m8:56[22m[39m
2026-07-28T16:02:42.7772991Z [90m [2m❯[22m app/features/flowcordia/workflows/approval/notification-processing.server.ts app/features/flowcordia/workflows/approval/notification-processing.server.ts:[2m10:0[22m[39m
2026-07-28T16:02:42.7774691Z [90m [2m❯[22m build/index.js:[2m8:56[22m[39m
2026-07-28T16:02:42.7775812Z [90m [2m❯[22m app/v3/alertsWorker.server.ts app/v3/alertsWorker.server.ts:[2m5:0[22m[39m
2026-07-28T16:02:42.7777249Z [36m [2m❯[22m startWebapp ../../internal-packages/testcontainers/src/webapp.ts:[2m189:11[22m[39m
2026-07-28T16:02:42.7778430Z     [90m187|[39m     proc[33m.[39m[34mkill[39m([32m"SIGTERM"[39m)[33m;[39m
2026-07-28T16:02:42.7779894Z     [90m188|[39m     [35mconst[39m output [33m=[39m [[33m...[39mstdout[33m,[39m [33m...[39mstderr][33m.[39m[34mjoin[39m([32m"\n"[39m)[33m;[39m
2026-07-28T16:02:42.7781320Z     [90m189|[39m     throw new Error(`Webapp failed to start.\nOutput:\n${output}\n\nOr…
2026-07-28T16:02:42.7782902Z     [90m   |[39m           [31m^[39m
2026-07-28T16:02:42.7783408Z     [90m190|[39m   }
2026-07-28T16:02:42.7783811Z     [90m191|[39m
2026-07-28T16:02:42.7784899Z [90m [2m❯[22m startTestServer ../../internal-packages/testcontainers/src/webapp.ts:[2m243:21[22m[39m
2026-07-28T16:02:42.7786557Z [90m [2m❯[22m test/healthcheck-require-plugins.e2e.test.ts:[2m42:16[22m[39m
2026-07-28T16:02:42.7787109Z 
2026-07-28T16:02:42.7787540Z [31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯[22m[39m
2026-07-28T16:02:42.7787918Z 
2026-07-28T16:02:42.7789743Z [41m[1m FAIL [22m[49m test/healthcheck-require-plugins.e2e.test.ts[2m > [22m/healthcheck with REQUIRE_PLUGINS[2m > [22mREQUIRE_PLUGINS unset + plugin missing
2026-07-28T16:02:42.7791716Z [31m[1mError[22m: Webapp failed to start.
2026-07-28T16:02:42.7792524Z Output:
2026-07-28T16:02:42.7793176Z 🔦 Tracer: Logger exporter enabled (sampling = 0.05)
2026-07-28T16:02:42.7796129Z 
2026-07-28T16:02:42.7799168Z 🔌 setting up prisma client to postgres://test@localhost:32778/test?connection_limit=10&pool_timeout=60&connection_timeout=20&application_name=trigger.dev+webapp
2026-07-28T16:02:42.7800324Z 
2026-07-28T16:02:42.7800592Z 🔌 prisma client connected
2026-07-28T16:02:42.7800866Z 
2026-07-28T16:02:42.7801243Z 🔌 No database replica, using the regular client
2026-07-28T16:02:42.7802091Z 
2026-07-28T16:02:42.7802628Z ❗ database schema unspecified, will default to `public` schema
2026-07-28T16:02:42.7803083Z 
2026-07-28T16:02:42.7803515Z 🗃️  Clickhouse service enabled to host localhost:19123
2026-07-28T16:02:42.7803893Z 
2026-07-28T16:02:42.7805287Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:01:30.756Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:02:42.7806269Z 
2026-07-28T16:02:42.7806838Z [2026-07-28T16:01:30.758Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:02:42.7807397Z 
2026-07-28T16:02:42.7808787Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:01:30.759Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:02:42.7809777Z 
2026-07-28T16:02:42.7810349Z [2026-07-28T16:01:30.759Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:02:42.7811110Z 
2026-07-28T16:02:42.7812734Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:01:30.759Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:02:42.7813767Z 
2026-07-28T16:02:42.7814359Z [2026-07-28T16:01:30.759Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:02:42.7814958Z 
2026-07-28T16:02:42.7816616Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:01:30.760Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:02:42.7817653Z 
2026-07-28T16:02:42.7818244Z [2026-07-28T16:01:30.760Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:02:42.7818820Z 
2026-07-28T16:02:42.7820261Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:01:30.760Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:02:42.7821271Z 
2026-07-28T16:02:42.7822086Z [2026-07-28T16:01:30.760Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:02:42.7822669Z 
2026-07-28T16:02:42.7824119Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:01:30.761Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:02:42.7825147Z 
2026-07-28T16:02:42.7825728Z [2026-07-28T16:01:30.761Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:02:42.7826298Z 
2026-07-28T16:02:42.7827750Z {"url":"http://:redacted@localhost:19123/","timestamp":"2026-07-28T16:01:30.761Z","name":"ClickHouse","message":"🏠 Initializing ClickHouse client with url","level":"info"}
2026-07-28T16:02:42.7828762Z 
2026-07-28T16:02:42.7829301Z [2026-07-28T16:01:30.761Z][INFO][@clickhouse/client][Connection] Log level is set to INFO
2026-07-28T16:02:42.7829846Z 
2026-07-28T16:02:42.7830959Z {"timestamp":"2026-07-28T16:01:30.770Z","name":"RunEngine","message":"RunEngine FairQueueSelectionStrategy queueSelectionStrategyOptions","level":"log"}
2026-07-28T16:02:42.7832158Z 
2026-07-28T16:02:42.7833567Z {"consumerCount":3,"drrQuantum":25,"defaultConcurrency":5,"consumersEnabled":false,"timestamp":"2026-07-28T16:01:30.779Z","name":"RunEngine","message":"BatchQueue initialized","level":"info"}
2026-07-28T16:02:42.7834700Z 
2026-07-28T16:02:42.7835934Z {"timestamp":"2026-07-28T16:01:31.196Z","name":"UpdateMetadataService","message":"[UpdateMetadataService] 🚽 Flushing started","level":"info"}
2026-07-28T16:02:42.7836838Z 
2026-07-28T16:02:42.7837624Z /home/runner/work/Flowcordia/Flowcordia/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/types.cjs:2498
2026-07-28T16:02:42.7838847Z             const discriminatorValues = getDiscriminator(type.shape[discriminator]);
2026-07-28T16:02:42.7839671Z                                                                    ^
2026-07-28T16:02:42.7840036Z 
2026-07-28T16:02:42.7840569Z TypeError: Cannot read properties of undefined (reading 'transport')
2026-07-28T16:02:42.7842298Z     at Object.create (/home/runner/work/Flowcordia/Flowcordia/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/types.cjs:2498:68)
2026-07-28T16:02:42.7844064Z     at app/features/flowcordia/setup/emailConfiguration.server.ts (/home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:50696:66)
2026-07-28T16:02:42.7845450Z     at /home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:8:56
2026-07-28T16:02:42.7846640Z     at app/services/email.server.ts (/home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:50771:5)
2026-07-28T16:02:42.7847803Z     at /home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:8:56
2026-07-28T16:02:42.7849292Z     at app/features/flowcordia/workflows/approval/notification.server.ts (/home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:85945:5)
2026-07-28T16:02:42.7850757Z     at /home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:8:56
2026-07-28T16:02:42.7852532Z     at app/features/flowcordia/workflows/approval/notification-processing.server.ts (/home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:86207:5)
2026-07-28T16:02:42.7854066Z     at /home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:8:56
2026-07-28T16:02:42.7855295Z     at app/v3/alertsWorker.server.ts (/home/runner/work/Flowcordia/Flowcordia/apps/webapp/build/index.js:87176:5)
2026-07-28T16:02:42.7856046Z 
2026-07-28T16:02:42.7856199Z Node.js v20.20.2
2026-07-28T16:02:42.7856398Z 
2026-07-28T16:02:42.7856407Z 
2026-07-28T16:02:42.7857551Z Original error: Error: Webapp did not become healthy at http://localhost:44611/healthcheck within 60000ms[39m
2026-07-28T16:02:42.7859205Z [90m [2m❯[22m Object.create ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/types.cjs:[2m2498:68[22m[39m
2026-07-28T16:02:42.7861243Z [90m [2m❯[22m app/features/flowcordia/setup/emailConfiguration.server.ts app/features/flowcordia/setup/emailConfiguration.server.ts:[2m73:57[22m[39m
2026-07-28T16:02:42.7862848Z [90m [2m❯[22m build/index.js:[2m8:56[22m[39m
2026-07-28T16:02:42.7863887Z [90m [2m❯[22m app/services/email.server.ts app/services/email.server.ts:[2m6:0[22m[39m
2026-07-28T16:02:42.7864902Z [90m [2m❯[22m build/index.js:[2m8:56[22m[39m
2026-07-28T16:02:42.7866779Z [90m [2m❯[22m app/features/flowcordia/workflows/approval/notification.server.ts app/features/flowcordia/workflows/approval/notification.server.ts:[2m11:0[22m[39m
2026-07-28T16:02:42.7868318Z [90m [2m❯[22m build/index.js:[2m8:56[22m[39m
2026-07-28T16:02:42.7870446Z [90m [2m❯[22m app/features/flowcordia/workflows/approval/notification-processing.server.ts app/features/flowcordia/workflows/approval/notification-processing.server.ts:[2m10:0[22m[39m
2026-07-28T16:02:42.7872499Z [90m [2m❯[22m build/index.js:[2m8:56[22m[39m
2026-07-28T16:02:42.7873647Z [90m [2m❯[22m app/v3/alertsWorker.server.ts app/v3/alertsWorker.server.ts:[2m5:0[22m[39m
2026-07-28T16:02:42.7875067Z [36m [2m❯[22m startWebapp ../../internal-packages/testcontainers/src/webapp.ts:[2m189:11[22m[39m
2026-07-28T16:02:42.7876258Z     [90m187|[39m     proc[33m.[39m[34mkill[39m([32m"SIGTERM"[39m)[33m;[39m
2026-07-28T16:02:42.7877774Z     [90m188|[39m     [35mconst[39m output [33m=[39m [[33m...[39mstdout[33m,[39m [33m...[39mstderr][33m.[39m[34mjoin[39m([32m"\n"[39m)[33m;[39m
2026-07-28T16:02:42.7879216Z     [90m189|[39m     throw new Error(`Webapp failed to start.\nOutput:\n${output}\n\nOr…
2026-07-28T16:02:42.7880045Z     [90m   |[39m           [31m^[39m
2026-07-28T16:02:42.7880531Z     [90m190|[39m   }
2026-07-28T16:02:42.7880931Z     [90m191|[39m
2026-07-28T16:02:42.7882245Z [90m [2m❯[22m startTestServer ../../internal-packages/testcontainers/src/webapp.ts:[2m243:21[22m[39m
2026-07-28T16:02:42.7883605Z [90m [2m❯[22m test/healthcheck-require-plugins.e2e.test.ts:[2m70:16[22m[39m
2026-07-28T16:02:42.7884165Z 
2026-07-28T16:02:42.7884569Z [31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯[22m[39m
2026-07-28T16:02:42.7885152Z 
2026-07-28T16:02:42.7885181Z 
2026-07-28T16:02:42.7885690Z [2m Test Files [22m [1m[31m2 failed[39m[22m[90m (2)[39m
2026-07-28T16:02:42.7886513Z [2m      Tests [22m [33m34 skipped[39m[90m (34)[39m
2026-07-28T16:02:42.7887163Z [2m   Start at [22m 16:00:03
2026-07-28T16:02:42.7888315Z [2m   Duration [22m 159.08s[2m (transform 329ms, setup 0ms, import 1.46s, tests 223.11s, environment 0ms)[22m
2026-07-28T16:02:42.7888999Z 
2026-07-28T16:02:42.8340278Z ##[error]Process completed with exit code 1.
2026-07-28T16:02:42.8450356Z Post job cleanup.
2026-07-28T16:02:42.9945932Z Pruning is unnecessary.
2026-07-28T16:02:43.0104475Z Post job cleanup.
2026-07-28T16:02:43.1108221Z [command]/usr/bin/git version
2026-07-28T16:02:43.1155275Z git version 2.54.0
2026-07-28T16:02:43.1204111Z Temporarily overriding HOME='/home/runner/work/_temp/ea90f44f-5698-4bc8-84f8-f3a906d94944' before making global git config changes
2026-07-28T16:02:43.1205656Z Adding repository directory to the temporary git global config as a safe directory
2026-07-28T16:02:43.1210437Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/Flowcordia/Flowcordia
2026-07-28T16:02:43.1244751Z Removing SSH command configuration
2026-07-28T16:02:43.1252014Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
2026-07-28T16:02:43.1288353Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
2026-07-28T16:02:43.1551797Z Removing HTTP extra header
2026-07-28T16:02:43.1558037Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
2026-07-28T16:02:43.1599979Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
2026-07-28T16:02:43.1874729Z Removing includeIf entries pointing to credentials config files
2026-07-28T16:02:43.1884671Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
2026-07-28T16:02:43.1957240Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
2026-07-28T16:02:43.2366759Z Cleaning up orphan processes
```
