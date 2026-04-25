import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * Real-geography vessel tracker for the Dashboard.
 *
 * Uses MapLibre GL with the OpenFreeMap "Positron" (light) / "Liberty" (dark)
 * vector styles — free, no API key, vector tiles. Plots Houston, Freeport,
 * and Tema as fixed port markers, draws a 3-segment great-circle route, and
 * places the vessel along that route at `transitPercent`.
 *
 * Props:
 *   transitPercent  — 0..100, derived from ETA / departure
 *   shipLabel       — short status text under the map title
 *   onClick         — click anywhere on the map proxies to view detail
 */

// Real port coordinates [lng, lat]
const HOUSTON  = [-95.0, 29.7];   // Port of Houston
const FREEPORT = [-78.7, 26.5];   // Freeport, Bahamas
const TEMA     = [-0.02, 5.62];   // Port of Tema, Ghana

const PORTS = [
  { id: 'houston',  coords: HOUSTON,  label: 'Houston',  sub: 'USA' },
  { id: 'freeport', coords: FREEPORT, label: 'Freeport', sub: 'Bahamas' },
  { id: 'tema',     coords: TEMA,     label: 'Tema',     sub: 'Ghana' },
];

// Map styles — both no-key, free, vector tiles via OpenFreeMap.
const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/positron';
const STYLE_DARK  = 'https://tiles.openfreemap.org/styles/dark';

/* ─── Great-circle math ─────────────────────────────────────── */
// Spherical interpolation between two [lng, lat] points.
// Returns N intermediate points so the route looks like a real flight/sea path.
function greatCirclePoints(a, b, segments = 64) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const [lng1, lat1] = a.map(toRad);
  const [lng2, lat2] = b.map(toRad);

  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2
  ));
  if (d === 0) return [a, b];

  const points = [];
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lng = Math.atan2(y, x);
    points.push([toDeg(lng), toDeg(lat)]);
  }
  return points;
}

// Position along the full Houston→Freeport→Tema route at fraction f (0..1).
// Distributes f proportionally across the two segments by their great-circle
// distance so the vessel speed is roughly uniform across both legs.
function positionAt(f) {
  const seg1 = greatCirclePoints(HOUSTON, FREEPORT, 32);
  const seg2 = greatCirclePoints(FREEPORT, TEMA, 64);

  // Approximate segment "lengths" by cumulative haversine on the densified line
  const length = (pts) => {
    let s = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0];
      const dy = pts[i][1] - pts[i - 1][1];
      s += Math.sqrt(dx * dx + dy * dy);
    }
    return s;
  };
  const l1 = length(seg1);
  const l2 = length(seg2);
  const total = l1 + l2;
  const split = l1 / total;

  if (f <= split) {
    const local = split === 0 ? 0 : f / split;
    return interpolateAlong(seg1, local);
  }
  const local = (f - split) / (1 - split);
  return interpolateAlong(seg2, local);
}

function interpolateAlong(pts, frac) {
  if (frac <= 0) return pts[0];
  if (frac >= 1) return pts[pts.length - 1];
  // proportional by arc-segment count (good enough since segments are dense)
  const idx = frac * (pts.length - 1);
  const i = Math.floor(idx);
  const t = idx - i;
  return [
    pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
    pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t,
  ];
}

