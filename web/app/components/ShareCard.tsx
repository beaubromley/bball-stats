"use client";

import { useState } from "react";

type CardStyle = "mvp" | "boxscore";

export default function ShareCard({ gameId }: { gameId: string }) {
  const [style, setStyle] = useState<CardStyle>("mvp");
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "error">("idle");

  const cardUrl = `/api/games/${gameId}/card?style=${style}`;

  async function handleCopy() {
    setStatus("copying");
    try {
      const res = await fetch(cardUrl);
      if (!res.ok) throw new Error("Failed to generate card");
      const blob = await res.blob();

      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        setStatus("copied");
      } catch {
        // Clipboard write not supported — fall back to download
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `game-card-${style}.png`;
        a.click();
        URL.revokeObjectURL(url);
        setStatus("copied");
      }
    } catch {
      setStatus("error");
    }
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <div className="space-y-3">
      {/* Style toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Share card:</span>
        <button
          onClick={() => setStyle("mvp")}
          className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
            style === "mvp"
              ? "bg-blue-600 text-white"
              : "border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500"
          }`}
        >
          MVP
        </button>
        <button
          onClick={() => setStyle("boxscore")}
          className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
            style === "boxscore"
              ? "bg-blue-600 text-white"
              : "border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500"
          }`}
        >
          Box Score
        </button>
      </div>

      {/* Card preview */}
      <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={style}
          src={cardUrl}
          alt={`Game card — ${style}`}
          className="w-full"
        />
      </div>

      {/* Copy button */}
      <button
        onClick={handleCopy}
        disabled={status === "copying"}
        className={`w-full py-2.5 font-semibold rounded-lg transition-colors text-sm ${
          status === "copied"
            ? "bg-green-600 text-white"
            : status === "error"
              ? "bg-red-600 text-white"
              : "bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
        }`}
      >
        {status === "copying"
          ? "Generating..."
          : status === "copied"
            ? "Copied!"
            : status === "error"
              ? "Failed — try again"
              : "Copy Card to Clipboard"}
      </button>
    </div>
  );
}
