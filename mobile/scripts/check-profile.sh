#!/usr/bin/env bash
#
# check-profile.sh
#
# Inspect every Xcode-managed iOS provisioning profile on this Mac and print
# its name, expiration date, and remaining lifetime. Useful for free Apple
# Developer accounts, where profiles only live for 7 days at a time and the
# sideloaded app stops launching when they lapse.
#
# Usage:
#   ./mobile/scripts/check-profile.sh
#
# No arguments, no flags. Exits 0 even if a profile is expired — this is a
# read-only inspector.

set -euo pipefail

PROFILES_DIR="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"

if [[ ! -d "$PROFILES_DIR" ]]; then
  echo "No provisioning profiles directory found at:"
  echo "  $PROFILES_DIR"
  echo "Have you ever run an Xcode build that signs an app?"
  exit 0
fi

shopt -s nullglob
files=("$PROFILES_DIR"/*.mobileprovision)
shopt -u nullglob

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No provisioning profiles found in:"
  echo "  $PROFILES_DIR"
  exit 0
fi

tmpfile=$(mktemp -t profile-plist)
trap 'rm -f "$tmpfile"' EXIT

for f in "${files[@]}"; do
  echo "=== $(basename "$f") ==="
  # Decrypt the CMS-signed plist into a temp file, then feed that to python.
  # Avoids stdin/heredoc conflicts that broke earlier attempts.
  if ! security cms -D -i "$f" -o "$tmpfile" 2>/dev/null; then
    echo "  (could not decode)"
    continue
  fi
  PROFILE_PLIST="$tmpfile" python3 - <<'PY'
import os, plistlib, datetime

with open(os.environ["PROFILE_PLIST"], "rb") as fh:
    p = plistlib.load(fh)

exp = p.get("ExpirationDate")
created = p.get("CreationDate")
app_id = (p.get("Entitlements") or {}).get("application-identifier", "?")
days = (exp - datetime.datetime.now(exp.tzinfo)).total_seconds() / 86400
status = "EXPIRED" if days < 0 else ("WARNING" if days < 1 else "OK")

print(f"  Name:      {p.get('Name')}")
print(f"  App ID:    {app_id}")
print(f"  Created:   {created}")
print(f"  Expires:   {exp}")
print(f"  Remaining: {days:.2f} days  [{status}]")
PY
done
