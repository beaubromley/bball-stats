// Detailed SVG renderings of the four NBA-inspired award trophies used on
// the Awards page. Each trophy has its own gradients and component so it
// can be placed on its respective AwardCard. Designed for legibility at
// ~100–120px width, with gold + crystal palettes that read well on both
// light and dark backgrounds.

import type { CSSProperties } from "react";

// --- Shared gradient defs (rendered once at the top of each SVG) ---

function GoldGradient({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#fef3c7" />
      <stop offset="25%" stopColor="#f6d77a" />
      <stop offset="55%" stopColor="#d4a017" />
      <stop offset="85%" stopColor="#8b5a14" />
      <stop offset="100%" stopColor="#4a2e08" />
    </linearGradient>
  );
}

function GoldSheenGradient({ id }: { id: string }) {
  // Sharper, shinier gold for small figures inside crystal
  return (
    <linearGradient id={id} x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stopColor="#fff6c2" />
      <stop offset="40%" stopColor="#f4c430" />
      <stop offset="80%" stopColor="#a66a10" />
      <stop offset="100%" stopColor="#5b3a05" />
    </linearGradient>
  );
}

function CrystalGradient({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
      <stop offset="35%" stopColor="rgba(220,230,255,0.55)" />
      <stop offset="70%" stopColor="rgba(180,195,235,0.35)" />
      <stop offset="100%" stopColor="rgba(140,155,200,0.45)" />
    </linearGradient>
  );
}

function BaseGradient({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stopColor="#1f2937" />
      <stop offset="100%" stopColor="#000000" />
    </linearGradient>
  );
}

function PlaqueGradient({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stopColor="#f4c430" />
      <stop offset="100%" stopColor="#8b5a14" />
    </linearGradient>
  );
}

// --- MVP: Michael Jordan Trophy (gold figure reaching up with basketball) ---

export function MvpTrophy({ style }: { style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 80 280"
      width="82"
      height="280"
      xmlns="http://www.w3.org/2000/svg"
      style={style}
      aria-hidden="true"
    >
      <defs>
        <GoldGradient id="mvp-gold" />
        <BaseGradient id="mvp-base" />
        <PlaqueGradient id="mvp-plaque" />
        <radialGradient id="mvp-ball-shade" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#f9e29a" />
          <stop offset="60%" stopColor="#c48c1f" />
          <stop offset="100%" stopColor="#5b3a05" />
        </radialGradient>
      </defs>

      {/* Basketball held overhead */}
      <g>
        <circle cx="42" cy="14" r="10.5" fill="url(#mvp-ball-shade)" />
        {/* Basketball seams */}
        <path d="M 31.5 14 Q 42 7 52.5 14" fill="none" stroke="#4a2e08" strokeWidth="0.9" strokeLinecap="round" />
        <path d="M 31.5 14 Q 42 21 52.5 14" fill="none" stroke="#4a2e08" strokeWidth="0.9" strokeLinecap="round" />
        <line x1="42" y1="3.5" x2="42" y2="24.5" stroke="#4a2e08" strokeWidth="0.9" strokeLinecap="round" />
      </g>

      {/* Elongated gold figure — reaching arm, head, arched body, trailing leg.
          Built as overlapping smooth paths for a sculpted silhouette. */}
      {/* Raised arm (from ball down to shoulder) */}
      <path
        d="M 44 24 Q 40 45 36 70 Q 34 82 37 85 Q 41 82 43 70 Q 46 48 48 26 Z"
        fill="url(#mvp-gold)"
      />
      {/* Head */}
      <ellipse cx="38" cy="79" rx="4.5" ry="5.5" fill="url(#mvp-gold)" />
      {/* Upper torso / shoulder wrap */}
      <path
        d="M 37 85 Q 30 92 28 108 Q 27 120 32 122 Q 38 118 41 105 Q 45 95 45 88 Z"
        fill="url(#mvp-gold)"
      />
      {/* Main torso tapering to waist */}
      <path
        d="M 32 120 Q 28 140 32 165 L 43 168 Q 49 150 49 120 Q 44 118 32 120 Z"
        fill="url(#mvp-gold)"
      />
      {/* Trailing arm at side (slight bend) */}
      <path
        d="M 47 118 Q 54 132 53 152 Q 52 168 48 170 Q 44 165 44 152 Q 44 134 44 120 Z"
        fill="url(#mvp-gold)"
      />
      {/* Front leg (leaping) */}
      <path
        d="M 33 165 Q 29 190 33 215 Q 36 220 40 216 Q 42 190 42 170 Z"
        fill="url(#mvp-gold)"
      />
      {/* Back leg */}
      <path
        d="M 44 168 Q 48 195 45 220 Q 48 224 52 220 Q 54 195 50 170 Z"
        fill="url(#mvp-gold)"
      />

      {/* Black pedestal with gold plaque */}
      <path d="M 15 220 L 65 220 L 72 240 L 8 240 Z" fill="url(#mvp-base)" />
      <rect x="22" y="225" width="36" height="7" rx="0.5" fill="url(#mvp-plaque)" />
      <rect x="4" y="240" width="72" height="10" rx="0.5" fill="#000000" />
      <rect x="4" y="240" width="72" height="1.5" fill="#d4a017" opacity="0.6" />
    </svg>
  );
}

