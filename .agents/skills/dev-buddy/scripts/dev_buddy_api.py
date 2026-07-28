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
SKILL_MANIFEST_PATH = SKILL_ROOT / "skill-manifest.json"
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")


def read_skill_manifest() -> dict[str, str]:
    try:
        raw = json.loads(SKILL_MANIFEST_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"invalid Dev Buddy Skill manifest: {error}") from error
    required = ("version", "apiVersion", "minCompatibleVersion", "sourceUrl")
    if not isinstance(raw, dict) or any(not isinstance(raw.get(key), str) or not raw[key].strip() for key in required):
        raise ValueError("invalid Dev Buddy Skill manifest: required version fields are missing")
    return {key: raw[key].strip() for key in required}


SKILL_MANIFEST = read_skill_manifest()
SKILL_VERSION = SKILL_MANIFEST["version"]
SKILL_API_VERSION = SKILL_MANIFEST["apiVersion"]
_compatibility_info: dict[str, Any] | None = None


class ApiRequestError(Exception):
    def __init__(self, status: int, detail: dict[str, Any]) -> None:
        super().__init__(str(detail.get("message") or f"HTTP {status}"))
        self.status = status
        self.detail = detail


class SkillCompatibilityError(Exception):
    def __init__(self, detail: dict[str, Any]) -> None:
        super().__init__(str(detail.get("message") or "Dev Buddy Skill version is incompatible"))
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


def _request_json(
    path: str,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    managed: bool = False,
    confirmation: str | None = None,
) -> Any:
    base_url, api_key = configuration()
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {api_key}",
        "User-Agent": f"dev-buddy-skill/{SKILL_VERSION}",
        "X-Dev-Buddy-Skill-Version": SKILL_VERSION,
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
    if confirmation:
        headers["X-Dev-Buddy-Confirm"] = confirmation
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


def semantic_version(value: str) -> tuple[int, int, int]:
    parts = value.strip().split(".")
    if len(parts) != 3 or any(not part.isdigit() for part in parts):
        raise SkillCompatibilityError({
            "error": "invalid_skill_version",
            "message": f"Dev Buddy returned an invalid semantic version: {value}",
        })
    return tuple(int(part) for part in parts)  # type: ignore[return-value]


def check_skill_compatibility() -> dict[str, Any]:
    global _compatibility_info
    if _compatibility_info is not None:
        return _compatibility_info
    try:
        result = _request_json("/api/v1/meta")
    except ApiRequestError as error:
        if error.status != 404:
            raise
        raise SkillCompatibilityError({
            "error": "server_version_check_unavailable",
            "message": "Dev Buddy 服务端未提供 Skill 版本检查，请先更新服务端",
            "currentVersion": SKILL_VERSION,
        }) from error
    data = result.get("data") if isinstance(result, dict) else None
    if not isinstance(data, dict):
        raise SkillCompatibilityError({
            "error": "invalid_version_response",
            "message": "Dev Buddy 服务端返回了无效的版本信息",
            "currentVersion": SKILL_VERSION,
        })
    api_version = str(data.get("apiVersion") or "")
    latest_version = str(data.get("recommendedSkillVersion") or "")
    min_version = str(data.get("minSkillVersion") or "")
    update_url = str(data.get("skillSourceUrl") or SKILL_MANIFEST["sourceUrl"])
    if api_version != SKILL_API_VERSION:
        raise SkillCompatibilityError({
            "error": "skill_api_incompatible",
            "message": f"当前 Skill 使用 {SKILL_API_VERSION}，服务端要求 {api_version}",
            "currentVersion": SKILL_VERSION,
            "apiVersion": api_version,
            "updateUrl": update_url,
        })
    current = semantic_version(SKILL_VERSION)
    minimum = semantic_version(min_version)
    latest = semantic_version(latest_version)
    if current < minimum:
        raise SkillCompatibilityError({
            "error": "skill_update_required",
            "message": f"当前 Dev Buddy Skill {SKILL_VERSION} 已不兼容，请更新到 {latest_version}",
            "currentVersion": SKILL_VERSION,
            "minVersion": min_version,
            "latestVersion": latest_version,
            "updateUrl": update_url,
        })
    if current < latest:
        print(json.dumps({
            "warning": "skill_update_available",
            "message": f"Dev Buddy Skill 有新版本 {latest_version}，当前版本为 {SKILL_VERSION}",
            "currentVersion": SKILL_VERSION,
            "latestVersion": latest_version,
            "updateUrl": update_url,
        }, ensure_ascii=False), file=sys.stderr)
    elif current > latest:
        print(json.dumps({
            "warning": "server_update_recommended",
            "message": f"当前 Skill {SKILL_VERSION} 新于服务端推荐版本 {latest_version}",
            "currentVersion": SKILL_VERSION,
            "serverSkillVersion": latest_version,
        }, ensure_ascii=False), file=sys.stderr)
    _compatibility_info = data
    return data


