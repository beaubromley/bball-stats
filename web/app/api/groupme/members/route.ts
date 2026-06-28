import { NextResponse } from "next/server";

const GROUP_ID = "95603942";
const DEFAULT_DAYS = 14;
const MAX_DAYS = 365;
const BASE_URL = "https://api.groupme.com/v3";

interface GroupMeMessage {
  id: string;
  name: string;
  user_id: string;
  created_at: number;
  system?: boolean;
}

export async function GET(req: Request) {
  const token = process.env.GROUPME_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "GROUPME_ACCESS_TOKEN not configured" },
      { status: 500 }
    );
  }

  const url = new URL(req.url);
  // `?scope=all` returns every group member (including lurkers) via the
  // group endpoint. Default keeps the legacy behavior — only members
  // who sent a message in the last N days, derived from the messages
  // feed. The expected-players logic on /api/players uses the default
  // because we want "expected to PLAY," not just "in the group."
  const scope = url.searchParams.get("scope");
  if (scope === "all") {
    try {
      const members = await fetchAllGroupMembers(token);
      return NextResponse.json(members);
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  const daysParam = url.searchParams.get("days");
  let days = DEFAULT_DAYS;
  if (daysParam) {
    const n = parseInt(daysParam, 10);
    if (!Number.isNaN(n) && n > 0) days = Math.min(n, MAX_DAYS);
  }

  try {
    const messages = await fetchRecentMessages(token, days);
    const members = getActiveMembers(messages);
    return NextResponse.json(members);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

interface GroupMember {
  user_id: string;
  nickname?: string;
  name?: string;
}

async function fetchAllGroupMembers(
  token: string,
): Promise<{ user_id: string; name: string }[]> {
  // Try token-in-querystring first (matches the messages endpoint that
  // we know works). If that 401s for any reason, fall back to the
  // X-Access-Token header form which GroupMe also accepts.
  let res = await fetch(
    `${BASE_URL}/groups/${GROUP_ID}?token=${encodeURIComponent(token)}`,
  );
  if (res.status === 401 || res.status === 403) {
    res = await fetch(`${BASE_URL}/groups/${GROUP_ID}`, {
      headers: { "X-Access-Token": token },
    });
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `GroupMe /groups/${GROUP_ID} returned ${res.status}: ${body.slice(0, 200)}`,
    );
  }
  const data = await res.json();
  const members: GroupMember[] = data?.response?.members ?? [];
  return members.map((m) => ({
    user_id: m.user_id,
    name: m.nickname ?? m.name ?? "Unknown",
  }));
}

async function fetchRecentMessages(token: string, days: number): Promise<GroupMeMessage[]> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
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
