import {
  createWorkflowFunctionPreviewValue,
  type JsonObject,
  type JsonValue,
} from "@flowcordia/workflow";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "~/components/primitives/Buttons";
import { cn } from "~/utils/cn";
import {
  removeWorkflowFunctionTestValue,
  setWorkflowFunctionTestValue,
  workflowFunctionTestHasPath,
  workflowFunctionTestPathKey,
  workflowFunctionTestValueAtPath,
  type WorkflowFunctionTestIssue,
  type WorkflowFunctionTestPath,
} from "./function-test-input";

const inputClassName =
  "w-full rounded border border-grid-bright bg-background-dimmed px-2.5 py-2 text-xs text-text-bright outline-none transition placeholder:text-text-dimmed focus:border-indigo-400";

function record(value: JsonValue | undefined): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function schemaRecord(value: JsonValue | undefined): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function schemaProperties(schema: JsonObject): Array<[string, JsonObject]> {
  const properties = schemaRecord(schema.properties);
  if (!properties) return [];
  const entries: Array<[string, JsonObject]> = [];
  for (const [key, value] of Object.entries(properties)) {
    const childSchema = schemaRecord(value);
    if (childSchema) entries.push([key, childSchema]);
  }
  return entries.sort(([left], [right]) => left.localeCompare(right));
}

function requiredProperties(schema: JsonObject): Set<string> {
  return new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((value): value is string => typeof value === "string")
      : []
  );
}

function fieldLabel(schema: JsonObject, fallback: string): string {
  return typeof schema.title === "string" && schema.title.length > 0 ? schema.title : fallback;
}

function fieldDescription(schema: JsonObject): string | null {
  return typeof schema.description === "string" && schema.description.length > 0
    ? schema.description
    : null;
}

function issuesAtPath(
  issues: readonly WorkflowFunctionTestIssue[],
  path: WorkflowFunctionTestPath
): WorkflowFunctionTestIssue[] {
  const key = workflowFunctionTestPathKey(path);
  return issues.filter((issue) => workflowFunctionTestPathKey(issue.path) === key);
}

function ScalarField({
  schema,
  value,
  disabled,
  onChange,
}: {
  schema: JsonObject;
  value: JsonValue | undefined;
  disabled: boolean;
  onChange: (value: JsonValue) => void;
}) {
  const enumValues = Array.isArray(schema.enum) ? schema.enum : null;
  if (enumValues && enumValues.length > 0) {
    return (
      <select
        className={inputClassName}
        value={JSON.stringify(value ?? enumValues[0])}
        disabled={disabled}
        onChange={(event) => onChange(JSON.parse(event.target.value) as JsonValue)}
      >
        {enumValues.map((candidate, index) => (
          <option key={`${JSON.stringify(candidate)}:${index}`} value={JSON.stringify(candidate)}>
            {typeof candidate === "string" ? candidate : JSON.stringify(candidate)}
          </option>
        ))}
      </select>
    );
  }

  switch (schema.type) {
    case "boolean":
      return (
        <select
          className={inputClassName}
          value={value === true ? "true" : "false"}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value === "true")}
        >
          <option value="false">False</option>
          <option value="true">True</option>
        </select>
      );
    case "number":
    case "integer":
      return (
        <input
          className={inputClassName}
          type="number"
          step={schema.type === "integer" ? 1 : "any"}
          min={typeof schema.minimum === "number" ? schema.minimum : undefined}
          max={typeof schema.maximum === "number" ? schema.maximum : undefined}
          value={typeof value === "number" ? value : 0}
          disabled={disabled}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            onChange(schema.type === "integer" ? Math.trunc(parsed) : parsed);
          }}
        />
      );
    case "null":
      return (
        <div className="rounded border border-grid-bright bg-background-dimmed px-2.5 py-2 font-mono text-xs text-text-dimmed">
          null
        </div>
      );
    case "string":
    default:
      return (
        <input
          className={inputClassName}
          type="text"
          minLength={typeof schema.minLength === "number" ? schema.minLength : undefined}
          maxLength={typeof schema.maxLength === "number" ? schema.maxLength : undefined}
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}