def request_json(
    path: str,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    managed: bool = False,
    confirmation: str | None = None,
) -> Any:
    if path != "/api/v1/meta":
        check_skill_compatibility()
    return _request_json(path, method, payload, managed, confirmation)


def read_stdin_secret(operation: str) -> str:
    if sys.stdin.isatty():
        raise ValueError(f"{operation} requires the secret on standard input")
    value = sys.stdin.read()
    if not value.strip():
        raise ValueError(f"{operation} requires a non-empty secret on standard input")
    return value


def read_utf8_file(path_value: str | None, label: str) -> str | None:
    if not path_value:
        return None
    path = Path(path_value).expanduser()
    if not path.is_file():
        raise ValueError(f"{label} file does not exist: {path}")
    return path.read_text(encoding="utf-8-sig")


def require_named_resource(path: str, resource_id: str, confirmed_name: str, field: str = "name") -> dict[str, Any]:
    result = request_json(path)
    resources = result.get("data", []) if isinstance(result, dict) else []
    target = next((item for item in resources if isinstance(item, dict) and item.get("id") == resource_id), None)
    if not target:
        raise ValueError(f"resource {resource_id} was not found")
    actual_name = str(target.get(field) or "")
    if actual_name != confirmed_name:
        raise ValueError(f"confirmation name does not match the exact resource name: {actual_name}")
    return target


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
    subparsers.add_parser("version", help="Show local and server-compatible Dev Buddy versions")
    servers = subparsers.add_parser("servers", help="List managed servers")
    servers.add_argument("--all", action="store_true", help="Include disabled servers (administrator API Key required)")
    subparsers.add_parser("policies", help="List command policies")
    databases = subparsers.add_parser("databases", help="List managed databases")
    databases.add_argument("--all", action="store_true", help="Include disabled databases (administrator API Key required)")
    subparsers.add_parser("db-policies", help="List database SQL policies")
    subparsers.add_parser("users", help="List users (administrator API Key required)")
    subparsers.add_parser("managed-sessions", help="List the current user's AI managed sessions")

    server_create = subparsers.add_parser(
        "server-create",
        help="Create a managed server (administrator API Key required)",
    )
    server_create.add_argument("--name", required=True)
    server_create.add_argument("--host", required=True)
    server_create.add_argument("--port", type=int, default=22, choices=range(1, 65536), metavar="1..65535")
    server_create.add_argument("--username", required=True)
    server_create.add_argument("--auth-type", required=True, choices=("password", "privateKey"))
    server_create.add_argument("--environment", required=True)
    server_create.add_argument(
        "--credential-stdin",
        action="store_true",
        required=True,
        help="Read the SSH credential from standard input; it is never accepted as an argument",
    )

    server_update = subparsers.add_parser("server-update", help="Update a managed server")
    server_update.add_argument("--server-id", required=True)
    server_update.add_argument("--name", required=True)
    server_update.add_argument("--host", required=True)
    server_update.add_argument("--port", type=int, default=22, choices=range(1, 65536), metavar="1..65535")
    server_update.add_argument("--username", required=True)
    server_update.add_argument("--auth-type", required=True, choices=("password", "privateKey"))
    server_update.add_argument("--environment", required=True)
    server_update.add_argument("--replace-credential-stdin", action="store_true")
    server_update.add_argument("--confirm-name", required=True)
    server_update.add_argument("--confirm-risk", action="store_true")

    server_test = subparsers.add_parser("server-test", help="Test one managed server connection")
    server_test.add_argument("--server-id", required=True)

    server_enable = subparsers.add_parser("server-enable", help="Enable one managed server")
    server_enable.add_argument("--server-id", required=True)
    server_enable.add_argument("--confirm-name", required=True)
    server_enable.add_argument("--confirm-risk", action="store_true")

    server_disable = subparsers.add_parser("server-disable", help="Disable one managed server")
    server_disable.add_argument("--server-id", required=True)
    server_disable.add_argument("--confirm-name", required=True)
    server_disable.add_argument("--confirm-risk", action="store_true")

    server_delete = subparsers.add_parser("server-delete", help="Delete one managed server")
    server_delete.add_argument("--server-id", required=True)
    server_delete.add_argument("--confirm-name", required=True)
    server_delete.add_argument("--confirm-risk", action="store_true")

    database_create = subparsers.add_parser("database-create", help="Create a managed database")
    database_create.add_argument("--name", required=True)
    database_create.add_argument("--engine", required=True, choices=("postgresql", "mysql"))
    database_create.add_argument("--host", required=True)
    database_create.add_argument("--port", required=True, type=int, choices=range(1, 65536), metavar="1..65535")
    database_create.add_argument("--database-name", required=True)
    database_create.add_argument("--username", required=True)
    database_create.add_argument("--password-stdin", action="store_true", required=True)
    database_create.add_argument("--connection-mode", choices=("direct", "sshTunnel"), default="direct")
    database_create.add_argument("--ssh-server-id")
    database_create.add_argument("--tls-mode", choices=("disable", "require", "verify-full"), default="disable")
    database_create.add_argument("--tls-ca-file")
    database_create.add_argument("--environment", required=True)

    database_update = subparsers.add_parser("database-update", help="Update a managed database")
    database_update.add_argument("--database-id", required=True)
    database_update.add_argument("--name", required=True)
    database_update.add_argument("--engine", required=True, choices=("postgresql", "mysql"))
    database_update.add_argument("--host", required=True)
    database_update.add_argument("--port", required=True, type=int, choices=range(1, 65536), metavar="1..65535")
    database_update.add_argument("--database-name", required=True)
    database_update.add_argument("--username", required=True)
    database_update.add_argument("--replace-password-stdin", action="store_true")
    database_update.add_argument("--connection-mode", choices=("direct", "sshTunnel"), default="direct")
    database_update.add_argument("--ssh-server-id")
    database_update.add_argument("--tls-mode", choices=("disable", "require", "verify-full"), default="disable")
    tls_change = database_update.add_mutually_exclusive_group()
    tls_change.add_argument("--tls-ca-file")
    tls_change.add_argument("--clear-tls-ca", action="store_true")
    database_update.add_argument("--environment", required=True)
    database_update.add_argument("--confirm-name", required=True)
    database_update.add_argument("--confirm-risk", action="store_true")

    database_test = subparsers.add_parser("database-test", help="Test one managed database connection")
    database_test.add_argument("--database-id", required=True)

    database_enable = subparsers.add_parser("database-enable", help="Enable one managed database")
    database_enable.add_argument("--database-id", required=True)
    database_enable.add_argument("--confirm-name", required=True)
    database_enable.add_argument("--confirm-risk", action="store_true")

    database_disable = subparsers.add_parser("database-disable", help="Disable one managed database")
    database_disable.add_argument("--database-id", required=True)
    database_disable.add_argument("--confirm-name", required=True)
    database_disable.add_argument("--confirm-risk", action="store_true")

    database_delete = subparsers.add_parser("database-delete", help="Delete one managed database")
    database_delete.add_argument("--database-id", required=True)
    database_delete.add_argument("--confirm-name", required=True)
    database_delete.add_argument("--confirm-risk", action="store_true")

    execute = subparsers.add_parser("exec", help="Execute one filtered diagnostic command")
    execute.add_argument("--server-id", required=True)
    execute.add_argument("--command", required=True)
    execute.add_argument("--reason", required=True)
    execute.add_argument("--timeout", type=int, default=30, choices=range(1, 61), metavar="1..60")
    execute.add_argument("--managed", action="store_true", help="Use DEV_BUDDY_MANAGED_SESSION_TOKEN")
    execute.add_argument("--confirm-risk", action="store_true")

    policy = subparsers.add_parser("policy-create", help="Create one command policy")
    policy.add_argument("--name", required=True)
    policy.add_argument("--pattern", required=True)
    policy.add_argument("--action", required=True, choices=("allow", "deny"))
    policy.add_argument("--priority", required=True, type=int, choices=range(1, 101), metavar="1..100")
    policy.add_argument("--disabled", action="store_true")
    policy.add_argument("--confirm-risk", action="store_true")

    policy_update = subparsers.add_parser("policy-update", help="Update one command policy")
    policy_update.add_argument("--policy-id", required=True)
    policy_update.add_argument("--name", required=True)
    policy_update.add_argument("--pattern", required=True)
    policy_update.add_argument("--action", required=True, choices=("allow", "deny"))
    policy_update.add_argument("--priority", required=True, type=int, choices=range(1, 101), metavar="1..100")
    policy_update.add_argument("--disabled", action="store_true")
    policy_update.add_argument("--confirm-name", required=True)
    policy_update.add_argument("--confirm-risk", action="store_true")

    policy_delete = subparsers.add_parser("policy-delete", help="Delete one command policy")
    policy_delete.add_argument("--policy-id", required=True)
    policy_delete.add_argument("--confirm-name", required=True)
    policy_delete.add_argument("--confirm-risk", action="store_true")

    db_query = subparsers.add_parser("db-query", help="Execute one policy-filtered SQL statement")
    db_query.add_argument("--database-id", required=True)
    db_query.add_argument("--sql", required=True)
    db_query.add_argument("--reason", required=True)
    db_query.add_argument("--timeout", type=int, default=15, choices=range(1, 31), metavar="1..30")
    db_query.add_argument("--managed", action="store_true", help="Use DEV_BUDDY_MANAGED_SESSION_TOKEN")
    db_query.add_argument("--confirm-risk", action="store_true")

    managed_start = subparsers.add_parser("managed-session-start", help="Start a temporary AI managed session")
    managed_start.add_argument("--objective", required=True)
    managed_start.add_argument("--reason", required=True)
    managed_start.add_argument("--planned-actions", default="")
    managed_start.add_argument("--duration", type=int, default=30, choices=range(15, 121), metavar="15..120")
    managed_start.add_argument("--server", action="append", default=[], metavar="SERVER_ID")
    managed_start.add_argument("--database", action="append", default=[], metavar="DATABASE_ID")
    managed_start.add_argument("--confirm-risk", action="store_true")

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
    db_policy.add_argument("--confirm-risk", action="store_true")

    db_policy_update = subparsers.add_parser("db-policy-update", help="Update one database SQL policy")
    db_policy_update.add_argument("--policy-id", required=True)
    db_policy_update.add_argument("--name", required=True)
    db_policy_update.add_argument("--pattern", required=True)
    db_policy_update.add_argument("--action", required=True, choices=("allow", "deny"))
    db_policy_update.add_argument("--priority", required=True, type=int, choices=range(1, 101), metavar="1..100")
    db_policy_update.add_argument("--disabled", action="store_true")
    db_policy_update.add_argument("--confirm-name", required=True)
    db_policy_update.add_argument("--confirm-risk", action="store_true")

    db_policy_delete = subparsers.add_parser("db-policy-delete", help="Delete one database SQL policy")
    db_policy_delete.add_argument("--policy-id", required=True)
    db_policy_delete.add_argument("--confirm-name", required=True)
    db_policy_delete.add_argument("--confirm-risk", action="store_true")

    user_create = subparsers.add_parser(
        "user-create",
        help="Create a local user with the system default password, prompting only when no default is configured",
    )
    user_create.add_argument("--username", required=True)
    user_create.add_argument("--display-name", required=True)
    user_create.add_argument("--email")
    user_create.add_argument("--role", choices=("admin", "operator"), default="operator")
    user_create.add_argument("--confirm-risk", action="store_true")

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
    user_update.add_argument("--confirm-risk", action="store_true")

    user_delete = subparsers.add_parser("user-delete", help="Delete a user")
    user_delete.add_argument("--user-id", required=True)
    user_delete.add_argument("--confirm", action="store_true", help="Confirm this irreversible operation")
    user_delete.add_argument("--confirm-username", required=True)

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
        if args.operation == "version":
            version = check_skill_compatibility()
            result = {
                "data": {
                    "localSkillVersion": SKILL_VERSION,
                    "isLatest": SKILL_VERSION == version.get("recommendedSkillVersion"),
                    **version,
                },
            }
        elif args.operation == "servers":
            result = request_json("/api/v1/servers?includeDisabled=true" if args.all else "/api/v1/servers")
        elif args.operation == "policies":
            result = request_json("/api/v1/command-policies")
        elif args.operation == "databases":
            result = request_json("/api/v1/databases?includeDisabled=true" if args.all else "/api/v1/databases")
        elif args.operation == "db-policies":
            result = request_json("/api/v1/database-policies")
        elif args.operation == "users":
            result = request_json("/api/v1/users")
        elif args.operation == "managed-sessions":
            result = request_json("/api/v1/managed-sessions")
        elif args.operation == "server-create":
            result = request_json(
                "/api/v1/servers",
                method="POST",
                payload={
                    "name": args.name,
                    "host": args.host,
                    "port": args.port,
                    "username": args.username,
                    "authType": args.auth_type,
                    "credential": read_stdin_secret("server-create"),
                    "environment": args.environment,
                },
            )
        elif args.operation == "server-update":
            if not args.confirm_risk:
                raise ValueError("server-update requires a second confirmation and --confirm-risk")
            require_named_resource(
                "/api/v1/servers?includeDisabled=true",
                args.server_id,
                args.confirm_name,
            )
            payload = {
                "name": args.name,
                "host": args.host,
                "port": args.port,
                "username": args.username,
                "authType": args.auth_type,
                "environment": args.environment,
            }
            if args.replace_credential_stdin:
                payload["credential"] = read_stdin_secret("server-update --replace-credential-stdin")
            result = request_json(
                f"/api/v1/servers/{args.server_id}",
                method="PATCH",
                payload=payload,
                confirmation="update-server",
            )
        elif args.operation == "server-test":
            result = request_json(f"/api/v1/servers/{args.server_id}/test", method="POST", payload={})
        elif args.operation == "server-enable":
            if not args.confirm_risk:
                raise ValueError("server-enable requires a second confirmation and --confirm-risk")
            require_named_resource(
                "/api/v1/servers?includeDisabled=true",
                args.server_id,
                args.confirm_name,
            )
            result = request_json(
                f"/api/v1/servers/{args.server_id}",
                method="PATCH",
                payload={"enabled": True},
                confirmation="enable-server",
            )
        elif args.operation == "server-disable":
            if not args.confirm_risk:
                raise ValueError("server-disable requires a second confirmation and --confirm-risk")
            require_named_resource(
                "/api/v1/servers?includeDisabled=true",
                args.server_id,
                args.confirm_name,
            )
            result = request_json(
                f"/api/v1/servers/{args.server_id}",
                method="PATCH",
                payload={"enabled": False},
                confirmation="disable-server",
            )
        elif args.operation == "server-delete":
            if not args.confirm_risk:
                raise ValueError("server-delete requires a second confirmation and --confirm-risk")
            require_named_resource(
                "/api/v1/servers?includeDisabled=true",
                args.server_id,
                args.confirm_name,
            )
            result = request_json(
                f"/api/v1/servers/{args.server_id}",
                method="DELETE",
                confirmation="delete-server",
            )
        elif args.operation == "database-create":
            if args.connection_mode == "sshTunnel" and not args.ssh_server_id:
                raise ValueError("database-create with sshTunnel requires --ssh-server-id")
            result = request_json(
                "/api/v1/databases",
                method="POST",
                payload={
                    "name": args.name,
                    "engine": args.engine,
                    "host": args.host,
                    "port": args.port,
                    "databaseName": args.database_name,
                    "username": args.username,
                    "password": read_stdin_secret("database-create"),
                    "connectionMode": args.connection_mode,
                    "sshServerId": args.ssh_server_id,
                    "tlsMode": args.tls_mode,
                    "tlsCa": read_utf8_file(args.tls_ca_file, "TLS CA"),
                    "environment": args.environment,
                },
            )
        elif args.operation == "database-update":
            if not args.confirm_risk:
                raise ValueError("database-update requires a second confirmation and --confirm-risk")
            if args.connection_mode == "sshTunnel" and not args.ssh_server_id:
                raise ValueError("database-update with sshTunnel requires --ssh-server-id")
            require_named_resource(
                "/api/v1/databases?includeDisabled=true",
                args.database_id,
                args.confirm_name,
            )
            payload = {
                "name": args.name,
                "engine": args.engine,
                "host": args.host,
                "port": args.port,
                "databaseName": args.database_name,
                "username": args.username,
                "connectionMode": args.connection_mode,
                "sshServerId": args.ssh_server_id,
                "tlsMode": args.tls_mode,
                "tlsCa": read_utf8_file(args.tls_ca_file, "TLS CA"),
                "clearTlsCa": args.clear_tls_ca,
                "environment": args.environment,
            }
            if args.replace_password_stdin:
                payload["password"] = read_stdin_secret("database-update --replace-password-stdin")
            result = request_json(
                f"/api/v1/databases/{args.database_id}",
                method="PATCH",
                payload=payload,
                confirmation="update-database",
            )
        elif args.operation == "database-test":
            result = request_json(f"/api/v1/databases/{args.database_id}/test", method="POST", payload={})
        elif args.operation == "database-enable":
            if not args.confirm_risk:
                raise ValueError("database-enable requires a second confirmation and --confirm-risk")
            require_named_resource(
                "/api/v1/databases?includeDisabled=true",
                args.database_id,
                args.confirm_name,
            )
            result = request_json(
                f"/api/v1/databases/{args.database_id}",
                method="PATCH",
                payload={"enabled": True},
                confirmation="enable-database",
            )
        elif args.operation == "database-disable":
            if not args.confirm_risk:
                raise ValueError("database-disable requires a second confirmation and --confirm-risk")
            require_named_resource(
                "/api/v1/databases?includeDisabled=true",
                args.database_id,
                args.confirm_name,
            )
            result = request_json(
                f"/api/v1/databases/{args.database_id}",
                method="PATCH",
                payload={"enabled": False},
                confirmation="disable-database",
            )
        elif args.operation == "database-delete":
            if not args.confirm_risk:
                raise ValueError("database-delete requires a second confirmation and --confirm-risk")
            require_named_resource(
                "/api/v1/databases?includeDisabled=true",
                args.database_id,
                args.confirm_name,
            )
            result = request_json(
                f"/api/v1/databases/{args.database_id}",
                method="DELETE",
                confirmation="delete-database",
            )
        elif args.operation == "exec":
            if args.managed and not args.confirm_risk:
                raise ValueError("managed command execution requires a second confirmation and --confirm-risk")
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
                confirmation=(
                    "execute-managed-command"
                    if args.managed
                    else "execute-risky-command" if args.confirm_risk else None
                ),
            )
        elif args.operation == "policy-create":
            if not args.confirm_risk:
                raise ValueError("policy-create requires a second confirmation and --confirm-risk")
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
                confirmation="create-command-policy",
            )
        elif args.operation == "policy-update":
            if not args.confirm_risk:
                raise ValueError("policy-update requires a second confirmation and --confirm-risk")
            require_named_resource("/api/v1/command-policies", args.policy_id, args.confirm_name)
            result = request_json(
                f"/api/v1/command-policies/{args.policy_id}",
                method="PATCH",
                payload={
                    "name": args.name,
                    "pattern": args.pattern,
                    "action": args.action,
                    "priority": args.priority,
                    "enabled": not args.disabled,
                },
                confirmation="update-command-policy",
            )
        elif args.operation == "policy-delete":
            if not args.confirm_risk:
                raise ValueError("policy-delete requires a second confirmation and --confirm-risk")
            require_named_resource("/api/v1/command-policies", args.policy_id, args.confirm_name)
            result = request_json(
                f"/api/v1/command-policies/{args.policy_id}",
                method="DELETE",
                confirmation="delete-command-policy",
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
                confirmation="execute-mutating-sql" if args.confirm_risk else None,
            )
        elif args.operation == "managed-session-start":
            if not args.server and not args.database:
                raise ValueError("managed-session-start requires at least one --server or --database")
            if not args.confirm_risk:
                raise ValueError("managed-session-start requires a second confirmation and --confirm-risk")
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
                confirmation="start-managed-session",
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
            if not args.confirm_risk:
                raise ValueError("db-policy-create requires a second confirmation and --confirm-risk")
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
                confirmation="create-database-policy",
            )
        elif args.operation == "db-policy-update":
            if not args.confirm_risk:
                raise ValueError("db-policy-update requires a second confirmation and --confirm-risk")
            require_named_resource("/api/v1/database-policies", args.policy_id, args.confirm_name)
            result = request_json(
                f"/api/v1/database-policies/{args.policy_id}",
                method="PATCH",
                payload={
                    "name": args.name,
                    "pattern": args.pattern,
                    "action": args.action,
                    "priority": args.priority,
                    "enabled": not args.disabled,
                },
                confirmation="update-database-policy",
            )
        elif args.operation == "db-policy-delete":
            if not args.confirm_risk:
                raise ValueError("db-policy-delete requires a second confirmation and --confirm-risk")
            require_named_resource("/api/v1/database-policies", args.policy_id, args.confirm_name)
            result = request_json(
                f"/api/v1/database-policies/{args.policy_id}",
                method="DELETE",
                confirmation="delete-database-policy",
            )
        elif args.operation == "user-create":
            if args.role == "admin" and not args.confirm_risk:
                raise ValueError("creating an admin user requires a second confirmation and --confirm-risk")
            payload = {
                "username": args.username,
                "displayName": args.display_name,
                "email": args.email,
                "role": args.role,
            }
            user_confirmation = "create-admin-user" if args.role == "admin" else None
            try:
                result = request_json(
                    "/api/v1/users",
                    method="POST",
                    payload=payload,
                    confirmation=user_confirmation,
                )
            except ApiRequestError as error:
                if not needs_interactive_user_password(error):
                    raise
                retry_payload = {**payload, "password": prompt_confirmed_password()}
                result = request_json(
                    "/api/v1/users",
                    method="POST",
                    payload=retry_payload,
                    confirmation=user_confirmation,
                )
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
            security_change = args.role is not None or args.enable or args.disable or args.reset_password
            if security_change and not args.confirm_risk:
                raise ValueError("user security changes require a second confirmation and --confirm-risk")
            if args.reset_password:
                password = getpass.getpass("New password: ")
                confirmation = getpass.getpass("Confirm password: ")
                if password != confirmation:
                    raise ValueError("password confirmation does not match")
                payload["password"] = password
            if not payload:
                raise ValueError("user-update requires at least one change")
            result = request_json(
                f"/api/v1/users/{args.user_id}",
                method="PATCH",
                payload=payload,
                confirmation="update-user-security" if security_change else None,
            )
        elif args.operation == "user-delete":
            if not args.confirm:
                raise ValueError("user-delete requires --confirm")
            require_named_resource("/api/v1/users", args.user_id, args.confirm_username, field="username")
            result = request_json(
                f"/api/v1/users/{args.user_id}",
                method="DELETE",
                confirmation="delete-user",
            )
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
                confirmation="replace-user-permissions",
            )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except SkillCompatibilityError as error:
        print(json.dumps(error.detail, ensure_ascii=False, indent=2), file=sys.stderr)
        return 3
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
