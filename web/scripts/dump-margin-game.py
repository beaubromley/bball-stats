"""Dump every event for the margin-record game (c738ac29) so we can see
whether the displayed 15-3 final reflects undone plays."""
import urllib.request
import json

TURSO_URL = 'https://bball-stats-beaubromley.aws-us-east-2.turso.io'
TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzA2ODg1NDcsImlkIjoiMzAzMTljZWYtNTlmYy00YzJkLThjODAtNDJmY2YzZWI1YmI3IiwicmlkIjoiZGU1NWJmZmItMDY0NC00NDM2LWEwZmQtODI5YTU4NzNlODY1In0.aD6SggGksUEtVyjys7UCi5Si7X8PlqXL9SJZ1AgpbmKz6RRLSYl6aZG-C4WhllJdi36nc58hKJIt1I82OhYsBg'

GID = 'c738ac29-20fa-49c4-9534-81ea4537bc87'


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


game = turso_query(f"SELECT * FROM games WHERE id = '{GID}'")
print("Game row:")
for k, v in game[0].items():
    print(f"  {k}: {v}")

rosters = turso_query(f"""
    SELECT r.team, p.name
    FROM rosters r
    JOIN players p ON p.id = r.player_id
    WHERE r.game_id = '{GID}'
    ORDER BY r.team, p.name
""")
team_a = [r['name'] for r in rosters if r['team'] == 'A']
team_b = [r['name'] for r in rosters if r['team'] == 'B']
print(f"\nTeam A: {', '.join(team_a)}")
print(f"Team B: {', '.join(team_b)}")

events = turso_query(f"""
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
    WHERE ge.game_id = '{GID}'
    ORDER BY ge.created_at ASC, ge.id ASC
""")

corrected_ids = set()
for e in events:
    if e['event_type'] == 'correction' and e['corrected_event_id'] is not None:
        corrected_ids.add(int(e['corrected_event_id']))

print(f"\nTotal events: {len(events)}  |  corrected score ids: {sorted(corrected_ids)}")
print()
print(f"  {'#':>3} {'id':>6} {'type':<11} {'pv':>4} {'team':<5} {'player':<14} {'corrects':<9} state")
a = b = 0
a_filtered = b_filtered = 0
score_count_a = score_count_b = 0
for i, e in enumerate(events, 1):
    eid = int(e['id'])
    eve_type = e['event_type']
    pv = int(e['point_value']) if e['point_value'] is not None else 0
    team = e['team'] or ''
    player = (e['player'] or '')[:14]
    corrects = str(e['corrected_event_id']) if e['corrected_event_id'] is not None else ''

    if eve_type in ('score', 'correction'):
        if team == 'A':
            a += pv
        elif team == 'B':
            b += pv

    included_in_filtered_walk = (eve_type == 'score' and eid not in corrected_ids)
    if included_in_filtered_walk:
        if team == 'A':
            a_filtered += pv
            score_count_a += 1
        elif team == 'B':
            b_filtered += pv
            score_count_b += 1

    flag = ''
    if eve_type == 'score' and eid in corrected_ids:
        flag = '  <- UNDONE'
    elif eve_type == 'correction':
        flag = '  <- UNDO'
    print(f"  {i:>3} {eid:>6} {eve_type:<11} {pv:>+4} {team:<5} {player:<14} {corrects:<9} OLD A={a} B={b}  NEW A={a_filtered} B={b_filtered}{flag}")

print(f"\nFinal (OLD walk, score+correction):    A={a}, B={b}")
print(f"Final (NEW walk, uncorrected scores):  A={a_filtered}, B={b_filtered}")
print(f"Uncorrected score events:  A={score_count_a}, B={score_count_b}")
