"""Read site feedback from the private Discord channel the /api/feedback webhook posts to.

Webhooks can only post, so reading needs a tiny read-only Discord bot. One-time setup is in
README.md ("Reading feedback"). Credentials live in the git-ignored .env file at the repo root:

    DISCORD_BOT_TOKEN=...      # from the Discord Developer Portal, Bot tab. Never commit or share it.
    DISCORD_FEEDBACK_CHANNEL_ID=...  # right-click the channel, Copy Channel ID (Developer Mode on)

Usage:
    python scripts/read_feedback.py            # messages since the last run (first run: last 50)
    python scripts/read_feedback.py --all      # last 100, ignoring what was already read
    python scripts/read_feedback.py --json     # machine-readable output
The ID of the newest message seen is kept in data/.feedback_state.json (git-ignored).
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"
STATE_FILE = ROOT / "data" / ".feedback_state.json"
API = "https://discord.com/api/v10"


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def fetch(path: str, token: str):
    req = urllib.request.Request(
        API + path,
        headers={"Authorization": f"Bot {token}", "User-Agent": "DiscordBot (feedback-reader, 1.0)"},
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # Windows consoles choke on emoji

    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="ignore the saved position and show the last 100")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    env = load_env()
    token, channel = env.get("DISCORD_BOT_TOKEN"), env.get("DISCORD_FEEDBACK_CHANNEL_ID")
    if not token or not channel:
        print("Missing DISCORD_BOT_TOKEN or DISCORD_FEEDBACK_CHANNEL_ID in .env (see README: Reading feedback).")
        return 2

    state = json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() and not args.all else {}
    after = state.get("last_id")

    messages: list[dict] = []
    try:
        if after:
            cursor = after
            while True:  # page forward through everything new
                page = fetch(f"/channels/{channel}/messages?limit=100&after={cursor}", token)
                if not page:
                    break
                messages.extend(page)
                cursor = max(page, key=lambda m: int(m["id"]))["id"]
                if len(page) < 100:
                    break
        else:
            messages = fetch(f"/channels/{channel}/messages?limit={100 if args.all else 50}", token)
    except urllib.error.HTTPError as e:
        hint = {
            401: "The bot token is wrong or was reset. Copy a fresh one into .env.",
            403: "The bot can't see that channel. Give it View Channel + Read Message History there.",
            404: "Channel not found. Check DISCORD_FEEDBACK_CHANNEL_ID.",
        }.get(e.code, "")
        print(f"Discord API error {e.code}. {hint}")
        return 1

    messages.sort(key=lambda m: int(m["id"]))
    out = [
        {
            "id": m["id"],
            "time": m["timestamp"][:16].replace("T", " ") + " UTC",
            "text": (m.get("content") or "").strip()
            or " | ".join(filter(None, [(e.get("title") or "") + " " + (e.get("description") or "") for e in m.get("embeds", [])])),
        }
        for m in messages
    ]

    if args.json:
        print(json.dumps(out, indent=1, ensure_ascii=False))
    elif not out:
        print("No new feedback.")
    else:
        empty = sum(1 for o in out if not o["text"])
        print(f"{len(out)} message(s){' since last check' if after else ''}:\n")
        for o in out:
            print(f"[{o['time']}]\n{o['text'] or '(empty: turn on Message Content Intent for the bot)'}\n")
        if empty == len(out):
            print("All messages came back empty: enable 'Message Content Intent' on the bot (Developer Portal, Bot tab).")

    if messages:
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        newest = max(messages, key=lambda m: int(m["id"]))["id"]
        if not after or int(newest) > int(after):
            STATE_FILE.write_text(json.dumps({"last_id": newest}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
