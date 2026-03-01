import urllib.request, json, uuid

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
    return data['results'][0]['response']['result']

players = [
    ("Mack", "Folger", "Mack F.", "Mack Folger"),
    ("Taylor", "Kinney", "Taylor K.", "Taylor Kinney"),
    ("Matt", "Andrus", "Matt A.", "Matt Andrus"),
]

for first, last, display, full in players:
    pid = str(uuid.uuid4())
    sql = "INSERT INTO players (id, name, first_name, last_name, full_name, aliases, status, created_at) VALUES ('" + pid + "', '" + display + "', '" + first + "', '" + last + "', '" + full + "', '[]', 'active', CURRENT_TIMESTAMP)"
    result = execute(sql)
    print("Added: " + display + " (" + full + ")")

remaining = execute('SELECT COUNT(*) FROM players')
print("\nTotal players: " + remaining['rows'][0][0]['value'])
