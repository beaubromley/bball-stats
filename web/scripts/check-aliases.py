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

players = execute('SELECT name, aliases, status FROM players ORDER BY name')
print('{:15s} | {:8s} | {}'.format('Name', 'Status', 'Aliases'))
print('-' * 60)
for p in players:
    name = p[0]['value']
    aliases = p[1]['value'] if p[1]['type'] != 'null' else '-'
    status = p[2]['value'] if p[2]['type'] != 'null' else '-'
    print('{:15s} | {:8s} | {}'.format(name, status, aliases))
