from pathlib import Path

path = Path("flowcordia/connections/README.md")
content = path.read_text()
anchor = "| Operations-readiness command | Durable worker heartbeat, proposal outbox, reconciliation schedules, and proposal aggregates | Produce one authenticated release snapshot for the selected tenant/project/repository without claiming work or exposing operational secrets | Repeatable-read, retry-aware, browser-bounded query implemented |"
row = "| Operator installation preflight | Environment configuration | Validate web, worker, and release configuration shape before migrations or connected checks without serializing values | Deterministic read-only CLI and schema `0.1` projection implemented; provider reachability remains separate |"

if row not in content:
    if content.count(anchor) != 1:
        raise SystemExit("installation preflight connection anchor is not exact")
    path.write_text(content.replace(anchor, f"{row}\n{anchor}", 1))
