"""
Backfill the player_game_stats rollup table for every game in the live DB.

Idempotent: running it twice produces the same end state. Safe to re-run any time.

Usage:
  python3 web/scripts/backfill-player-game-stats.py              # all games
  python3 web/scripts/backfill-player-game-stats.py <game_id>    # single game

The math here MUST match lib/player-game-stats.ts exactly. If the production
TS code ever diverges, the backfill is the source of truth for first-pass
correctness; otherwise refreshGameStats() owns it from then on.
"""
import sys
import urllib.request
import json
from typing import Any

URL = 'https://bball-stats-beaubromley.aws-us-east-2.turso.io'
TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzA2ODg1NDcsImlkIjoiMzAzMTljZWYtNTlmYy00YzJkLThjODAtNDJmY2YzZWI1YmI3IiwicmlkIjoiZGU1NWJmZmItMDY0NC00NDM2LWEwZmQtODI5YTU4NzNlODY1In0.aD6SggGksUEtVyjys7UCi5Si7X8PlqXL9SJZ1AgpbmKz6RRLSYl6aZG-C4WhllJdi36nc58hKJIt1I82OhYsBg'


def execute(sql: str, args: list = None) -> list:
    if args is None:
        args = []
    stmt: dict = {'sql': sql}
    if args:
        stmt['args'] = [
            {'type': 'null'} if a is None
            else {'type': 'integer', 'value': str(a)} if isinstance(a, bool) or isinstance(a, int)
            else {'type': 'float', 'value': a} if isinstance(a, float)
            else {'type': 'text', 'value': str(a)}
            for a in args
        ]
    payload = {'requests': [{'type': 'execute', 'stmt': stmt}]}
    req = urllib.request.Request(
        URL + '/v2/pipeline',
        data=json.dumps(payload).encode(),
        headers={'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json'},
    )
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read())
    r = data['results'][0]
    if r.get('type') == 'error':
        raise RuntimeError(r.get('error') or r)
    res = r['response']['result']
    cols = [c['name'] for c in res['cols']]
    rows = []
    for row in res['rows']:
        d = {}
        for i, cell in enumerate(row):
            t = cell.get('type')
            v = cell.get('value')
            if t == 'null':
                d[cols[i]] = None
            elif t == 'integer':
                d[cols[i]] = int(v)
            elif t == 'float':
                d[cols[i]] = float(v)
            else:
                d[cols[i]] = v
        rows.append(d)
    return rows


def ensure_schema():
    """Create the player_game_stats table if it doesn't exist yet."""
    execute("""
        CREATE TABLE IF NOT EXISTS player_game_stats (
            game_id          TEXT    NOT NULL,
            player_id        TEXT    NOT NULL,
            team             TEXT    NOT NULL,
            game_status      TEXT    NOT NULL,
            start_time       DATETIME NOT NULL,
            scoring_mode     TEXT    NOT NULL,
            won              INTEGER,
            points           INTEGER NOT NULL,
            ones_made        INTEGER NOT NULL,
            twos_made        INTEGER NOT NULL,
            assists          INTEGER NOT NULL,
            steals           INTEGER NOT NULL,
            blocks           INTEGER NOT NULL,
            fantasy_points   INTEGER NOT NULL,
            team_score       INTEGER NOT NULL,
            opp_score        INTEGER NOT NULL,
            plus_minus       INTEGER NOT NULL,
            effective_games  REAL    NOT NULL,
            was_game_mvp     INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (game_id, player_id),
            FOREIGN KEY (game_id) REFERENCES games(id),
            FOREIGN KEY (player_id) REFERENCES players(id)
        )
    """)
    execute("CREATE INDEX IF NOT EXISTS idx_pgs_player ON player_game_stats(player_id)")
    execute("CREATE INDEX IF NOT EXISTS idx_pgs_status ON player_game_stats(game_status)")


def fantasy_points(pts: int, asts: int, stls: int, blks: int) -> int:
    return pts + asts + stls + blks


