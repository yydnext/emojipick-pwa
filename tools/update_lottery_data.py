#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Update EmojiPick lottery data files from NY Open Data (Socrata).

Outputs (in ./data):
- powerball_latest.json
- powerball_history.json
- powerball_stats.json
- megamillions_latest.json
- megamillions_history.json
- megamillions_stats.json

Design goals:
- Avoid Socrata $select to prevent "no-such-column" 400 errors.
- Keep output schema stable for the existing compare.html/app.js.
- Be tolerant to minor schema/format variations in the dataset.
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import requests


BASE = "https://data.ny.gov/resource"
TIMEOUT = 30

# How many draws to store (recent -> older)
HISTORY_LIMIT = 520  # ~2 years (2 draws/week)
FETCH_LIMIT = 800    # fetch extra to be safe

GAMES = [
    {
        "code": "pb",
        "data_key": "powerball",
        "dataset": "d6yy-54nr",  # NY Open Data: Powerball Winning Numbers
        "label": "Powerball",
        "bonus_label": "Powerball",
    },
    {
        "code": "mm",
        "data_key": "megamillions",
        "dataset": "5xaw-6ayf",  # NY Open Data: Mega Millions Winning Numbers
        "label": "Mega Millions",
        "bonus_label": "Mega Ball",
    },
]

# repo root = parent of /tools
REPO_ROOT = os.path.dirname(os.path.dirname(__file__))
OUT_DIR = os.path.join(REPO_ROOT, "data")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def die(msg: str, code: int = 1) -> None:
    print(f"[update_lottery_data] {msg}", file=sys.stderr)
    raise SystemExit(code)


def http_get_json(url: str, params: Dict[str, str]) -> Any:
    headers = {
        "Accept": "application/json",
        "User-Agent": "EmojiPick-Updater/1.0 (+github-actions)",
    }
    try:
        r = requests.get(url, params=params, timeout=TIMEOUT, headers=headers)
    except requests.RequestException as e:
        die(f"Request failed: {e}")

    if r.status_code != 200:
        # Print a useful short snippet. (Socrata errors include JSON text.)
        text = (r.text or "").strip().replace("\n", " ")
        die(f"HTTP {r.status_code} from {r.url}: {text[:300]}")
    try:
        return r.json()
    except ValueError:
        die(f"Non-JSON response from {r.url}: {(r.text or '')[:200]}")


def normalize_date(s: str) -> str:
    """draw_date sometimes contains time; keep YYYY-MM-DD."""
    if not s:
        return ""
    return str(s)[:10]


_NUM_RE = re.compile(r"\d+")


def parse_int_list(raw: str) -> List[int]:
    if not raw:
        return []
    out: List[int] = []
    for p in raw.strip().replace(",", " ").split():
        try:
            out.append(int(p))
        except ValueError:
            return []
    return out


def get_int(row: Dict[str, Any], keys: List[str]) -> Optional[int]:
    for k in keys:
        v = row.get(k)
        if v in (None, ""):
            continue
        try:
            return int(v)
        except Exception:
            pass
    return None


def parse_numbers_for_game(game_code: str, row: Dict[str, Any]) -> Optional[Tuple[List[int], int]]:
    """
    Powerball: often winning_numbers has 6 nums (5 + powerball)
    Mega Millions: winning_numbers has 5 nums, mega_ball is separate column
    """
    wn = row.get("winning_numbers") or row.get("winning_number") or row.get("winning") or ""
    nums = parse_int_list(str(wn))

    if game_code == "mm":
        if len(nums) < 5:
            return None
        main = nums[:5]
        bonus = get_int(row, ["mega_ball", "megaball", "mega", "mega_ball_number"])
        if bonus is None and len(nums) >= 6:
            bonus = nums[5]
        if bonus is None:
            return None
        return main, bonus

    # default: powerball
    if len(nums) >= 6:
        return nums[:5], nums[5]

    # fallback if powerball is separate
    if len(nums) >= 5:
        bonus = get_int(row, ["powerball", "power_ball", "pb", "powerball_number"])
        if bonus is None:
            return None
        return nums[:5], bonus

    return None


