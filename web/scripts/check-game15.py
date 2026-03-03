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

# Get game 15 (15th finished game by start_time)
games = turso_query("SELECT id FROM games WHERE status = 'finished' ORDER BY start_time ASC")
print(f"Total finished games: {len(games)}")
game15 = games[14] if len(games) >= 15 else None
if not game15:
    print("Game 15 not found")
    exit()
game_id = game15['id']
print(f"Game 15 ID: {game_id}")

# Get all events
events = turso_query(f"SELECT ge.id, ge.event_type, ge.point_value, ge.corrected_event_id, p.name FROM game_events ge JOIN players p ON ge.player_id = p.id WHERE ge.game_id = '{game_id}' ORDER BY ge.created_at ASC")
print(f"\nAll events ({len(events)}):")
for e in events:
    print(f"  id={e['id']} type={e['event_type']:12s} pts={e['point_value']:3s} corrected={e['corrected_event_id'] or '-':>5s} player={e['name']}")
