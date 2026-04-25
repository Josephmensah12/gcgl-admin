import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * Real-geography vessel tracker for the Dashboard.
 *
 * Uses MapLibre GL with the OpenFreeMap "Positron" (light) / "Dark" vector
 * styles — free, no API key. Plots Houston, Freeport, Tema as fixed port
 * markers, draws a 3-segment great-circle route, and places the vessel along
 * that route at `transitPercent`. The vessel dot is the only interactive
 * element — click navigates, hover shows a popup with shipment name,
 * shipping line, and transit %.
 *
 * Props:
 *   transitPercent  — 0..100, derived from ETA / departure
 *   arrived         — boolean, render destination as green
 *   vesselInfo      — { name, carrier } shown in the hover popup
 *   onVesselClick   — fires when the user clicks the vessel dot
 */

// Real port coordinates [lng, lat]
const HOUSTON = [-95.0, 29.7];   // Port of Houston
const TEMA    = [-0.02, 5.62];   // Port of Tema, Ghana

const PORTS = [
  { id: 'houston', coords: HOUSTON, label: 'Houston', sub: 'USA' },
  { id: 'tema',    coords: TEMA,    label: 'Tema',    sub: 'Ghana' },
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

// Single great-circle Houston → Tema. We pre-densify once at module scope
// so position lookups are O(1) interpolation along the dense polyline.
const ROUTE = greatCirclePoints(HOUSTON, TEMA, 96);

function positionAt(f) {
  return interpolateAlong(ROUTE, f);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
export default function VesselMap({
  transitPercent = 0,
  arrived = false,
  vesselInfo,
  onVesselClick,
  className = '',
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const vesselElRef = useRef(null);
  const popupRef = useRef(null);
  const onVesselClickRef = useRef(onVesselClick);
  const vesselInfoRef = useRef(vesselInfo);
  // Keep refs current so the marker's event listeners always see the latest props
  onVesselClickRef.current = onVesselClick;
  vesselInfoRef.current = vesselInfo;

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

    // Resize the canvas whenever the container changes size — fixes the
    // common flex-layout / lazy-load gotcha where the map's first measurement
    // is wrong because the parent hadn't laid out yet.
    const ro = new ResizeObserver(() => {
      try { map.resize(); } catch { /* map may already be torn down */ }
    });
    ro.observe(containerRef.current);
    map._resizeObserver = ro;

    // Also resize after the next animation frame for good measure.
    requestAnimationFrame(() => {
      try { map.resize(); } catch { /* map may already be torn down */ }
    });

    map.on('load', () => {
      // Single great-circle Houston → Tema
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: ROUTE } },
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

      // Vessel marker — pulsing dot, clickable, hover popup
      const vesselEl = document.createElement('div');
      vesselEl.setAttribute('role', 'button');
      vesselEl.setAttribute('aria-label', 'View shipment');
      vesselEl.tabIndex = 0;
      vesselEl.style.cssText = 'position: relative; width: 18px; height: 18px; cursor: pointer; outline: none;';
      vesselEl.innerHTML = `
        <div class="gc-vessel-pulse-ring" style="
          position: absolute; inset: 0; border-radius: 50%;
          background: rgba(99, 102, 241, 0.35);
          animation: gc-vessel-pulse 2.4s ease-out infinite;
          pointer-events: none;
        "></div>
        <div class="gc-vessel-core" style="
          position: absolute; inset: 4px; border-radius: 50%;
          background: linear-gradient(135deg, #6366F1, #4F46E5);
          border: 2px solid #fff;
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.5);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        "></div>
      `;
      vesselElRef.current = vesselEl;
      const marker = new maplibregl.Marker({ element: vesselEl, anchor: 'center' })
        .setLngLat(vesselPos)
        .addTo(map);
      map._vesselMarker = marker;

      // Hover popup — shipment name + shipping line + transit %
      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 14,
        className: 'gc-vessel-popup',
        anchor: 'bottom',
      });
      popupRef.current = popup;

      const renderPopup = () => {
        const info = vesselInfoRef.current || {};
        const pct = Math.round(((info.transitPercent ?? 0) * 1));
        const name = info.name || 'Shipment';
        const carrier = info.carrier || info.vesselName || '—';
        popup.setHTML(`
          <div style="font-family: 'Inter', system-ui, sans-serif; min-width: 180px;">
            <div style="font-size: 13px; font-weight: 700; color: #1A1D2B; letter-spacing: -0.01em;">${escapeHtml(name)}</div>
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 6px;">
              <div>
                <p style="margin: 0; font-size: 9.5px; font-weight: 700; color: #9CA3C0; text-transform: uppercase; letter-spacing: 0.08em;">Shipping line</p>
                <p style="margin: 2px 0 0; font-size: 11.5px; font-weight: 600; color: #4B5163;">${escapeHtml(carrier)}</p>
              </div>
              <div style="text-align: right;">
                <p style="margin: 0; font-size: 9.5px; font-weight: 700; color: #9CA3C0; text-transform: uppercase; letter-spacing: 0.08em;">Transit</p>
                <p style="margin: 2px 0 0; font-size: 13px; font-weight: 800; color: #6366F1; font-variant-numeric: tabular-nums;">${pct}%</p>
              </div>
            </div>
          </div>
        `);
      };

      const showPopup = () => {
        renderPopup();
        const m = map._vesselMarker;
        if (m) popup.setLngLat(m.getLngLat()).addTo(map);
      };
      const hidePopup = () => popup.remove();

      vesselEl.addEventListener('mouseenter', showPopup);
      vesselEl.addEventListener('mouseleave', hidePopup);
      vesselEl.addEventListener('focus', showPopup);
      vesselEl.addEventListener('blur', hidePopup);
      vesselEl.addEventListener('click', (e) => {
        e.stopPropagation();
        onVesselClickRef.current?.();
      });
      vesselEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onVesselClickRef.current?.();
        }
      });
    });

    return () => {
      try { map._resizeObserver?.disconnect(); } catch { /* noop */ }
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
          if (!map.getSource('route')) {
            map.addSource('route', {
              type: 'geojson',
              data: { type: 'Feature', geometry: { type: 'LineString', coordinates: ROUTE } },
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
      className={className}
      style={{ position: className?.includes('absolute') ? undefined : 'relative' }}
    >
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' }} />
      <style>{`
        @keyframes gc-vessel-pulse {
          0%   { transform: scale(0.8); opacity: 0.55; }
          70%  { transform: scale(2.4); opacity: 0;    }
          100% { transform: scale(2.4); opacity: 0;    }
        }
        .gc-vessel-popup .maplibregl-popup-content {
          padding: 10px 12px;
          border-radius: 10px;
          box-shadow: 0 6px 20px rgba(15, 22, 41, 0.12), 0 1px 3px rgba(15, 22, 41, 0.06);
          border: 1px solid rgba(99, 102, 241, 0.1);
        }
        .gc-vessel-popup .maplibregl-popup-tip {
          border-top-color: #fff;
        }
        html.dark .gc-vessel-popup .maplibregl-popup-content {
          background: #1a1a2e;
          border-color: rgba(99, 102, 241, 0.25);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.3);
          color: #c8ccd4;
        }
        html.dark .gc-vessel-popup .maplibregl-popup-content > div > div { color: #c8ccd4; }
        html.dark .gc-vessel-popup .maplibregl-popup-tip { border-top-color: #1a1a2e; }
        /* Hover state on the dot */
        [role="button"][aria-label="View shipment"]:hover .gc-vessel-core,
        [role="button"][aria-label="View shipment"]:focus-visible .gc-vessel-core {
          transform: scale(1.18);
          box-shadow: 0 4px 14px rgba(99, 102, 241, 0.65);
        }
      `}</style>
    </div>
  );
}
