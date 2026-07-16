import {
  CURRENT_WORKFLOW_SCHEMA_VERSION,
  type WorkflowDefinition,
  type WorkflowIssue,
} from "./types.js";
import { validateWorkflow } from "./validation.js";

type UnknownRecord = Record<string, unknown>;

export interface WorkflowMigration {
  fromVersion: string;
  toVersion: string;
  migrate: (document: UnknownRecord) => unknown;
}

export type WorkflowMigrationResult =
  | {
      success: true;
      workflow: WorkflowDefinition;
      appliedMigrations: ReadonlyArray<{ fromVersion: string; toVersion: string }>;
      issues: [];
    }
  | {
      success: false;
      appliedMigrations: ReadonlyArray<{ fromVersion: string; toVersion: string }>;
      issues: WorkflowIssue[];
    };

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function migrationIssue(code: WorkflowIssue["code"], message: string): WorkflowIssue {
  return {
    code,
    message,
    path: ["schemaVersion"],
    entity: { type: "workflow" },
  };
}

function cloneDocument(document: UnknownRecord): UnknownRecord {
  return structuredClone(document);
}

export function migrateWorkflowDocument(
  input: unknown,
  migrations: readonly WorkflowMigration[] = []
): WorkflowMigrationResult {
  const appliedMigrations: Array<{ fromVersion: string; toVersion: string }> = [];

  if (!isRecord(input)) {
    return {
      success: false,
      appliedMigrations,
      issues: [migrationIssue("invalid_type", "Workflow migration input must be an object.")],
    };
  }

  if (typeof input.schemaVersion !== "string" || input.schemaVersion.length === 0) {
    return {
      success: false,
      appliedMigrations,
      issues: [migrationIssue("required", '"schemaVersion" is required before migration.')],
    };
  }

  const migrationsBySource = new Map<string, WorkflowMigration>();
  for (const migration of migrations) {
    if (migrationsBySource.has(migration.fromVersion)) {
      return {
        success: false,
        appliedMigrations,
        issues: [
          migrationIssue(
            "migration_failed",
            `More than one migration starts at version "${migration.fromVersion}".`
          ),
        ],
      };
    }
    migrationsBySource.set(migration.fromVersion, migration);
  }

  let document: UnknownRecord;
  try {
    document = cloneDocument(input);
  } catch {
    return {
      success: false,
      appliedMigrations,
      issues: [migrationIssue("migration_failed", "Workflow document could not be cloned safely.")],
    };
  }

  const visitedVersions = new Set<string>();
  while (document.schemaVersion !== CURRENT_WORKFLOW_SCHEMA_VERSION) {
    const currentVersion = document.schemaVersion;
    if (typeof currentVersion !== "string") {
      return {
        success: false,
        appliedMigrations,
        issues: [
          migrationIssue("migration_failed", "A migration removed the workflow schema version."),
        ],
      };
    }

    if (visitedVersions.has(currentVersion)) {
      return {
        success: false,
        appliedMigrations,
        issues: [
          migrationIssue(
            "migration_cycle",
            `Migration cycle detected at version "${currentVersion}".`
          ),
        ],
      };
    }
    visitedVersions.add(currentVersion);

    const migration = migrationsBySource.get(currentVersion);
    if (!migration) {
      return {
        success: false,
        appliedMigrations,
        issues: [
          migrationIssue(
            "migration_missing",
            `No migration path exists from version "${currentVersion}" to "${CURRENT_WORKFLOW_SCHEMA_VERSION}".`
          ),
        ],
      };
    }

    try {
      const migrated = migration.migrate(cloneDocument(document));
      if (!isRecord(migrated)) {
        throw new TypeError("Migration output must be an object.");
      }
      if (migrated.schemaVersion !== migration.toVersion) {
        throw new TypeError(
          `Migration declared "${migration.toVersion}" but returned "${String(migrated.schemaVersion)}".`
        );
      }
      document = migrated;
      appliedMigrations.push({
        fromVersion: migration.fromVersion,
        toVersion: migration.toVersion,
      });
    } catch (error) {
      return {
        success: false,
        appliedMigrations,
        issues: [
          migrationIssue(
            "migration_failed",
            error instanceof Error ? error.message : `Migration from "${currentVersion}" failed.`
          ),
        ],
      };
    }
  }

  const validation = validateWorkflow(document);
  if (!validation.success) {
    return {
      success: false,
      appliedMigrations,
      issues: validation.issues,
    };
  }

  return {
    success: true,
    workflow: validation.workflow,
    appliedMigrations,
    issues: [],
  };
}
