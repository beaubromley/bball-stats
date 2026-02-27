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
    const members = getActiveMembers(messages);
    return NextResponse.json(members);
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

function getActiveMembers(messages: GroupMeMessage[]): { user_id: string; name: string }[] {
  const members = new Map<string, string>();
  for (const msg of messages) {
    if (msg.system) continue;
    // Use most recent name for each user_id
    if (!members.has(msg.user_id)) {
      members.set(msg.user_id, msg.name);
    }
  }
  return Array.from(members, ([user_id, name]) => ({ user_id, name }));
}
