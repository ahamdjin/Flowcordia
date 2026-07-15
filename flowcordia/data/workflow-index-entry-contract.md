# Workflow index entry contract

A valid entry includes workflow identity, canonical metadata, node and edge counts, exact source commit/blob/path, canonical SHA-256, and indexed time. An invalid entry includes the same source identity plus a normalized validation code and message, but no canonical digest or graph metadata. Transport failures do not create invalid entries; they fail the entire snapshot.
