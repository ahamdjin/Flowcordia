# Workflow render proof

Before graph projection, Studio reads the selected workflow at the entry's source commit and verifies source path, blob SHA, workflow ID, and canonical SHA-256. A mismatch returns a normalized blocked state. The durable entry alone is insufficient authority to render the graph.
