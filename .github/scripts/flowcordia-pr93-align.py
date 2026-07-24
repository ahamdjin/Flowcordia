from pathlib import Path


path = Path(".github/workflows/flowcordia-launch-campaign-readiness.yml")
lines = path.read_text(encoding="utf-8").splitlines()


def insert_after_once(needle: str, additions: list[str], label: str) -> None:
    indexes = [index for index, line in enumerate(lines) if line == needle]
    if len(indexes) != 1:
        raise SystemExit(f"Expected one {label} line, found {len(indexes)}")
    index = indexes[0]
    lines[index + 1 : index + 1] = additions


insert_after_once(
    "      AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}",
    [
        "      AWS_SESSION_TOKEN: ${{ secrets.AWS_SESSION_TOKEN }}",
        "      OBJECT_STORE_DEFAULT_PROTOCOL: ${{ vars.OBJECT_STORE_DEFAULT_PROTOCOL }}",
    ],
    "provider AWS credential",
)
insert_after_once(
    "      CLICKHOUSE_URL: ${{ secrets.CLICKHOUSE_URL }}",
    ['      ALERTS_WORKER_ENABLED: "true"'],
    "alert ClickHouse configuration",
)
insert_after_once(
    "      ALERTS_WORKER_REDIS_PORT: ${{ vars.ALERTS_WORKER_REDIS_PORT }}",
    ["      ALERTS_WORKER_REDIS_USERNAME: ${{ secrets.ALERTS_WORKER_REDIS_USERNAME }}"],
    "alert Redis port",
)
alert_region_pair = [
    "      ALERT_SMTP_PASSWORD: ${{ secrets.ALERT_SMTP_PASSWORD }}",
    "      AWS_REGION: ${{ vars.AWS_REGION }}",
]
for index in range(len(lines) - 1):
    if lines[index : index + 2] == alert_region_pair:
        del lines[index + 1]
        break
else:
    raise SystemExit("Expected one alert AWS region line")

path.write_text("\n".join(lines) + "\n", encoding="utf-8")
