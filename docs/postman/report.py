"""Turn a Newman JSON export into a compact results file and an endpoint-coverage table.

The raw Newman export contains every access token, one-time password and response body, so it is never committed.
This keeps only what proves the run: per request the expected and actual status, each assertion and its result, and the
time taken; and for every operation of the API which requests exercised it.

    cd backend/pm-api && source .venv/bin/activate
    npx newman run ../../docs/postman/acme-pm-api.postman_collection.json -e ../../docs/postman/localstack.postman_environment.json \\
        --reporters cli,json --reporter-json-export /tmp/newman-localstack.json
    python ../../docs/postman/report.py /tmp/newman-localstack.json localstack http://localhost:3001/api/pm-api

Writes docs/postman/results/postman-results-<environment>.json.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent.parent / "backend" / "pm-api"))


def flatten(items: list[dict], folder: str = "") -> list[tuple[str, dict]]:
    out: list[tuple[str, dict]] = []
    for item in items:
        if "item" in item:
            out += flatten(item["item"], item["name"])
        else:
            out.append((folder, item))
    return out


def normalise(path: str) -> str:
    """`/projects/{{project_id}}/team` and `/projects/{project_id}/team` both become `/projects/{}/team`."""
    return re.sub(r"\{\{[^}]*\}\}|\{[^}/]*\}", "{}", path)


def request_path(item: dict) -> str:
    url = item["request"]["url"]
    raw = url["raw"] if isinstance(url, dict) else url
    return re.sub(r"^\{\{baseUrl\}\}", "", raw).split("?")[0]


def main(export_path: str, environment: str, base_url: str) -> int:
    from app.main import app  # the API's own list of operations (OpenAPI)

    collection = json.loads((HERE / "acme-pm-api.postman_collection.json").read_text())
    export = json.loads(Path(export_path).read_text())
    executions = export["run"]["executions"]
    ordered = flatten(collection["item"])
    if len(ordered) != len(executions):
        print(f"collection has {len(ordered)} requests but the run has {len(executions)}", file=sys.stderr)
        return 2

    requests = []
    for (folder, item), run in zip(ordered, executions, strict=True):
        assert item["name"] == run["item"]["name"], (item["name"], run["item"]["name"])
        assertions = [
            {"name": a["assertion"], "passed": not a.get("error") and not a.get("skipped", False)} for a in run.get("assertions", [])
        ]
        expected = next((int(m.group(1)) for line in item.get("event", [{}])[0].get("script", {}).get("exec", [])
                         if (m := re.search(r"Status code is (\d{3})", line))), None)
        requests.append({
            "folder": folder,
            "name": item["name"],
            "method": item["request"]["method"],
            "path": request_path(item),
            "status": run["response"]["code"],
            "expected_status": expected,
            "response_ms": run["response"]["responseTime"],
            "passed": all(a["passed"] for a in assertions) and bool(assertions),
            "assertions": assertions,
        })

    operations = []
    for path, methods in sorted(app.openapi()["paths"].items()):
        for method in sorted(methods):
            hits = [r for r in requests if r["method"] == method.upper() and normalise(r["path"]) == normalise(path)]
            operations.append({
                "method": method.upper(),
                "path": path,
                "requests": len(hits),
                "statuses_seen": sorted({r["status"] for r in hits}),
                "all_passed": bool(hits) and all(r["passed"] for r in hits),
                "request_names": [r["name"] for r in hits],
            })
    uncovered = [f"{o['method']} {o['path']}" for o in operations if not o["requests"]]

    stats = export["run"]["stats"]
    result = {
        "generated_at": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
        "environment": environment,
        "base_url": base_url,
        "summary": {
            "requests": stats["requests"]["total"], "requests_failed": stats["requests"]["failed"],
            "assertions": stats["assertions"]["total"], "assertions_failed": stats["assertions"]["failed"],
            "operations_in_api": len(operations), "operations_exercised": len(operations) - len(uncovered),
            "operations_not_exercised": uncovered,
            "all_passed": stats["assertions"]["failed"] == 0 and stats["requests"]["failed"] == 0 and not uncovered,
            "slowest_request_ms": max(r["response_ms"] for r in requests),
        },
        "operations": operations,
        "requests": requests,
    }
    out = HERE / "results" / f"postman-results-{environment}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(result, indent=2) + "\n")
    s = result["summary"]
    print(f"{s['requests']} requests, {s['assertions']} assertions, {s['assertions_failed']} failed; "
          f"{s['operations_exercised']}/{s['operations_in_api']} operations exercised -> {out}")
    return 0 if s["all_passed"] else 1


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    sys.exit(main(*sys.argv[1:]))
