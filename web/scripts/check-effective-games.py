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

# Get winning score per game
print("=== GAME WINNING SCORES ===")
games = turso_query("""
    SELECT ts.game_id, MAX(CAST(ts.team_score AS REAL)) as winning_score
    FROM (
        SELECT r.game_id, r.team, SUM(CAST(ge.point_value AS INTEGER)) as team_score
        FROM game_events ge
        JOIN rosters r ON ge.game_id = r.game_id AND ge.player_id = r.player_id
        JOIN games g ON ge.game_id = g.id AND g.status = 'finished'
        GROUP BY r.game_id, r.team
    ) ts
    GROUP BY ts.game_id
    ORDER BY ts.game_id
""")
print(f"{'Game#':>5}  {'WinScore':>8}  {'EffGames':>8}")
print("-" * 28)
for i, g in enumerate(games):
    ws = float(g['winning_score'])
    eg = ws / 11.0
    print(f"{i+1:>5}  {ws:>8.0f}  {eg:>8.2f}")

print(f"\nTotal finished games: {len(games)}")
ws_values = [float(g['winning_score']) for g in games]
print(f"Winning scores: min={min(ws_values):.0f}, max={max(ws_values):.0f}, avg={sum(ws_values)/len(ws_values):.1f}")

# Get effective games per player
print("\n=== PLAYER EFFECTIVE GAMES ===")
players = turso_query("""
    SELECT
        p.name,
        COUNT(DISTINCT r.game_id) as games_played,
        SUM(COALESCE(CAST(gws.winning_score AS REAL), 11) / 11.0) as effective_games,
        COALESCE(scoring.total_points, 0) as total_points,
        COALESCE(scoring.assists, 0) as assists,
        COALESCE(scoring.steals, 0) as steals,
        COALESCE(scoring.blocks, 0) as blocks
    FROM players p
    JOIN rosters r ON p.id = r.player_id
    JOIN games g ON r.game_id = g.id AND g.status = 'finished'
    LEFT JOIN (
        SELECT ge.player_id,
            SUM(ge.point_value) as total_points,
            SUM(CASE WHEN ge.event_type = 'assist' THEN 1 ELSE 0 END) as assists,
            SUM(CASE WHEN ge.event_type = 'steal' THEN 1 ELSE 0 END) as steals,
            SUM(CASE WHEN ge.event_type = 'block' THEN 1 ELSE 0 END) as blocks
        FROM game_events ge
        GROUP BY ge.player_id
    ) scoring ON p.id = scoring.player_id
    LEFT JOIN (
        SELECT ts.game_id, MAX(ts.team_score) as winning_score
        FROM (
            SELECT r2.game_id, r2.team, SUM(ge2.point_value) as team_score
            FROM game_events ge2
            JOIN rosters r2 ON ge2.game_id = r2.game_id AND ge2.player_id = r2.player_id
            GROUP BY r2.game_id, r2.team
        ) ts
        GROUP BY ts.game_id
    ) gws ON r.game_id = gws.game_id
    GROUP BY p.id
    ORDER BY effective_games DESC
""")

print(f"{'Name':<15} {'GP':>3} {'EffG':>6} {'Pts':>5} {'PPG':>5} {'FP':>5} {'FPG':>5}")
print("-" * 55)
for p in players:
    gp = int(p['games_played'])
    eg = float(p['effective_games'])
    pts = int(float(p['total_points']))
    ast = int(float(p['assists']))
    stl = int(float(p['steals']))
    blk = int(float(p['blocks']))
    fp = pts + ast + stl + blk
    ppg = round(pts / eg, 1) if eg > 0 else 0
    fpg = round(fp / eg, 1) if eg > 0 else 0
    print(f"{p['name']:<15} {gp:>3} {eg:>6.2f} {pts:>5} {ppg:>5} {fp:>5} {fpg:>5}")
