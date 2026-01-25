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
"""

from __future__ import annotations
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import requests


BASE = "https://data.ny.gov/resource"

GAMES = [
    {
        "code": "pb",
        "data_key": "powerball",
        "dataset": "d6yy-54nr",  # Powerball Winning Numbers (NY Open Data)
        "label": "Powerball",
        "bonus_label": "Powerball",
    },
    {
        "code": "mm",
        "data_key": "megamillions",
        "dataset": "5xaw-6ayf",  # Mega Millions Winning Numbers (NY Open Data)
        "label": "Mega Millions",
        "bonus_label": "Mega Ball",
    },
]

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
TIMEOUT = 30

# How many draws to store (recent -> older)
HISTORY_LIMIT = 520  # ~2 years for 2 draws/week games
FETCH_LIMIT = 700    # fetch a bit more to be safe


def die(msg: str, code: int = 1) -> None:
    print(f"[update_lottery_data] {msg}", file=sys.stderr)
    raise SystemExit(code)


def http_get_json(url: str, params: Dict[str, str]) -> Any:
    headers = {
        "Accept": "application/json",
        "User-Agent": "EmojiPick-Updater/1.0",
    }
    r = requests.get(url, params=params, timeout=TIMEOUT, headers=headers)
    if r.status_code != 200:
        die(f"HTTP {r.status_code} from {r.url}: {r.text[:300]}")
    return r.json()


def parse_winning_numbers(raw: str) -> Optional[Tuple[List[int], int]]:
    """
    Socrata rows usually have `winning_numbers` like: "11 24 33 38 47 1"
    => first 5 are main, last is bonus.
    (Powerball, MegaMillions 모두 이 포맷으로 제공되는 경우가 많음)
    """
    if not raw:
        return None
    parts = [p for p in raw.strip().split() if p.strip()]
    nums: List[int] = []
    for p in parts:
        try:
            nums.append(int(p))
        except ValueError:
            return None
    if len(nums) < 6:
        return None
    main = nums[:5]
    bonus = nums[5]
    return main, bonus


def normalize_date(s: str) -> str:
    """
    draw_date sometimes includes time; keep YYYY-MM-DD.
    """
    if not s:
        return ""
    return str(s)[:10]


def compute_stats(draws: List[Dict[str, Any]]) -> Dict[str, Any]:
    freq_main: Dict[int, int] = {}
    freq_bonus: Dict[int, int] = {}
    for d in draws:
        for n in d.get("main_numbers", []) or []:
            try:
                nn = int(n)
            except Exception:
                continue
            freq_main[nn] = freq_main.get(nn, 0) + 1
        b = d.get("bonus_number", None)
        if b is not None and b != "":
            try:
                bb = int(b)
            except Exception:
                bb = None
            if bb is not None:
                freq_bonus[bb] = freq_bonus.get(bb, 0) + 1

    hot_main = [n for (n, _c) in sorted(freq_main.items(), key=lambda kv: (-kv[1], kv[0]))[:10]]
    hot_bonus = [n for (n, _c) in sorted(freq_bonus.items(), key=lambda kv: (-kv[1], kv[0]))[:10]]

    return {
        "window": f"last {len(draws)} draws",
        "hot_main": hot_main,
        "hot_bonus": hot_bonus,
        "source": "NY Open Data (computed)",
    }


def fetch_game(game: Dict[str, str]) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    dataset = game["dataset"]
    url = f"{BASE}/{dataset}.json"

    # ✅ 가장 안전한 컬럼만 요청: draw_date, winning_numbers
    # (존재하지 않는 컬럼을 $select에 넣으면 Socrata가 400으로 바로 실패함)
    params = {
        "$select": "draw_date,winning_numbers",
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
        wn = row.get("winning_numbers", "")
        parsed = parse_winning_numbers(wn)
        if not raw_date or not parsed:
            continue
        main, bonus = parsed

        # draw_no는 데이터셋마다 없을 수 있으니 "optional" 처리 (없으면 빈 문자열)
        draw_no = (
            row.get("draw_number")
            or row.get("draw_no")
            or row.get("draw")
            or ""
        )

        key = (raw_date, tuple(main), int(bonus))
        if key in seen:
            continue
        seen.add(key)

        draws.append(
            {
                "draw_no": draw_no,
                "draw_date": raw_date,
                "main_numbers": main,
                "bonus_number": bonus,
            }
        )

        if len(draws) >= HISTORY_LIMIT:
            break

    if not draws:
        die(f"Parsed 0 draws for {game['data_key']} ({dataset}).")

    latest = draws[0]
    nowz = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

    latest_out = {
        "game": game["code"],
        "draw_date": latest["draw_date"],
        "main_numbers": latest["main_numbers"],
        "bonus_number": latest["bonus_number"],
        "bonus_label": game["bonus_label"],
        "source": "NY Open Data",
        "updated_at": nowz,
    }

    history_out = {
        "game": game["code"],
        "meta": {
            "source": "NY Open Data",
            "dataset": dataset,
            "updated_at": nowz,
            "count": len(draws),
        },
        "draws": draws,
    }

    stats_out = compute_stats(draws)

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

        print(f"[update_lottery_data] Wrote {dk}_latest/history/stats.json")

    print("[update_lottery_data] Done.")


if __name__ == "__main__":
    main()
