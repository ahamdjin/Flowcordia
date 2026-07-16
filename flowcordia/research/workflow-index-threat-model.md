# Workflow index threat model

## Protected assets

- tenant and project repository binding;
- GitHub App installation credentials;
- exact workflow source identity;
- canonical workflow integrity;
- credential values and configuration values;
- durable catalog availability;
- synchronization leases and audit evidence.

## Primary threats and controls

| Threat | Control |
| --- | --- |
| browser selects another repository or installation | resource routes resolve all scope server-side and recheck the current connection |
| branch moves during indexing | branch resolves once; all discovery and content reads use the immutable commit |
| partial GitHub tree accepted as complete | truncated trees fail the full synchronization |
| invalid workflow rendered | invalid documents are durable `INVALID` entries and canvas loading is blocked |
| stale database entry points to different Git content | Studio proves commit, blob, path, workflow ID, and canonical digest on every graph load |
| webhook spoofing | existing HMAC verification occurs before push normalization or persistence |
| webhook replay mutation | delivery ID is bound to payload SHA-256; mismatched bytes are rejected |
| duplicate or concurrent workers replace newer state | generation plus lease token required for completion |
| worker crash deletes catalog | replacement is one transaction after complete discovery; prior catalog remains until commit |
| credential/configuration disclosure | browser DTO omits configuration values and all credential values/internal identities |
| GitHub outage erases visible state | failed sync preserves the last complete index and records a safe failure |
| index worker affects customer runs | no imports or registration with run engine, deployment, supervisor, or customer runtime |

## Residual risks

- Repository trees large enough to be truncated require a future reviewed subtree traversal.
- Credential-reference names and configuration key names are visible to authorized Studio readers by design.
- Manual synchronization performs GitHub reads during an HTTP request and is bounded by the operational lease; very large allowed catalogs should normally use the worker path.