// --- Scoring Leader: Maurice Podoloff-inspired (crystal basketball on gold column) ---

export function ScoringTrophy({ style }: { style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 100 200"
      width="100"
      height="200"
      xmlns="http://www.w3.org/2000/svg"
      style={style}
      aria-hidden="true"
    >
      <defs>
        <GoldGradient id="sc-gold" />
        <BaseGradient id="sc-base" />
        <PlaqueGradient id="sc-plaque" />
        <radialGradient id="sc-crystal" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.98)" />
          <stop offset="50%" stopColor="rgba(210,225,255,0.55)" />
          <stop offset="100%" stopColor="rgba(150,165,200,0.55)" />
        </radialGradient>
      </defs>

      {/* Crystal basketball */}
      <g>
        <circle cx="50" cy="45" r="32" fill="url(#sc-crystal)" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
        {/* Faceted highlights */}
        <path d="M 32 28 L 50 20 L 68 28 L 58 40 L 42 40 Z" fill="rgba(255,255,255,0.25)" />
        <ellipse cx="40" cy="32" rx="6" ry="3" fill="rgba(255,255,255,0.55)" />
        {/* Basketball seams — diamond-cut look */}
        <g stroke="rgba(255,255,255,0.7)" strokeWidth="0.9" fill="none" strokeLinecap="round">
          <path d="M 18 45 Q 50 30 82 45" />
          <path d="M 18 45 Q 50 60 82 45" />
          <line x1="50" y1="13" x2="50" y2="77" />
          <path d="M 22 32 Q 50 42 78 32" opacity="0.5" />
          <path d="M 22 58 Q 50 48 78 58" opacity="0.5" />
        </g>
      </g>

      {/* Gold crown ring that cradles the ball */}
      <g>
        <ellipse cx="50" cy="80" rx="26" ry="5" fill="url(#sc-gold)" />
        {/* Crossed wire supports rising up */}
        <path d="M 30 79 Q 50 60 70 79" stroke="url(#sc-gold)" strokeWidth="2.2" fill="none" />
        <path d="M 35 79 Q 50 65 65 79" stroke="url(#sc-gold)" strokeWidth="1.8" fill="none" />
      </g>

      {/* Tapered gold column */}
      <path d="M 35 82 L 65 82 L 62 130 L 38 130 Z" fill="url(#sc-gold)" />
      {/* Column fluting */}
      <line x1="45" y1="85" x2="44" y2="128" stroke="rgba(0,0,0,0.25)" strokeWidth="0.8" />
      <line x1="50" y1="85" x2="50" y2="128" stroke="rgba(0,0,0,0.3)" strokeWidth="0.8" />
      <line x1="55" y1="85" x2="56" y2="128" stroke="rgba(0,0,0,0.25)" strokeWidth="0.8" />

      {/* Gold band above base */}
      <rect x="30" y="130" width="40" height="6" fill="url(#sc-gold)" />

      {/* Dark engraving band */}
      <rect x="30" y="136" width="40" height="10" fill="#000000" />
      <rect x="34" y="138" width="32" height="6" fill="url(#sc-plaque)" opacity="0.6" />

      {/* Square base */}
      <path d="M 28 146 L 72 146 L 78 170 L 22 170 Z" fill="url(#sc-base)" />
      <rect x="18" y="170" width="64" height="12" rx="0.5" fill="#000000" />
      <rect x="18" y="170" width="64" height="1.5" fill="#d4a017" opacity="0.6" />
    </svg>
  );
}

