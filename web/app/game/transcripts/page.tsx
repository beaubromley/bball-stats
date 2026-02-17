"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthProvider";

const API_BASE = "/api";

interface Transcript {
  id: number;
  raw_text: string;
  acted_on: string | null;
  created_at: string;
}

interface GameEvent {
  id: number;
  player_name: string;
  event_type: string;
  point_value: number;
  raw_transcript: string | null;
  created_at: string;
}

interface GameDetail {
  id: string;
  start_time: string;
  status: string;
  winning_team: string | null;
}

function formatEventLabel(evt: GameEvent): string {
  switch (evt.event_type) {
    case "score":
      return `${evt.player_name} +${evt.point_value}`;
    case "correction":
      return `UNDO ${evt.player_name}`;
    case "steal":
      return `${evt.player_name} STL`;
    case "block":
      return `${evt.player_name} BLK`;
    case "assist":
      return `${evt.player_name} AST`;
    default:
      return `${evt.player_name} ${evt.event_type}`;
  }
}

function eventColor(type: string): string {
  switch (type) {
    case "score": return "text-green-400";
    case "correction": return "text-red-400";
    case "steal": return "text-yellow-400";
    case "block": return "text-purple-400";
    case "assist": return "text-blue-400";
    default: return "text-gray-500 dark:text-gray-400";
  }
}

function TranscriptsInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();

  const [game, setGame] = useState<GameDetail | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.replace("/login");
    }
  }, [authLoading, isAdmin, router]);

  useEffect(() => {
    if (!id || !isAdmin) return;
    Promise.all([
      fetch(`${API_BASE}/games/${id}`).then((r) => r.json()),
      fetch(`${API_BASE}/games/${id}/events`).then((r) => r.json()),
      fetch(`${API_BASE}/games/${id}/transcripts`).then((r) => r.json()).catch(() => []),
    ])
      .then(([g, e, t]) => {
        setGame(g);
        setEvents(e);
        setTranscripts(t);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, isAdmin]);

  if (authLoading || !isAdmin) {
    return <div className="text-gray-500 text-center py-16">Loading...</div>;
  }

  if (loading) {
    return <div className="text-gray-500 text-center py-16">Loading...</div>;
  }

  if (!game) {
    return <div className="text-gray-500 text-center py-16">Game not found.</div>;
  }

  // Build a set of raw_transcript strings that matched an event (fallback for old data without acted_on)
  const matchedTranscripts = new Set<string>();
  for (const evt of events) {
    if (evt.raw_transcript) matchedTranscripts.add(evt.raw_transcript);
  }

  // Build unified timeline: transcripts (new data) or events (old data fallback)
  const hasTranscripts = transcripts.length > 0;

  // Unified entries sorted by time
  type TimelineEntry =
    | { kind: "transcript"; data: Transcript; recognized: boolean }
    | { kind: "event"; data: GameEvent };

  const timeline: TimelineEntry[] = [];

  if (hasTranscripts) {
    for (const t of transcripts) {
      const recognized = !!(t.acted_on || matchedTranscripts.has(t.raw_text));
      timeline.push({ kind: "transcript", data: t, recognized });
    }
  } else {
    // Old game without transcripts — show events directly
    for (const evt of events) {
      timeline.push({ kind: "event", data: evt });
    }
  }

  timeline.sort((a, b) => {
    const timeA = new Date(a.kind === "transcript" ? a.data.created_at : a.data.created_at).getTime();
    const timeB = new Date(b.kind === "transcript" ? b.data.created_at : b.data.created_at).getTime();
    return timeA - timeB;
  });

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link
          href={`/game?id=${id}`}
          className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          &larr; Back to Game
        </Link>
      </div>

      <h1 className="text-2xl font-bold font-display uppercase tracking-wide mb-1">Voice Log</h1>
      <p className="text-gray-500 text-sm mb-8">
        {new Date(game.start_time).toLocaleString()}
        {game.status === "finished" && game.winning_team && (
          <span className="ml-2">— Team {game.winning_team} wins</span>
        )}
      </p>

      {timeline.length === 0 ? (
        <p className="text-gray-400 dark:text-gray-600 text-sm py-4">No events recorded.</p>
      ) : (
        <div className="space-y-1">
          {timeline.map((entry) => {
            if (entry.kind === "transcript") {
              const t = entry.data;
              return (
                <div
                  key={`t-${t.id}`}
                  className="flex items-start gap-3 py-2 border-b border-gray-100 dark:border-gray-900"
                >
                  <span className="text-xs text-gray-400 dark:text-gray-600 w-14 shrink-0 pt-0.5">
                    {new Date(t.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm italic truncate ${entry.recognized ? "text-gray-500 dark:text-gray-400" : "text-orange-400"}`}>
                      &ldquo;{t.raw_text}&rdquo;
                    </div>
                    {t.acted_on && (
                      <div className="text-sm font-medium text-green-400">
                        {t.acted_on}
                      </div>
                    )}
                  </div>
                </div>
              );
            } else {
              const evt = entry.data;
              return (
                <div
                  key={`e-${evt.id}`}
                  className="flex items-start gap-3 py-2 border-b border-gray-100 dark:border-gray-900"
                >
                  <span className="text-xs text-gray-400 dark:text-gray-600 w-14 shrink-0 pt-0.5">
                    {new Date(evt.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                  <div className="flex-1 min-w-0">
                    {evt.raw_transcript && (
                      <div className="text-sm text-gray-500 dark:text-gray-400 italic truncate">
                        &ldquo;{evt.raw_transcript}&rdquo;
                      </div>
                    )}
                    <div className={`text-sm font-medium ${eventColor(evt.event_type)}`}>
                      {formatEventLabel(evt)}
                    </div>
                  </div>
                </div>
              );
            }
          })}
        </div>
      )}
    </div>
  );
}

export default function TranscriptsPage() {
  return (
    <Suspense fallback={<div className="text-gray-500 text-center py-16">Loading...</div>}>
      <TranscriptsInner />
    </Suspense>
  );
}