/* ─── Component ─────────────────────────────────────────────── */
export default function VesselMap({ transitPercent = 0, shipLabel, arrived = false, onClick, className = '' }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const vesselElRef = useRef(null);

  const f = arrived ? 1 : Math.min(Math.max(transitPercent / 100, 0), 1);
  const vesselPos = positionAt(f);
  const vesselLng = vesselPos[0];
  const vesselLat = vesselPos[1];

  useEffect(() => {
    if (!containerRef.current) return;

    const isDark = document.documentElement.classList.contains('dark');

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: isDark ? STYLE_DARK : STYLE_LIGHT,
      center: [-45, 18],   // mid-Atlantic, biased south to fit the curve
      zoom: 1.6,
      attributionControl: false,
      interactive: false,  // it's a dashboard tile, not a full map
    });
    mapRef.current = map;

    map.on('load', () => {
      // Route — full great-circle Houston → Freeport → Tema
      const seg1 = greatCirclePoints(HOUSTON, FREEPORT, 32);
      const seg2 = greatCirclePoints(FREEPORT, TEMA, 64);
      const fullRoute = [...seg1, ...seg2.slice(1)];

      map.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: fullRoute } },
      });

      // Soft glow under the route
      map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        paint: {
          'line-color': '#6366F1',
          'line-width': 6,
          'line-opacity': 0.15,
          'line-blur': 4,
        },
      });

      // Dashed route line
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: {
          'line-color': '#6366F1',
          'line-width': 2.2,
          'line-dasharray': [2, 2],
        },
      });

      // Port markers (DOM-based for crisp typography)
      PORTS.forEach((p, i) => {
        const isStart = i === 0;
        const isEnd = i === PORTS.length - 1;
        const el = document.createElement('div');
        el.className = 'gc-port-marker';
        el.innerHTML = `
          <div style="
            width: 11px; height: 11px; border-radius: 50%;
            background: ${isStart ? '#F59E0B' : isEnd ? '#10B981' : '#6366F1'};
            border: 2px solid #fff;
            box-shadow: 0 0 0 2px ${isStart ? '#F59E0B' : isEnd ? '#10B981' : '#6366F1'}33,
                        0 1px 4px rgba(15, 22, 41, 0.3);
          "></div>
          <div style="
            position: absolute; top: 14px; left: 50%; transform: translateX(-50%);
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(6px);
            padding: 2px 8px; border-radius: 4px;
            font-size: 10px; font-weight: 700; color: #1A1D2B;
            white-space: nowrap; pointer-events: none;
            box-shadow: 0 1px 3px rgba(15, 22, 41, 0.15);
            letter-spacing: 0.02em;
          ">${p.label}</div>
        `;
        new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(p.coords)
          .addTo(map);
      });

      // Vessel marker — pulsing dot
      const vesselEl = document.createElement('div');
      vesselEl.style.cssText = 'position: relative; width: 18px; height: 18px;';
      vesselEl.innerHTML = `
        <div style="
          position: absolute; inset: 0; border-radius: 50%;
          background: rgba(99, 102, 241, 0.35);
          animation: gc-vessel-pulse 2.4s ease-out infinite;
        "></div>
        <div style="
          position: absolute; inset: 4px; border-radius: 50%;
          background: linear-gradient(135deg, #6366F1, #4F46E5);
          border: 2px solid #fff;
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.5);
        "></div>
      `;
      vesselElRef.current = vesselEl;
      const marker = new maplibregl.Marker({ element: vesselEl, anchor: 'center' })
        .setLngLat(vesselPos)
        .addTo(map);
      // store on the map ref for repositioning on prop change
      map._vesselMarker = marker;
    });

    return () => {
      try { map.remove(); } catch { /* already torn down */ }
    };
    // Style only changes when dark-mode toggles — listen at module level (next effect).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reposition the vessel when transitPercent changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map._vesselMarker) return;
    map._vesselMarker.setLngLat([vesselLng, vesselLat]);
  }, [vesselLng, vesselLat]);

  // React to dark-mode toggles by swapping the style
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const map = mapRef.current;
      if (!map) return;
      const isDark = document.documentElement.classList.contains('dark');
      const nextStyle = isDark ? STYLE_DARK : STYLE_LIGHT;
      const currentStyle = map.getStyle()?.sprite || '';
      if (
        (isDark && !currentStyle.includes('dark')) ||
        (!isDark && currentStyle.includes('dark'))
      ) {
        // Re-apply route + markers after style swap
        map.once('style.load', () => {
          const seg1 = greatCirclePoints(HOUSTON, FREEPORT, 32);
          const seg2 = greatCirclePoints(FREEPORT, TEMA, 64);
          const fullRoute = [...seg1, ...seg2.slice(1)];
          if (!map.getSource('route')) {
            map.addSource('route', {
              type: 'geojson',
              data: { type: 'Feature', geometry: { type: 'LineString', coordinates: fullRoute } },
            });
          }
          if (!map.getLayer('route-glow')) {
            map.addLayer({
              id: 'route-glow', type: 'line', source: 'route',
              paint: { 'line-color': '#6366F1', 'line-width': 6, 'line-opacity': 0.18, 'line-blur': 4 },
            });
          }
          if (!map.getLayer('route-line')) {
            map.addLayer({
              id: 'route-line', type: 'line', source: 'route',
              paint: { 'line-color': '#6366F1', 'line-width': 2.2, 'line-dasharray': [2, 2] },
            });
          }
        });
        map.setStyle(nextStyle);
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return (
    <div
      onClick={onClick}
      className={`relative ${onClick ? 'cursor-pointer' : ''} ${className}`}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div ref={containerRef} className="absolute inset-0 rounded-t-[16px] overflow-hidden" />
      {/* Subtle gradient veil at top so the title bar reads cleanly */}
      <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-white/70 to-transparent dark:from-[#1a1a2e]/70 pointer-events-none rounded-t-[16px]" />
      {shipLabel && (
        <div className="absolute top-3 left-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/95 dark:bg-[#1a1a2e]/95 backdrop-blur-sm border border-black/[0.04] dark:border-white/10 shadow-sm">
          <span className="w-[7px] h-[7px] rounded-full bg-[#6366F1] animate-pulse-dot" />
          <span className="text-[11.5px] font-semibold text-[#1A1D2B] dark:text-white tracking-[0.01em]">{shipLabel}</span>
        </div>
      )}
      <style>{`
        @keyframes gc-vessel-pulse {
          0%   { transform: scale(0.8); opacity: 0.55; }
          70%  { transform: scale(2.4); opacity: 0;    }
          100% { transform: scale(2.4); opacity: 0;    }
        }
      `}</style>
    </div>
  );
}