// --- Clutch (Jerry West): Crystal vase with gold jumpshooter ---

export function ClutchTrophy({ style }: { style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 100 220"
      width="100"
      height="220"
      xmlns="http://www.w3.org/2000/svg"
      style={style}
      aria-hidden="true"
    >
      <defs>
        <GoldSheenGradient id="cl-gold" />
        <CrystalGradient id="cl-crystal" />
        <BaseGradient id="cl-base" />
        <PlaqueGradient id="cl-plaque" />
      </defs>

      {/* Crystal vase body — flared top, narrow waist, wider bottom */}
      <path
        d="M 22 22
           L 78 22
           Q 82 50 76 80
           Q 68 110 70 150
           Q 72 170 68 178
           L 32 178
           Q 28 170 30 150
           Q 32 110 24 80
           Q 18 50 22 22 Z"
        fill="url(#cl-crystal)"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="1"
      />

      {/* Diamond-cut facet pattern */}
      <g stroke="rgba(255,255,255,0.35)" strokeWidth="0.7" fill="none" strokeLinecap="round">
        <path d="M 28 32 L 50 95 L 28 160" />
        <path d="M 72 32 L 50 95 L 72 160" />
        <path d="M 40 40 L 50 70 L 60 40" />
        <path d="M 40 130 L 50 100 L 60 130" />
        <path d="M 24 60 L 76 60" opacity="0.5" />
        <path d="M 26 140 L 74 140" opacity="0.5" />
        <path d="M 28 100 L 72 100" opacity="0.4" />
      </g>

      {/* Rim highlight */}
      <path d="M 24 24 Q 50 18 76 24" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" fill="none" />

      {/* Gold shooter figure — jumpshot pose */}
      <g fill="url(#cl-gold)">
        {/* Ball released above head */}
        <circle cx="50" cy="55" r="4" />
        {/* Extended arms guiding ball up */}
        <path d="M 46 64 L 47.5 58 L 51.5 58 L 53.5 64 L 52 66 L 48 66 Z" />
        <path d="M 43 70 L 44.5 62 L 46.5 62 L 47 70 Z" />
        <path d="M 53 70 L 53.5 62 L 55.5 62 L 57 70 Z" />
        {/* Head */}
        <circle cx="50" cy="73" r="3.8" />
        {/* Torso with body arched from jump */}
        <path d="M 46 77 Q 43 90 45 104 L 55 104 Q 57 90 54 77 Z" />
        {/* Bent front leg (jumping) */}
        <path d="M 45 104 Q 42 115 45 127 Q 42 132 40 130 Q 38 118 41 104 Z" />
        {/* Trailing back leg */}
        <path d="M 55 104 Q 58 118 56 132 Q 59 136 61 133 Q 62 118 59 104 Z" />
      </g>

      {/* Subtle inner shimmer over figure */}
      <path
        d="M 30 30 Q 50 60 30 90 Z"
        fill="rgba(255,255,255,0.12)"
      />

      {/* Black square pedestal */}
      <path d="M 25 178 L 75 178 L 80 200 L 20 200 Z" fill="url(#cl-base)" />
      <rect x="32" y="184" width="36" height="8" rx="0.5" fill="url(#cl-plaque)" />
      <rect x="16" y="200" width="68" height="12" rx="0.5" fill="#000000" />
      <rect x="16" y="200" width="68" height="1.5" fill="#d4a017" opacity="0.6" />
    </svg>
  );
}

