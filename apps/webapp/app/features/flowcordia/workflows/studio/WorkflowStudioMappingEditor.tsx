import {
  FLOWCORDIA_MAPPING_MAX_ENTRIES,
  FLOWCORDIA_MAPPING_MODES,
  parseFlowcordiaMappingConfiguration,
  type FlowcordiaMappingMode,
  type JsonObject,
  type JsonValue,
} from "@flowcordia/workflow";
import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/primitives/Buttons";

const inputClassName =
  "w-full rounded border border-grid-bright bg-background-dimmed px-2.5 py-2 text-xs text-text-bright outline-none transition placeholder:text-text-dimmed focus:border-indigo-400";

type LiteralType = "string" | "number" | "boolean" | "null";

type MappingRow = {
  target: string;
  kind: "source" | "literal";
  source: string;
  required: boolean;
  literalType: LiteralType;
  literalText: string;
  literalBoolean: boolean;
};

type MappingDraft = {
  mode: FlowcordiaMappingMode;
  rows: MappingRow[];
};

function emptyRow(): MappingRow {
  return {
    target: "",
    kind: "source",
    source: "",
    required: false,
    literalType: "string",
    literalText: "",
    literalBoolean: false,
  };
}

function literalDraft(
  value: JsonValue
): Pick<MappingRow, "literalType" | "literalText" | "literalBoolean"> | null {
  if (value === null) return { literalType: "null", literalText: "", literalBoolean: false };
  if (typeof value === "string") {
    return { literalType: "string", literalText: value, literalBoolean: false };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return { literalType: "number", literalText: String(value), literalBoolean: false };
  }
  if (typeof value === "boolean") {
    return { literalType: "boolean", literalText: "", literalBoolean: value };
  }
  return null;
}

function createDraft(configuration: JsonObject): MappingDraft | { blocked: string } {
  if (
    configuration.mode === "replace" &&
    Array.isArray(configuration.entries) &&
    configuration.entries.length === 0 &&
    Object.keys(configuration).every((key) => key === "mode" || key === "entries")
  ) {
    return { mode: "replace", rows: [emptyRow()] };
  }
  const parsed = parseFlowcordiaMappingConfiguration(configuration);
  if (!parsed.success) {
    return {
      blocked:
        parsed.issues[0]?.message ??
        "The stored mapping is outside the safe visual contract and must be changed in code.",
    };
  }
  const rows: MappingRow[] = [];
  for (const entry of parsed.configuration.entries) {
    if ("source" in entry) {
      rows.push({
        ...emptyRow(),
        target: entry.target,
        source: entry.source,
        required: entry.required,
      });
      continue;
    }
    const literal = literalDraft(entry.value);
    if (!literal) {
      return {
        blocked:
          "Studio edits literal mapping values only when they are strings, numbers, booleans, or null. Preserve object and array literals in code.",
      };
    }
    rows.push({ ...emptyRow(), target: entry.target, kind: "literal", ...literal });
  }
  return { mode: parsed.configuration.mode, rows };
}

function literalValue(row: MappingRow): JsonValue | undefined {
  switch (row.literalType) {
    case "string":
      return row.literalText;
    case "number": {
      const value = Number(row.literalText);
      return row.literalText.trim() && Number.isFinite(value) ? value : undefined;
    }
    case "boolean":
      return row.literalBoolean;
    case "null":
      return null;
  }
}

function buildConfiguration(
  draft: MappingDraft
): { success: true; configuration: JsonObject } | { success: false; message: string } {
  const entries: JsonObject[] = [];
  for (const row of draft.rows) {
    if (row.kind === "source") {
      entries.push({ target: row.target, source: row.source, required: row.required });
      continue;
    }
    const value = literalValue(row);
    if (value === undefined) {
      return { success: false, message: "Literal number values must be finite numbers." };
    }
    entries.push({ target: row.target, value });
  }
  const parsed = parseFlowcordiaMappingConfiguration({ mode: draft.mode, entries });
  return parsed.success
    ? { success: true, configuration: parsed.configuration }
    : {
        success: false,
        message: parsed.issues[0]?.message ?? "The mapping configuration is invalid.",
      };
}

function fingerprint(value: JsonObject): string {
  return JSON.stringify(value);
}

