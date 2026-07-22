#!/usr/bin/env python3
"""Minimal Dev Buddy API client for project capabilities."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


SKILL_ROOT = Path(__file__).resolve().parents[1]
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")


def read_env_file(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if value[:1] == value[-1:] and value[:1] in {"'", '"'}:
            value = value[1:-1]
        values[key] = value
    return values


def configuration() -> tuple[str, str]:
    file_values = read_env_file(SKILL_ROOT / ".env")
    base_url = (os.environ.get("DEV_BUDDY_BASE_URL") or file_values.get("DEV_BUDDY_BASE_URL", "")).strip().rstrip("/")
    api_key = (os.environ.get("DEV_BUDDY_API_KEY") or file_values.get("DEV_BUDDY_API_KEY", "")).strip()
    if not base_url:
        raise ValueError("DEV_BUDDY_BASE_URL is not configured")
    if not api_key:
        raise ValueError("DEV_BUDDY_API_KEY is not configured")
    parsed = urlparse(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("DEV_BUDDY_BASE_URL must be an http(s) origin")
    return base_url, api_key


def request_json(path: str, method: str = "GET", payload: dict[str, Any] | None = None) -> Any:
    base_url, api_key = configuration()
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {api_key}",
        "User-Agent": "dev-buddy-skill/1.0",
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = Request(f"{base_url}{path}", data=body, headers=headers, method=method)
    try:
        with urlopen(request, timeout=70) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(raw)
        except json.JSONDecodeError:
            detail = {"message": raw or error.reason}
        print(json.dumps({"httpStatus": error.code, **detail}, ensure_ascii=False, indent=2), file=sys.stderr)
        raise SystemExit(1) from error
    except URLError as error:
        print(json.dumps({"error": "connection_failed", "message": str(error.reason)}, ensure_ascii=False, indent=2), file=sys.stderr)
        raise SystemExit(1) from error


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Call the Dev Buddy infrastructure API")
    subparsers = parser.add_subparsers(dest="operation", required=True)
    subparsers.add_parser("servers", help="List enabled managed servers")
    subparsers.add_parser("policies", help="List command policies")
    subparsers.add_parser("databases", help="List enabled managed databases")
    subparsers.add_parser("db-policies", help="List database SQL policies")

    execute = subparsers.add_parser("exec", help="Execute one filtered diagnostic command")
    execute.add_argument("--server-id", required=True)
    execute.add_argument("--command", required=True)
    execute.add_argument("--reason", required=True)
    execute.add_argument("--timeout", type=int, default=30, choices=range(1, 61), metavar="1..60")

    policy = subparsers.add_parser("policy-create", help="Create one command policy")
    policy.add_argument("--name", required=True)
    policy.add_argument("--pattern", required=True)
    policy.add_argument("--action", required=True, choices=("allow", "deny"))
    policy.add_argument("--priority", required=True, type=int, choices=range(1, 101), metavar="1..100")
    policy.add_argument("--disabled", action="store_true")

    db_query = subparsers.add_parser("db-query", help="Execute one policy-filtered SQL statement")
    db_query.add_argument("--database-id", required=True)
    db_query.add_argument("--sql", required=True)
    db_query.add_argument("--reason", required=True)
    db_query.add_argument("--timeout", type=int, default=15, choices=range(1, 31), metavar="1..30")

    db_policy = subparsers.add_parser("db-policy-create", help="Create one database SQL policy")
    db_policy.add_argument("--name", required=True)
    db_policy.add_argument("--pattern", required=True)
    db_policy.add_argument("--action", required=True, choices=("allow", "deny"))
    db_policy.add_argument("--priority", required=True, type=int, choices=range(1, 101), metavar="1..100")
    db_policy.add_argument("--disabled", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.operation == "servers":
            result = request_json("/api/v1/servers")
        elif args.operation == "policies":
            result = request_json("/api/v1/command-policies")
        elif args.operation == "databases":
            result = request_json("/api/v1/databases")
        elif args.operation == "db-policies":
            result = request_json("/api/v1/database-policies")
        elif args.operation == "exec":
            result = request_json(
                "/api/v1/executions",
                method="POST",
                payload={
                    "serverId": args.server_id,
                    "command": args.command,
                    "reason": args.reason,
                    "timeoutSeconds": args.timeout,
                },
            )
        elif args.operation == "policy-create":
            result = request_json(
                "/api/v1/command-policies",
                method="POST",
                payload={
                    "name": args.name,
                    "pattern": args.pattern,
                    "action": args.action,
                    "priority": args.priority,
                    "enabled": not args.disabled,
                },
            )
        elif args.operation == "db-query":
            result = request_json(
                "/api/v1/database-queries",
                method="POST",
                payload={
                    "databaseId": args.database_id,
                    "sql": args.sql,
                    "reason": args.reason,
                    "timeoutSeconds": args.timeout,
                },
            )
        else:
            result = request_json(
                "/api/v1/database-policies",
                method="POST",
                payload={
                    "name": args.name,
                    "pattern": args.pattern,
                    "action": args.action,
                    "priority": args.priority,
                    "enabled": not args.disabled,
                },
            )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except ValueError as error:
        print(json.dumps({"error": "configuration_error", "message": str(error)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
