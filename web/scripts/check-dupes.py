import urllib.request, json

url = 'https://bball-stats-beaubromley.aws-us-east-2.turso.io'
token = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzA2ODg1NDcsImlkIjoiMzAzMTljZWYtNTlmYy00YzJkLThjODAtNDJmY2YzZWI1YmI3IiwicmlkIjoiZGU1NWJmZmItMDY0NC00NDM2LWEwZmQtODI5YTU4NzNlODY1In0.aD6SggGksUEtVyjys7UCi5Si7X8PlqXL9SJZ1AgpbmKz6RRLSYl6aZG-C4WhllJdi36nc58hKJIt1I82OhYsBg'

def execute(sql):
    payload = {'requests': [{'type': 'execute', 'stmt': {'sql': sql}}]}
    req = urllib.request.Request(
        url + '/v2/pipeline',
        data=json.dumps(payload).encode(),
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
    )
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read())
    return data['results'][0]['response']['result']['rows']

dupes = ['Addison', 'Austin', 'Brandon', 'Cole', 'Gage', 'Jackson', 'Jacob',
         'James', 'Joe', 'Tyler', 'Matt', 'AJ', 'Michael', 'Matt A.', 'Taylor K.']
names_sql = ', '.join(["'" + n + "'" for n in dupes])

players = execute('SELECT id, name FROM players WHERE name IN (' + names_sql + ')')

print('{:12s} | {:8s} | {:7s} | {}'.format('Name', 'Rosters', 'Events', 'Games'))
print('-' * 80)

for p in players:
    pid = p[0]['value']
    name = p[1]['value']

    rosters = execute("SELECT COUNT(*) FROM rosters WHERE player_id = '" + pid + "'")
    roster_count = int(rosters[0][0]['value'])

    events = execute("SELECT COUNT(*) FROM game_events WHERE player_id = '" + pid + "'")
    event_count = int(events[0][0]['value'])

    games = execute("SELECT g.id, g.start_time FROM games g JOIN rosters r ON g.id = r.game_id WHERE r.player_id = '" + pid + "' ORDER BY g.start_time")
    if games:
        parts = []
        for g in games:
            if g[1]['type'] != 'null':
                parts.append(g[1]['value'][:10])
            else:
                parts.append(g[0]['value'][:8])
        game_list = ', '.join(parts)
    else:
        game_list = '-'

    print('{:12s} | {:8d} | {:7d} | {}'.format(name, roster_count, event_count, game_list))
