/**
 * Line-art logistics illustrations for empty states.
 * Shared visual language: 1.5px strokes, indigo lines, amber/green accents,
 * subtle shadow under each subject. Designed at 220 x 140.
 */

const STROKE = '#6366F1';
const STROKE_LIGHT = 'rgba(99, 102, 241, 0.35)';
const ACCENT = '#F59E0B';

function ShadowOval() {
  return (
    <ellipse cx="110" cy="128" rx="52" ry="4" fill="rgba(15, 22, 41, 0.06)" />
  );
}

export function ContainerArt({ className = 'w-[220px] h-[140px]' }) {
  return (
    <svg viewBox="0 0 220 140" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ShadowOval />
      {/* Container body */}
      <rect x="50" y="46" width="120" height="76" rx="3"
        fill="#FFFFFF" stroke={STROKE} strokeWidth="1.5" />
      {/* Corrugated lines */}
      {Array.from({ length: 11 }).map((_, i) => (
        <line key={i}
          x1={56 + i * 11} y1="50"
          x2={56 + i * 11} y2="118"
          stroke={STROKE_LIGHT} strokeWidth="1" />
      ))}
      {/* Door panels */}
      <line x1="110" y1="46" x2="110" y2="122" stroke={STROKE} strokeWidth="1.5" />
      {/* Door handles */}
      <rect x="100" y="76" width="3" height="14" fill={STROKE} />
      <rect x="117" y="76" width="3" height="14" fill={STROKE} />
      {/* Top label plate */}
      <rect x="74" y="32" width="72" height="14" rx="1.5"
        fill="#FFFFFF" stroke={STROKE} strokeWidth="1.5" />
      <text x="110" y="42" textAnchor="middle"
        fontFamily="Inter, sans-serif" fontWeight="700" fontSize="7"
        letterSpacing="0.06em" fill={STROKE}>GCGL · 40HC</text>
      {/* Loading indicator dot */}
      <circle cx="170" cy="38" r="4" fill={ACCENT} />
      <circle cx="170" cy="38" r="4" fill={ACCENT} opacity="0.3">
        <animate attributeName="r" values="4;9;4" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0;0.3" dur="2.4s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

export function ShipArt({ className = 'w-[220px] h-[140px]' }) {
  return (
    <svg viewBox="0 0 220 140" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ShadowOval />
      {/* Water lines */}
      <path d="M 30 122 Q 50 118, 70 122 T 110 122 T 150 122 T 190 122"
        stroke={STROKE_LIGHT} strokeWidth="1" fill="none" strokeLinecap="round" />
      <path d="M 40 130 Q 60 126, 80 130 T 120 130 T 160 130 T 200 130"
        stroke={STROKE_LIGHT} strokeWidth="1" fill="none" strokeLinecap="round" />
      {/* Hull */}
      <path d="M 38 96 L 50 116 L 170 116 L 182 96 Z"
        fill="#FFFFFF" stroke={STROKE} strokeWidth="1.5" strokeLinejoin="round" />
      {/* Stacked containers (deck) */}
      <rect x="58" y="74" width="32" height="22" fill="#FFFFFF" stroke={STROKE} strokeWidth="1.5" />
      <rect x="92" y="74" width="32" height="22" fill="#FFFFFF" stroke={STROKE} strokeWidth="1.5" />
      <rect x="126" y="74" width="32" height="22" fill="#FFFFFF" stroke={STROKE} strokeWidth="1.5" />
      <rect x="75" y="56" width="32" height="18" fill="#FFFFFF" stroke={STROKE} strokeWidth="1.5" />
      <rect x="109" y="56" width="32" height="18" fill="#FFFFFF" stroke={STROKE} strokeWidth="1.5" />
      {/* Container vertical lines */}
      {[64, 70, 76, 82, 98, 104, 110, 116, 132, 138, 144, 150, 81, 87, 93, 99, 115, 121, 127, 133].map((x, i) => (
        <line key={i} x1={x} y1={i < 12 ? '74' : '56'} x2={x} y2={i < 12 ? '96' : '74'}
          stroke={STROKE_LIGHT} strokeWidth="0.8" />
      ))}
      {/* Bridge / cabin */}
      <rect x="155" y="62" width="22" height="34" fill="#FFFFFF" stroke={STROKE} strokeWidth="1.5" />
      <rect x="160" y="68" width="12" height="6" fill={STROKE} />
      {/* Mast */}
      <line x1="166" y1="62" x2="166" y2="44" stroke={STROKE} strokeWidth="1.5" />
      {/* Flag */}
      <path d="M 166 44 L 178 48 L 166 52 Z" fill={ACCENT} />
    </svg>
  );
}

export function ReceiptArt({ className = 'w-[220px] h-[140px]' }) {
  return (
    <svg viewBox="0 0 220 140" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ShadowOval />
      {/* Receipt paper with torn bottom */}
      <path d="M 75 22 L 145 22 L 145 116 L 138 110 L 131 116 L 124 110 L 117 116 L 110 110 L 103 116 L 96 110 L 89 116 L 82 110 L 75 116 Z"
        fill="#FFFFFF" stroke={STROKE} strokeWidth="1.5" strokeLinejoin="round" />
      {/* Receipt header line */}
      <line x1="83" y1="34" x2="137" y2="34" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
      <line x1="92" y1="42" x2="128" y2="42" stroke={STROKE_LIGHT} strokeWidth="1" strokeLinecap="round" />
      {/* Itemized lines */}
      {[54, 64, 74, 84].map((y) => (
        <g key={y}>
          <line x1="83" y1={y} x2="115" y2={y} stroke={STROKE_LIGHT} strokeWidth="1" strokeLinecap="round" />
          <line x1="125" y1={y} x2="137" y2={y} stroke={STROKE_LIGHT} strokeWidth="1" strokeLinecap="round" />
        </g>
      ))}
      {/* Total */}
      <line x1="83" y1="98" x2="137" y2="98" stroke={STROKE} strokeWidth="1.2" />
      <text x="86" y="108" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="7" fill={STROKE}>TOTAL</text>
      <text x="137" y="108" textAnchor="end" fontFamily="Inter, sans-serif" fontWeight="800" fontSize="9" fill={STROKE}>$ —</text>
      {/* Stamp */}
      <circle cx="155" cy="62" r="14" fill="none" stroke={ACCENT} strokeWidth="1.5" strokeDasharray="2 2" opacity="0.7" />
      <text x="155" y="65" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="800" fontSize="7"
        letterSpacing="0.08em" fill={ACCENT} opacity="0.85">PAID</text>
    </svg>
  );
}

export function PeopleArt({ className = 'w-[220px] h-[140px]' }) {
  return (
    <svg viewBox="0 0 220 140" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ShadowOval />
      {/* Ground line */}
      <line x1="40" y1="122" x2="180" y2="122" stroke={STROKE_LIGHT} strokeWidth="1" strokeDasharray="3 3" />
      {/* Person 1 (front) */}
      <circle cx="92" cy="62" r="11" fill="#FFFFFF" stroke={STROKE} strokeWidth="1.5" />
      <path d="M 75 122 L 75 100 Q 75 84, 92 84 Q 109 84, 109 100 L 109 122"
        fill="#FFFFFF" stroke={STROKE} strokeWidth="1.5" strokeLinejoin="round" />
      {/* Person 2 (back) */}
      <circle cx="130" cy="58" r="10" fill="#FFFFFF" stroke={STROKE} strokeWidth="1.5" />
      <path d="M 115 122 L 115 102 Q 115 88, 130 88 Q 145 88, 145 102 L 145 122"
        fill="#FFFFFF" stroke={STROKE} strokeWidth="1.5" strokeLinejoin="round" />
      {/* Plus / connect mark */}
      <circle cx="160" cy="46" r="10" fill={ACCENT} opacity="0.18" />
      <line x1="160" y1="42" x2="160" y2="50" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" />
      <line x1="156" y1="46" x2="164" y2="46" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