def compute_stats(draws: List[Dict[str, Any]], bonus_label: str) -> Dict[str, Any]:
    freq_main: Dict[int, int] = {}
    freq_bonus: Dict[int, int] = {}

    for d in draws:
        for n in d.get("numbers", []) or []:
            if isinstance(n, int):
                freq_main[n] = freq_main.get(n, 0) + 1
        b = d.get("bonus", None)
        if isinstance(b, int):
            freq_bonus[b] = freq_bonus.get(b, 0) + 1

    hot_main = [n for (n, _c) in sorted(freq_main.items(), key=lambda kv: (-kv[1], kv[0]))[:10]]
    hot_bonus = [n for (n, _c) in sorted(freq_bonus.items(), key=lambda kv: (-kv[1], kv[0]))[:10]]

    return {
        "hot_main": hot_main,
        "hot_bonus": hot_bonus,
        "bonus_label": bonus_label,      # UI can render: f"{bonus_label} {n}"
        "window_draws": len(draws),
        "source": "computed_from_history",
        "updated_at": utc_now_iso(),
    }


def pick_draw_no(row: Dict[str, Any]) -> Any:
    """
    Socrata datasets vary. Prefer one of:
    draw_no, draw_number, draw, draw_nbr, etc.
    If none exists, leave "" (string) so schema stays stable.
    """
    for k in ("draw_no", "draw_number", "draw", "draw_nbr", "drawid", "drawing"):
        if k in row and row.get(k) not in (None, ""):
            return row.get(k)
    return ""


def fetch_game(game: Dict[str, str]) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    dataset = game["dataset"]
    url = f"{BASE}/{dataset}.json"

    # IMPORTANT: Do NOT use $select. If you select a non-existent column, Socrata returns 400.
    # Keep only $order + $limit. We'll safely read columns via row.get(...).
    params = {
        "$order": "draw_date DESC",
        "$limit": str(FETCH_LIMIT),
    }

    rows = http_get_json(url, params=params)
    if not isinstance(rows, list) or not rows:
        die(f"No rows returned for {game['data_key']} ({dataset}).")

    draws: List[Dict[str, Any]] = []
    seen = set()

    for row in rows:
        raw_date = normalize_date(row.get("draw_date", ""))
        wn = row.get("winning_numbers", "") or row.get("winning_number", "") or row.get("winning", "")
        parsed = parse_numbers_for_game(game["code"], row)


        if not raw_date or not parsed:
            continue

        main, bonus = parsed

        draw_no = pick_draw_no(row)

        key = (raw_date, tuple(main), int(bonus))
        if key in seen:
            continue
        seen.add(key)

        draws.append(
            {
                "draw_no": draw_no,
                "draw_date": raw_date,
                "numbers": main,
                "bonus": int(bonus),
            }
        )

        if len(draws) >= HISTORY_LIMIT:
            break

    if not draws:
        die(f"Parsed 0 draws for {game['data_key']} ({dataset}).")

    updated_at = utc_now_iso()

    latest = draws[0]
    latest_out = {
        "game": game["code"],
        "draw_no": latest.get("draw_no", ""),
        "draw_date": latest["draw_date"],
        "numbers": latest["numbers"],
        "bonus": latest["bonus"],
        "bonus_label": game["bonus_label"],
        "source": "official",
        "updated_at": updated_at,
    }

    history_out = {
        "game": game["code"],
        "draws": draws,
        "source": "official",
        "updated_at": updated_at,
    }

    stats_out = compute_stats(draws, bonus_label=game["bonus_label"])
    stats_out["game"] = game["code"]

    return latest_out, history_out, stats_out


def write_json(path: str, obj: Any) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main() -> None:
    if not os.path.isdir(OUT_DIR):
        die(f"Output dir not found: {OUT_DIR}")

    for game in GAMES:
        print(f"[update_lottery_data] Fetching {game['label']}...")
        latest, history, stats = fetch_game(game)

        dk = game["data_key"]
        write_json(os.path.join(OUT_DIR, f"{dk}_latest.json"), latest)
        write_json(os.path.join(OUT_DIR, f"{dk}_history.json"), history)
        write_json(os.path.join(OUT_DIR, f"{dk}_stats.json"), stats)

        print(f"[update_lottery_data] Wrote {dk}_latest.json / {dk}_history.json / {dk}_stats.json")

    print("[update_lottery_data] Done.")


if __name__ == "__main__":
    main()
