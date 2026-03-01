"""Check game durations from play-by-play timestamps."""
import urllib.request, json
from datetime import datetime

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
        vals = {}
        for i in range(len(cols)):
            vals[cols[i]] = row[i]['value'] if row[i]['type'] != 'null' else None
        rows.append(vals)
    return rows

def parse_dt(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00'))

# Method 1: game start_time to end_time
rows = turso_query(
    'SELECT id, start_time, end_time FROM games '
    'WHERE status = "finished" AND end_time IS NOT NULL '
    'ORDER BY start_time ASC'
)

print("=== Game durations (start_time to end_time) ===")
durs_game = []
for r in rows:
    s = parse_dt(r['start_time'])
    e = parse_dt(r['end_time'])
    dur = (e - s).total_seconds() / 60
    durs_game.append(dur)
    gid = r['id'][:8]
    print(f"  {gid}  {dur:5.1f} min")

if durs_game:
    avg = sum(durs_game) / len(durs_game)
    med = sorted(durs_game)[len(durs_game) // 2]
    print(f"\n  Average: {avg:.1f} min  |  Median: {med:.1f} min")
    print(f"  NBA game: 48 min  |  Scale factor: {48/avg:.1f}x")

# Method 2: first to last event created_at
print()
print("=== Game durations (first to last play-by-play event) ===")
rows2 = turso_query(
    'SELECT ge.game_id, MIN(ge.created_at) as first_ev, MAX(ge.created_at) as last_ev '
    'FROM game_events ge '
    'JOIN games g ON ge.game_id = g.id '
    'WHERE g.status = "finished" '
    'GROUP BY ge.game_id '
    'ORDER BY MIN(ge.created_at) ASC'
)

durs_ev = []
for r in rows2:
    if r['first_ev'] and r['last_ev']:
        s = parse_dt(r['first_ev'])
        e = parse_dt(r['last_ev'])
        dur = (e - s).total_seconds() / 60
        durs_ev.append(dur)
        gid = r['game_id'][:8]
        print(f"  {gid}  {dur:5.1f} min")

if durs_ev:
    avg = sum(durs_ev) / len(durs_ev)
    med = sorted(durs_ev)[len(durs_ev) // 2]
    print(f"\n  Average: {avg:.1f} min  |  Median: {med:.1f} min")
    print(f"  NBA game: 48 min  |  Scale factor: {48/avg:.1f}x")
