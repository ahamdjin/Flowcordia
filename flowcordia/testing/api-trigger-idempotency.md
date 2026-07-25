# API trigger idempotency and TTL acceptance

## Goal

Prove that Flowcordia projects bounded request controls into the inherited authenticated task endpoint instead of creating a parallel ingress or queue.

## Repository contracts

The focused gate proves:

- legacy empty API-trigger configuration receives safe defaults;
- unknown configuration fails closed;
- idempotency-key TTL is limited to 60 seconds through 30 days;
- queue-expiration TTL is limited to 60 seconds through 14 days;
- required idempotency keys are 1-256 characters;
- optional idempotency omits both key and key TTL when no key is supplied;
- generated compiler metadata identifies the exact native request fields and bounded duration strings;
- Studio round-trips only the three documented fields;
- the portable editor persists only normalized configuration;
- existing manual, schedule, and webhook bindings remain unchanged.

## Connected acceptance still required

A protected environment run must invoke one exact deployed API workflow through the project-access-token endpoint and preserve payload-free evidence for:

1. the first idempotent request;
2. a duplicate request inside the configured key TTL returning the original run;
3. a request after the key TTL creating a new run;
4. a queued run exceeding its configured queue TTL becoming expired before execution;
5. a failed run clearing its idempotency key according to the inherited runtime behavior.

Repository tests prove the request and compilation contract. They do not claim a configured production endpoint has executed these cases.
