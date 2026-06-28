"use client";

import { useEffect, useState } from "react";
import { isIndependenceWeek, independenceBannerText } from "@/lib/useIndependenceWeek";

/**
 * Self-activating Independence Week theme. Shows a patriotic banner and flips
 * an `html.july4` class (which globals.css keys off) for the first seven days
 * of July, then removes itself. Purely decorative — gated client-side after
 * mount so a server/client date difference can't cause a hydration mismatch.
 */
function Star({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M12 2l2.94 6.26 6.86.83-5.06 4.66 1.34 6.79L12 17.9 5.92 21.3l1.34-6.79L2.2 9.85l6.86-.83z" />
    </svg>
  );
}

export default function July4Theme() {
  const [active, setActive] = useState(false);
  const [text, setText] = useState("Happy Birthday America");

  useEffect(() => {
    const now = new Date();
    const inWindow = isIndependenceWeek(now);
    setActive(inWindow);
    setText(independenceBannerText(now));
    const root = document.documentElement;
    if (inWindow) root.classList.add("july4");
    return () => root.classList.remove("july4");
  }, []);

  if (!active) return null;

  return (
    <div className="july4-banner" role="presentation">
      <div className="july4-stars" aria-hidden="true">
        <Star className="july4-star" />
        <Star className="july4-star" />
        <Star className="july4-star" />
      </div>
      <span className="july4-text">{text}</span>
      <div className="july4-stars" aria-hidden="true">
        <Star className="july4-star" />
        <Star className="july4-star" />
        <Star className="july4-star" />
      </div>
    </div>
  );
}
