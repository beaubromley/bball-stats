"use client";

interface MvpBannerProps {
  playerName: string;
  fantasyPoints: number;
  points: number;
  assists: number;
  steals: number;
  blocks: number;
}

export default function MvpBanner({ playerName, fantasyPoints, points, assists, steals, blocks }: MvpBannerProps) {
  return (
    <div className="border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 text-center">
      <div className="text-xs text-yellow-700 dark:text-yellow-500 tracking-wider font-bold font-display mb-1">GAME MVP</div>
      <div className="text-2xl font-bold font-display text-yellow-600 dark:text-yellow-400">{playerName}</div>
      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
        {fantasyPoints} FP &mdash; {points} pts, {assists} ast, {steals} stl, {blocks} blk
      </div>
    </div>
  );
}
