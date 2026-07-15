# First useful Workflow Studio slice

A project member with GitHub read access can open Flowcordia Studio and inspect the real canonical workflows in the connected production repository. A member with GitHub write access can synchronize the repository immediately.

The user can see:

- repository and tracked branch;
- exact indexed commit;
- synchronization state and safe failures;
- valid and invalid workflow files;
- node and edge counts;
- a read-only visual graph;
- node kind, operation, configuration keys, credential references, runtime hints, and code references.

The slice is useful because every visible workflow and graph element comes from a proven GitHub source. It intentionally provides no editing controls until the save/proposal boundary exists.