function SchemaField({
  schema,
  path,
  label,
  required,
  value,
  issues,
  disabled,
  onChange,
}: {
  schema: JsonObject;
  path: WorkflowFunctionTestPath;
  label: string;
  required: boolean;
  value: JsonValue;
  issues: readonly WorkflowFunctionTestIssue[];
  disabled: boolean;
  onChange: (value: JsonValue) => void;
}) {
  const present = workflowFunctionTestHasPath(value, path);
  const current = workflowFunctionTestValueAtPath(value, path);
  const fieldIssues = issuesAtPath(issues, path);
  const description = fieldDescription(schema);
  const displayLabel = fieldLabel(schema, label);

  if (!required && !present) {
    return (
      <div className="rounded border border-grid-dimmed bg-background-bright p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-text-bright">{displayLabel}</div>
            {description && <div className="mt-1 text-xxs text-text-dimmed">{description}</div>}
            <div className="mt-1 text-xxs text-text-dimmed">Optional</div>
          </div>
          <Button
            variant="secondary/small"
            LeadingIcon={PlusIcon}
            disabled={disabled}
            onClick={() =>
              onChange(
                setWorkflowFunctionTestValue(
                  value,
                  path,
                  createWorkflowFunctionPreviewValue(schema)
                )
              )
            }
          >
            Include
          </Button>
        </div>
      </div>
    );
  }

  const header = (
    <div className="mb-2 flex items-start justify-between gap-3">
      <div>
        <div className="text-xs font-medium text-text-bright">
          {displayLabel}
          {required && <span className="ml-1 text-rose-300">*</span>}
        </div>
        {description && <div className="mt-1 text-xxs text-text-dimmed">{description}</div>}
      </div>
      {!required && (
        <button
          type="button"
          className="text-xxs text-text-dimmed transition hover:text-rose-300"
          disabled={disabled}
          onClick={() => onChange(removeWorkflowFunctionTestValue(value, path))}
        >
          Remove
        </button>
      )}
    </div>
  );

  if (schema.type === "object") {
    const properties = schemaProperties(schema);
    const requiredSet = requiredProperties(schema);
    return (
      <fieldset className="rounded border border-grid-dimmed bg-background-bright p-3">
        {header}
        <div className="space-y-3">
          {properties.length === 0 ? (
            <div className="text-xxs text-text-dimmed">No declared fields.</div>
          ) : (
            properties.map(([key, childSchema]) => (
              <SchemaField
                key={key}
                schema={childSchema}
                path={[...path, key]}
                label={key}
                required={requiredSet.has(key)}
                value={value}
                issues={issues}
                disabled={disabled}
                onChange={onChange}
              />
            ))
          )}
        </div>
        {fieldIssues.map((issue) => (
          <div key={`${issue.code}:${issue.message}`} className="mt-2 text-xxs text-rose-300">
            {issue.message}
          </div>
        ))}
      </fieldset>
    );
  }

  if (schema.type === "array") {
    const entries = Array.isArray(current) ? current : [];
    const itemSchema = schemaRecord(schema.items) ?? { type: "null" };
    return (
      <fieldset className="rounded border border-grid-dimmed bg-background-bright p-3">
        {header}
        <div className="space-y-3">
          {entries.map((_, index) => (
            <div key={index} className="rounded border border-grid-dimmed p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xxs font-medium text-text-dimmed">Item {index + 1}</span>
                <button
                  type="button"
                  className="text-text-dimmed transition hover:text-rose-300"
                  disabled={disabled}
                  onClick={() => onChange(removeWorkflowFunctionTestValue(value, [...path, index]))}
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </div>
              <SchemaField
                schema={itemSchema}
                path={[...path, index]}
                label={`Item ${index + 1}`}
                required
                value={value}
                issues={issues}
                disabled={disabled}
                onChange={onChange}
              />
            </div>
          ))}
          <Button
            variant="secondary/small"
            LeadingIcon={PlusIcon}
            disabled={disabled}
            onClick={() =>
              onChange(
                setWorkflowFunctionTestValue(
                  value,
                  [...path, entries.length],
                  createWorkflowFunctionPreviewValue(itemSchema)
                )
              )
            }
          >
            Add item
          </Button>
        </div>
        {fieldIssues.map((issue) => (
          <div key={`${issue.code}:${issue.message}`} className="mt-2 text-xxs text-rose-300">
            {issue.message}
          </div>
        ))}
      </fieldset>
    );
  }

  return (
    <label className="block rounded border border-grid-dimmed bg-background-bright p-3">
      {header}
      <ScalarField
        schema={schema}
        value={current}
        disabled={disabled}
        onChange={(next) => onChange(setWorkflowFunctionTestValue(value, path, next))}
      />
      {fieldIssues.map((issue) => (
        <div key={`${issue.code}:${issue.message}`} className="mt-2 text-xxs text-rose-300">
          {issue.message}
        </div>
      ))}
    </label>
  );
}

export function WorkflowFunctionInputForm({
  schema,
  value,
  issues,
  disabled,
  onChange,
}: {
  schema: JsonObject;
  value: JsonValue;
  issues: readonly WorkflowFunctionTestIssue[];
  disabled: boolean;
  onChange: (value: JsonValue) => void;
}) {
  const properties = schemaProperties(schema);
  const required = requiredProperties(schema);
  const objectValue = record(value);

  return (
    <div className="space-y-3">
      {properties.map(([key, childSchema]) => (
        <SchemaField
          key={key}
          schema={childSchema}
          path={[key]}
          label={key}
          required={required.has(key)}
          value={objectValue}
          issues={issues}
          disabled={disabled}
          onChange={onChange}
        />
      ))}
      {properties.length === 0 && (
        <div className="rounded border border-grid-dimmed bg-background-bright px-3 py-4 text-xs text-text-dimmed">
          This function accepts an empty object.
        </div>
      )}
    </div>
  );
}
