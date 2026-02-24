"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";

const API_BASE = "/api";

interface Message {
  role: "user" | "assistant";
  text: string;
  sql?: string;
  rows?: Record<string, unknown>[];
}

export default function InsightsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showSql, setShowSql] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace("/login");
  }, [authLoading, isAdmin, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function askQuestion() {
    const q = input.trim();
    if (!q || asking) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setAsking(true);

    try {
      const res = await fetch(`${API_BASE}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.answer || "No response.", sql: data.sql, rows: data.rows },
      ]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: "Failed to get a response." }]);
    }
    setAsking(false);
  }

  if (authLoading || !isAdmin) {
    return <div className="text-gray-500 text-center py-16">Loading...</div>;
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 120px)" }}>
      <h1 className="text-3xl font-bold font-display uppercase tracking-wide mb-4">AI Insights</h1>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Ask questions about your basketball data. Powered by Gemini.
      </p>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 dark:text-gray-600 py-12 space-y-2">
            <p className="text-sm">Try asking:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                "Who has the best win percentage with at least 3 games?",
                "Which player scores the highest percentage from deep?",
                "Who has the most assists and who do they assist the most?",
                "Which two players win the most when on the same team?",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); }}
                  className="text-xs px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-full text-gray-500 dark:text-gray-400 hover:border-blue-500 hover:text-blue-400 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-lg px-4 py-3 text-sm ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.text}</div>
              {msg.sql && (
                <div className="mt-2">
                  <button
                    onClick={() => setShowSql(showSql === i ? null : i)}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-blue-400 underline"
                  >
                    {showSql === i ? "Hide SQL" : "Show SQL"}
                  </button>
                  {showSql === i && (
                    <pre className="mt-1 text-xs bg-gray-200 dark:bg-gray-900 p-2 rounded overflow-x-auto text-gray-700 dark:text-gray-300">
                      {msg.sql}
                    </pre>
                  )}
                </div>
              )}
              {msg.rows && msg.rows.length > 0 && showSql === i && (
                <div className="mt-2 overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="border-b border-gray-300 dark:border-gray-700">
                        {Object.keys(msg.rows[0]).map((col) => (
                          <th key={col} className="text-left py-1 pr-3 text-gray-500">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {msg.rows.slice(0, 10).map((row, ri) => (
                        <tr key={ri} className="border-b border-gray-200 dark:border-gray-800">
                          {Object.values(row).map((val, ci) => (
                            <td key={ci} className="py-1 pr-3 tabular-nums">{String(val ?? "")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ))}

        {asking && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-3 text-sm text-gray-500 dark:text-gray-400 animate-pulse">
              Thinking...
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && askQuestion()}
          placeholder="Ask about your stats..."
          className="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
          disabled={asking}
        />
        <button
          onClick={askQuestion}
          disabled={asking || !input.trim()}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white font-semibold rounded-lg transition-colors"
        >
          Ask
        </button>
      </div>
    </div>
  );
}
