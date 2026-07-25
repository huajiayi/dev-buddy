#!/usr/bin/env python3
"""Minimal Dev Buddy API client for project capabilities."""

from __future__ import annotations

import argparse
import getpass
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


class ApiRequestError(Exception):
    def __init__(self, status: int, detail: dict[str, Any]) -> None:
        super().__init__(str(detail.get("message") or f"HTTP {status}"))
        self.status = status
        self.detail = detail


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


def request_json(
    path: str,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    managed: bool = False,
) -> Any:
    base_url, api_key = configuration()
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {api_key}",
        "User-Agent": "dev-buddy-skill/1.0",
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
    if managed:
        managed_token = os.environ.get("DEV_BUDDY_MANAGED_SESSION_TOKEN", "").strip()
        if not managed_token:
            raise ValueError("DEV_BUDDY_MANAGED_SESSION_TOKEN is required with --managed")
        headers["X-Managed-Session"] = managed_token
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
        raise ApiRequestError(error.code, detail) from error
    except URLError as error:
        print(json.dumps({"error": "connection_failed", "message": str(error.reason)}, ensure_ascii=False, indent=2), file=sys.stderr)
        raise SystemExit(1) from error


def needs_interactive_user_password(error: ApiRequestError) -> bool:
    message = str(error.detail.get("message") or "")
    return error.status == 400 and (
        error.detail.get("error") == "password_required"
        or ("初始密码" in message and "默认" in message)
    )


