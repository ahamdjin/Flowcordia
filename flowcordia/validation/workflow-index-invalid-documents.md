# Invalid workflow handling

A canonical workflow file that can be located and read but fails schema parsing, migration, or validation is recorded as `INVALID` with one normalized issue. It remains visible so operators can fix the real repository file. It has no canonical digest, is never projected as graph data, and cannot be treated as executable.
