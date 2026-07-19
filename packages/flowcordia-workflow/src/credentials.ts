export const FLOWCORDIA_MAX_CREDENTIAL_REFERENCES = 16;
export const FLOWCORDIA_CREDENTIAL_REFERENCE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export interface FlowcordiaCredentialReferenceIssue {
  code: "invalid_reference" | "duplicate_reference" | "too_many_references";
  message: string;
  index?: number;
}

export function isFlowcordiaCredentialReference(value: string): boolean {
  return (
    value.length >= 1 && value.length <= 64 && FLOWCORDIA_CREDENTIAL_REFERENCE_PATTERN.test(value)
  );
}

export function flowcordiaCredentialEnvironmentName(reference: string): string {
  return `FLOWCORDIA_CREDENTIAL_${reference.toUpperCase().replace(/-/g, "_")}`;
}

export function validateFlowcordiaCredentialReferences(
  references: readonly string[]
): FlowcordiaCredentialReferenceIssue[] {
  const issues: FlowcordiaCredentialReferenceIssue[] = [];
  if (references.length > FLOWCORDIA_MAX_CREDENTIAL_REFERENCES) {
    issues.push({
      code: "too_many_references",
      message: `A node may bind at most ${FLOWCORDIA_MAX_CREDENTIAL_REFERENCES} credential references.`,
    });
  }
  const seen = new Set<string>();
  references.forEach((reference, index) => {
    if (!isFlowcordiaCredentialReference(reference)) {
      issues.push({
        code: "invalid_reference",
        index,
        message:
          "Credential references must be 1-64 lowercase characters, start with a letter, and use only letters, numbers, or single hyphens.",
      });
    }
    if (seen.has(reference)) {
      issues.push({
        code: "duplicate_reference",
        index,
        message: `Credential reference "${reference}" is duplicated.`,
      });
    }
    seen.add(reference);
  });
  return issues;
}
