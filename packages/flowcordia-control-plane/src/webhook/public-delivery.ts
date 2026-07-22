const INTERNAL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const WORKFLOW_ID_PATTERN = /^[a-z][a-z0-9_-]{2,127}$/;
const DELIVERY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const LEASE_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/;
const MAX_LEASE_MS = 5 * 60 * 1000;

export type PublicWebhookDeliveryStatus = "RECEIVED" | "TRIGGERED" | "FAILED";

export interface PublicWebhookDeliveryScope {
  /** Internal database identity. Never accepted directly from a public route. */
  tenantId: string;
  /** Internal database identity. Never accepted directly from a public route. */
  projectId: string;
  /** Exact production runtime-environment database identity. */
  environmentId: string;
  /** Canonical workflow identity resolved from the deployed repository index. */
  workflowId: string;
  /** Stable internal endpoint identity resolved from the public ID. */
  endpointId: string;
}

export interface PublicWebhookDeliveryRecord extends PublicWebhookDeliveryScope {
  storageId: string;
  deliveryId: string;
  payloadHash: string;
  status: PublicWebhookDeliveryStatus;
  attempts: number;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  runFriendlyId: string | null;
  failureCode: string | null;
  receivedAt: Date;
  completedAt: Date | null;
}

export interface ReservePublicWebhookDeliveryInput extends PublicWebhookDeliveryScope {
  deliveryId: string;
  payloadHash: string;
  receivedAt: Date;
  now: Date;
  leaseToken: string;
  leaseExpiresAt: Date;
}

export type PublicWebhookDeliveryReservation =
  | {
      status: "acquired";
      storageId: string;
      attempts: number;
      resumed: boolean;
      leaseToken: string;
      leaseExpiresAt: Date;
    }
  | {
      status: "in_progress";
      storageId: string;
      attempts: number;
      leaseExpiresAt: Date;
    }
  | {
      status: "completed";
      storageId: string;
      attempts: number;
      runFriendlyId: string;
      completedAt: Date;
    };

export interface PublicWebhookDeliveryTransaction {
  insertDelivery(
    input: ReservePublicWebhookDeliveryInput
  ): Promise<
    | { status: "inserted"; delivery: PublicWebhookDeliveryRecord }
    | { status: "duplicate"; delivery: PublicWebhookDeliveryRecord }
  >;
  reacquireDelivery(input: {
    storageId: string;
    payloadHash: string;
    now: Date;
    leaseToken: string;
    leaseExpiresAt: Date;
  }): Promise<PublicWebhookDeliveryRecord | null>;
  completeDelivery(input: {
    storageId: string;
    leaseToken: string;
    runFriendlyId: string;
    completedAt: Date;
  }): Promise<boolean>;
  failDelivery(input: {
    storageId: string;
    leaseToken: string;
    failureCode: string;
    completedAt: Date;
  }): Promise<boolean>;
}

export interface PublicWebhookDeliveryStore {
  transaction<T>(
    callback: (transaction: PublicWebhookDeliveryTransaction) => Promise<T>
  ): Promise<T>;
}

export class PublicWebhookDeliveryValidationError extends Error {
  readonly code = "invalid_public_webhook_delivery";

  constructor(message: string) {
    super(message);
    this.name = "PublicWebhookDeliveryValidationError";
  }
}

export class PublicWebhookReplayMismatchError extends Error {
  readonly code = "public_webhook_replay_mismatch";

  constructor() {
    super("Webhook delivery identity was reused with a different payload digest.");
    this.name = "PublicWebhookReplayMismatchError";
  }
}

export class PublicWebhookDeliveryConcurrencyError extends Error {
  readonly code = "public_webhook_delivery_concurrency";

  constructor(message = "Webhook delivery ownership changed concurrently.") {
    super(message);
    this.name = "PublicWebhookDeliveryConcurrencyError";
  }
}

function validDate(value: Date): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function validateScope(scope: PublicWebhookDeliveryScope): void {
  for (const [field, value] of [
    ["tenantId", scope.tenantId],
    ["projectId", scope.projectId],
    ["environmentId", scope.environmentId],
    ["endpointId", scope.endpointId],
  ] as const) {
    if (!INTERNAL_ID_PATTERN.test(value)) {
      throw new PublicWebhookDeliveryValidationError(`${field} is invalid.`);
    }
  }
  if (!WORKFLOW_ID_PATTERN.test(scope.workflowId)) {
    throw new PublicWebhookDeliveryValidationError("workflowId is invalid.");
  }
}

