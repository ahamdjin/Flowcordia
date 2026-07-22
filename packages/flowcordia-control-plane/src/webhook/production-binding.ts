import { createHash } from "node:crypto";

const INTERNAL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const WORKFLOW_ID_PATTERN = /^[a-z][a-z0-9_-]{2,127}$/;
const NODE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CREDENTIAL_REFERENCE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const CREDENTIAL_ENVIRONMENT_PATTERN = /^FLOWCORDIA_WEBHOOK_HMAC_[A-Z0-9_]{1,200}$/;
const WEBHOOK_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export const PRODUCTION_WEBHOOK_REVOCATION_REASONS = [
  "credential_compromise",
  "unexpected_traffic",
  "workflow_retired",
  "manual_emergency_stop",
] as const;
export type ProductionWebhookRevocationReason =
  (typeof PRODUCTION_WEBHOOK_REVOCATION_REASONS)[number];
const REVOCATION_REASONS = new Set<string>(PRODUCTION_WEBHOOK_REVOCATION_REASONS);

export interface ProductionWebhookBindingScope {
  tenantId: string;
  projectId: string;
  environmentId: string;
  workflowId: string;
  nodeId: string;
}

export interface ProductionWebhookBindingRevisionInput extends ProductionWebhookBindingScope {
  proposalId: string;
  mergeCommitSha: string;
  workflowPath: string;
  workflowBlobSha: string;
  workflowCanonicalSha256: string;
  deploymentId: string;
  deploymentShortCode: string;
  workerId: string;
  workerVersion: string;
  taskIdentifier: string;
  method: string;
  path: string;
  maxBodyBytes: number;
  timestampToleranceSeconds: number;
  credentialReference: string;
  credentialEnvironmentName: string;
  credentialVersion: string;
}

export interface ProductionWebhookEndpointRecord extends ProductionWebhookBindingScope {
  storageId: string;
  publicId: string;
  activeRevisionId: string | null;
  revokedAt: Date | null;
  revokedByUserId: string | null;
  revocationReason: ProductionWebhookRevocationReason | null;
}

export interface ProductionWebhookRevisionRecord extends ProductionWebhookBindingRevisionInput {
  storageId: string;
  endpointId: string;
  revision: number;
  fingerprint: string;
  createdAt: Date;
}

export interface ProductionWebhookBindingTransaction {
  ensureEndpoint(input: {
    scope: ProductionWebhookBindingScope;
    publicId: string;
    now: Date;
  }): Promise<ProductionWebhookEndpointRecord>;
  findRevisionByFingerprint(input: {
    endpointId: string;
    fingerprint: string;
  }): Promise<ProductionWebhookRevisionRecord | null>;
  createRevision(input: {
    endpointId: string;
    fingerprint: string;
    binding: ProductionWebhookBindingRevisionInput;
    createdAt: Date;
  }): Promise<ProductionWebhookRevisionRecord>;
  activateRevision(input: {
    endpointId: string;
    revisionId: string;
    activatedAt: Date;
  }): Promise<boolean>;
  revokeEndpoint(input: {
    scope: ProductionWebhookBindingScope;
    expectedPublicId: string;
    actorId: string;
    reason: ProductionWebhookRevocationReason;
    revokedAt: Date;
  }): Promise<
    | {
        status: "revoked" | "already_revoked";
        endpoint: ProductionWebhookEndpointRecord;
      }
    | { status: "not_found" }
  >;
}

export interface ProductionWebhookBindingStore {
  transaction<T>(
    callback: (transaction: ProductionWebhookBindingTransaction) => Promise<T>
  ): Promise<T>;
}

export interface ActivateProductionWebhookBindingInput {
  binding: ProductionWebhookBindingRevisionInput;
  proposedPublicId: string;
  activatedAt: Date;
}

export interface ActivatedProductionWebhookBinding {
  endpointStorageId: string;
  endpointPublicId: string;
  revisionStorageId: string;
  revision: number;
  fingerprint: string;
  changed: boolean;
}

export interface RevokeProductionWebhookBindingInput {
  scope: ProductionWebhookBindingScope;
  expectedPublicId: string;
  actorId: string;
  reason: ProductionWebhookRevocationReason;
  revokedAt: Date;
}

export interface RevokedProductionWebhookBinding {
  endpointStorageId: string;
  endpointPublicId: string;
  changed: boolean;
  revokedAt: Date;
  reason: ProductionWebhookRevocationReason;
}

export class ProductionWebhookBindingValidationError extends Error {
  readonly code = "invalid_production_webhook_binding";