def prompt_confirmed_password() -> str:
    if not sys.stdin.isatty():
        raise ValueError(
            "Dev Buddy has no default user password; rerun user-create in an interactive terminal "
            "to enter one securely, or configure the default user password in System Settings"
        )
    password = getpass.getpass("Initial password: ")
    confirmation = getpass.getpass("Confirm password: ")
    if password != confirmation:
        raise ValueError("password confirmation does not match")
    if not password:
        raise ValueError("password cannot be empty")
    return password


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Call the Dev Buddy infrastructure API")
    subparsers = parser.add_subparsers(dest="operation", required=True)
    subparsers.add_parser("servers", help="List enabled managed servers")
    subparsers.add_parser("policies", help="List command policies")
    subparsers.add_parser("databases", help="List enabled managed databases")
    subparsers.add_parser("db-policies", help="List database SQL policies")
    subparsers.add_parser("users", help="List users (administrator API Key required)")
    subparsers.add_parser("managed-sessions", help="List the current user's AI managed sessions")

    execute = subparsers.add_parser("exec", help="Execute one filtered diagnostic command")
    execute.add_argument("--server-id", required=True)
    execute.add_argument("--command", required=True)
    execute.add_argument("--reason", required=True)
    execute.add_argument("--timeout", type=int, default=30, choices=range(1, 61), metavar="1..60")
    execute.add_argument("--managed", action="store_true", help="Use DEV_BUDDY_MANAGED_SESSION_TOKEN")

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
    db_query.add_argument("--managed", action="store_true", help="Use DEV_BUDDY_MANAGED_SESSION_TOKEN")

    managed_start = subparsers.add_parser("managed-session-start", help="Start a temporary AI managed session")
    managed_start.add_argument("--objective", required=True)
    managed_start.add_argument("--reason", required=True)
    managed_start.add_argument("--planned-actions", default="")
    managed_start.add_argument("--duration", type=int, default=30, choices=range(15, 121), metavar="15..120")
    managed_start.add_argument("--server", action="append", default=[], metavar="SERVER_ID")
    managed_start.add_argument("--database", action="append", default=[], metavar="DATABASE_ID")

    managed_end = subparsers.add_parser("managed-session-end", help="End a managed session and generate its summary")
    managed_end.add_argument("--session-id", required=True)
    managed_end.add_argument("--reason", default="AI completed the requested work")

    managed_events = subparsers.add_parser("managed-session-events", help="Read one managed session's audit events")
    managed_events.add_argument("--session-id", required=True)

    db_policy = subparsers.add_parser("db-policy-create", help="Create one database SQL policy")
    db_policy.add_argument("--name", required=True)
    db_policy.add_argument("--pattern", required=True)
    db_policy.add_argument("--action", required=True, choices=("allow", "deny"))
    db_policy.add_argument("--priority", required=True, type=int, choices=range(1, 101), metavar="1..100")
    db_policy.add_argument("--disabled", action="store_true")

    user_create = subparsers.add_parser(
        "user-create",
        help="Create a local user with the system default password, prompting only when no default is configured",
    )
    user_create.add_argument("--username", required=True)
    user_create.add_argument("--display-name", required=True)
    user_create.add_argument("--email")
    user_create.add_argument("--role", choices=("admin", "operator"), default="operator")

    user_update = subparsers.add_parser("user-update", help="Update a user")
    user_update.add_argument("--user-id", required=True)
    user_update.add_argument("--username")
    user_update.add_argument("--display-name")
    user_update.add_argument("--email")
    user_update.add_argument("--role", choices=("admin", "operator"))
    status = user_update.add_mutually_exclusive_group()
    status.add_argument("--enable", action="store_true")
    status.add_argument("--disable", action="store_true")
    user_update.add_argument("--reset-password", action="store_true")

    user_delete = subparsers.add_parser("user-delete", help="Delete a user")
    user_delete.add_argument("--user-id", required=True)
    user_delete.add_argument("--confirm", action="store_true", help="Confirm this irreversible operation")

    permissions = subparsers.add_parser("user-permissions", help="Read one user's resource permissions")
    permissions.add_argument("--user-id", required=True)

    permissions_set = subparsers.add_parser("user-permissions-set", help="Replace one operator's complete resource permission set")
    permissions_set.add_argument("--user-id", required=True)
    permissions_set.add_argument("--server", action="append", default=[], metavar="SERVER_ID")
    permissions_set.add_argument("--database", action="append", default=[], metavar="DATABASE_ID")
    permissions_set.add_argument("--confirm-replace", action="store_true")
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
        elif args.operation == "users":
            result = request_json("/api/v1/users")
        elif args.operation == "managed-sessions":
            result = request_json("/api/v1/managed-sessions")
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
                managed=args.managed,
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
                managed=args.managed,
            )
        elif args.operation == "managed-session-start":
            if not args.server and not args.database:
                raise ValueError("managed-session-start requires at least one --server or --database")
            result = request_json(
                "/api/v1/managed-sessions",
                method="POST",
                payload={
                    "objective": args.objective,
                    "reason": args.reason,
                    "plannedActions": args.planned_actions,
                    "durationMinutes": args.duration,
                    "serverIds": list(dict.fromkeys(args.server)),
                    "databaseIds": list(dict.fromkeys(args.database)),
                },
            )
        elif args.operation == "managed-session-end":
            result = request_json(
                f"/api/v1/managed-sessions/{args.session_id}/end",
                method="POST",
                payload={"reason": args.reason},
            )
        elif args.operation == "managed-session-events":
            result = request_json(f"/api/v1/managed-sessions/{args.session_id}")
        elif args.operation == "db-policy-create":
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
        elif args.operation == "user-create":
            payload = {
                "username": args.username,
                "displayName": args.display_name,
                "email": args.email,
                "role": args.role,
            }
            try:
                result = request_json("/api/v1/users", method="POST", payload=payload)
            except ApiRequestError as error:
                if not needs_interactive_user_password(error):
                    raise
                retry_payload = {**payload, "password": prompt_confirmed_password()}
                result = request_json("/api/v1/users", method="POST", payload=retry_payload)
        elif args.operation == "user-update":
            payload = {
                key: value for key, value in {
                    "username": args.username,
                    "displayName": args.display_name,
                    "email": args.email,
                    "role": args.role,
                }.items() if value is not None
            }
            if args.enable:
                payload["enabled"] = True
            elif args.disable:
                payload["enabled"] = False
            if args.reset_password:
                password = getpass.getpass("New password: ")
                confirmation = getpass.getpass("Confirm password: ")
                if password != confirmation:
                    raise ValueError("password confirmation does not match")
                payload["password"] = password
            if not payload:
                raise ValueError("user-update requires at least one change")
            result = request_json(f"/api/v1/users/{args.user_id}", method="PATCH", payload=payload)
        elif args.operation == "user-delete":
            if not args.confirm:
                raise ValueError("user-delete requires --confirm")
            result = request_json(f"/api/v1/users/{args.user_id}", method="DELETE")
        elif args.operation == "user-permissions":
            result = request_json(f"/api/v1/users/{args.user_id}/permissions")
        else:
            if not args.confirm_replace:
                raise ValueError("user-permissions-set requires --confirm-replace")
            result = request_json(
                f"/api/v1/users/{args.user_id}/permissions",
                method="PUT",
                payload={
                    "serverIds": list(dict.fromkeys(args.server)),
                    "databaseIds": list(dict.fromkeys(args.database)),
                },
            )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except ApiRequestError as error:
        print(
            json.dumps({"httpStatus": error.status, **error.detail}, ensure_ascii=False, indent=2),
            file=sys.stderr,
        )
        return 1
    except ValueError as error:
        print(json.dumps({"error": "configuration_error", "message": str(error)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
