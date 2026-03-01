import urllib.request, json, time

TOKEN = "B5hwZ91HEoQrlDWxLPLJTVLZjfwPssbGitZiSPKR"
GROUP_ID = "95603942"
BASE_URL = "https://api.groupme.com/v3"

# 12 months ago
CUTOFF = (time.time() - 365 * 24 * 60 * 60) * 1000

# Current players in DB
CURRENT_PLAYERS = {
    "Beau B.", "JC B.", "Parker D.", "Garett H.", "Addison P.", "Austin P.",
    "Ed G.", "Gage S.", "Joe M.", "Jon J.", "Jackson T.", "Jacob T.",
    "Brandon K.", "Tyler E.", "Cole G.", "Brent M.", "Michael", "James B.",
    "AJ F."
}

# Also match by first name for fuzzy matching
CURRENT_FIRST_NAMES = set()
for p in CURRENT_PLAYERS:
    CURRENT_FIRST_NAMES.add(p.split()[0].lower())

def fetch_messages():
    all_messages = []
    before_id = None
    page = 0

    while True:
        params = "token=" + TOKEN + "&limit=100"
        if before_id:
            params += "&before_id=" + before_id

        url = BASE_URL + "/groups/" + GROUP_ID + "/messages?" + params
        req = urllib.request.Request(url)

        try:
            resp = urllib.request.urlopen(req)
            data = json.loads(resp.read())
        except Exception as e:
            print("Error fetching: " + str(e))
            break

        messages = data.get("response", {}).get("messages", [])
        if not messages:
            break

        for msg in messages:
            created_ms = msg["created_at"] * 1000
            if created_ms < CUTOFF:
                return all_messages
            if not msg.get("system", False):
                all_messages.append({
                    "name": msg["name"],
                    "user_id": msg["user_id"],
                    "created_at": msg["created_at"],
                })

        before_id = messages[-1]["id"]
        page += 1
        if page % 10 == 0:
            print("  ...fetched " + str(len(all_messages)) + " messages so far")

        if len(messages) < 100:
            break

    return all_messages

print("Fetching GroupMe messages from the last 12 months...")
messages = fetch_messages()
print("Total non-system messages: " + str(len(messages)))

# Get unique names
name_counts = {}
for msg in messages:
    name = msg["name"]
    if name not in name_counts:
        name_counts[name] = 0
    name_counts[name] += 1

print("\nAll GroupMe members who commented (" + str(len(name_counts)) + " people):")
print("-" * 50)

not_in_db = []
in_db = []

for name, count in sorted(name_counts.items(), key=lambda x: -x[1]):
    first = name.split()[0].lower()
    matched = first in CURRENT_FIRST_NAMES
    status = "IN DB" if matched else "NOT IN DB"
    line = "{:25s} | {:4d} msgs | {}".format(name, count, status)
    print("  " + line)
    if not matched:
        not_in_db.append((name, count))
    else:
        in_db.append((name, count))

if not_in_db:
    print("\n" + "=" * 50)
    print("PLAYERS NOT IN DATABASE (" + str(len(not_in_db)) + "):")
    print("=" * 50)
    for name, count in sorted(not_in_db, key=lambda x: -x[1]):
        print("  " + name + " (" + str(count) + " messages)")
