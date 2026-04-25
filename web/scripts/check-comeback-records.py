"""Audit the margin / comeback game records.

Replicates the production SQL in lib/records.ts (getGameLevelRecords),
identifies which games hold the records, then dumps every event for
those games so we can verify by hand whether undone plays are being
handled correctly.

Run with: python3 scripts/check-comeback-records.py
"""
import urllib.request
import json

TURSO_URL = 'https://bball-stats-beaubromley.aws-us-east-2.turso.io'
TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzA2ODg1NDcsImlkIjoiMzAzMTljZWYtNTlmYy00YzJkLThjODAtNDJmY2YzZWI1YmI3IiwicmlkIjoiZGU1NWJmZmItMDY0NC00NDM2LWEwZmQtODI5YTU4NzNlODY1In0.aD6SggGksUEtVyjys7UCi5Si7X8PlqXL9SJZ1AgpbmKz6RRLSYl6aZG-C4WhllJdi36nc58hKJIt1I82OhYsBg'


def turso_query(sql, args=None):
    stmt = {'sql': sql}
    if args is not None:
        stmt['args'] = [{'type': 'text', 'value': str(a)} for a in args]
    payload = {'requests': [{'type': 'execute', 'stmt': stmt}]}
    req = urllib.request.Request(
        TURSO_URL + '/v2/pipeline',
        data=json.dumps(payload).encode(),
        headers={'Authorization': 'Bearer ' + TURSO_TOKEN, 'Content-Type': 'application/json'}
    )
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read())
    result = data['results'][0]['response']['result']
    cols = [c['name'] for c in result['cols']]
    rows = []
    for row in result['rows']:
        rows.append({cols[i]: (row[i].get('value') if row[i]['type'] != 'null' else None) for i in range(len(cols))})
    return rows


# 1) Compute what the records page shows: for each finished/decided game,
#    sum the uncorrected scores per team and find the max comeback during
#    the chronological walk.
print("=" * 80)
print("Step 1: Replicate getGameLevelRecords")
print("=" * 80)

# Score events excluding any score that was corrected (mirrors production SQL).
events = turso_query("""
    SELECT
      ge.id,
      ge.game_id,
      ge.point_value,
      ge.created_at,
      r.team,
      p.name AS player_name
    FROM game_events ge
    JOIN rosters r ON r.game_id = ge.game_id AND r.player_id = ge.player_id
    JOIN players p ON p.id = ge.player_id
    JOIN games g ON g.id = ge.game_id
    WHERE g.status = 'finished'
      AND g.winning_team IS NOT NULL
      AND ge.event_type = 'score'
      AND ge.id NOT IN (
        SELECT corrected_event_id FROM game_events
        WHERE event_type = 'correction' AND corrected_event_id IS NOT NULL
      )
    ORDER BY ge.game_id, ge.created_at ASC, ge.id ASC
""")

games_meta = turso_query("""
    SELECT id, start_time, winning_team
    FROM games
    WHERE status = 'finished' AND winning_team IS NOT NULL
""")
meta_by_id = {g['id']: g for g in games_meta}

# Walk per-game.
by_game = {}
for e in events:
    by_game.setdefault(e['game_id'], []).append(e)

stats = []
for gid, evs in by_game.items():
    m = meta_by_id.get(gid)
    if not m:
        continue
    a = b = 0
    max_def = 0
    for e in evs:
        pv = int(e['point_value'])
        if e['team'] == 'A':
            a += pv
        else:
            b += pv
        winner = a if m['winning_team'] == 'A' else b
        loser = b if m['winning_team'] == 'A' else a
        deficit = loser - winner
        if deficit > max_def:
            max_def = deficit
    stats.append({
        'game_id': gid,
        'start_time': m['start_time'],
        'winning_team': m['winning_team'],
        'final_a': a,
        'final_b': b,
        'comeback': max_def,
        'margin': abs(a - b),
    })

