"""
NBA Player Comparison — "Draft Night Comp"

Pulls each bball-stats player's per-game averages, scales them up to
NBA-equivalent stats (48-min game vs our games-to-11), then finds the
closest NBA player match using Euclidean distance on normalized stats.

Usage:  python web/scripts/nba-comp.py
"""

import urllib.request, json, math

# ── Turso connection ──────────────────────────────────────────────
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


# ── Fetch our players' per-game stats ────────────────────────────
players = turso_query("""
    SELECT
        p.name,
        COUNT(DISTINCT r.game_id) as gp,
        COALESCE(SUM(CASE WHEN ge.event_type = 'score' THEN ge.point_value ELSE 0 END), 0) as pts,
        COALESCE(SUM(CASE WHEN ge.event_type = 'score' AND ge.point_value = 2
          AND ge.id NOT IN (SELECT corrected_event_id FROM game_events WHERE corrected_event_id IS NOT NULL)
          THEN 1 ELSE 0 END), 0) as threes,
        COALESCE(SUM(CASE WHEN ge.event_type = 'assist' THEN 1 ELSE 0 END), 0) as ast,
        COALESCE(SUM(CASE WHEN ge.event_type = 'steal' THEN 1 ELSE 0 END), 0) as stl,
        COALESCE(SUM(CASE WHEN ge.event_type = 'block' THEN 1 ELSE 0 END), 0) as blk
    FROM players p
    JOIN rosters r ON p.id = r.player_id
    JOIN games g ON r.game_id = g.id AND g.status = 'finished'
    LEFT JOIN game_events ge ON ge.game_id = g.id AND ge.player_id = p.id
    WHERE p.status = 'active'
    GROUP BY p.id, p.name
    HAVING gp >= 3
    ORDER BY p.name
""")

# ── Scaling logic ────────────────────────────────────────────────
# Time scale: 48 min NBA game / 12 min avg our game = 4x
# Scoring scale: NBA uses 2s/3s, we use 1s/2s = extra 2x for points
TIME_SCALE = 4.0
POINTS_SCALE = TIME_SCALE * 2.0  # 8x for points (time + scoring system)
STAT_SCALE = TIME_SCALE           # 4x for ast/stl/blk (time only)

our_stats = []
for p in players:
    gp = int(p['gp'])
    ppg = float(p['pts']) / gp
    three_pg = float(p['threes']) / gp  # our 2-pointers = NBA 3-pointers
    apg = float(p['ast']) / gp
    spg = float(p['stl']) / gp
    bpg = float(p['blk']) / gp

    our_stats.append({
        'name': p['name'],
        'gp': gp,
        'ppg': ppg,
        'three_pg': three_pg,
        'apg': apg,
        'spg': spg,
        'bpg': bpg,
        # Scaled to NBA-equivalent
        'nba_ppg': round(ppg * POINTS_SCALE, 1),
        'nba_3pm': round(three_pg * STAT_SCALE, 1),  # 3PM scales by time only
        'nba_apg': round(apg * STAT_SCALE, 1),
        'nba_spg': round(spg * STAT_SCALE, 1),
        'nba_bpg': round(bpg * STAT_SCALE, 1),
    })


