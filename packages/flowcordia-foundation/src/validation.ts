import { Ajv2020, type ErrorObject, type Options, type ValidateFunction } from "ajv/dist/2020.js";
import { z } from "zod";

export { z };
export type { ErrorObject, ValidateFunction };

export function createJsonSchemaValidator(options: Options = {}): Ajv2020 {
  return new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: false,
    validateFormats: false,
    messages: true,
    ...options,
  });
}

export function schemaPathSegments(error: ErrorObject): ReadonlyArray<string | number> {
  const pointer = error.instancePath;
  const segments: Array<string | number> = pointer
    .split("/")
    .slice(1)
    .map((segment: string) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))
    .map((segment: string) => (/^(0|[1-9]\d*)$/.test(segment) ? Number(segment) : segment));
  if (error.keyword === "required" && typeof error.params.missingProperty === "string") {
    segments.push(error.params.missingProperty);
  }
  if (
    error.keyword === "additionalProperties" &&
    typeof error.params.additionalProperty === "string"
  ) {
    segments.push(error.params.additionalProperty);
  }
  return segments;
}
