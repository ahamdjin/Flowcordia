from __future__ import annotations

import base64
import hashlib
import py_compile
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARTS = ["00", "01", "02", "03", "04", "05", "06", "07", "08", "090", "091", "10", "11"]
HASHES = {
    "00": "cf947f2df9ef4dd40620081569d41230da2ae51174fb90d3a8a85b8d5413a408",
    "01": "daaf8ab9aede1a49f9f87b0039b56a6930444073f58e10e7555747fcfdcc4953",
    "02": "3c943335ce2d2b51b64427e921eca04bded64812d136fe1d5f8d81d0dfa49f9f",
    "03": "b6bec8efeac15a1f38a13a9ad807a102c3bffd6ebe4231ae5137a325735ff4bb",
    "04": "eeb764d6fc78b87e907d23a566e24721e40a531bd41a86cdfb725fcc61e6b24e",
    "05": "befc99241bf26dac45e793bbde42dce9977535eec05c07991771b17adb9391f7",
    "06": "dbfe991c945ca75f75e9f069e0f1d4453ac9bef1fddd87a2ab0851286e8a0390",
    "07": "075d0d18507431cc4557e6c433d5fb7bd0fb0e0016dac6a41bed84eb305aaf77",
    "08": "9d7c06eeb9ae70864e3cc76bcf7ac61917539a35d31f58daff7f37479b5ad3bc",
    "090": "df2a1a2b5e61ae818f9f0fd41d3f74e28c81b01708926f99cf3e79792faa8015",
    "091": "166ec8d33686da09cdb3900b60b4f91ec1c24540e125c06495f53f2fa36cf882",
    "10": "7b29c9168eee664d585e841f07f93018873c16f1fc9651c49d7eea3ce2cd878e",
    "11": "c1a2a3f296f4c7794bf69873ea9e376b4c733b66aefcc6386ba8067f0a1ced24",
}
ORIGINAL_SHA = "24b2d937cb7310e2e59fd6b68622740b66891541e8a9b3cdfc67c54534509e64"
CURRENT_SHA = "ba06d5c40231ecb12067070f094d90c2f578d42cfd34d98937b809a29af83835"


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def exact_replace(text: str, old: str, new: str, count: int) -> str:
    observed = text.count(old)
    if observed != count:
        raise SystemExit(f"transform anchor mismatch: expected {count}, found {observed}: {old[:100]!r}")
    return text.replace(old, new, count)


def main() -> None:
    decoded_parts: list[bytes] = []
    for index in PARTS:
        encoded = (ROOT / f"scripts/flowcordia_apply_approval_escalation.b64part{index}").read_text()
        decoded = base64.b64decode(encoded, validate=True)
        if index == "090":
            decoded = decoded.replace(b"Yellow", b"yellow")
            decoded = decoded.replace(b"<Bade ", b"<Badge ")
            decoded = decoded.replace(b"\n         )}", b"\n          )}")
        actual = digest(decoded)
        if actual != HASHES[index]:
            raise SystemExit(f"chunk {index} digest mismatch: expected {HASHES[index]}, got {actual}")
        decoded_parts.append(decoded)

    original = b"".join(decoded_parts)
    if digest(original) != ORIGINAL_SHA:
        raise SystemExit("original patch digest mismatch")
    text = original.decode("utf-8")

    marker = text.index("# Studio round-trip.")
    head, body = text[:marker], text[marker:]
    body = exact_replace(
        body,
        "'''import {\n  FLOWCORDIA_APPROVAL_MAX_INSTRUCTION_LENGTH,",
        "'''import {\n  FLOWCORDIA_API_TRIGGER_MAX_IDEMPOTENCY_TTL_SECONDS,\n  FLOWCORDIA_API_TRIGGER_MAX_QUEUE_TTL_SECONDS,\n  FLOWCORDIA_API_TRIGGER_MIN_IDEMPOTENCY_TTL_SECONDS,\n  FLOWCORDIA_API_TRIGGER_MIN_QUEUE_TTL_SECONDS,\n  FLOWCORDIA_APPROVAL_MAX_INSTRUCTION_LENGTH,",
        2,
    )
    body = exact_replace(
        body,
        "'''export {\n  FLOWCORDIA_APPROVAL_MAX_INSTRUCTION_LENGTH,",
        "'''export {\n  FLOWCORDIA_API_TRIGGER_MAX_IDEMPOTENCY_TTL_SECONDS,\n  FLOWCORDIA_API_TRIGGER_MAX_QUEUE_TTL_SECONDS,\n  FLOWCORDIA_API_TRIGGER_MIN_IDEMPOTENCY_TTL_SECONDS,\n  FLOWCORDIA_API_TRIGGER_MIN_QUEUE_TTL_SECONDS,\n  FLOWCORDIA_APPROVAL_MAX_INSTRUCTION_LENGTH,",
        2,
    )
    text = head + body
    text = exact_replace(
        text,
        "'''       timeoutSeconds: string;\n       requireComment: boolean;\n'''",
        "'''      timeoutSeconds: string;\n      requireComment: boolean;\n'''",
        1,
    )
    text = exact_replace(
        text,
        "         timeoutSeconds: String(parsed.configuration.timeoutSeconds),\n         requireComment: parsed.configuration.requireComment,",
        "        timeoutSeconds: String(parsed.configuration.timeoutSeconds),\n        requireComment: parsed.configuration.requireComment,",
        2,
    )
    text = exact_replace(
        text,
        "         timeoutSeconds: Number(draft.timeoutSeconds),\n         requireComment: draft.requireComment,",
        "        timeoutSeconds: Number(draft.timeoutSeconds),\n        requireComment: draft.requireComment,",
        2,
    )

    current = text.encode("utf-8")
    actual = digest(current)
    if actual != CURRENT_SHA:
        raise SystemExit(f"current-main patch digest mismatch: expected {CURRENT_SHA}, got {actual}")

    target = Path("/tmp/flowcordia_apply_approval_escalation_v4.py")
    target.write_bytes(current)
    py_compile.compile(str(target), doraise=True)
    subprocess.run(["python3", str(target)], check=True)


if __name__ == "__main__":
    main()
