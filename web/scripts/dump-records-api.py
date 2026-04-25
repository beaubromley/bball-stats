"""Print only the game-level records (margin, comeback) currently shipping
on the production /api/records endpoint, so we can see exactly what the
home page is rendering."""
import urllib.request
import json

# Production deploy
URL = "https://yba-stats.vercel.app/api/records"

resp = urllib.request.urlopen(URL)
data = json.loads(resp.read())

print("=== /api/records — game[] (margin & comeback) ===")
for r in data.get("game", []):
    print(f"  stat={r['stat']:<9} value={r['value']:<3} A={r['team_a_score']:<3} B={r['team_b_score']:<3} winner={r['winning_team']} game_id={r['game_id']} S{r['season']}G{r['game_number']} start={r['start_time']}")
