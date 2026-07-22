# Node package contract

Flowcordia node packages are versioned declarations of reviewed workflow capabilities. Schema `0.1` defines identity, configuration/input/output contracts, credential requirements, exact network origins, and one repository-owned runtime export without installing or executing package code.

## Manifest identity

A manifest contains:

- one reverse-domain package ID and semantic version;
- bounded publisher identity and optional credential-free HTTPS URL;
- 1–128 unique operation IDs and runtime operation identities;
- one positive catalog version per operation;
- an exact category-to-node-kind mapping;
- reviewed configuration, input, and output object schemas;
- declared capabilities, credentials, and exact HTTPS origins;
- one reviewed JavaScript or TypeScript path and export per operation.

Canonical serialization sorts object keys while preserving meaningful operation and capability order. The SHA-256 manifest digest binds the complete validated declaration.

## Trust boundary

Schema `0.1` does not install code, resolve dependencies, import runtime exports, create credentials, contact declared origins, publish a Studio node, or authorize execution. It validates only portable metadata and repository-owned runtime references.

Runtime source must remain outside Git control paths, GitHub workflow paths, canonical workflow files, and generated `trigger/flowcordia` artifacts. Only exact credential-free HTTPS origins are accepted. Credential values never appear in the manifest; declarations identify the required credential type and the existing project-environment ownership boundary.

A future package installer must separately prove:

1. package source and manifest digest;
2. publisher signature and trust policy;
3. dependency and license policy;
4. exact runtime build and sandbox behavior;
5. organization catalog approval;
6. credential authorization and network egress policy;
7. upgrade, deprecation, and rollback compatibility.

## Capability consistency

- `credential_references` requires at least one credential declaration.
- Credential declarations require `credential_references`.
- `network_access` requires at least one exact HTTPS origin.
- Network declarations require `network_access`.
- Trigger, action, logic, and output categories must map to trigger, action, control, and output node kinds respectively.

Invalid, unknown, duplicate, structurally ambiguous, or capability-inconsistent manifests fail closed before package identity is returned.
