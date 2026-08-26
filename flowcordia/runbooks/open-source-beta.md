# Open-source beta quickstart

## Supported beta boundary

The initial Flowcordia beta is a GitHub-first, single-server self-hosted product. The supported
path is:

- Linux `amd64` with Docker Engine and Docker Compose v2;
- one Flowcordia installation on one host;
- one installation owner, with additional users invited after email is configured;
- repositories connected through a GitHub App installed only on selected repositories;
- the bundled PostgreSQL, Redis, ClickHouse, Electric, MinIO, S2, registry, Studio builder, and
  Trigger.dev execution supervisor;
- Studio authoring, independent TypeScript Source authoring, test, stage, deploy, execute, and
  GitHub proposal synchronization through the documented first-party path.

This beta does not promise high availability, ARM images, a managed service, uptime or response
SLAs, arbitrary Activepieces Enterprise features, arbitrary third-party pieces, or compatibility
with an unreviewed Trigger.dev upgrade. Back up the installation and use synthetic data until your
own acceptance run passes.

## 1. Prepare the host

Use the exact repository tag or commit that produced the release image. Install Docker Engine,
Docker Compose v2, Git, and OpenSSL. Allocate at least 8 vCPU, 16 GB RAM, and persistent disk for a
practical first installation.

Download these artifacts from the same successful **Publish Flowcordia self-host image** workflow:

- immutable image reference (`ghcr.io/...@sha256:...`);
- `flowcordia-release-manifest.json`;
- publication evidence and attestation bundle.

Do not install from `latest` or another mutable tag.

## 2. Create deployment configuration

From the matching checkout:

```bash
sudo install -d -m 0700 -o 1000 -g 1000 /opt/flowcordia
sudo -u '#1000' bash ./docker/scripts/generate-flowcordia-bundled-secrets.sh /opt/flowcordia
```

Place the downloaded manifest at `/opt/flowcordia/release-manifest.json`. In
`deployment.env`, replace every `<replace-...>` value with the exact release output and set the
public HTTPS `APP_ORIGIN` and `LOGIN_ORIGIN`. In `deployment.secrets`, configure the GitHub App
private key and an email provider.

The first owner can be claimed without receiving an email. Email is still required before using
invitations, password reset, or accepting the release preflight.

## 3. Create the GitHub App

Create one GitHub App owned by the account or organization that will install it.

Use these URLs, replacing the example origin with `APP_ORIGIN`:

```text
Homepage URL: https://flowcordia.example.com
Setup URL: https://flowcordia.example.com/github/callback
Webhook URL: https://flowcordia.example.com/webhooks/flowcordia/github
Callback URL: leave empty (the GitHub App does not use OAuth user authorization)
```

Enable webhook delivery with the same random secret stored as `GITHUB_APP_WEBHOOK_SECRET`.

Repository permissions:

- Contents: read and write;
- Pull requests: read and write;
- Checks: read-only;
- Commit statuses: read-only;
- Metadata: read-only (automatically granted by GitHub).

Subscribe to `push`, `pull_request`, `pull_request_review`, `check_run`, `check_suite`, and
`status`. Install the App only on repositories Flowcordia should access. Generate a private key,
then keep the PEM outside Git and paste it only into the protected setup form or secrets file.

## 4. Validate and start

```bash
pnpm exec tsx scripts/flowcordia-bundled-validate.ts \
  --config /opt/flowcordia/deployment.env \
  --secrets /opt/flowcordia/deployment.secrets \
  --manifest /opt/flowcordia/release-manifest.json \
  --registry-auth /opt/flowcordia/registry.htpasswd

bash ./docker/scripts/flowcordia-bundled.sh \
  /opt/flowcordia/deployment.env \
  /opt/flowcordia/deployment.secrets
```

Terminate TLS in a reverse proxy and forward the public hostname to `127.0.0.1:3030`. Do not
publish the database, object-store API, registry, supervisor, or Docker proxy ports.

## 5. Claim and configure the installation

1. Open `https://flowcordia.example.com/setup/owner`.
2. Create the first owner. This route disables itself atomically after the owner exists.
3. Continue through `/setup/first-run`.
4. Enter the GitHub App ID, slug, private key, and webhook secret if they were not supplied by the
   environment.
5. Install the App, select a repository and production branch, create or import the starter
   workflow, then synchronize.
6. Open Studio only after setup reports the exact repository head as ready.

## 6. Accept the beta installation

Before using real credentials, complete one synthetic journey:

1. create a manual workflow with a mapping or HTTP step;
2. save it and reload Studio to prove draft recovery;
3. run **Test** and inspect bounded input/output;
4. stage and deploy it through the Studio builder;
5. execute it through the Trigger.dev supervisor;
6. push a governed proposal and verify the pull request contains canonical workflow JSON and
   generated TypeScript;
7. synchronize the merged production head;
8. restart the stack and confirm the workflow, run history, credentials, and repository binding
   remain available;
9. run `flowcordia doctor` and preserve only its sanitized artifact.

Do not call an installation beta-ready when this journey fails. Use
[`bundled-self-host-deployment.md`](bundled-self-host-deployment.md) for backup, upgrade, rollback,
and recovery rules. Report defects through [`../../SUPPORT.md`](../../SUPPORT.md) and security
issues through [`../../SECURITY.md`](../../SECURITY.md).
