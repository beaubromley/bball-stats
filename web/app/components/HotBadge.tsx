/**
 * Small inline "hot streak" indicator. Renders nothing if the player
 * isn't on the hot list. Hover tooltip explains the criteria.
 *
 * Hot = last-5 FPG ≥ 1.2× career FPG, with ≥5 career games and
 * the player's 5th-most-recent game within the last 14 days. Numbers
 * come from /api/hot-streaks.
 */
export interface HotStreakInfo {
  last5_fpg: number;
  career_fpg: number;
  ratio: number;
}

export default function HotBadge({
  info,
  size = "sm",
}: {
  info: HotStreakInfo | undefined;
  size?: "sm" | "xs";
}) {
  if (!info) return null;
  const tip =
    `Hot streak: last 5 games averaging ${info.last5_fpg.toFixed(2)} FPG vs ` +
    `${info.career_fpg.toFixed(2)} career (${Math.round((info.ratio - 1) * 100)}% above pace).`;
  const cls =
    size === "xs"
      ? "text-[12px] leading-none align-middle"
      : "text-xs leading-none align-middle";
  return (
    <span
      title={tip}
      aria-label={tip}
      className={`${cls} ml-1 inline-block cursor-help`}
    >
      🔥
    </span>
  );
}