  constructor(message: string) {
    super(message);
    this.name = "ProductionWebhookBindingValidationError";
  }
}

export class ProductionWebhookBindingRevokedError extends Error {
  readonly code = "production_webhook_binding_revoked";

  constructor() {
    super("The production webhook endpoint has been revoked.");
    this.name = "ProductionWebhookBindingRevokedError";
  }
}

export class ProductionWebhookBindingNotFoundError extends Error {
  readonly code = "production_webhook_binding_not_found";

  constructor() {
    super("The exact production webhook endpoint was not found.");
    this.name = "ProductionWebhookBindingNotFoundError";
  }
}

export class ProductionWebhookBindingConcurrencyError extends Error {
  readonly code = "production_webhook_binding_concurrency";

  constructor() {
    super("The production webhook binding changed concurrently.");
    this.name = "ProductionWebhookBindingConcurrencyError";
  }
}

function validDate(value: Date): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function boundedText(field: string, value: string, maximum: number): void {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) {
    throw new ProductionWebhookBindingValidationError(`${field} is invalid.`);
  }
}

function validateScope(scope: ProductionWebhookBindingScope): void {
  for (const [field, value] of [
    ["tenantId", scope.tenantId],
    ["projectId", scope.projectId],
    ["environmentId", scope.environmentId],
  ] as const) {
    if (!INTERNAL_ID_PATTERN.test(value)) {
      throw new ProductionWebhookBindingValidationError(`${field} is invalid.`);
    }
  }
  if (!WORKFLOW_ID_PATTERN.test(scope.workflowId)) {
    throw new ProductionWebhookBindingValidationError("workflowId is invalid.");
  }
  if (!NODE_ID_PATTERN.test(scope.nodeId)) {
    throw new ProductionWebhookBindingValidationError("nodeId is invalid.");
  }
}

function validateBinding(binding: ProductionWebhookBindingRevisionInput): void {
  validateScope(binding);
  for (const [field, value] of [
    ["proposalId", binding.proposalId],
    ["deploymentId", binding.deploymentId],
    ["workerId", binding.workerId],
  ] as const) {
    if (!INTERNAL_ID_PATTERN.test(value)) {
      throw new ProductionWebhookBindingValidationError(`${field} is invalid.`);
    }
  }
  if (!GIT_SHA_PATTERN.test(binding.mergeCommitSha)) {
    throw new ProductionWebhookBindingValidationError("mergeCommitSha is invalid.");
  }
  if (!GIT_SHA_PATTERN.test(binding.workflowBlobSha)) {
    throw new ProductionWebhookBindingValidationError("workflowBlobSha is invalid.");
  }
  if (!SHA256_PATTERN.test(binding.workflowCanonicalSha256)) {
    throw new ProductionWebhookBindingValidationError("workflowCanonicalSha256 is invalid.");
  }
  boundedText("workflowPath", binding.workflowPath, 512);
  boundedText("deploymentShortCode", binding.deploymentShortCode, 128);
  boundedText("workerVersion", binding.workerVersion, 128);
  boundedText("taskIdentifier", binding.taskIdentifier, 160);
  if (!WEBHOOK_METHODS.has(binding.method)) {
    throw new ProductionWebhookBindingValidationError("method is invalid.");
  }
  boundedText("path", binding.path, 256);
  if (!binding.path.startsWith("/")) {
    throw new ProductionWebhookBindingValidationError("path is invalid.");
  }
  if (
    !Number.isSafeInteger(binding.maxBodyBytes) ||
    binding.maxBodyBytes < 1 ||
    binding.maxBodyBytes > 5_242_880
  ) {
    throw new ProductionWebhookBindingValidationError("maxBodyBytes is invalid.");
  }
  if (
    !Number.isSafeInteger(binding.timestampToleranceSeconds) ||
    binding.timestampToleranceSeconds < 30 ||
    binding.timestampToleranceSeconds > 900
  ) {
    throw new ProductionWebhookBindingValidationError("timestampToleranceSeconds is invalid.");
  }
  if (!CREDENTIAL_REFERENCE_PATTERN.test(binding.credentialReference)) {
    throw new ProductionWebhookBindingValidationError("credentialReference is invalid.");
  }
  if (!CREDENTIAL_ENVIRONMENT_PATTERN.test(binding.credentialEnvironmentName)) {
    throw new ProductionWebhookBindingValidationError("credentialEnvironmentName is invalid.");
  }
  boundedText("credentialVersion", binding.credentialVersion, 128);
}

