"""Reassign 3 self-assists to their closest unassisted teammate score."""
import urllib.request, json

TURSO_URL = 'https://bball-stats-beaubromley.aws-us-east-2.turso.io'
TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzA2ODg1NDcsImlkIjoiMzAzMTljZWYtNTlmYy00YzJkLThjODAtNDJmY2YzZWI1YmI3IiwicmlkIjoiZGU1NWJmZmItMDY0NC00NDM2LWEwZmQtODI5YTU4NzNlODY1In0.aD6SggGksUEtVyjys7UCi5Si7X8PlqXL9SJZ1AgpbmKz6RRLSYl6aZG-C4WhllJdi36nc58hKJIt1I82OhYsBg'

def turso_execute(sql):
    payload = {'requests': [{'type': 'execute', 'stmt': {'sql': sql}}]}
    req = urllib.request.Request(
        TURSO_URL + '/v2/pipeline',
        data=json.dumps(payload).encode(),
        headers={'Authorization': 'Bearer ' + TURSO_TOKEN, 'Content-Type': 'application/json'}
    )
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read())
    return data['results'][0]['response']['result']

# Reassign: assist_event_id -> new score_event_id
fixes = [
    (388, 391, "Addison P. assist -> Jackson T. 1pt"),
    (345, 346, "Ed G. assist -> Austin P. 2pt"),
    (330, 331, "Beau B. assist -> Addison P. 2pt"),
]

for assist_id, new_score_id, desc in fixes:
    result = turso_execute(f"UPDATE game_events SET assisted_event_id = {new_score_id} WHERE id = {assist_id}")
    print(f"  #{assist_id}: {desc} -> {result['affected_row_count']} row(s) updated")

print("\nDone.")