# ── NBA reference dataset ────────────────────────────────────────
# Curated set of recognizable NBA players (career or peak averages).
# Format: (Name, PPG, 3PM, APG, SPG, BPG)
NBA_PLAYERS = [
    # All-time scorers / wings
    # ("Michael Jordan", 30.1, 0.5, 5.3, 2.3, 0.8),
    # ("LeBron James", 27.1, 1.7, 7.4, 1.5, 0.8),
    ("Kobe Bryant", 25.0, 1.4, 4.7, 1.4, 0.5),
    ("Kevin Durant", 27.3, 1.8, 4.4, 1.1, 1.1),
    ("Kareem Abdul-Jabbar", 24.6, 0.0, 3.6, 0.9, 2.6),
    ("Shaquille O'Neal", 23.7, 0.0, 2.5, 0.6, 2.3),
    ("Wilt Chamberlain", 30.1, 0.0, 4.4, 0.0, 0.0),
    ("Oscar Robertson", 25.7, 0.0, 9.5, 0.0, 0.0),
    ("Jerry West", 27.0, 0.0, 6.7, 0.0, 0.0),
    ("Elgin Baylor", 27.4, 0.0, 4.3, 0.0, 0.0),
    ("Moses Malone", 20.6, 0.0, 1.4, 0.8, 1.3),
    ("Julius Erving", 22.0, 0.1, 3.9, 1.8, 1.5),
    ("Dominique Wilkins", 24.8, 0.6, 2.5, 1.3, 0.6),
    ("Tracy McGrady", 19.6, 1.4, 4.4, 1.2, 0.8),
    ("Vince Carter", 16.7, 1.7, 3.1, 1.0, 0.5),
    ("Carmelo Anthony", 22.5, 1.2, 2.7, 1.0, 0.3),

    # Point guards
    ("Magic Johnson", 19.5, 0.3, 11.2, 1.9, 0.4),
    ("Stephen Curry", 24.8, 3.6, 6.4, 1.6, 0.2),
    ("Chris Paul", 17.5, 1.2, 9.4, 2.1, 0.2),
    ("Steve Nash", 14.3, 1.3, 8.5, 0.7, 0.1),
    ("John Stockton", 13.1, 0.6, 10.5, 2.2, 0.2),
    ("Allen Iverson", 26.7, 0.9, 6.2, 2.2, 0.2),
    ("Russell Westbrook", 21.7, 0.9, 8.1, 1.6, 0.3),
    ("Jason Kidd", 12.6, 1.4, 8.7, 1.9, 0.3),
    ("Tony Parker", 15.5, 0.3, 5.6, 0.7, 0.1),
    ("Rajon Rondo", 10.0, 0.3, 8.1, 1.6, 0.2),
    ("Ja Morant", 22.5, 1.2, 7.2, 1.0, 0.4),
    ("Trae Young", 25.3, 2.8, 9.5, 0.9, 0.1),
    ("Luka Doncic", 28.7, 3.0, 8.3, 1.2, 0.5),
    ("Isiah Thomas", 19.2, 0.5, 9.3, 1.9, 0.3),
    ("Gary Payton", 16.3, 0.6, 6.7, 1.8, 0.2),
    ("Kyrie Irving", 23.0, 2.2, 5.7, 1.3, 0.4),
    ("Damian Lillard", 24.7, 3.0, 6.7, 0.9, 0.3),
    ("Derrick Rose", 17.4, 0.5, 5.2, 0.7, 0.3),
    ("Mike Conley", 14.9, 1.8, 5.5, 1.4, 0.3),
    ("Chauncey Billups", 15.2, 1.6, 5.4, 0.9, 0.2),
    ("Mark Price", 15.2, 1.5, 6.7, 1.2, 0.1),
    ("Tim Hardaway", 17.7, 1.7, 8.2, 1.6, 0.1),
    ("Baron Davis", 16.1, 1.5, 7.2, 1.8, 0.3),
    ("Gilbert Arenas", 20.7, 2.0, 5.3, 1.5, 0.3),
    ("Deron Williams", 16.3, 1.3, 8.1, 1.0, 0.3),
    ("Penny Hardaway", 15.2, 0.4, 5.0, 1.3, 0.5),
    ("SGA (Shai Gilgeous-Alexander)", 24.3, 0.8, 5.5, 1.3, 0.8),

    # Shooting guards
    ("James Harden", 24.1, 2.7, 7.0, 1.6, 0.5),
    ("Dwyane Wade", 22.0, 0.5, 5.4, 1.5, 0.9),
    ("Ray Allen", 18.9, 2.3, 3.4, 1.1, 0.2),
    ("Klay Thompson", 19.5, 2.9, 2.3, 0.9, 0.5),
    ("Devin Booker", 23.8, 2.1, 4.7, 0.9, 0.3),
    ("Donovan Mitchell", 24.1, 2.8, 4.8, 1.4, 0.3),
    ("Reggie Miller", 18.2, 1.8, 3.0, 1.1, 0.2),
    ("Clyde Drexler", 20.4, 0.5, 5.6, 2.0, 0.7),
    ("Joe Dumars", 16.1, 0.7, 4.5, 0.9, 0.1),
    ("Michael Redd", 19.0, 1.8, 2.1, 0.9, 0.2),
    ("Mitch Richmond", 21.0, 1.2, 3.5, 1.2, 0.3),
    ("CJ McCollum", 18.5, 2.2, 3.5, 0.9, 0.3),
    ("Bradley Beal", 21.5, 2.0, 4.4, 1.1, 0.3),
    ("Zach LaVine", 19.5, 2.3, 3.7, 0.9, 0.4),
    ("Jalen Brunson", 17.6, 1.6, 5.7, 0.8, 0.2),
    ("Tyler Herro", 17.0, 2.3, 3.7, 0.6, 0.2),
    ("Anthony Edwards", 24.4, 2.8, 4.8, 1.3, 0.5),

    # Small forwards
    ("Larry Bird", 24.3, 0.7, 6.3, 1.7, 0.8),
    ("Kawhi Leonard", 19.9, 1.1, 3.0, 1.7, 0.6),
    ("Paul George", 20.8, 2.1, 3.6, 1.5, 0.4),
    ("Jayson Tatum", 23.1, 2.5, 4.4, 1.1, 0.7),
    ("Jimmy Butler", 19.5, 0.7, 5.0, 1.5, 0.4),
    ("Scottie Pippen", 16.1, 0.7, 5.2, 2.0, 0.8),
    ("Paul Pierce", 19.7, 1.4, 3.5, 1.3, 0.4),
    ("Grant Hill", 16.7, 0.3, 4.1, 1.2, 0.5),
    ("Khris Middleton", 18.0, 1.9, 4.2, 1.1, 0.2),
    ("Brandon Ingram", 19.5, 1.0, 4.4, 0.7, 0.5),
    ("Jaylen Brown", 18.6, 1.7, 2.9, 1.1, 0.4),
    ("Gordon Hayward", 15.4, 1.3, 3.7, 1.0, 0.3),
    ("Tobias Harris", 15.3, 1.0, 2.6, 0.8, 0.4),
    ("Rudy Gay", 15.7, 0.8, 2.3, 1.1, 0.5),
    ("DeMar DeRozan", 20.1, 0.3, 3.8, 0.9, 0.3),
    ("Luol Deng", 14.8, 0.5, 2.3, 1.1, 0.4),
    ("Andrew Wiggins", 17.9, 1.2, 2.3, 0.9, 0.6),

    # Power forwards
    ("Tim Duncan", 19.0, 0.0, 3.0, 0.7, 2.2),
    ("Giannis Antetokounmpo", 23.4, 0.5, 4.9, 1.1, 1.3),
    ("Dirk Nowitzki", 20.7, 1.3, 2.6, 0.9, 0.8),
    ("Kevin Garnett", 17.8, 0.2, 3.7, 1.3, 1.4),
    ("Anthony Davis", 24.1, 0.5, 2.6, 1.2, 2.3),
    ("Charles Barkley", 22.1, 0.5, 3.9, 1.5, 0.5),
    ("Karl Malone", 25.0, 0.1, 3.6, 1.4, 0.8),
    ("Zion Williamson", 25.0, 0.2, 3.6, 0.7, 0.6),
    ("Chris Bosh", 19.2, 0.5, 2.0, 0.8, 0.8),
    ("Amar'e Stoudemire", 18.9, 0.0, 1.4, 0.8, 1.3),
    ("Blake Griffin", 19.8, 0.5, 4.2, 0.8, 0.5),
    ("LaMarcus Aldridge", 19.4, 0.3, 2.0, 0.7, 1.1),
    ("Pascal Siakam", 17.0, 0.8, 3.7, 0.8, 0.6),
    ("Rasheed Wallace", 14.4, 0.8, 1.8, 0.8, 1.3),
    ("Chris Webber", 20.7, 0.2, 4.2, 1.4, 1.4),
    ("Pau Gasol", 17.0, 0.1, 3.2, 0.5, 1.6),
    ("Domantas Sabonis", 14.8, 0.4, 5.6, 0.8, 0.4),
    ("Julius Randle", 18.5, 1.1, 3.3, 0.7, 0.4),
    ("John Collins", 15.1, 0.5, 1.6, 0.6, 1.0),

    # Centers
    ("Hakeem Olajuwon", 21.8, 0.0, 2.5, 1.7, 3.1),
    ("David Robinson", 21.1, 0.0, 2.5, 1.4, 3.0),
    ("Patrick Ewing", 21.0, 0.0, 1.9, 1.0, 2.4),
    ("Nikola Jokic", 20.8, 1.0, 6.9, 1.3, 0.7),
    ("Joel Embiid", 27.9, 1.0, 3.6, 0.8, 1.7),
    ("Rudy Gobert", 12.4, 0.0, 1.3, 0.7, 2.1),
    ("Alonzo Mourning", 17.1, 0.0, 1.1, 0.5, 2.8),
    ("Dikembe Mutombo", 9.8, 0.0, 0.6, 0.4, 3.0),
    ("Dwight Howard", 15.7, 0.0, 1.3, 0.9, 1.8),
    ("Marc Gasol", 14.0, 0.6, 3.4, 0.6, 1.4),
    ("Al Horford", 13.9, 0.9, 3.5, 0.8, 1.2),
    ("Brook Lopez", 16.7, 1.3, 1.8, 0.5, 1.5),
    ("DeAndre Jordan", 8.5, 0.0, 0.8, 0.5, 1.4),
    ("Bam Adebayo", 15.5, 0.0, 3.3, 0.9, 0.8),
    ("Nikola Vucevic", 16.8, 1.0, 2.8, 0.9, 0.8),
    ("Jarrett Allen", 12.6, 0.0, 1.3, 0.5, 1.3),

    # Role players / defensive specialists
    ("Dennis Rodman", 7.3, 0.1, 1.8, 0.7, 0.6),
    ("Ben Wallace", 5.7, 0.0, 1.3, 1.3, 2.0),
    ("Tony Allen", 8.1, 0.1, 1.4, 1.4, 0.3),
    ("Marcus Smart", 11.0, 1.6, 4.0, 1.3, 0.3),
    ("Draymond Green", 8.7, 0.8, 5.5, 1.4, 1.1),
    ("Andre Iguodala", 11.7, 0.8, 4.2, 1.3, 0.5),
    ("Robert Horry", 7.0, 0.9, 2.1, 0.8, 1.0),
    ("Shane Battier", 8.6, 1.2, 1.8, 0.9, 0.8),
    ("Bruce Bowen", 6.1, 1.0, 1.2, 0.8, 0.4),
    ("Ron Artest / Metta World Peace", 13.2, 0.8, 2.7, 1.8, 0.5),
    ("PJ Tucker", 6.4, 1.0, 1.5, 0.7, 0.3),
    ("Jrue Holiday", 15.6, 1.3, 5.8, 1.4, 0.5),
    ("Derek Fisher", 8.3, 1.1, 2.7, 0.8, 0.1),
    ("Boris Diaw", 8.6, 0.5, 3.5, 0.7, 0.4),
    ("Tayshaun Prince", 11.1, 0.5, 2.1, 1.0, 0.9),
    ("Trevor Ariza", 10.5, 1.4, 2.5, 1.3, 0.4),
    ("Danny Green", 8.7, 1.8, 1.5, 1.0, 0.5),
    ("Patrick Beverley", 8.3, 1.4, 3.4, 1.1, 0.4),
    ("Thaddeus Young", 12.0, 0.2, 2.0, 1.3, 0.3),
    ("Taj Gibson", 8.6, 0.0, 1.0, 0.5, 1.1),

    # Sixth men / bench scorers
    ("Jamal Crawford", 14.6, 1.3, 3.4, 0.9, 0.2),
    ("Lou Williams", 13.9, 1.5, 3.4, 0.8, 0.2),
    ("Manu Ginobili", 13.3, 1.3, 3.8, 1.3, 0.3),
    ("Lamar Odom", 13.3, 0.6, 3.7, 0.8, 0.8),
    ("Jason Terry", 13.4, 1.8, 3.7, 1.1, 0.2),
    ("Bobby Jackson", 10.9, 0.8, 3.6, 1.2, 0.2),
    ("JR Smith", 12.4, 1.8, 2.1, 0.9, 0.3),
    ("Montrezl Harrell", 12.9, 0.0, 1.2, 0.5, 1.0),
    ("Jordan Clarkson", 14.0, 1.5, 2.7, 0.7, 0.2),
]