function validateReservation(input: ReservePublicWebhookDeliveryInput): void {
  validateScope(input);
  if (!DELIVERY_ID_PATTERN.test(input.deliveryId)) {
    throw new PublicWebhookDeliveryValidationError("deliveryId is invalid.");
  }
  if (!SHA256_PATTERN.test(input.payloadHash)) {
    throw new PublicWebhookDeliveryValidationError(
      "payloadHash must be a lowercase SHA-256 digest."
    );
  }
  if (!LEASE_TOKEN_PATTERN.test(input.leaseToken)) {
    throw new PublicWebhookDeliveryValidationError("leaseToken is invalid.");
  }
  if (!validDate(input.receivedAt) || !validDate(input.now) || !validDate(input.leaseExpiresAt)) {
    throw new PublicWebhookDeliveryValidationError("Webhook delivery timestamps are invalid.");
  }
  if (input.leaseExpiresAt.getTime() <= input.now.getTime()) {
    throw new PublicWebhookDeliveryValidationError(
      "Webhook delivery lease must expire in the future."
    );
  }
  if (input.leaseExpiresAt.getTime() - input.now.getTime() > MAX_LEASE_MS) {
    throw new PublicWebhookDeliveryValidationError("Webhook delivery lease exceeds five minutes.");
  }
}

function validateCompletion(input: {
  storageId: string;
  leaseToken: string;
  completedAt: Date;
}): void {
  if (!INTERNAL_ID_PATTERN.test(input.storageId)) {
    throw new PublicWebhookDeliveryValidationError("storageId is invalid.");
  }
  if (!LEASE_TOKEN_PATTERN.test(input.leaseToken)) {
    throw new PublicWebhookDeliveryValidationError("leaseToken is invalid.");
  }
  if (!validDate(input.completedAt)) {
    throw new PublicWebhookDeliveryValidationError("completedAt is invalid.");
  }
}

function reservationFromAcquired(
  delivery: PublicWebhookDeliveryRecord,
  resumed: boolean
): Extract<PublicWebhookDeliveryReservation, { status: "acquired" }> {
  if (!delivery.leaseToken || !delivery.leaseExpiresAt) {
    throw new PublicWebhookDeliveryConcurrencyError(
      "Acquired webhook delivery has no active lease."
    );
  }
  return {
    status: "acquired",
    storageId: delivery.storageId,
    attempts: delivery.attempts,
    resumed,
    leaseToken: delivery.leaseToken,
    leaseExpiresAt: delivery.leaseExpiresAt,
  };
}

export class PublicWebhookDeliveryService {
  constructor(private readonly store: PublicWebhookDeliveryStore) {}

  async reserve(
    input: ReservePublicWebhookDeliveryInput
  ): Promise<PublicWebhookDeliveryReservation> {
    validateReservation(input);
    return this.store.transaction(async (transaction) => {
      const result = await transaction.insertDelivery(input);
      const delivery = result.delivery;
      if (result.status === "inserted") return reservationFromAcquired(delivery, false);
      if (delivery.payloadHash !== input.payloadHash) throw new PublicWebhookReplayMismatchError();
      if (delivery.status === "TRIGGERED") {
        if (!delivery.runFriendlyId || !delivery.completedAt) {
          throw new PublicWebhookDeliveryConcurrencyError(
            "Completed webhook delivery is missing immutable run evidence."
          );
        }
        return {
          status: "completed",
          storageId: delivery.storageId,
          attempts: delivery.attempts,
          runFriendlyId: delivery.runFriendlyId,
          completedAt: delivery.completedAt,
        };
      }
      if (
        delivery.status === "RECEIVED" &&
        delivery.leaseExpiresAt &&
        delivery.leaseExpiresAt.getTime() > input.now.getTime()
      ) {
        return {
          status: "in_progress",
          storageId: delivery.storageId,
          attempts: delivery.attempts,
          leaseExpiresAt: delivery.leaseExpiresAt,
        };
      }
      const reacquired = await transaction.reacquireDelivery({
        storageId: delivery.storageId,
        payloadHash: input.payloadHash,
        now: input.now,
        leaseToken: input.leaseToken,
        leaseExpiresAt: input.leaseExpiresAt,
      });
      if (!reacquired) throw new PublicWebhookDeliveryConcurrencyError();
      return reservationFromAcquired(reacquired, true);
    });
  }

  async complete(input: {
    storageId: string;
    leaseToken: string;
    runFriendlyId: string;
    completedAt: Date;
  }): Promise<void> {
    validateCompletion(input);
    if (!INTERNAL_ID_PATTERN.test(input.runFriendlyId)) {
      throw new PublicWebhookDeliveryValidationError("runFriendlyId is invalid.");
    }
    const completed = await this.store.transaction((transaction) =>
      transaction.completeDelivery(input)
    );
    if (!completed) throw new PublicWebhookDeliveryConcurrencyError();
  }

  async fail(input: {
    storageId: string;
    leaseToken: string;
    failureCode: string;
    completedAt: Date;
  }): Promise<void> {
    validateCompletion(input);
    if (!/^[a-z][a-z0-9_]{2,63}$/.test(input.failureCode)) {
      throw new PublicWebhookDeliveryValidationError("failureCode is invalid.");
    }
    const failed = await this.store.transaction((transaction) => transaction.failDelivery(input));
    if (!failed) throw new PublicWebhookDeliveryConcurrencyError();
  }
}
