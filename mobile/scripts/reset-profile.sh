#!/usr/bin/env bash
#
# reset-profile.sh
#
# Delete every cached Xcode provisioning profile on this Mac. Use this when
# Xcode is stubbornly reusing an about-to-expire 7-day profile instead of
# re-issuing a fresh one. After running this, plug in your phone, hit Cmd+R
# in Xcode, and it'll be forced to fetch a new profile from Apple.
#
# Safe — these files are pure caches; Xcode regenerates them on demand.
#
# Usage:
#   ./mobile/scripts/reset-profile.sh                # interactive confirm
#   ./mobile/scripts/reset-profile.sh --yes          # skip confirm

set -euo pipefail

PROFILES_DIR="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
AUTO_YES=0
if [[ "${1:-}" == "--yes" || "${1:-}" == "-y" ]]; then
  AUTO_YES=1
fi

if [[ ! -d "$PROFILES_DIR" ]]; then
  echo "Nothing to delete — profile cache directory does not exist:"
  echo "  $PROFILES_DIR"
  exit 0
fi

shopt -s nullglob
files=("$PROFILES_DIR"/*.mobileprovision)
shopt -u nullglob

if [[ ${#files[@]} -eq 0 ]]; then
  echo "Already clean — no .mobileprovision files in:"
  echo "  $PROFILES_DIR"
  exit 0
fi

echo "Profiles to delete:"
for f in "${files[@]}"; do
  echo "  $(basename "$f")"
done
echo

if [[ $AUTO_YES -ne 1 ]]; then
  read -r -p "Delete ${#files[@]} cached profile(s)? [y/N] " ans
  case "$ans" in
    y|Y|yes|YES) ;;
    *) echo "Aborted."; exit 0 ;;
  esac
fi

for f in "${files[@]}"; do
  rm "$f"
  echo "Deleted: $(basename "$f")"
done

echo
echo "Done. Open Xcode, plug in your phone, and press Cmd+R."
echo "A fresh 7-day profile will be issued automatically."
