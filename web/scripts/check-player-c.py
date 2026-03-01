"""Check what game history player 'C' has."""
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

# Find the player
players = turso_query("SELECT id, name, first_name, last_name, status FROM players WHERE name = 'C'")
if not players:
    print("No player named 'C' found")
    exit()

p = players[0]
pid = p['id']
print(f"Player: {p['name']} (id: {pid})")
print(f"  first_name: {p['first_name']}, last_name: {p['last_name']}, status: {p['status']}")

# Check roster entries
rosters = turso_query(f"SELECT r.game_id, r.team, g.start_time, g.status FROM rosters r JOIN games g ON r.game_id = g.id WHERE r.player_id = '{pid}' ORDER BY g.start_time DESC")
print(f"\nRoster entries: {len(rosters)}")
for r in rosters:
    print(f"  Game {r['game_id'][:8]}... | Team {r['team']} | {r['start_time']} | {r['status']}")

# Check game events
events = turso_query(f"SELECT ge.id, ge.game_id, ge.event_type, ge.point_value, ge.raw_transcript, ge.created_at FROM game_events ge WHERE ge.player_id = '{pid}' ORDER BY ge.created_at DESC")
print(f"\nGame events: {len(events)}")
for e in events:
    print(f"  Event #{e['id']}: {e['event_type']} {e['point_value']}pt in game {e['game_id'][:8]}... at {e['created_at']}")
    if e['raw_transcript']:
        print(f"    transcript: \"{e['raw_transcript']}\"")

# Also check who else was on the same team in those games
if rosters:
    for r in rosters:
        teammates = turso_query(f"SELECT p.name FROM rosters ros JOIN players p ON ros.player_id = p.id WHERE ros.game_id = '{r['game_id']}' AND ros.team = '{r['team']}' AND ros.player_id != '{pid}'")
        print(f"\nTeammates in game {r['game_id'][:8]}... (team {r['team']}):")
        for t in teammates:
            print(f"  {t['name']}")
