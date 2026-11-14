"""Deploy the current working tree to Vercel without a Git connection.

Vercel's CLI talks to ``api.vercel.com``; on networks where that host is
unreachable, the platform API is still served at ``vercel.com/api``. This script
uses that path (or a pinned address) and performs a source deployment:

    $env:VERCEL_TOKEN = "..."           # required, never commit it
    python -m scripts.deploy_vercel --project hermes-nasa --team <team_id>

If ``api.vercel.com`` resolves but is blocked on the network, pin it to the
address that serves ``vercel.com`` (the API is the same):

    $env:VERCEL_API_IP = "64.239.123.129"   # current vercel.com edge address

Files come from ``git ls-files`` so ignored paths (node_modules, .venv, .env,
data) are never uploaded. A deployment is built by Vercel from ``vercel.json``.
"""

from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import os
import socket
import ssl
import subprocess
import sys
import time
from pathlib import Path

DEFAULT_TEAM = os.getenv("VERCEL_TEAM_ID", "")


class _PinnedConnection(http.client.HTTPSConnection):
    """HTTPS to ``host`` while dialing ``ip`` (SNI and Host stay correct)."""

    def __init__(self, host: str, ip: str | None, timeout: float) -> None:
        super().__init__(host, 443, timeout=timeout, context=ssl.create_default_context())
        self._ip = ip

    def connect(self) -> None:
        target = self._ip or self.host
        sock = socket.create_connection((target, 443), self.timeout)
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)


class VerceApi:
    def __init__(self, token: str, team: str) -> None:
        self.token = token
        self.team = team
        host = os.getenv("VERCEL_API_HOST", "api.vercel.com")
        ip = os.getenv("VERCEL_API_IP") or None
        self.host = host
        self.ip = ip

    def call(self, method: str, path: str, body: bytes | None = None, headers: dict | None = None):
        last_error: Exception | None = None
        for attempt in range(1, 4):
            try:
                conn = _PinnedConnection(self.host, self.ip, timeout=180)
                head = {"Authorization": f"Bearer {self.token}", "User-Agent": "hermes-deploy"}
                head.update(headers or {})
                separator = "&" if "?" in path else "?"
                conn.request(
                    method, f"{path}{separator}teamId={self.team}", body=body, headers=head
                )
                response = conn.getresponse()
                payload = response.read()
                status = response.status
                conn.close()
                if status in {429, 500, 502, 503, 504} and attempt < 3:
                    time.sleep(2 * attempt)
                    continue
                try:
                    parsed = json.loads(payload) if payload else None
                except json.JSONDecodeError:
                    parsed = payload[:300]
                return status, parsed
            except (http.client.HTTPException, OSError, TimeoutError) as exc:
                last_error = exc
                time.sleep(2 * attempt)
        raise RuntimeError(f"{method} {path} failed after retries: {last_error}")

    def upload(self, data: bytes, sha: str) -> tuple[int, object]:
        return self.call(
            "POST",
            "/v2/files",
            data,
            {"x-vercel-digest": sha, "Content-Type": "application/octet-stream"},
        )


def tracked_files() -> list[Path]:
    output = subprocess.check_output(["git", "ls-files"], text=True)
    return [Path(line) for line in output.splitlines() if line and Path(line).is_file()]

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default="hermes-nasa")
    parser.add_argument("--team", default=DEFAULT_TEAM, help="Vercel team id (required)")
    parser.add_argument("--target", default="production", choices=["production", "preview"])
    parser.add_argument("--timeout", type=int, default=900)
    args = parser.parse_args()

    token = os.getenv("VERCEL_TOKEN")
    if not token:
        print("VERCEL_TOKEN is not set", file=sys.stderr)
        return 2
    if not args.team:
        print("--team (or VERCEL_TEAM_ID) is required", file=sys.stderr)
        return 2
    if not Path("vercel.json").is_file() or not Path("frontend").is_dir():
        print(
            "Run this from the repository root: the deployment uploads the whole tree "
            "described by vercel.json.",
            file=sys.stderr,
        )
        return 2

    api = VerceApi(token, args.team)
    manifest = []
    files = tracked_files()
    print(f"uploading {len(files)} files to Vercel ...")
    for index, path in enumerate(files, 1):
        data = path.read_bytes()
        sha = hashlib.sha1(data).hexdigest()
        status, result = api.upload(data, sha)
        if status not in (200, 201):
            print(f"upload failed for {path}: {status} {str(result)[:200]}", file=sys.stderr)
            return 1
        manifest.append({"file": path.as_posix(), "sha": sha, "size": len(data)})
        if index % 100 == 0:
            print(f"  {index}/{len(files)}")

    payload = {
        "name": args.project,
        "project": args.project,
        "target": args.target,
        "files": manifest,
        "projectSettings": {
            "framework": None,
            "buildCommand": None,
            "installCommand": None,
            "outputDirectory": None,
            "rootDirectory": None,
        },
        "meta": {"gitBranch": "main", "source": "local"},
    }
    status, result = api.call(
        "POST",
        "/v13/deployments",
        json.dumps(payload).encode(),
        {"Content-Type": "application/json"},
    )
    print("deployment:", status)
    if status not in (200, 201) or not isinstance(result, dict):
        print(str(result)[:900], file=sys.stderr)
        return 1
    deployment_id = result["id"]
    print("id:", deployment_id)

    deadline = time.time() + args.timeout
    while time.time() < deadline:
        time.sleep(5)
        _, state = api.call("GET", f"/v13/deployments/{deployment_id}")
        ready = state.get("readyState") if isinstance(state, dict) else None
        print("state:", ready)
        if ready in {"READY", "ERROR", "CANCELED"}:
            print(
                json.dumps(
                    {key: state.get(key) for key in ("url", "alias", "readyState", "errorMessage")},
                    indent=1,
                )
            )
            return 0 if ready == "READY" else 1
    print("timed out waiting for the build", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
