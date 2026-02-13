import { NextResponse } from "next/server";

const GROUP_ID = "95603942";
const DAYS = 2;
const BASE_URL = "https://api.groupme.com/v3";

interface GroupMeMessage {
  id: string;
  name: string;
  user_id: string;
  created_at: number;
  system?: boolean;
}

export async function GET() {
  const token = process.env.GROUPME_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "GROUPME_ACCESS_TOKEN not configured" },
      { status: 500 }
    );
  }

  try {
    const messages = await fetchRecentMessages(token);
    const activeNames = getActiveMembers(messages);
    const players = buildPlayerList(activeNames);
    return NextResponse.json(players);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function fetchRecentMessages(token: string): Promise<GroupMeMessage[]> {
  const cutoff = Date.now() - DAYS * 24 * 60 * 60 * 1000;
  const allMessages: GroupMeMessage[] = [];
  let beforeId: string | undefined;

  while (true) {
    const params = new URLSearchParams({ token, limit: "100" });
    if (beforeId) params.set("before_id", beforeId);

    const res = await fetch(
      `${BASE_URL}/groups/${GROUP_ID}/messages?${params}`
    );
    if (!res.ok) break;

    const data = await res.json();
    const messages: GroupMeMessage[] = data?.response?.messages;
    if (!messages || messages.length === 0) break;

    for (const msg of messages) {
      if (msg.created_at * 1000 < cutoff) return allMessages;
      allMessages.push(msg);
    }

    beforeId = messages[messages.length - 1].id;
    if (messages.length < 100) break;
  }

  return allMessages;
}

function getActiveMembers(messages: GroupMeMessage[]): string[] {
  const names = new Set<string>();
  for (const msg of messages) {
    if (msg.system) continue;
    names.add(msg.name);
  }
  return Array.from(names);
}

interface Player {
  fullName: string;
  displayName: string;
  voiceName: string;
}

// Override auto-generated display/voice names for specific GroupMe names.
// Key: GroupMe name (case-insensitive match). Value: desired displayName and voiceName.
const NAME_OVERRIDES: Record<string, { displayName: string; voiceName: string }> = {
  "Tyler": { displayName: "Tyler E.", voiceName: "tyler" },
};

function findOverride(groupMeName: string): { displayName: string; voiceName: string } | undefined {
  for (const [key, value] of Object.entries(NAME_OVERRIDES)) {
    if (groupMeName.toLowerCase() === key.toLowerCase()) return value;
  }
  return undefined;
}

function buildPlayerList(fullNames: string[]): Player[] {
  // Count first names to detect duplicates
  const firstNameCount = new Map<string, number>();
  for (const name of fullNames) {
    const first = name.split(/\s+/)[0].toLowerCase();
    firstNameCount.set(first, (firstNameCount.get(first) || 0) + 1);
  }

  return fullNames.map((fullName) => {
    // Check for manual override first
    const override = findOverride(fullName);
    if (override) {
      return { fullName, displayName: override.displayName, voiceName: override.voiceName };
    }

    const parts = fullName.split(/\s+/);
    const first = parts[0];
    const last = parts.slice(1).join(" ");
    const firstLower = first.toLowerCase();
    const isDuplicate = (firstNameCount.get(firstLower) || 0) > 1;

    let displayName: string;
    let voiceName: string;

    if (!last) {
      // Single name only
      displayName = first;
      voiceName = firstLower;
    } else if (!isDuplicate) {
      // Unique first name: "Beau B."
      displayName = `${first} ${last[0].toUpperCase()}.`;
      voiceName = firstLower;
    } else {
      // Duplicate first name: "Joe Sm." display, "joe s" voice
      const lastChars = last.length >= 2 ? last.slice(0, 2) : last;
      displayName = `${first} ${lastChars[0].toUpperCase()}${lastChars.slice(1).toLowerCase()}.`;
      voiceName = `${firstLower} ${last[0].toLowerCase()}`;
    }

    return { fullName, displayName, voiceName };
  });
}