function validateRevocation(input: RevokeProductionWebhookBindingInput): void {
  validateScope(input.scope);
  if (!PUBLIC_ID_PATTERN.test(input.expectedPublicId)) {
    throw new ProductionWebhookBindingValidationError("expectedPublicId is invalid.");
  }
  if (!INTERNAL_ID_PATTERN.test(input.actorId)) {
    throw new ProductionWebhookBindingValidationError("actorId is invalid.");
  }
  if (!REVOCATION_REASONS.has(input.reason)) {
    throw new ProductionWebhookBindingValidationError("reason is invalid.");
  }
  if (!validDate(input.revokedAt)) {
    throw new ProductionWebhookBindingValidationError("revokedAt is invalid.");
  }
}

export function productionWebhookBindingFingerprint(
  binding: ProductionWebhookBindingRevisionInput
): string {
  validateBinding(binding);
  return createHash("sha256")
    .update(
      JSON.stringify([
        binding.tenantId,
        binding.projectId,
        binding.environmentId,
        binding.workflowId,
        binding.nodeId,
        binding.proposalId,
        binding.mergeCommitSha,
        binding.workflowPath,
        binding.workflowBlobSha,
        binding.workflowCanonicalSha256,
        binding.deploymentId,
        binding.deploymentShortCode,
        binding.workerId,
        binding.workerVersion,
        binding.taskIdentifier,
        binding.method,
        binding.path,
        binding.maxBodyBytes,
        binding.timestampToleranceSeconds,
        binding.credentialReference,
        binding.credentialEnvironmentName,
        binding.credentialVersion,
      ])
    )
    .digest("hex");
}

export class ProductionWebhookBindingService {
  constructor(private readonly store: ProductionWebhookBindingStore) {}

  async activate(
    input: ActivateProductionWebhookBindingInput
  ): Promise<ActivatedProductionWebhookBinding> {
    validateBinding(input.binding);
    if (!PUBLIC_ID_PATTERN.test(input.proposedPublicId)) {
      throw new ProductionWebhookBindingValidationError("proposedPublicId is invalid.");
    }
    if (!validDate(input.activatedAt)) {
      throw new ProductionWebhookBindingValidationError("activatedAt is invalid.");
    }
    const fingerprint = productionWebhookBindingFingerprint(input.binding);
    return this.store.transaction(async (transaction) => {
      const endpoint = await transaction.ensureEndpoint({
        scope: input.binding,
        publicId: input.proposedPublicId,
        now: input.activatedAt,
      });
      if (endpoint.revokedAt) throw new ProductionWebhookBindingRevokedError();

      let revision = await transaction.findRevisionByFingerprint({
        endpointId: endpoint.storageId,
        fingerprint,
      });
      if (!revision) {
        revision = await transaction.createRevision({
          endpointId: endpoint.storageId,
          fingerprint,
          binding: input.binding,
          createdAt: input.activatedAt,
        });
      }
      if (endpoint.activeRevisionId === revision.storageId) {
        return {
          endpointStorageId: endpoint.storageId,
          endpointPublicId: endpoint.publicId,
          revisionStorageId: revision.storageId,
          revision: revision.revision,
          fingerprint,
          changed: false,
        };
      }
      const activated = await transaction.activateRevision({
        endpointId: endpoint.storageId,
        revisionId: revision.storageId,
        activatedAt: input.activatedAt,
      });
      if (!activated) throw new ProductionWebhookBindingConcurrencyError();
      return {
        endpointStorageId: endpoint.storageId,
        endpointPublicId: endpoint.publicId,
        revisionStorageId: revision.storageId,
        revision: revision.revision,
        fingerprint,
        changed: true,
      };
    });
  }

  async revoke(
    input: RevokeProductionWebhookBindingInput
  ): Promise<RevokedProductionWebhookBinding> {
    validateRevocation(input);
    return this.store.transaction(async (transaction) => {
      const result = await transaction.revokeEndpoint(input);
      if (result.status === "not_found") {
        throw new ProductionWebhookBindingNotFoundError();
      }
      const endpoint = result.endpoint;
      if (!endpoint.revokedAt || !endpoint.revokedByUserId || !endpoint.revocationReason) {
        throw new ProductionWebhookBindingConcurrencyError();
      }
      return {
        endpointStorageId: endpoint.storageId,
        endpointPublicId: endpoint.publicId,
        changed: result.status === "revoked",
        revokedAt: endpoint.revokedAt,
        reason: endpoint.revocationReason,
      };
    });
  }
}