def refresh_game(game_id: str):
    """Recompute and write all player_game_stats rows for one game."""
    games = execute(
        "SELECT id, status, winning_team, start_time, scoring_mode FROM games WHERE id = ?",
        [game_id],
    )
    if not games:
        execute("DELETE FROM player_game_stats WHERE game_id = ?", [game_id])
        return ('deleted', 0)
    game = games[0]

    roster = execute(
        "SELECT player_id, team FROM rosters WHERE game_id = ?", [game_id]
    )
    if not roster:
        execute("DELETE FROM player_game_stats WHERE game_id = ?", [game_id])
        return ('no_roster', 0)

    events = execute(
        "SELECT id, player_id, event_type, point_value FROM game_events WHERE game_id = ?",
        [game_id],
    )

    by_player: dict = {}
    for r in roster:
        by_player[r['player_id']] = {
            'player_id': r['player_id'],
            'team': r['team'],
            'points': 0, 'ones_made': 0, 'twos_made': 0,
            'assists': 0, 'steals': 0, 'blocks': 0,
        }

    for e in events:
        agg = by_player.get(e['player_id'])
        if agg is None:
            continue
        et = e['event_type']
        pv = e['point_value']
        if et == 'score':
            agg['points'] += pv
            if pv == 1: agg['ones_made'] += 1
            elif pv == 2: agg['twos_made'] += 1
        elif et == 'correction':
            agg['points'] += pv
            if pv == -1: agg['ones_made'] -= 1
            elif pv == -2: agg['twos_made'] -= 1
        elif et == 'assist': agg['assists'] += 1
        elif et == 'steal':  agg['steals'] += 1
        elif et == 'block':  agg['blocks'] += 1

    team_a_score = sum(a['points'] for a in by_player.values() if a['team'] == 'A')
    team_b_score = sum(a['points'] for a in by_player.values() if a['team'] == 'B')
    winning_score = max(team_a_score, team_b_score)
    effective_games = max(winning_score, 11) / 11.0 if game['status'] == 'finished' else 1.0

    # MVP tiebreaker: fp DESC, pts DESC, asts DESC, player_id ASC. Only winning team eligible.
    mvp_player_id = None
    if game['status'] == 'finished' and game['winning_team']:
        winners = [a for a in by_player.values() if a['team'] == game['winning_team']]
        best = None
        for a in winners:
            fp = fantasy_points(a['points'], a['assists'], a['steals'], a['blocks'])
            cand = {'player_id': a['player_id'], 'fp': fp, 'pts': a['points'], 'asts': a['assists']}
            if best is None:
                best = cand
            elif (cand['fp'] > best['fp']
                  or (cand['fp'] == best['fp'] and cand['pts'] > best['pts'])
                  or (cand['fp'] == best['fp'] and cand['pts'] == best['pts'] and cand['asts'] > best['asts'])
                  or (cand['fp'] == best['fp'] and cand['pts'] == best['pts'] and cand['asts'] == best['asts'] and cand['player_id'] < best['player_id'])):
                best = cand
        mvp_player_id = best['player_id'] if best else None

    written = 0
    for a in by_player.values():
        team_score = team_a_score if a['team'] == 'A' else team_b_score
        opp_score = team_b_score if a['team'] == 'A' else team_a_score
        won = None
        if game['status'] == 'finished' and game['winning_team']:
            won = 1 if a['team'] == game['winning_team'] else 0
        fp = fantasy_points(a['points'], a['assists'], a['steals'], a['blocks'])
        was_mvp = 1 if a['player_id'] == mvp_player_id else 0

        execute("""
            INSERT OR REPLACE INTO player_game_stats (
                game_id, player_id, team, game_status, start_time, scoring_mode,
                won, points, ones_made, twos_made, assists, steals, blocks,
                fantasy_points, team_score, opp_score, plus_minus, effective_games,
                was_game_mvp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            game_id, a['player_id'], a['team'], game['status'], game['start_time'], game['scoring_mode'],
            won, a['points'], a['ones_made'], a['twos_made'], a['assists'], a['steals'], a['blocks'],
            fp, team_score, opp_score, team_score - opp_score, effective_games, was_mvp,
        ])
        written += 1
    return ('refreshed', written)


def main():
    ensure_schema()

    if len(sys.argv) > 1:
        gid = sys.argv[1]
        status, n = refresh_game(gid)
        print(f"{gid}: {status}, wrote {n} rows")
        return

    games = execute("SELECT id FROM games ORDER BY start_time ASC")
    print(f"Refreshing {len(games)} games...")
    total_rows = 0
    refreshed = 0
    skipped = 0
    deleted = 0
    for i, g in enumerate(games):
        status, n = refresh_game(g['id'])
        total_rows += n
        if status == 'refreshed':
            refreshed += 1
        elif status == 'no_roster':
            skipped += 1
        else:
            deleted += 1
        if (i + 1) % 10 == 0:
            print(f"  {i + 1} / {len(games)}...")

    print(f"\nDone: {refreshed} games refreshed, {skipped} no-roster skipped, {deleted} deleted, {total_rows} player rows total")

    # Sanity: total rows in the table
    res = execute("SELECT COUNT(*) AS n FROM player_game_stats")
    print(f"player_game_stats rows in DB: {res[0]['n']}")


if __name__ == '__main__':
    main()
