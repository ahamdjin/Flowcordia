# Workflow index definition of done

This PR is not complete merely because the canvas renders. It is complete only when:

- discovery, validation, persistence, webhook scheduling, worker recovery, manual synchronization, query verification, and rendering form one tested path;
- the previous complete index survives every modeled failure;
- all scope comes from authenticated server state;
- exact Git source identity is proven twice: during indexing and before rendering;
- invalid or stale identity fails closed;
- the read surface is useful without claiming edit/runtime capabilities;
- full repository CI passes on the exact head;
- rollout and rollback are operationally executable.