export function WorkflowStudioMappingEditor({
  configuration,
  busy,
  onSave,
}: {
  configuration: JsonObject;
  busy: boolean;
  onSave: (configuration: JsonObject) => void;
}) {
  const [state, setState] = useState<MappingDraft | { blocked: string }>(() =>
    createDraft(configuration)
  );

  useEffect(() => setState(createDraft(configuration)), [configuration]);

  const result = useMemo(
    () =>
      "blocked" in state
        ? { success: false as const, message: state.blocked }
        : buildConfiguration(state),
    [state]
  );
  const unchanged =
    result.success && fingerprint(result.configuration) === fingerprint(configuration);

  if ("blocked" in state) {
    return (
      <div className="rounded border border-yellow-500/25 bg-yellow-500/10 px-2.5 py-2 text-xxs leading-4 text-yellow-200">
        {state.blocked} Studio will not reinterpret it through a lossy fallback.
      </div>
    );
  }

  const updateRow = (index: number, next: MappingRow) => {
    setState({
      ...state,
      rows: state.rows.map((row, rowIndex) => (rowIndex === index ? next : row)),
    });
  };

  return (
    <div className="space-y-3 rounded border border-grid-dimmed bg-background-dimmed p-3">
      <div>
        <div className="text-xxs font-medium text-text-bright">Data mapping</div>
        <div className="mt-1 text-xxs leading-4 text-text-dimmed">
          No expressions are accepted. Map reviewed input paths or scalar literals into
          deterministic output fields; scripts and runtime evaluation are blocked.
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-xxs text-text-dimmed">Output mode</span>
        <select
          className={inputClassName}
          value={state.mode}
          disabled={busy}
          onChange={(event) =>
            setState({
              ...state,
              mode: event.target.value as (typeof FLOWCORDIA_MAPPING_MODES)[number],
            })
          }
        >
          <option value="replace">Create a new object</option>
          <option value="merge">Merge fields into object input</option>
        </select>
      </label>

      <div className="space-y-2">
        {state.rows.map((row, index) => (
          <div
            key={index}
            className="space-y-2 rounded border border-grid-bright bg-background-bright p-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xxs font-medium text-text-bright">Field {index + 1}</span>
              <Button
                variant="minimal/small"
                disabled={busy || state.rows.length === 1}
                onClick={() =>
                  setState({
                    ...state,
                    rows: state.rows.filter((_, rowIndex) => rowIndex !== index),
                  })
                }
              >
                Remove
              </Button>
            </div>
            <label className="block">
              <span className="mb-1 block text-xxs text-text-dimmed">Target path</span>
              <input
                className={inputClassName}
                value={row.target}
                disabled={busy}
                maxLength={512}
                placeholder="customer.email"
                onChange={(event) => updateRow(index, { ...row, target: event.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xxs text-text-dimmed">Value source</span>
              <select
                className={inputClassName}
                value={row.kind}
                disabled={busy}
                onChange={(event) =>
                  updateRow(index, { ...row, kind: event.target.value as MappingRow["kind"] })
                }
              >
                <option value="source">Input path</option>
                <option value="literal">Literal value</option>
              </select>
            </label>
            {row.kind === "source" ? (
              <>
                <label className="block">
                  <span className="mb-1 block text-xxs text-text-dimmed">
                    Source path <span className="opacity-70">(empty means whole input)</span>
                  </span>
                  <input
                    className={inputClassName}
                    value={row.source}
                    disabled={busy}
                    maxLength={512}
                    placeholder="contact.email"
                    onChange={(event) => updateRow(index, { ...row, source: event.target.value })}
                  />
                </label>
                <label className="flex items-center gap-2 text-xxs text-text-dimmed">
                  <input
                    type="checkbox"
                    checked={row.required}
                    disabled={busy}
                    onChange={(event) =>
                      updateRow(index, { ...row, required: event.target.checked })
                    }
                  />
                  Fail the run when this source is missing
                </label>
              </>
            ) : (
              <>
                <label className="block">
                  <span className="mb-1 block text-xxs text-text-dimmed">Literal type</span>
                  <select
                    className={inputClassName}
                    value={row.literalType}
                    disabled={busy}
                    onChange={(event) =>
                      updateRow(index, { ...row, literalType: event.target.value as LiteralType })
                    }
                  >
                    <option value="string">Text</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                    <option value="null">Null</option>
                  </select>
                </label>
                {(row.literalType === "string" || row.literalType === "number") && (
                  <label className="block">
                    <span className="mb-1 block text-xxs text-text-dimmed">Literal value</span>
                    <input
                      className={inputClassName}
                      value={row.literalText}
                      disabled={busy}
                      inputMode={row.literalType === "number" ? "decimal" : "text"}
                      onChange={(event) =>
                        updateRow(index, { ...row, literalText: event.target.value })
                      }
                    />
                  </label>
                )}
                {row.literalType === "boolean" && (
                  <select
                    className={inputClassName}
                    value={String(row.literalBoolean)}
                    disabled={busy}
                    onChange={(event) =>
                      updateRow(index, { ...row, literalBoolean: event.target.value === "true" })
                    }
                  >
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <Button
        className="w-full justify-center"
        variant="minimal/small"
        disabled={busy || state.rows.length >= FLOWCORDIA_MAPPING_MAX_ENTRIES}
        onClick={() => setState({ ...state, rows: [...state.rows, emptyRow()] })}
      >
        Add field
      </Button>

      {!result.success && <div className="text-xxs leading-4 text-rose-300">{result.message}</div>}
      <Button
        className="w-full justify-center"
        variant="secondary/small"
        disabled={busy || !result.success || unchanged}
        onClick={() => result.success && onSave(result.configuration)}
      >
        Save mapping
      </Button>
    </div>
  );
}
