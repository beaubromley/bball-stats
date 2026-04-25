"""Replicate the new getGameLevelRecords logic in Python and confirm
the margin/comeback record holders match expected truth — especially
for games with bogus corrected_event_id values."""
import urllib.request
import json

TURSO_URL = 'https://bball-stats-beaubromley.aws-us-east-2.turso.io'
TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzA2ODg1NDcsImlkIjoiMzAzMTljZWYtNTlmYy00YzJkLThjODAtNDJmY2YzZWI1YmI3IiwicmlkIjoiZGU1NWJmZmItMDY0NC00NDM2LWEwZmQtODI5YTU4NzNlODY1In0.aD6SggGksUEtVyjys7UCi5Si7X8PlqXL9SJZ1AgpbmKz6RRLSYl6aZG-C4WhllJdi36nc58hKJIt1I82OhYsBg'


def turso_query(sql):
    payload = {'requests': [{'type': 'execute', 'stmt': {'sql': sql}}]}
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


scores = turso_query("""
    SELECT ge.id, ge.game_id, ge.player_id, ge.point_value, ge.created_at, r.team
    FROM game_events ge
    JOIN rosters r ON r.game_id = ge.game_id AND r.player_id = ge.player_id
    JOIN games g ON g.id = ge.game_id
    WHERE g.status = 'finished' AND g.winning_team IS NOT NULL
      AND ge.event_type = 'score'
    ORDER BY ge.game_id, ge.created_at ASC, ge.id ASC
""")
corrections = turso_query("""
    SELECT ge.id, ge.game_id, ge.player_id, ge.point_value, ge.corrected_event_id, ge.created_at
    FROM game_events ge
    JOIN games g ON g.id = ge.game_id
    WHERE g.status = 'finished' AND g.winning_team IS NOT NULL
      AND ge.event_type = 'correction'
""")
games = turso_query("SELECT id, start_time, winning_team FROM games WHERE status='finished' AND winning_team IS NOT NULL")

scores_by_game = {}
for s in scores:
    scores_by_game.setdefault(s['game_id'], []).append({
        'id': int(s['id']),
        'player_id': s['player_id'],
        'pv': int(s['point_value']),
        'created_at': s['created_at'],
        'team': s['team'],
    })
corr_by_game = {}
for c in corrections:
    corr_by_game.setdefault(c['game_id'], []).append({
        'id': int(c['id']),
        'player_id': c['player_id'],
        'pv': int(c['point_value']),
        'corrected_event_id': int(c['corrected_event_id']) if c['corrected_event_id'] is not None else None,
        'created_at': c['created_at'],
    })
meta = {g['id']: g for g in games}


def compute_undone(scores_g, corrections_g):
    undone = set()
    score_ids = {s['id'] for s in scores_g}
    remaining = []
    for c in corrections_g:
        ceid = c['corrected_event_id']
        if ceid is not None and ceid in score_ids and ceid not in undone:
            undone.add(ceid)
        else:
            remaining.append(c)
    for c in remaining:
        cands = [s for s in scores_g
                 if s['player_id'] == c['player_id']
                 and s['pv'] == -c['pv']
                 and s['created_at'] < c['created_at']
                 and s['id'] not in undone]
        cands.sort(key=lambda s: (s['created_at'], s['id']), reverse=True)
        if cands:
            undone.add(cands[0]['id'])
    return undone


stats = []
for gid, scs in scores_by_game.items():
    m = meta.get(gid)
    if not m:
        continue
    corrs = corr_by_game.get(gid, [])
    undone = compute_undone(scs, corrs)
    a = b = 0
    max_def = 0
    for e in scs:
        if e['id'] in undone:
            continue
        if e['team'] == 'A':
            a += e['pv']
        else:
            b += e['pv']
        winner = a if m['winning_team'] == 'A' else b
        loser = b if m['winning_team'] == 'A' else a
        deficit = loser - winner
        if deficit > max_def:
            max_def = deficit
    stats.append({'game_id': gid, 'start_time': m['start_time'], 'winning_team': m['winning_team'],
                  'final_a': a, 'final_b': b, 'comeback': max_def, 'margin': abs(a-b)})

max_margin = max(s['margin'] for s in stats)
max_comeback = max(s['comeback'] for s in stats)
print(f"MARGIN record (= {max_margin}):")
for s in sorted([x for x in stats if x['margin'] == max_margin], key=lambda x: x['start_time'], reverse=True):
    print(f"  {s['game_id']}  A={s['final_a']} B={s['final_b']}  winner={s['winning_team']}  {s['start_time']}")
print(f"\nCOMEBACK record (= {max_comeback}):")
for s in sorted([x for x in stats if x['comeback'] == max_comeback], key=lambda x: x['start_time'], reverse=True):
    print(f"  {s['game_id']}  A={s['final_a']} B={s['final_b']}  winner={s['winning_team']}  {s['start_time']}")

# Spot-check the previously-broken game
TARGET = 'c738ac29-20fa-49c4-9534-81ea4537bc87'
print(f"\n--- {TARGET} (was 15-3) ---")
for s in stats:
    if s['game_id'] == TARGET:
        print(f"  Final: A={s['final_a']} B={s['final_b']}  margin={s['margin']}  comeback={s['comeback']}")