# ── Find closest match ──────────────────────────────────────────
# Weights for each stat dimension (higher = more important in matching)
WEIGHTS = {
    'ppg': 1.0,
    '3pm': 2.5,   # 3PT shooting is a key play style differentiator
    'apg': 1.5,   # assists are rarer, weight them more
    'spg': 2.0,   # steals are rare, weight them more
    'bpg': 2.0,   # blocks are rare, weight them more
}

def distance(our, nba):
    """Weighted Euclidean distance between our scaled stats and an NBA player."""
    return math.sqrt(
        WEIGHTS['ppg'] * (our['nba_ppg'] - nba[1]) ** 2 +
        WEIGHTS['3pm'] * (our['nba_3pm'] - nba[2]) ** 2 +
        WEIGHTS['apg'] * (our['nba_apg'] - nba[3]) ** 2 +
        WEIGHTS['spg'] * (our['nba_spg'] - nba[4]) ** 2 +
        WEIGHTS['bpg'] * (our['nba_bpg'] - nba[5]) ** 2
    )


# ── Output ───────────────────────────────────────────────────────
print("=" * 72)
print("  BBALL STATS — NBA DRAFT NIGHT COMPARISONS")
print(f"  Points: {POINTS_SCALE}x (4x time + 2x scoring: 1s/2s -> 2s/3s)")
print("=" * 72)

