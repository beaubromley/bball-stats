"""Check for game events where a player assisted themselves."""
import urllib.request, json

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
        rows.append({cols[i]: (row[i]['value'] if row[i]['type'] != 'null' else None) for i in range(len(cols))})
    return rows

# Find assist events where the assist player_id matches the scored event's player_id
rows = turso_query("""
    SELECT
        a.id AS assist_event_id,
        a.game_id,
        a.player_id AS assist_player_id,
        ap.name AS assist_player_name,
        s.id AS score_event_id,
        s.player_id AS score_player_id,
        sp.name AS score_player_name,
        s.point_value,
        a.created_at
    FROM game_events a
    JOIN game_events s ON a.assisted_event_id = s.id
    JOIN players ap ON a.player_id = ap.id
    JOIN players sp ON s.player_id = sp.id
    WHERE a.event_type = 'assist'
      AND a.player_id = s.player_id
    ORDER BY a.created_at DESC
""")

if rows:
    print(f"Found {len(rows)} self-assists:\n")
    for r in rows:
        print(f"  Game {r['game_id'][:8]}... | {r['assist_player_name']} assisted their own {r['point_value']}pt bucket (assist event {r['assist_event_id']}, score event {r['score_event_id']}) at {r['created_at']}")
else:
    print("No self-assists found.")
