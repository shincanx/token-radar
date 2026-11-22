#!/usr/bin/env python3
"""Push files to shincanx/token-radar via the GitHub Contents API.

Reuses the custom.github connector's approved credential path (same
surrogate exchange as github.py; the real token is never read here).
Usage:
  gh-push.py push <repo-dir> <message>   # commit every entry file, update main
  gh-push.py about                       # set repo About (description/homepage/topics)
  gh-push.py head                        # print current main HEAD sha (or NONE)
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response

BASE_URL = "https://api.github.com"
ALLOWED_HOSTS = ["api.github.com"]
CREDENTIAL_NAME = "custom.github"
HEADERS = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}
OWNER = "shincanx"
REPO = "token-radar"

# Every file of the entry, in push order. out/ is build output and stays local.
FILES = [
    "LICENSE",
    "README.md",
    "main.ts",
    "lib/model.ts",
    "dashboard/index.html",
    "dashboard/app.css",
    "dashboard/app.js",
    "screenshots/1-board.png",
    "screenshots/2-detail.png",
    "screenshots/3-filtered.png",
    "vendor/makefun-board.ts",
    "shots.py",
    "gh-push.py",
]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise RuntimeError("redirect refused, verify the endpoint")


def call(path, method="GET", payload=None):
    data = None
    headers = dict(HEADERS)
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        BASE_URL + path, data=data, headers=headers, method=method
    )
    add_surrogate_to_request(request, CREDENTIAL_NAME, allowed_hosts=ALLOWED_HOSTS)
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=120) as response:
            if response.status == 204:
                return {"status": 204}
            return read_json_response(response)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        try:
            detail = json.loads(body)
        except ValueError:
            detail = {"message": body}
        print(json.dumps({"error": detail, "status": e.code}, indent=2))
        raise SystemExit(1)


def get_head():
    try:
        r = call(f"/repos/{OWNER}/{REPO}/git/refs/heads/main")
        return r["object"]["sha"]
    except SystemExit:
        return None


def cmd_head():
    sha = get_head()
    print(sha if sha else "NONE")


def cmd_push(repo_dir, message):
    # Contents API (works on an empty repo too; the git-data API refuses
    # blob creation with 409 "Git Repository is empty" until a first commit).
    last = None
    for name in FILES:
        with open(os.path.join(repo_dir, name), "rb") as f:
            raw = f.read()
        sha = None
        try:
            cur = call(
                f"/repos/{OWNER}/{REPO}/contents/{name}?ref=main", "GET"
            )
            if isinstance(cur, dict) and cur.get("sha"):
                sha = cur["sha"]
        except SystemExit:
            sha = None
        payload = {
            "message": message,
            "content": base64.b64encode(raw).decode(),
            "branch": "main",
        }
        if sha:
            payload["sha"] = sha
        r = call(f"/repos/{OWNER}/{REPO}/contents/{name}", "PUT", payload)
        last = r["commit"]["sha"]
        print(f"pushed {name} ({len(raw)} bytes) -> {last[:8]}")
    print(json.dumps({"commit": last, "message": message}))


def cmd_about():
    summary = "Token Radar: a fitted pre-token launch radar — size-elastic value model, walk-forward tested, costed farm verdicts."
    desc = (
        summary
        + " Built by an AI agent for make.fun's \u201cBuild the best token launch radar\u201d bounty, $1,325 in USDC."
    )
    call(
        f"/repos/{OWNER}/{REPO}",
        "PATCH",
        {
            "description": desc,
            "homepage": "https://make.fun/bounty/token-radar-01",
        },
    )
    call(
        f"/repos/{OWNER}/{REPO}/topics",
        "PUT",
        {"names": ["makefun", "ai-agents", "bounties", "trading"]},
    )
    print(json.dumps({"about": "set", "description": desc}))


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "push":
        cmd_push(sys.argv[2], sys.argv[3])
    elif len(sys.argv) >= 2 and sys.argv[1] == "about":
        cmd_about()
    elif len(sys.argv) >= 2 and sys.argv[1] == "head":
        cmd_head()
    else:
        print(__doc__)
        raise SystemExit(2)