used = set()
for p in sorted(our_stats, key=lambda x: x['nba_ppg'], reverse=True):
    # Find closest match not already used
    ranked = [nba for nba in sorted(NBA_PLAYERS, key=lambda nba: distance(p, nba)) if nba[0] not in used]
    best = ranked[0]
    used.add(best[0])

    print()
    print(f"  {p['name']}  ({p['gp']} games)")
    print(f"  |- Our stats:    {p['ppg']:.1f} PPG  {p['three_pg']:.1f} 3PG  {p['apg']:.1f} APG  {p['spg']:.1f} SPG  {p['bpg']:.1f} BPG")
    print(f"  |- Scaled (NBA): {p['nba_ppg']} PPG  {p['nba_3pm']} 3PM  {p['nba_apg']} APG  {p['nba_spg']} SPG  {p['nba_bpg']} BPG")
    print(f"  |")
    print(f"  |- COMP: {best[0]}")
    print(f"  |     ({best[1]} PPG  {best[2]} 3PM  {best[3]} APG  {best[4]} SPG  {best[5]} BPG)")
    print(f"  |")
    print(f"  |- Runner-up: {ranked[1][0]}  ({ranked[1][1]} PPG  {ranked[1][2]} 3PM)")
    print(f"  `- Also:      {ranked[2][0]}  ({ranked[2][1]} PPG  {ranked[2][2]} 3PM)")

print()
print("=" * 72)
print(f"  Points scaled {POINTS_SCALE}x (4x time, 2x scoring: 1s/2s -> 2s/3s).")
print(f"  AST/STL/BLK scaled {STAT_SCALE}x (time only). Weighted Euclidean distance.")
print("=" * 72)
