"""Audit: do corrected_event_id values actually point to valid game_events
in the same game? If not, the records query's NOT IN filter silently
fails to exclude undone scores."""
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


# All correction events that point to a corrected_event_id
corrections = turso_query("""
    SELECT id AS correction_id, game_id, corrected_event_id, point_value, created_at
    FROM game_events
    WHERE event_type = 'correction' AND corrected_event_id IS NOT NULL
    ORDER BY game_id, created_at
""")

print(f"Total corrections with corrected_event_id: {len(corrections)}")

# For each, check whether corrected_event_id exists AND is in the same game.
broken = []
ok = []
for c in corrections:
    target = turso_query(f"SELECT id, game_id, event_type, point_value FROM game_events WHERE id = {c['corrected_event_id']}")
    if not target:
        broken.append((c, 'no event with that id'))
    elif target[0]['game_id'] != c['game_id']:
        broken.append((c, f"id exists but in different game ({target[0]['game_id']})"))
    elif target[0]['event_type'] != 'score':
        broken.append((c, f"target event_type is {target[0]['event_type']}, not score"))
    else:
        ok.append(c)

print(f"  OK (resolves to a score in same game): {len(ok)}")
print(f"  BROKEN: {len(broken)}")
print()
if broken:
    print("=== BROKEN corrections ===")
    by_game = {}
    for c, why in broken:
        by_game.setdefault(c['game_id'], []).append((c, why))
    for gid, items in by_game.items():
        print(f"\nGame {gid}: {len(items)} broken correction(s)")
        for c, why in items:
            print(f"  correction id={c['correction_id']} corrected_event_id={c['corrected_event_id']} pv={c['point_value']}  -> {why}")