// --- Defensive (Hakeem Olajuwon): Crystal vase with gold defender ---

export function DefensiveTrophy({ style }: { style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 100 220"
      width="100"
      height="220"
      xmlns="http://www.w3.org/2000/svg"
      style={style}
      aria-hidden="true"
    >
      <defs>
        <GoldSheenGradient id="df-gold" />
        <CrystalGradient id="df-crystal" />
        <BaseGradient id="df-base" />
        <PlaqueGradient id="df-plaque" />
      </defs>

      {/* Crystal vase (matches Clutch silhouette — they are a set) */}
      <path
        d="M 22 22
           L 78 22
           Q 82 50 76 80
           Q 68 110 70 150
           Q 72 170 68 178
           L 32 178
           Q 28 170 30 150
           Q 32 110 24 80
           Q 18 50 22 22 Z"
        fill="url(#df-crystal)"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="1"
      />

      {/* Diamond-cut facet pattern (matches Clutch) */}
      <g stroke="rgba(255,255,255,0.35)" strokeWidth="0.7" fill="none" strokeLinecap="round">
        <path d="M 28 32 L 50 95 L 28 160" />
        <path d="M 72 32 L 50 95 L 72 160" />
        <path d="M 40 40 L 50 70 L 60 40" />
        <path d="M 40 130 L 50 100 L 60 130" />
        <path d="M 24 60 L 76 60" opacity="0.5" />
        <path d="M 26 140 L 74 140" opacity="0.5" />
        <path d="M 28 100 L 72 100" opacity="0.4" />
      </g>

      {/* Rim highlight */}
      <path d="M 24 24 Q 50 18 76 24" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" fill="none" />

      {/* Gold defender figure — wide stance, arms spread */}
      <g fill="url(#df-gold)">
        {/* Head */}
        <circle cx="50" cy="70" r="4" />
        {/* Torso crouched low */}
        <path d="M 45 75 Q 43 88 45 100 L 55 100 Q 57 88 55 75 Z" />
        {/* Arms spread wide and low */}
        <path d="M 46 80 L 34 90 L 32 94 L 35 95 L 47 86 Z" />
        <path d="M 54 80 L 66 90 L 68 94 L 65 95 L 53 86 Z" />
        {/* Hands */}
        <circle cx="33" cy="93" r="2" />
        <circle cx="67" cy="93" r="2" />
        {/* Bent legs, wide base — athletic stance */}
        <path d="M 45 100 Q 40 115 38 132 Q 35 136 39 138 Q 44 125 49 105 Z" />
        <path d="M 55 100 Q 60 115 62 132 Q 65 136 61 138 Q 56 125 51 105 Z" />
      </g>

      {/* Subtle inner shimmer */}
      <path
        d="M 30 30 Q 50 60 30 90 Z"
        fill="rgba(255,255,255,0.12)"
      />

      {/* Black square pedestal */}
      <path d="M 25 178 L 75 178 L 80 200 L 20 200 Z" fill="url(#df-base)" />
      <rect x="32" y="184" width="36" height="8" rx="0.5" fill="url(#df-plaque)" />
      <rect x="16" y="200" width="68" height="12" rx="0.5" fill="#000000" />
      <rect x="16" y="200" width="68" height="1.5" fill="#d4a017" opacity="0.6" />
    </svg>
  );
}