# Find the record holders.
max_margin = max(s['margin'] for s in stats)
max_comeback = max(s['comeback'] for s in stats)
margin_holders = [s for s in stats if s['margin'] == max_margin]
comeback_holders = [s for s in stats if s['comeback'] == max_comeback]

print(f"\nMARGIN record (= {max_margin}):")
for s in margin_holders:
    print(f"  game_id={s['game_id']} | A={s['final_a']} B={s['final_b']} | winner={s['winning_team']} | start={s['start_time']}")
print(f"\nCOMEBACK record (= {max_comeback}):")
for s in comeback_holders:
    print(f"  game_id={s['game_id']} | A={s['final_a']} B={s['final_b']} | winner={s['winning_team']} | start={s['start_time']}")

# 2) For every record-holder game, dump ALL events (including corrections
#    and non-score events skipped for stats) so we can see exactly what's
#    in the DB.
print()
print("=" * 80)
print("Step 2: Dump every event for record-holder games")
print("=" * 80)

target_ids = sorted({s['game_id'] for s in margin_holders + comeback_holders})

for gid in target_ids:
    print(f"\n--- Game {gid} ---")
    rosters = turso_query(f"""
        SELECT r.team, p.name
        FROM rosters r
        JOIN players p ON p.id = r.player_id
        WHERE r.game_id = '{gid}'
        ORDER BY r.team, p.name
    """)
    team_a = [r['name'] for r in rosters if r['team'] == 'A']
    team_b = [r['name'] for r in rosters if r['team'] == 'B']
    m = meta_by_id[gid]
    print(f"start={m['start_time']}  winner={m['winning_team']}")
    print(f"Team A: {', '.join(team_a)}")
    print(f"Team B: {', '.join(team_b)}")

    all_events = turso_query(f"""
        SELECT
          ge.id,
          ge.event_type,
          ge.point_value,
          ge.corrected_event_id,
          ge.created_at,
          r.team,
          p.name AS player
        FROM game_events ge
        LEFT JOIN rosters r ON r.game_id = ge.game_id AND r.player_id = ge.player_id
        LEFT JOIN players p ON p.id = ge.player_id
        WHERE ge.game_id = '{gid}'
        ORDER BY ge.created_at ASC, ge.id ASC
    """)

    # Build a set of corrected score ids in this game.
    corrected_ids = set()
    for e in all_events:
        if e['event_type'] == 'correction' and e['corrected_event_id'] is not None:
            corrected_ids.add(int(e['corrected_event_id']))

    print()
    print(f"  {'#':>3} {'id':>6} {'type':<11} {'pv':>4} {'team':<5} {'player':<14} {'corrects':<9} state")
    a = b = 0
    a_filtered = b_filtered = 0
    for i, e in enumerate(all_events, 1):
        eid = int(e['id'])
        eve_type = e['event_type']
        pv = int(e['point_value']) if e['point_value'] is not None else 0
        team = e['team'] or ''
        player = (e['player'] or '')[:14]
        corrects = str(e['corrected_event_id']) if e['corrected_event_id'] is not None else ''

        # OLD behavior: walk includes both score AND correction
        if eve_type in ('score', 'correction'):
            if team == 'A':
                a += pv
            elif team == 'B':
                b += pv

        # NEW behavior: walk includes only uncorrected scores
        included_in_filtered_walk = (eve_type == 'score' and eid not in corrected_ids)
        if included_in_filtered_walk:
            if team == 'A':
                a_filtered += pv
            elif team == 'B':
                b_filtered += pv

        flag = ''
        if eve_type == 'score' and eid in corrected_ids:
            flag = '  ← UNDONE'
        elif eve_type == 'correction':
            flag = '  ← UNDO'
        print(f"  {i:>3} {eid:>6} {eve_type:<11} {pv:>+4} {team:<5} {player:<14} {corrects:<9} OLD A={a} B={b}  NEW A={a_filtered} B={b_filtered}{flag}")

    print(f"\n  Final (OLD walk, score+correction):     A={a}, B={b}")
    print(f"  Final (NEW walk, uncorrected scores):  A={a_filtered}, B={b_filtered}")
