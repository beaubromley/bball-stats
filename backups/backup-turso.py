"""Backup Turso DB to a local SQL file via HTTP API."""
import urllib.request, json, sys
from datetime import datetime

TURSO_URL = 'https://bball-stats-beaubromley.aws-us-east-2.turso.io'
TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzA2ODg1NDcsImlkIjoiMzAzMTljZWYtNTlmYy00YzJkLThjODAtNDJmY2YzZWI1YmI3IiwicmlkIjoiZGU1NWJmZmItMDY0NC00NDM2LWEwZmQtODI5YTU4NzNlODY1In0.aD6SggGksUEtVyjys7UCi5Si7X8PlqXL9SJZ1AgpbmKz6RRLSYl6aZG-C4WhllJdi36nc58hKJIt1I82OhYsBg'

BACKUP_DIR = 'C:/Users/beaub/dev/bball-stats/backups'

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

def escape_val(v):
    if v is None:
        return 'NULL'
    v = str(v)
    return "'" + v.replace("'", "''") + "'"

# Get all tables
tables = turso_query("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' AND name NOT LIKE 'libsql%' ORDER BY name")

timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
filename = f'{BACKUP_DIR}/bball-stats-backup-{timestamp}.sql'

with open(filename, 'w', encoding='utf-8') as f:
    f.write('PRAGMA foreign_keys=OFF;\n')
    f.write('BEGIN TRANSACTION;\n')

    for table in tables:
        tname = table['name']
        create_sql = table['sql']
        # Use IF NOT EXISTS
        create_sql = create_sql.replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS ', 1)
        f.write(f'{create_sql};\n')

        # Get all rows
        rows = turso_query(f'SELECT * FROM "{tname}"')
        if rows:
            cols = list(rows[0].keys())
            col_names = ', '.join(cols)
            for row in rows:
                vals = ', '.join(escape_val(row[c]) for c in cols)
                f.write(f'INSERT INTO "{tname}" ({col_names}) VALUES ({vals});\n')

    f.write('COMMIT;\n')

print(f'Backup saved: {filename}')

# Count records per table
for table in tables:
    count = turso_query(f'SELECT COUNT(*) as cnt FROM "{table["name"]}"')
    print(f'  {table["name"]}: {count[0]["cnt"]} rows')
